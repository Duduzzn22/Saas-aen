-- A new history row must represent an actual change for an active student.
create function private.validate_level_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_previous uuid;
begin
  select s.status into v_status from public.students s
  where s.organization_id = new.organization_id and s.id = new.student_id for update;
  if v_status is distinct from 'active' then raise exception 'Aluno inativo'; end if;
  select h.level_id into v_previous from public.student_level_history h
  where h.organization_id = new.organization_id and h.student_id = new.student_id
  order by h.assigned_at desc, h.id desc limit 1;
  if v_previous = new.level_id then raise exception 'O aluno já está neste nível'; end if;
  if not exists (
    select 1 from public.swim_levels l where l.organization_id = new.organization_id
      and l.id = new.level_id and l.active
  ) then raise exception 'Nível inativo'; end if;
  return new;
end;
$$;
revoke all on function private.validate_level_transition() from public, anon, authenticated;
create trigger student_level_transition before insert on public.student_level_history
for each row execute function private.validate_level_transition();
