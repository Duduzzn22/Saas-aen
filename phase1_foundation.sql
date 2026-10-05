-- Phase 1. Apply to a new Supabase project only after review.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  role text not null check (role in ('admin','reception','teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id, organization_id) where active;

-- SECURITY DEFINER is restricted to this non-exposed schema. Every call uses
-- auth.uid(), so request-supplied user IDs never authorize access.
create or replace function private.has_org_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.active and m.role = any(p_roles)
  );
$$;
revoke all on function private.has_org_role(uuid,text[]) from public, anon;
grant execute on function private.has_org_role(uuid,text[]) to authenticated;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  birth_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index students_org_name_idx on public.students (organization_id, full_name);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text,
  email text,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index guardians_org_name_idx on public.guardians (organization_id, full_name);

create table public.student_guardians (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null default 'responsável',
  is_financial boolean not null default false,
  is_emergency boolean not null default false,
  primary key (organization_id, student_id, guardian_id),
  foreign key (organization_id, student_id) references public.students(organization_id,id) on delete cascade,
  foreign key (organization_id, guardian_id) references public.guardians(organization_id,id) on delete cascade
);
create index student_guardians_guardian_idx on public.student_guardians (organization_id,guardian_id);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,user_id),
  foreign key (organization_id,user_id) references public.memberships(organization_id,user_id)
);
create index teachers_org_name_idx on public.teachers (organization_id,full_name);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.teachers enable row level security;

create policy organizations_read on public.organizations for select to authenticated
using (private.has_org_role(id, array['admin','reception','teacher']));
create policy memberships_read on public.memberships for select to authenticated
using (user_id = (select auth.uid()) or private.has_org_role(organization_id,array['admin']));
-- Membership writes are provisioned by an operator in the SQL editor in Phase 1.
-- No client path can promote itself to admin or add another tenant.

create policy students_read on public.students for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy students_insert on public.students for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy students_update on public.students for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy guardians_read on public.guardians for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy guardians_insert on public.guardians for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy guardians_update on public.guardians for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy links_read on public.student_guardians for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy links_insert on public.student_guardians for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy links_delete on public.student_guardians for delete to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));

create policy teachers_read on public.teachers for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or
       (user_id = (select auth.uid()) and private.has_org_role(organization_id,array['teacher'])));
create policy teachers_insert on public.teachers for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy teachers_update on public.teachers for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

-- Explicit Data API grants are needed on new Supabase projects. RLS remains mandatory.
revoke all on public.organizations, public.memberships, public.students,
  public.guardians, public.student_guardians, public.teachers from anon;
grant select on public.organizations, public.memberships to authenticated;
grant select, insert, update on public.students, public.guardians, public.teachers to authenticated;
grant select, insert, delete on public.student_guardians to authenticated;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_user_id uuid,
  table_name text not null,
  row_id uuid,
  operation text not null,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_org_time_idx on public.audit_logs(organization_id,changed_at desc);
alter table public.audit_logs enable row level security;
create policy audit_admin_read on public.audit_logs for select to authenticated
using (private.has_org_role(organization_id,array['admin']));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function private.capture_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    insert into public.audit_logs(organization_id,actor_user_id,table_name,row_id,operation,old_data)
    values (old.organization_id,auth.uid(),TG_TABLE_NAME,old.id,TG_OP,to_jsonb(old));
    return old;
  elsif TG_OP = 'INSERT' then
    insert into public.audit_logs(organization_id,actor_user_id,table_name,row_id,operation,new_data)
    values (new.organization_id,auth.uid(),TG_TABLE_NAME,new.id,TG_OP,to_jsonb(new));
    return new;
  else
    insert into public.audit_logs(organization_id,actor_user_id,table_name,row_id,operation,old_data,new_data)
    values (new.organization_id,auth.uid(),TG_TABLE_NAME,new.id,TG_OP,to_jsonb(old),to_jsonb(new));
    return new;
  end if;
end;
$$;
revoke all on function private.capture_audit() from public, anon, authenticated;
create trigger students_audit after insert or update or delete on public.students
for each row execute function private.capture_audit();
create trigger guardians_audit after insert or update or delete on public.guardians
for each row execute function private.capture_audit();
create trigger teachers_audit after insert or update or delete on public.teachers
for each row execute function private.capture_audit();
