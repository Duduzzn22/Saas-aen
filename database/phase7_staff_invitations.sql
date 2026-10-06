-- Staff access is granted only after the account's email is confirmed.
create or replace function private.verified_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users
  where id = (select auth.uid()) and email_confirmed_at is not null;
$$;
revoke all on function private.verified_email() from public, anon;
grant execute on function private.verified_email() to authenticated;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^ @]+@[^ @]+[.][^ @]+$'),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role text not null check (role in ('reception','teacher')),
  teacher_id uuid,
  status text not null default 'pending' check (status in ('pending','claimed','revoked')),
  created_by uuid references auth.users(id),
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  foreign key (organization_id, teacher_id) references public.teachers(organization_id,id),
  check ((role = 'teacher' and teacher_id is not null) or (role = 'reception' and teacher_id is null))
);
create unique index staff_invitations_pending_email on public.staff_invitations(organization_id,email) where status = 'pending';
create index staff_invitations_email_status on public.staff_invitations(email,status);
alter table public.staff_invitations enable row level security;
create policy staff_invitations_read on public.staff_invitations for select to authenticated
using (private.has_org_role(organization_id,array['admin']) or
       (status = 'pending' and email = private.verified_email()));
create policy organizations_invited_read on public.organizations for select to authenticated
using (exists (select 1 from public.staff_invitations i where i.organization_id = id
  and i.status = 'pending' and i.email = private.verified_email()));
revoke all on public.staff_invitations from anon, authenticated;
grant select on public.staff_invitations to authenticated;
create trigger staff_invitations_audit after insert or update on public.staff_invitations
for each row execute function private.capture_audit();

create or replace function public.create_staff_invitation(p_org uuid, p_email text, p_name text, p_role text, p_teacher uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.has_org_role(p_org,array['admin']) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_email is null or length(trim(p_email)) > 254 or p_name is null
     or p_role not in ('teacher','reception') then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  if p_role = 'teacher' and not exists (
    select 1 from public.teachers t where t.organization_id = p_org and t.id = p_teacher
      and t.active and t.user_id is null and lower(trim(t.email)) = lower(trim(p_email))
  ) then
    raise exception 'Teacher must be active, unlinked and have the same email' using errcode = '22023';
  end if;
  insert into public.staff_invitations(organization_id,email,full_name,role,teacher_id,created_by)
  values (p_org,lower(trim(p_email)),trim(p_name),p_role,p_teacher,auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.claim_staff_invitation(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.staff_invitations%rowtype;
begin
  select * into v_inv from public.staff_invitations where id = p_id for update;
  if not found or v_inv.status <> 'pending' or auth.uid() is null
     or v_inv.email is distinct from private.verified_email() then
    raise exception 'Invitation unavailable' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships where organization_id = v_inv.organization_id and user_id = auth.uid()) then
    raise exception 'Account already linked to this school' using errcode = '23505';
  end if;
  if v_inv.role = 'teacher' and not exists (
    select 1 from public.teachers t where t.organization_id = v_inv.organization_id and t.id = v_inv.teacher_id
      and t.active and t.user_id is null and lower(trim(t.email)) = v_inv.email
  ) then
    raise exception 'Teacher account unavailable' using errcode = '22023';
  end if;
  insert into public.memberships(organization_id,user_id,full_name,role)
  values (v_inv.organization_id,auth.uid(),v_inv.full_name,v_inv.role);
  if v_inv.role = 'teacher' then
    update public.teachers set user_id = auth.uid()
    where organization_id = v_inv.organization_id and id = v_inv.teacher_id and user_id is null;
    if not found then raise exception 'Teacher account unavailable' using errcode = '22023'; end if;
  end if;
  update public.staff_invitations set status = 'claimed',claimed_by = auth.uid(),claimed_at = now() where id = p_id;
  return v_inv.organization_id;
end;
$$;

create or replace function public.revoke_staff_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.staff_invitations where id = p_id and status = 'pending' for update;
  if v_org is null or not private.has_org_role(v_org,array['admin']) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  update public.staff_invitations set status = 'revoked' where id = p_id;
end;
$$;
revoke all on function public.create_staff_invitation(uuid,text,text,text,uuid),
  public.claim_staff_invitation(uuid), public.revoke_staff_invitation(uuid) from public, anon;
grant execute on function public.create_staff_invitation(uuid,text,text,text,uuid),
  public.claim_staff_invitation(uuid), public.revoke_staff_invitation(uuid) to authenticated;
