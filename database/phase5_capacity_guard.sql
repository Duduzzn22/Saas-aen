-- Reserve capacity for approved one-off makeup students as well as regular students.
create or replace function private.validate_enrollment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_active boolean; v_regular integer; v_makeups integer;
begin
  if not new.active then return new; end if;
  select c.capacity,c.active into v_capacity,v_active from public.swim_classes c
  where c.organization_id = new.organization_id and c.id = new.class_id for update;
  if not coalesce(v_active,false) or not exists (
    select 1 from public.students s where s.organization_id = new.organization_id
      and s.id = new.student_id and s.status = 'active'
  ) then raise exception 'Turma ou aluno inativo'; end if;
  select count(*) into v_regular from public.class_enrollments e
  where e.organization_id = new.organization_id and e.class_id = new.class_id
    and e.active and e.id <> new.id;
  select coalesce(max(booked),0) into v_makeups from (
    select count(*) as booked from public.makeup_requests m
    where m.organization_id = new.organization_id and m.target_class_id = new.class_id
      and m.status = 'approved' and m.student_id <> new.student_id
      and not exists (select 1 from public.class_enrollments e
        where e.organization_id = m.organization_id and e.class_id = new.class_id
          and e.student_id = m.student_id and e.active and e.id <> new.id)
    group by m.target_session_id
  ) per_session;
  if v_regular + 1 + v_makeups > v_capacity then raise exception 'Turma sem vagas'; end if;
  return new;
end;
$$;

create or replace function private.check_class_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_regular integer; v_makeups integer;
begin
  select count(*) into v_regular from public.class_enrollments e
  where e.organization_id = new.organization_id and e.class_id = new.id and e.active;
  select coalesce(max(booked),0) into v_makeups from (
    select count(*) as booked from public.makeup_requests m
    where m.organization_id = new.organization_id and m.target_class_id = new.id
      and m.status = 'approved' and not exists (select 1 from public.class_enrollments e
        where e.organization_id = m.organization_id and e.class_id = new.id
          and e.student_id = m.student_id and e.active)
    group by m.target_session_id
  ) per_session;
  if new.capacity < v_regular + v_makeups then
    raise exception 'Capacidade menor que as matrículas e reposições aprovadas';
  end if;
  return new;
end;
$$;

create or replace function private.validate_makeup()
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
    where c.organization_id = new.organization_id and c.id = v_target.class_id and c.active for update;
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
