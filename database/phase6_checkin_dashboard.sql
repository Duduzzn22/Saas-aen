create extension if not exists pgcrypto with schema extensions;

create table public.session_checkin_codes (
  organization_id uuid not null,
  session_id uuid not null,
  token_hash text not null check (length(token_hash) = 64),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id,session_id),
  foreign key (organization_id,session_id) references public.class_sessions(organization_id,id) on delete restrict
);
create index session_checkin_expires_idx on public.session_checkin_codes(expires_at);
create index session_checkin_creator_idx on public.session_checkin_codes(created_by);
alter table public.session_checkin_codes enable row level security;
create policy checkin_codes_read on public.session_checkin_codes for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception'])
  or exists (select 1 from public.class_sessions s where s.organization_id = session_checkin_codes.organization_id
    and s.id = session_checkin_codes.session_id and private.teaches_class(s.organization_id,s.class_id)));
create policy checkin_codes_insert on public.session_checkin_codes for insert to authenticated
with check (created_by = (select auth.uid()) and (private.has_org_role(organization_id,array['admin','reception'])
  or exists (select 1 from public.class_sessions s where s.organization_id = session_checkin_codes.organization_id
    and s.id = session_checkin_codes.session_id and private.teaches_class(s.organization_id,s.class_id))));
create policy checkin_codes_update on public.session_checkin_codes for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception'])
  or exists (select 1 from public.class_sessions s where s.organization_id = session_checkin_codes.organization_id
    and s.id = session_checkin_codes.session_id and private.teaches_class(s.organization_id,s.class_id)))
with check (created_by = (select auth.uid()) and (private.has_org_role(organization_id,array['admin','reception'])
  or exists (select 1 from public.class_sessions s where s.organization_id = session_checkin_codes.organization_id
    and s.id = session_checkin_codes.session_id and private.teaches_class(s.organization_id,s.class_id))));
revoke all on public.session_checkin_codes from anon;
grant select,insert,update on public.session_checkin_codes to authenticated;
create trigger checkin_codes_audit after insert or update on public.session_checkin_codes
for each row execute function private.capture_audit();

create function public.guardian_checkin(p_org uuid,p_session uuid,p_student uuid,p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.class_sessions%rowtype; v_code public.session_checkin_codes%rowtype;
  v_now timestamp := now() at time zone 'America/Sao_Paulo';
begin
  if (select auth.uid()) is null or length(p_token) < 32 or length(p_token) > 128
    or not private.guardian_of_student(p_org,p_student) then
    raise exception 'Check-in indisponível';
  end if;
  select * into v_session from public.class_sessions s
    where s.organization_id=p_org and s.id=p_session and s.status='scheduled';
  if not found or v_now < (v_session.lesson_date + v_session.starts_at - interval '20 minutes')
    or v_now > (v_session.lesson_date + v_session.ends_at) then
    raise exception 'Fora do horário da aula';
  end if;
  select * into v_code from public.session_checkin_codes c
    where c.organization_id=p_org and c.session_id=p_session;
  if not found or v_code.expires_at < now()
    or v_code.token_hash <> encode(extensions.digest(p_token,'sha256'),'hex') then
    raise exception 'Código inválido ou expirado';
  end if;
  if not (exists (select 1 from public.class_enrollments e
      where e.organization_id=p_org and e.class_id=v_session.class_id
        and e.student_id=p_student and e.active)
    or exists (select 1 from public.makeup_requests m
      where m.organization_id=p_org and m.target_session_id=p_session
        and m.student_id=p_student and m.status='approved')) then
    raise exception 'Aluno não participa desta aula';
  end if;
  insert into public.attendance(organization_id,class_id,session_id,student_id,status,recorded_by)
    values(p_org,v_session.class_id,p_session,p_student,'present',(select auth.uid()))
    on conflict (organization_id,session_id,student_id) do update
      set status='present',recorded_by=(select auth.uid()),recorded_at=now();
end;
$$;
revoke all on function public.guardian_checkin(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.guardian_checkin(uuid,uuid,uuid,text) to authenticated;

create function public.management_dashboard(p_org uuid,p_start date,p_end date)
returns table(month date,billed_cents numeric,received_cents numeric,
  sessions_count bigint,present_count bigint,absent_count bigint)
language sql stable security invoker set search_path = '' as $$
  with months as (
    select generate_series(date_trunc('month',p_start)::date,date_trunc('month',p_end)::date,interval '1 month')::date as month
    where p_start <= p_end and p_end <= p_start + interval '12 months'
      and private.has_org_role(p_org,array['admin','reception'])
  ), invoices as (
    select date_trunc('month',i.billing_month)::date as month,sum(i.amount_cents) amount
    from public.monthly_invoices i where i.organization_id=p_org and i.status='open'
      and i.billing_month between p_start and p_end group by 1
  ), payments as (
    select date_trunc('month',p.paid_on)::date as month,sum(p.amount_cents) amount
    from public.invoice_payments p where p.organization_id=p_org and p.voided_at is null
      and p.paid_on between p_start and (p_end + interval '1 month - 1 day')::date group by 1
  ), sessions as (
    select date_trunc('month',s.lesson_date)::date as month,count(*) amount
    from public.class_sessions s where s.organization_id=p_org and s.status='scheduled'
      and s.lesson_date between p_start and (p_end + interval '1 month - 1 day')::date group by 1
  ), calls as (
    select date_trunc('month',s.lesson_date)::date as month,
      count(*) filter (where a.status='present') present,
      count(*) filter (where a.status in ('absent','justified')) absent
    from public.attendance a join public.class_sessions s
      on s.organization_id=a.organization_id and s.id=a.session_id
    where a.organization_id=p_org and s.lesson_date between p_start and (p_end + interval '1 month - 1 day')::date
    group by 1
  )
  select m.month,coalesce(i.amount,0),coalesce(p.amount,0),
    coalesce(s.amount,0),coalesce(c.present,0),coalesce(c.absent,0)
  from months m left join invoices i using(month) left join payments p using(month)
    left join sessions s using(month) left join calls c using(month)
  order by m.month;
$$;
revoke all on function public.management_dashboard(uuid,date,date) from public, anon;
grant execute on function public.management_dashboard(uuid,date,date) to authenticated;
