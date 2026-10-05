-- Phase 2: operational schedule and attendance. Apply after phase1_foundation.sql.
create extension if not exists btree_gist with schema extensions;

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 80),
  active boolean not null default true,
  unique (organization_id,id),
  unique (organization_id,name)
);
create index pools_org_idx on public.pools(organization_id);

create table public.lanes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  pool_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  active boolean not null default true,
  foreign key (organization_id,pool_id) references public.pools(organization_id,id) on delete restrict,
  unique (organization_id,pool_id,id),
  unique (organization_id,pool_id,name)
);
create index lanes_pool_idx on public.lanes(organization_id,pool_id);

create table public.swim_classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 100),
  teacher_id uuid not null,
  capacity integer not null check (capacity between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id,teacher_id) references public.teachers(organization_id,id) on delete restrict,
  unique (organization_id,id)
);
create index swim_classes_teacher_idx on public.swim_classes(organization_id,teacher_id);

create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  pool_id uuid not null,
  lane_id uuid not null,
  weekday integer not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  check (starts_at < ends_at),
  foreign key (organization_id,class_id) references public.swim_classes(organization_id,id) on delete restrict,
  foreign key (organization_id,pool_id,lane_id) references public.lanes(organization_id,pool_id,id) on delete restrict,
  unique (organization_id,class_id,id),
  constraint lane_weekly_no_overlap exclude using gist (
    organization_id with =, lane_id with =, weekday with =,
    int4range(
      (extract(hour from starts_at)::int * 60 + extract(minute from starts_at)::int),
      (extract(hour from ends_at)::int * 60 + extract(minute from ends_at)::int)
    ) with &&
  ) where (active)
);
create index class_schedules_class_idx on public.class_schedules(organization_id,class_id);

create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  student_id uuid not null,
  active boolean not null default true,
  enrolled_at timestamptz not null default now(),
  foreign key (organization_id,class_id) references public.swim_classes(organization_id,id) on delete restrict,
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  unique (organization_id,class_id,student_id)
);
create index class_enrollments_student_idx on public.class_enrollments(organization_id,student_id);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  schedule_id uuid not null,
  lesson_date date not null,
  starts_at time not null,
  ends_at time not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at timestamptz not null default now(),
  foreign key (organization_id,class_id,schedule_id) references public.class_schedules(organization_id,class_id,id) on delete restrict,
  unique (organization_id,class_id,id),
  unique (organization_id,schedule_id,lesson_date),
  check (starts_at < ends_at)
);
create index class_sessions_calendar_idx on public.class_sessions(organization_id,lesson_date,starts_at);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status text not null check (status in ('present','absent','justified')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (organization_id,class_id,session_id) references public.class_sessions(organization_id,class_id,id) on delete restrict,
  foreign key (organization_id,class_id,student_id) references public.class_enrollments(organization_id,class_id,student_id) on delete restrict,
  unique (organization_id,session_id,student_id)
);
create index attendance_session_idx on public.attendance(organization_id,session_id);

-- Serialize enrollment changes against the class row so concurrent requests
-- cannot overbook a class. This also prevents enrolling inactive students.
create function private.validate_enrollment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_active boolean;
begin
  if not new.active then return new; end if;
  select c.capacity, c.active into v_capacity, v_active
  from public.swim_classes c
  where c.organization_id = new.organization_id and c.id = new.class_id
  for update;
  if not coalesce(v_active,false) or not exists (
    select 1 from public.students s
    where s.organization_id = new.organization_id and s.id = new.student_id and s.status = 'active'
  ) then raise exception 'Turma ou aluno inativo'; end if;
  if (select count(*) from public.class_enrollments e
      where e.organization_id = new.organization_id and e.class_id = new.class_id
        and e.active and e.id <> new.id) >= v_capacity then
    raise exception 'Turma sem vagas';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_enrollment() from public, anon, authenticated;
create trigger enrollment_capacity before insert or update on public.class_enrollments
for each row execute function private.validate_enrollment();

create function private.validate_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_schedule public.class_schedules%rowtype;
begin
  select * into v_schedule from public.class_schedules s
  where s.organization_id = new.organization_id and s.class_id = new.class_id
    and s.id = new.schedule_id;
  if not found or extract(dow from new.lesson_date)::int <> v_schedule.weekday then
    raise exception 'Data fora do horário semanal';
  end if;
  if new.starts_at <> v_schedule.starts_at or new.ends_at <> v_schedule.ends_at then
    raise exception 'Horário da aula diferente do horário semanal';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_session() from public, anon, authenticated;
create trigger session_matches_schedule before insert on public.class_sessions
for each row execute function private.validate_session();

create function private.validate_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.class_sessions s
    where s.organization_id = new.organization_id and s.class_id = new.class_id
      and s.id = new.session_id and s.status = 'scheduled'
  ) or not exists (
    select 1 from public.class_enrollments e
    where e.organization_id = new.organization_id and e.class_id = new.class_id
      and e.student_id = new.student_id and e.active
  ) then raise exception 'Aula cancelada ou aluno sem matrícula ativa'; end if;
  return new;
end;
$$;
revoke all on function private.validate_attendance() from public, anon, authenticated;
create trigger attendance_valid before insert or update on public.attendance
for each row execute function private.validate_attendance();

-- Check membership on every request, including teacher assignments. No user metadata is trusted.
create function private.teaches_class(p_org uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.memberships m
    join public.teachers t on t.organization_id = m.organization_id and t.user_id = m.user_id
    join public.swim_classes c on c.organization_id = t.organization_id and c.teacher_id = t.id
    where m.organization_id = p_org and c.id = p_class
      and m.user_id = (select auth.uid()) and m.active and m.role = 'teacher' and t.active
  );
$$;
revoke all on function private.teaches_class(uuid,uuid) from public, anon;
grant execute on function private.teaches_class(uuid,uuid) to authenticated;

create policy students_teacher_class_read on public.students for select to authenticated
using (exists (
  select 1 from public.class_enrollments e
  where e.organization_id = students.organization_id and e.student_id = students.id
    and e.active and private.teaches_class(e.organization_id,e.class_id)
));

alter table public.pools enable row level security;
alter table public.lanes enable row level security;
alter table public.swim_classes enable row level security;
alter table public.class_schedules enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;

create policy pools_read on public.pools for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception','teacher']));
create policy pools_insert on public.pools for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy pools_update on public.pools for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

create policy lanes_read on public.lanes for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception','teacher']));
create policy lanes_insert on public.lanes for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy lanes_update on public.lanes for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

create policy classes_read on public.swim_classes for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,id));
create policy classes_insert on public.swim_classes for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy classes_update on public.swim_classes for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy schedules_read on public.class_schedules for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id));
create policy schedules_insert on public.class_schedules for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy schedules_update on public.class_schedules for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy enrollments_read on public.class_enrollments for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id));
create policy enrollments_insert on public.class_enrollments for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy enrollments_update on public.class_enrollments for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy sessions_read on public.class_sessions for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id));
create policy sessions_insert on public.class_sessions for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy sessions_update on public.class_sessions for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy attendance_read on public.attendance for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id));
create policy attendance_insert on public.attendance for insert to authenticated
with check (recorded_by = (select auth.uid()) and
  (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id)));
create policy attendance_update on public.attendance for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id))
with check (recorded_by = (select auth.uid()) and
  (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_class(organization_id,class_id)));

revoke all on public.pools, public.lanes, public.swim_classes, public.class_schedules,
  public.class_enrollments, public.class_sessions, public.attendance from anon;
grant select,insert,update on public.pools, public.lanes, public.swim_classes,
  public.class_schedules, public.class_enrollments, public.class_sessions, public.attendance to authenticated;

create trigger pools_audit after insert or update on public.pools for each row execute function private.capture_audit();
create trigger lanes_audit after insert or update on public.lanes for each row execute function private.capture_audit();
create trigger classes_audit after insert or update on public.swim_classes for each row execute function private.capture_audit();
create trigger schedules_audit after insert or update on public.class_schedules for each row execute function private.capture_audit();
create trigger enrollments_audit after insert or update on public.class_enrollments for each row execute function private.capture_audit();
create trigger sessions_audit after insert or update on public.class_sessions for each row execute function private.capture_audit();
create trigger attendance_audit after insert or update on public.attendance for each row execute function private.capture_audit();
