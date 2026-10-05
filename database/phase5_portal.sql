-- Phase 5: verified guardian access, school notices and read-only portal data.
-- A confirmed email may request access; an administrator must approve it.

create table public.guardian_access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  guardian_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  foreign key (organization_id,guardian_id) references public.guardians(organization_id,id) on delete restrict,
  unique (organization_id,guardian_id,user_id)
);
create index guardian_requests_org_status_idx on public.guardian_access_requests(organization_id,status,requested_at);
create index guardian_requests_user_idx on public.guardian_access_requests(user_id);
create index guardian_requests_reviewer_idx on public.guardian_access_requests(reviewed_by) where reviewed_by is not null;

create table public.guardian_portal_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  guardian_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,guardian_id) references public.guardians(organization_id,id) on delete restrict,
  unique (organization_id,guardian_id,user_id)
);
create index guardian_links_user_idx on public.guardian_portal_links(user_id,organization_id) where active;
create index guardian_links_guardian_idx on public.guardian_portal_links(organization_id,guardian_id) where active;
create index guardian_links_creator_idx on public.guardian_portal_links(created_by);

create function private.verified_guardian_email_match(p_org uuid,p_guardian uuid,p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardians g join auth.users u
      on lower(trim(g.email)) = lower(trim(u.email))
    where g.organization_id = p_org and g.id = p_guardian and g.email is not null
      and u.id = p_user and u.email_confirmed_at is not null
  );
$$;
revoke all on function private.verified_guardian_email_match(uuid,uuid,uuid) from public, anon;
grant execute on function private.verified_guardian_email_match(uuid,uuid,uuid) to authenticated;

create function private.guardian_of_student(p_org uuid,p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.student_guardians sg
    join public.guardian_portal_links l on l.organization_id = sg.organization_id
      and l.guardian_id = sg.guardian_id
    where sg.organization_id = p_org and sg.student_id = p_student
      and l.user_id = (select auth.uid()) and l.active
      and private.verified_guardian_email_match(l.organization_id,l.guardian_id,l.user_id)
  );
$$;
revoke all on function private.guardian_of_student(uuid,uuid) from public, anon;
grant execute on function private.guardian_of_student(uuid,uuid) to authenticated;

create function private.financial_guardian_of_student(p_org uuid,p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.student_guardians sg
    join public.guardian_portal_links l on l.organization_id = sg.organization_id
      and l.guardian_id = sg.guardian_id
    where sg.organization_id = p_org and sg.student_id = p_student and sg.is_financial
      and l.user_id = (select auth.uid()) and l.active
      and private.verified_guardian_email_match(l.organization_id,l.guardian_id,l.user_id)
  );
$$;
revoke all on function private.financial_guardian_of_student(uuid,uuid) from public, anon;
grant execute on function private.financial_guardian_of_student(uuid,uuid) to authenticated;

create function private.guardian_of_class(p_org uuid,p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_enrollments e
    where e.organization_id = p_org and e.class_id = p_class and e.active
      and private.guardian_of_student(e.organization_id,e.student_id)
  );
$$;
revoke all on function private.guardian_of_class(uuid,uuid) from public, anon;
grant execute on function private.guardian_of_class(uuid,uuid) to authenticated;

create function private.guardian_of_assessment(p_org uuid,p_assessment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_assessments a
    where a.organization_id = p_org and a.id = p_assessment
      and private.guardian_of_student(a.organization_id,a.student_id)
  );
$$;
revoke all on function private.guardian_of_assessment(uuid,uuid) from public, anon;
grant execute on function private.guardian_of_assessment(uuid,uuid) to authenticated;

create function private.guardian_has_org_link(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.guardian_portal_links l
    where l.organization_id = p_org and l.user_id = (select auth.uid()) and l.active
      and private.verified_guardian_email_match(l.organization_id,l.guardian_id,l.user_id)
  );
$$;
revoke all on function private.guardian_has_org_link(uuid) from public, anon;
grant execute on function private.guardian_has_org_link(uuid) to authenticated;

create function private.validate_guardian_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active and not private.verified_guardian_email_match(new.organization_id,new.guardian_id,new.user_id) then
    raise exception 'Conta sem e-mail confirmado correspondente';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_guardian_link() from public, anon, authenticated;
create trigger guardian_link_verified before insert or update on public.guardian_portal_links
for each row execute function private.validate_guardian_link();

alter table public.guardian_access_requests enable row level security;
alter table public.guardian_portal_links enable row level security;
create policy guardian_self_lookup on public.guardians for select to authenticated
using (private.verified_guardian_email_match(organization_id,id,(select auth.uid())));
create policy access_requests_read on public.guardian_access_requests for select to authenticated
using (user_id = (select auth.uid()) or private.has_org_role(organization_id,array['admin','reception']));
create policy access_requests_insert on public.guardian_access_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null
  and private.verified_guardian_email_match(organization_id,guardian_id,user_id));
create policy access_requests_update on public.guardian_access_requests for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']) and reviewed_by = (select auth.uid()));
create policy guardian_links_read on public.guardian_portal_links for select to authenticated
using (user_id = (select auth.uid()) or private.has_org_role(organization_id,array['admin','reception']));
create policy guardian_links_insert on public.guardian_portal_links for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_org_role(organization_id,array['admin']));
create policy guardian_links_update on public.guardian_portal_links for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));
revoke all on public.guardian_access_requests, public.guardian_portal_links from anon;
grant select,insert,update on public.guardian_access_requests, public.guardian_portal_links to authenticated;

create function public.review_guardian_access(p_request uuid,p_approve boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_request public.guardian_access_requests%rowtype;
begin
  select * into v_request from public.guardian_access_requests r where r.id = p_request for update;
  if not found or v_request.status <> 'pending'
    or not private.has_org_role(v_request.organization_id,array['admin']) then
    raise exception 'Solicitação indisponível';
  end if;
  if p_approve then
    insert into public.guardian_portal_links(organization_id,guardian_id,user_id,created_by)
    values(v_request.organization_id,v_request.guardian_id,v_request.user_id,(select auth.uid()))
    on conflict (organization_id,guardian_id,user_id) do update set active = true;
  end if;
  update public.guardian_access_requests set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = (select auth.uid()), reviewed_at = now() where id = p_request;
end;
$$;
revoke all on function public.review_guardian_access(uuid,boolean) from public, anon;
grant execute on function public.review_guardian_access(uuid,boolean) to authenticated;

create policy student_guardian_portal_read on public.students for select to authenticated
using (private.guardian_of_student(organization_id,id));
create policy student_guardians_portal_read on public.student_guardians for select to authenticated
using (exists (select 1 from public.guardian_portal_links l
  where l.organization_id = student_guardians.organization_id
    and l.guardian_id = student_guardians.guardian_id and l.user_id = (select auth.uid()) and l.active
    and private.verified_guardian_email_match(l.organization_id,l.guardian_id,l.user_id)));
create policy enrollments_portal_read on public.class_enrollments for select to authenticated
using (private.guardian_of_student(organization_id,student_id));
create policy classes_portal_read on public.swim_classes for select to authenticated
using (private.guardian_of_class(organization_id,id));
create policy schedules_portal_read on public.class_schedules for select to authenticated
using (private.guardian_of_class(organization_id,class_id));
create policy sessions_portal_read on public.class_sessions for select to authenticated
using (private.guardian_of_class(organization_id,class_id));
create policy attendance_portal_read on public.attendance for select to authenticated
using (private.guardian_of_student(organization_id,student_id));
create policy level_history_portal_read on public.student_level_history for select to authenticated
using (private.guardian_of_student(organization_id,student_id));
create policy assessments_portal_read on public.student_assessments for select to authenticated
using (private.guardian_of_student(organization_id,student_id));
create policy results_portal_read on public.assessment_results for select to authenticated
using (private.guardian_of_assessment(organization_id,assessment_id));
create policy invoices_portal_read on public.monthly_invoices for select to authenticated
using (private.financial_guardian_of_student(organization_id,student_id));
create policy payments_portal_read on public.invoice_payments for select to authenticated
using (exists (select 1 from public.monthly_invoices i
  where i.organization_id = invoice_payments.organization_id and i.id = invoice_payments.invoice_id
    and private.financial_guardian_of_student(i.organization_id,i.student_id)));

create table public.portal_notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  guardian_id uuid,
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null check (length(trim(body)) between 3 and 2000),
  active boolean not null default true,
  expires_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,guardian_id) references public.guardians(organization_id,id) on delete restrict
);
create index portal_notices_org_idx on public.portal_notices(organization_id,created_at desc);
create index portal_notices_guardian_idx on public.portal_notices(organization_id,guardian_id);
create index portal_notices_creator_idx on public.portal_notices(created_by);
alter table public.portal_notices enable row level security;
create policy portal_notices_read on public.portal_notices for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or
  (active and (expires_on is null or expires_on >= (now() at time zone 'America/Sao_Paulo')::date)
    and private.guardian_has_org_link(organization_id)
    and (guardian_id is null or exists (
      select 1 from public.guardian_portal_links l where l.organization_id = portal_notices.organization_id
        and l.guardian_id = portal_notices.guardian_id and l.user_id = (select auth.uid()) and l.active
    ))));
create policy portal_notices_insert on public.portal_notices for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_org_role(organization_id,array['admin','reception']));
create policy portal_notices_update on public.portal_notices for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));
revoke all on public.portal_notices from anon;
grant select,insert,update on public.portal_notices to authenticated;

create trigger requests_audit after insert or update on public.guardian_access_requests for each row execute function private.capture_audit();
create trigger links_audit after insert or update on public.guardian_portal_links for each row execute function private.capture_audit();
create trigger notices_audit after insert or update on public.portal_notices for each row execute function private.capture_audit();
