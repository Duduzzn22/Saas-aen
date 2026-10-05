-- Continue Phase 2: virtual recurring calendar and safe maintenance.
-- Existing dated lessons stay intact when a weekly schedule is deactivated.

create function private.check_class_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.capacity < (
    select count(*) from public.class_enrollments e
    where e.organization_id = new.organization_id and e.class_id = new.id and e.active
  ) then raise exception 'Capacidade menor que o número de alunos matriculados'; end if;
  return new;
end;
$$;
revoke all on function private.check_class_capacity() from public, anon, authenticated;
create trigger class_capacity_guard before update of capacity on public.swim_classes
for each row execute function private.check_class_capacity();

create function private.check_schedule_resources()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.active and (
    not exists (select 1 from public.swim_classes c where c.organization_id = new.organization_id and c.id = new.class_id and c.active)
    or not exists (select 1 from public.pools p where p.organization_id = new.organization_id and p.id = new.pool_id and p.active)
    or not exists (select 1 from public.lanes l where l.organization_id = new.organization_id and l.id = new.lane_id and l.active)
  ) then raise exception 'Turma, piscina ou raia inativa'; end if;
  return new;
end;
$$;
revoke all on function private.check_schedule_resources() from public, anon, authenticated;
create trigger schedule_resources before insert or update on public.class_schedules
for each row execute function private.check_schedule_resources();

create function private.prevent_resource_deactivation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and exists (
    select 1 from public.class_schedules s
    where s.organization_id = new.organization_id and s.active
      and (case TG_TABLE_NAME
        when 'pools' then s.pool_id = new.id
        when 'lanes' then s.lane_id = new.id
        else s.class_id = new.id end)
  ) then raise exception 'Desative os horários antes de inativar o recurso'; end if;
  return new;
end;
$$;
revoke all on function private.prevent_resource_deactivation() from public, anon, authenticated;
create trigger pool_active_schedule before update of active on public.pools
for each row execute function private.prevent_resource_deactivation();
create trigger lane_active_schedule before update of active on public.lanes
for each row execute function private.prevent_resource_deactivation();
create trigger class_active_schedule before update of active on public.swim_classes
for each row execute function private.prevent_resource_deactivation();

create or replace function private.validate_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_schedule public.class_schedules%rowtype;
begin
  select s.* into v_schedule from public.class_schedules s
  join public.swim_classes c on c.organization_id = s.organization_id and c.id = s.class_id
  where s.organization_id = new.organization_id and s.class_id = new.class_id
    and s.id = new.schedule_id and s.active and c.active;
  if not found or extract(dow from new.lesson_date)::int <> v_schedule.weekday then
    raise exception 'Data fora de um horário semanal ativo';
  end if;
  if new.starts_at <> v_schedule.starts_at or new.ends_at <> v_schedule.ends_at then
    raise exception 'Horário da aula diferente do horário semanal';
  end if;
  return new;
end;
$$;

-- A teacher can materialize an occurrence of their own class when opening
-- its call sheet. The insert is still checked by validate_session().
create policy sessions_teacher_insert on public.class_sessions for insert to authenticated
with check (private.teaches_class(organization_id,class_id));
