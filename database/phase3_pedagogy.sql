-- Phase 3: per-school pedagogy, immutable assessments and level progression.
-- Apply after all Phase 2 migrations.

create table public.swim_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 80),
  description text check (length(description) <= 500),
  rank integer not null check (rank between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,name),
  unique (organization_id,rank)
);
create index swim_levels_org_rank_idx on public.swim_levels(organization_id,rank);

create table public.swim_skills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  level_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 120),
  description text check (length(description) <= 500),
  position integer not null default 1 check (position between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (organization_id,level_id) references public.swim_levels(organization_id,id) on delete restrict,
  unique (organization_id,level_id,id),
  unique (organization_id,level_id,name)
);
create index swim_skills_level_idx on public.swim_skills(organization_id,level_id,position);

create table public.student_level_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  level_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  reason text check (length(reason) <= 500),
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  foreign key (organization_id,level_id) references public.swim_levels(organization_id,id) on delete restrict
);
create index level_history_student_idx on public.student_level_history(organization_id,student_id,assigned_at desc);
create index level_history_level_idx on public.student_level_history(organization_id,level_id);
create index level_history_actor_idx on public.student_level_history(assigned_by);

create table public.student_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  level_id uuid not null,
  assessor_user_id uuid not null references auth.users(id),
  assessed_on date not null default current_date,
  summary text check (length(summary) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  foreign key (organization_id,level_id) references public.swim_levels(organization_id,id) on delete restrict,
  unique (organization_id,id,level_id)
);
create index assessments_student_idx on public.student_assessments(organization_id,student_id,assessed_on desc);
create index assessments_level_idx on public.student_assessments(organization_id,level_id);
create index assessments_actor_idx on public.student_assessments(assessor_user_id);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assessment_id uuid not null,
  level_id uuid not null,
  skill_id uuid not null,
  result text not null check (result in ('not_started','developing','achieved')),
  foreign key (organization_id,assessment_id,level_id) references public.student_assessments(organization_id,id,level_id) on delete restrict,
  foreign key (organization_id,level_id,skill_id) references public.swim_skills(organization_id,level_id,id) on delete restrict,
  unique (organization_id,assessment_id,skill_id)
);
create index assessment_results_assessment_idx on public.assessment_results(organization_id,assessment_id,level_id);
create index assessment_results_skill_idx on public.assessment_results(organization_id,level_id,skill_id);

create function private.teaches_student(p_org uuid,p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.class_enrollments e
    join public.swim_classes c on c.organization_id = e.organization_id and c.id = e.class_id
    where e.organization_id = p_org and e.student_id = p_student and e.active and c.active
      and private.teaches_class(e.organization_id,e.class_id)
  );
$$;
revoke all on function private.teaches_student(uuid,uuid) from public, anon;
grant execute on function private.teaches_student(uuid,uuid) to authenticated;

create function private.can_read_assessment(p_org uuid,p_assessment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_assessments a
    where a.organization_id = p_org and a.id = p_assessment
      and (private.has_org_role(p_org,array['admin','reception'])
        or private.teaches_student(p_org,a.student_id))
  );
$$;
revoke all on function private.can_read_assessment(uuid,uuid) from public, anon;
grant execute on function private.can_read_assessment(uuid,uuid) to authenticated;

alter table public.swim_levels enable row level security;
alter table public.swim_skills enable row level security;
alter table public.student_level_history enable row level security;
alter table public.student_assessments enable row level security;
alter table public.assessment_results enable row level security;

create policy levels_read on public.swim_levels for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception','teacher']));
create policy levels_insert on public.swim_levels for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy levels_update on public.swim_levels for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

create policy skills_read on public.swim_skills for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception','teacher']));
create policy skills_insert on public.swim_skills for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy skills_update on public.swim_skills for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

create policy level_history_read on public.student_level_history for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_student(organization_id,student_id));
create policy level_history_insert on public.student_level_history for insert to authenticated
with check (assigned_by = (select auth.uid()) and
  (private.has_org_role(organization_id,array['admin']) or private.teaches_student(organization_id,student_id)));

create policy assessments_read on public.student_assessments for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']) or private.teaches_student(organization_id,student_id));
create policy assessments_insert on public.student_assessments for insert to authenticated
with check (assessor_user_id = (select auth.uid()) and
  (private.has_org_role(organization_id,array['admin']) or private.teaches_student(organization_id,student_id)));

create policy results_read on public.assessment_results for select to authenticated
using (private.can_read_assessment(organization_id,assessment_id));
create policy results_insert on public.assessment_results for insert to authenticated
with check (exists (
  select 1 from public.student_assessments a
  where a.organization_id = assessment_results.organization_id and a.id = assessment_results.assessment_id
    and a.level_id = assessment_results.level_id and a.assessor_user_id = (select auth.uid())
));

revoke all on public.swim_levels, public.swim_skills, public.student_level_history,
  public.student_assessments, public.assessment_results from anon;
grant select,insert,update on public.swim_levels, public.swim_skills to authenticated;
grant select,insert on public.student_level_history, public.student_assessments, public.assessment_results to authenticated;

-- One transaction creates the evaluation header and all skill results.
-- Security invoker keeps the table RLS policies active.
create function public.record_swim_assessment(
  p_org uuid, p_student uuid, p_level uuid, p_date date, p_summary text, p_results jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_skill uuid; v_result text; v_count integer;
begin
  if (select auth.uid()) is null or jsonb_typeof(p_results) is distinct from 'array'
    or jsonb_array_length(p_results) not between 1 and 100
    or p_date is null or p_date > current_date
    or length(coalesce(p_summary,'')) > 1000 then
    raise exception 'Avaliação inválida';
  end if;
  select count(*) into v_count from public.swim_skills
  where organization_id = p_org and level_id = p_level and active;
  if v_count <> jsonb_array_length(p_results) then raise exception 'Habilidades incompletas'; end if;
  insert into public.student_assessments(organization_id,student_id,level_id,assessor_user_id,assessed_on,summary)
  values(p_org,p_student,p_level,(select auth.uid()),p_date,nullif(trim(p_summary),'')) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_results) loop
    v_skill := (v_item->>'skill_id')::uuid;
    v_result := v_item->>'result';
    if v_result not in ('not_started','developing','achieved') or not exists (
      select 1 from public.swim_skills s where s.organization_id = p_org
        and s.level_id = p_level and s.id = v_skill and s.active
    ) then raise exception 'Habilidade inválida'; end if;
    insert into public.assessment_results(organization_id,assessment_id,level_id,skill_id,result)
    values(p_org,v_id,p_level,v_skill,v_result);
  end loop;
  return v_id;
end;
$$;
revoke all on function public.record_swim_assessment(uuid,uuid,uuid,date,text,jsonb) from public, anon;
grant execute on function public.record_swim_assessment(uuid,uuid,uuid,date,text,jsonb) to authenticated;

create trigger levels_audit after insert or update on public.swim_levels for each row execute function private.capture_audit();
create trigger skills_audit after insert or update on public.swim_skills for each row execute function private.capture_audit();
create trigger level_history_audit after insert on public.student_level_history for each row execute function private.capture_audit();
create trigger assessments_audit after insert on public.student_assessments for each row execute function private.capture_audit();
create trigger results_audit after insert on public.assessment_results for each row execute function private.capture_audit();
