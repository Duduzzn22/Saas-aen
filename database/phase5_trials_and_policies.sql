-- A verified guardian may discover their school before requesting access.
create policy organizations_guardian_lookup on public.organizations for select to authenticated
using (exists (select 1 from public.guardians g where g.organization_id = organizations.id
  and private.verified_guardian_email_match(g.organization_id,g.id,(select auth.uid()))));

drop policy portal_notices_read on public.portal_notices;
create policy portal_notices_read on public.portal_notices for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or
  (active and (expires_on is null or expires_on >= (now() at time zone 'America/Sao_Paulo')::date)
    and private.guardian_has_org_link(organization_id)
    and (guardian_id is null or exists (
      select 1 from public.guardian_portal_links l where l.organization_id = portal_notices.organization_id
        and l.guardian_id = portal_notices.guardian_id and l.user_id = (select auth.uid()) and l.active
        and private.verified_guardian_email_match(l.organization_id,l.guardian_id,l.user_id)
    ))));

alter table public.class_sessions add constraint class_sessions_organization_id_id_key unique (organization_id,id);
create table public.trial_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  prospect_name text not null check (length(trim(prospect_name)) between 2 and 120),
  contact_name text not null check (length(trim(contact_name)) between 2 and 120),
  contact_email text not null check (length(trim(contact_email)) between 3 and 254),
  contact_phone text check (length(contact_phone) <= 40),
  preferred_date date,
  note text check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','scheduled','completed','cancelled')),
  session_id uuid,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id,session_id) references public.class_sessions(organization_id,id) on delete restrict,
  check ((status = 'pending' and session_id is null and reviewed_by is null)
    or (status = 'scheduled' and session_id is not null and reviewed_by is not null)
    or (status in ('completed','cancelled') and reviewed_by is not null))
);
create index trial_org_status_idx on public.trial_requests(organization_id,status,created_at);
create index trial_session_idx on public.trial_requests(organization_id,session_id);
create index trial_requester_idx on public.trial_requests(requested_by);
create index trial_reviewer_idx on public.trial_requests(reviewed_by) where reviewed_by is not null;

create function private.validate_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions%rowtype; v_capacity integer; v_occupied integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.requested_by <> (select auth.uid()) then
      raise exception 'Solicitação experimental inválida';
    end if;
    return new;
  end if;
  if new.organization_id <> old.organization_id or new.requested_by <> old.requested_by
    or new.prospect_name <> old.prospect_name or new.contact_email <> old.contact_email
    or new.reviewed_by <> (select auth.uid()) or old.status not in ('pending','scheduled') then
    raise exception 'Solicitação experimental não pode ser alterada';
  end if;
  if new.status = 'scheduled' and old.status = 'pending' then
    select * into v_session from public.class_sessions s
      where s.organization_id = new.organization_id and s.id = new.session_id for update;
    if not found or v_session.status <> 'scheduled'
      or v_session.lesson_date < (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'Aula experimental indisponível';
    end if;
    select c.capacity into v_capacity from public.swim_classes c
      where c.organization_id = new.organization_id and c.id = v_session.class_id and c.active for update;
    if v_capacity is null then raise exception 'Turma experimental inativa'; end if;
    select count(*) into v_occupied from public.class_enrollments e
      where e.organization_id = new.organization_id and e.class_id = v_session.class_id and e.active;
    select v_occupied + count(*) into v_occupied from public.makeup_requests m
      where m.organization_id = new.organization_id and m.target_session_id = v_session.id
      and m.status = 'approved' and not exists (
        select 1 from public.class_enrollments e where e.organization_id = m.organization_id
          and e.class_id = v_session.class_id and e.student_id = m.student_id and e.active);
    select v_occupied + count(*) into v_occupied from public.trial_requests t
      where t.organization_id = new.organization_id and t.session_id = v_session.id
        and t.status = 'scheduled' and t.id <> new.id;
    if v_occupied >= v_capacity then raise exception 'Aula experimental sem vagas'; end if;
  elsif not (old.status = 'pending' and new.status = 'cancelled'
      or old.status = 'scheduled' and new.status in ('completed','cancelled'))
      or (old.status = 'scheduled' and new.session_id is distinct from old.session_id) then
    raise exception 'Transição experimental inválida';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_trial() from public, anon, authenticated;
create trigger trial_guard before insert or update on public.trial_requests
for each row execute function private.validate_trial();
alter table public.trial_requests enable row level security;
create policy trial_read on public.trial_requests for select to authenticated
using (requested_by = (select auth.uid()) or private.has_org_role(organization_id,array['admin','reception']));
create policy trial_insert on public.trial_requests for insert to authenticated
with check (requested_by = (select auth.uid()) and status = 'pending'
  and (private.guardian_has_org_link(organization_id)
    or private.has_org_role(organization_id,array['admin','reception'])));
create policy trial_update on public.trial_requests for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']) and reviewed_by = (select auth.uid()));
revoke all on public.trial_requests from anon;
grant select,insert,update on public.trial_requests to authenticated;
create trigger trials_audit after insert or update on public.trial_requests
for each row execute function private.capture_audit();
