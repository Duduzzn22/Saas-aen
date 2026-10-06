-- Pilot onboarding: one school may be created by each confirmed account.
alter table public.organizations add column created_by uuid references auth.users(id) on delete set null;
create unique index organizations_creator_once on public.organizations(created_by) where created_by is not null;

-- The exposed RPC has no direct table grants. It checks the caller and creates
-- both rows in one transaction; an error rolls everything back.
create or replace function public.create_school(p_name text, p_admin_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null or private.verified_email() is null then
    raise exception 'Confirmed account required' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120
     or p_admin_name is null or length(trim(p_admin_name)) not between 2 and 120
     or p_slug is null or length(p_slug) not between 3 and 70
     or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid school data' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations where created_by = auth.uid()) then
    raise exception 'Account already created a school' using errcode = '23505';
  end if;
  insert into public.organizations(name,slug,created_by)
  values (trim(p_name),p_slug,auth.uid()) returning id into v_org;
  insert into public.memberships(organization_id,user_id,full_name,role)
  values (v_org,auth.uid(),trim(p_admin_name),'admin');
  insert into public.audit_logs(organization_id,actor_user_id,table_name,row_id,operation,new_data)
  values (v_org,auth.uid(),'organizations',v_org,'INSERT',
    jsonb_build_object('name',trim(p_name),'slug',p_slug,'created_by',auth.uid()));
  insert into public.audit_logs(organization_id,actor_user_id,table_name,row_id,operation,new_data)
  values (v_org,auth.uid(),'memberships',v_org,'INSERT',
    jsonb_build_object('user_id',auth.uid(),'role','admin','full_name',trim(p_admin_name)));
  return v_org;
end;
$$;
revoke all on function public.create_school(text,text,text) from public, anon;
grant execute on function public.create_school(text,text,text) to authenticated;
