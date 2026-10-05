-- One-off makeup bookings are separate from recurring class enrollments.
create table public.makeup_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  original_class_id uuid not null,
  original_session_id uuid not null,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  preferred_date date,
  note text check (length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  target_class_id uuid,
  target_session_id uuid,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  foreign key (organization_id,original_class_id,original_session_id)
    references public.class_sessions(organization_id,class_id,id) on delete restrict,
  foreign key (organization_id,target_class_id,target_session_id)
    references public.class_sessions(organization_id,class_id,id) on delete restrict,
  unique (organization_id,student_id,original_session_id),
  check ((status = 'pending' and target_session_id is null and target_class_id is null and reviewed_by is null)
      or (status = 'rejected' and target_session_id is null and target_class_id is null and reviewed_by is not null)
      or (status = 'approved' and target_session_id is not null and target_class_id is not null and reviewed_by is not null))
);
create unique index makeup_target_student_unique on public.makeup_requests(organization_id,target_session_id,student_id)
where status = 'approved';
create index makeup_org_status_idx on public.makeup_requests(organization_id,status,requested_at);
create index makeup_student_idx on public.makeup_requests(organization_id,student_id);
create index makeup_target_idx on public.makeup_requests(organization_id,target_class_id,target_session_id);
create index makeup_requester_idx on public.makeup_requests(requested_by);
create index makeup_reviewer_idx on public.makeup_requests(reviewed_by) where reviewed_by is not null;

create function private.validate_makeup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_original public.class_sessions%rowtype; v_target public.class_sessions%rowtype;
v_capacity integer; v_enrolled boolean; v_occupied integer;
begin
  if tg_op = 'INSERT' then
    select * into v_original from public.class_sessions s
    where s.organization_id = new.organization_id and s.id = new.original_session_id;
    if not found or v_original.class_id <> new.original_class_id
      or v_original.lesson_date > (now() at time zone 'America/Sao_Paulo')::date
      or not exists (select 1 from public.class_enrollments e
        where e.organization_id = new.organization_id and e.class_id = new.original_class_id
          and e.student_id = new.student_id and e.active)
      or (v_original.status <> 'cancelled' and not exists (
        select 1 from public.attendance a where a.organization_id = new.organization_id
          and a.session_id = new.original_session_id and a.student_id = new.student_id
          and a.status in ('absent','justified'))) then
      raise exception 'Aula original não elegível para reposição';
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.organization_id <> old.organization_id
    or new.student_id <> old.student_id or new.original_session_id <> old.original_session_id
    or new.requested_by <> old.requested_by or new.reviewed_by <> (select auth.uid()) then
    raise exception 'Solicitação não pode ser alterada';
  end if;
  if new.status = 'approved' then
    select * into v_target from public.class_sessions s
    where s.organization_id = new.organization_id and s.id = new.target_session_id for update;
    if not found or v_target.class_id <> new.target_class_id or v_target.status <> 'scheduled'
      or v_target.lesson_date < (now() at time zone 'America/Sao_Paulo')::date
      or v_target.id = new.original_session_id then
      raise exception 'Aula de reposição indisponível';
    end if;
    select c.capacity into v_capacity from public.swim_classes c
    where c.organization_id = new.organization_id and c.id = v_target.class_id and c.active;
    if v_capacity is null then raise exception 'Turma de reposição inativa'; end if;
    select exists (select 1 from public.class_enrollments e
      where e.organization_id = new.organization_id and e.class_id = v_target.class_id
        and e.student_id = new.student_id and e.active) into v_enrolled;
    select count(*) into v_occupied from public.class_enrollments e
    where e.organization_id = new.organization_id and e.class_id = v_target.class_id and e.active;
    select v_occupied + count(*) into v_occupied from public.makeup_requests m
    where m.organization_id = new.organization_id and m.target_session_id = v_target.id
      and m.status = 'approved' and m.id <> new.id and not exists (
        select 1 from public.class_enrollments e where e.organization_id = m.organization_id
          and e.class_id = v_target.class_id and e.student_id = m.student_id and e.active);
    if not v_enrolled and v_occupied >= v_capacity then raise exception 'Aula de reposição sem vagas'; end if;
  elsif new.status <> 'rejected' then
    raise exception 'Decisão de reposição inválida';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_makeup() from public, anon, authenticated;
create trigger makeup_guard before insert or update on public.makeup_requests
for each row execute function private.validate_makeup();

alter table public.makeup_requests enable row level security;
create policy makeup_read on public.makeup_requests for select to authenticated
using (requested_by = (select auth.uid())
  or private.has_org_role(organization_id,array['admin','reception'])
  or (status = 'approved' and private.teaches_class(organization_id,target_class_id)));
create policy makeup_insert on public.makeup_requests for insert to authenticated
with check (requested_by = (select auth.uid()) and private.guardian_of_student(organization_id,student_id)
  and status = 'pending');
create policy makeup_update on public.makeup_requests for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception'])
  and reviewed_by = (select auth.uid()));
revoke all on public.makeup_requests from anon;
grant select,insert,update on public.makeup_requests to authenticated;

-- Attendance may belong to a normal enrollment or a single approved makeup.
alter table public.attendance drop constraint attendance_organization_id_class_id_student_id_fkey;
create or replace function private.validate_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.class_sessions s
    where s.organization_id = new.organization_id and s.class_id = new.class_id
      and s.id = new.session_id and s.status = 'scheduled'
  ) or not (
    exists (select 1 from public.class_enrollments e
      where e.organization_id = new.organization_id and e.class_id = new.class_id
        and e.student_id = new.student_id and e.active)
    or exists (select 1 from public.makeup_requests m
      where m.organization_id = new.organization_id and m.target_class_id = new.class_id
        and m.target_session_id = new.session_id and m.student_id = new.student_id
        and m.status = 'approved')
  ) then raise exception 'Aula cancelada ou aluno sem matrícula ou reposição ativa'; end if;
  return new;
end;
$$;
create policy students_teacher_makeup_read on public.students for select to authenticated
using (exists (select 1 from public.makeup_requests m
  where m.organization_id = students.organization_id and m.student_id = students.id
    and m.status = 'approved' and private.teaches_class(m.organization_id,m.target_class_id)));

create trigger makeups_audit after insert or update on public.makeup_requests
for each row execute function private.capture_audit();
