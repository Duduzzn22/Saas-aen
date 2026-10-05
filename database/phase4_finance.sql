-- Phase 4: monthly billing in BRL, manual payments and reversible voids.
-- Apply after Phase 3. No gateway charge is created by this migration.

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 100),
  description text check (length(description) <= 500),
  amount_cents bigint not null check (amount_cents between 1 and 1000000000),
  due_day integer not null check (due_day between 1 and 28),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,name)
);
create index billing_plans_org_idx on public.billing_plans(organization_id);

create table public.student_billing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  plan_id uuid not null,
  started_on date not null default current_date,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  foreign key (organization_id,plan_id) references public.billing_plans(organization_id,id) on delete restrict,
  unique (organization_id,student_id)
);
create index student_billing_plan_idx on public.student_billing(organization_id,plan_id);

create table public.monthly_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  plan_id uuid not null,
  billing_month date not null check (extract(day from billing_month) = 1),
  plan_name text not null,
  amount_cents bigint not null check (amount_cents between 1 and 1000000000),
  due_on date not null,
  status text not null default 'open' check (status in ('open','void')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text check (length(void_reason) <= 500),
  foreign key (organization_id,student_id) references public.students(organization_id,id) on delete restrict,
  foreign key (organization_id,plan_id) references public.billing_plans(organization_id,id) on delete restrict,
  unique (organization_id,id),
  unique (organization_id,student_id,billing_month),
  check (due_on >= billing_month and due_on < (billing_month + interval '1 month')::date),
  check ((status = 'open' and voided_at is null and voided_by is null)
      or (status = 'void' and voided_at is not null and voided_by is not null))
);
create index monthly_invoices_month_idx on public.monthly_invoices(organization_id,billing_month,due_on);
create index monthly_invoices_student_idx on public.monthly_invoices(organization_id,student_id);
create index monthly_invoices_plan_idx on public.monthly_invoices(organization_id,plan_id);
create index monthly_invoices_creator_idx on public.monthly_invoices(created_by);
create index monthly_invoices_void_actor_idx on public.monthly_invoices(voided_by) where voided_by is not null;

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents between 1 and 1000000000),
  paid_on date not null,
  method text not null check (method in ('cash','bank_transfer','pix','card','other')),
  reference text check (length(reference) <= 120),
  received_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_by uuid references auth.users(id),
  voided_at timestamptz,
  void_reason text check (length(void_reason) <= 500),
  foreign key (organization_id,invoice_id) references public.monthly_invoices(organization_id,id) on delete restrict,
  check ((voided_at is null and voided_by is null) or (voided_at is not null and voided_by is not null))
);
create index invoice_payments_invoice_idx on public.invoice_payments(organization_id,invoice_id) where voided_at is null;
create index invoice_payments_actor_idx on public.invoice_payments(received_by);
create index invoice_payments_void_actor_idx on public.invoice_payments(voided_by) where voided_by is not null;

create function private.validate_invoice_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'status' - 'voided_by' - 'voided_at' - 'void_reason')
      is distinct from (to_jsonb(old) - 'status' - 'voided_by' - 'voided_at' - 'void_reason')
      or old.status <> 'open' or new.status <> 'void' or new.voided_by <> (select auth.uid())
      or length(trim(coalesce(new.void_reason,''))) < 3 then
      raise exception 'A mensalidade só pode ser cancelada com justificativa';
    end if;
    if exists (select 1 from public.invoice_payments p
      where p.organization_id = old.organization_id and p.invoice_id = old.id and p.voided_at is null) then
      raise exception 'Estorne os pagamentos antes de cancelar a mensalidade';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_invoice_change() from public, anon, authenticated;
create trigger invoice_change_guard before update on public.monthly_invoices
for each row execute function private.validate_invoice_change();

create function private.validate_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invoice public.monthly_invoices%rowtype; v_paid bigint;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'voided_by' - 'voided_at' - 'void_reason')
      is distinct from (to_jsonb(old) - 'voided_by' - 'voided_at' - 'void_reason')
      or old.voided_at is not null or new.voided_at is null
      or new.voided_by <> (select auth.uid()) or length(trim(coalesce(new.void_reason,''))) < 3 then
      raise exception 'O pagamento só pode ser estornado com justificativa';
    end if;
    return new;
  end if;
  select * into v_invoice from public.monthly_invoices i
    where i.organization_id = new.organization_id and i.id = new.invoice_id for update;
  if not found or v_invoice.status <> 'open' or new.voided_at is not null then
    raise exception 'Mensalidade indisponível para pagamento';
  end if;
  select coalesce(sum(p.amount_cents),0) into v_paid from public.invoice_payments p
    where p.organization_id = new.organization_id and p.invoice_id = new.invoice_id and p.voided_at is null;
  if v_paid + new.amount_cents > v_invoice.amount_cents then
    raise exception 'Pagamento maior que o saldo da mensalidade';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_payment_change() from public, anon, authenticated;
create trigger payment_change_guard before insert or update on public.invoice_payments
for each row execute function private.validate_payment_change();

alter table public.billing_plans enable row level security;
alter table public.student_billing enable row level security;
alter table public.monthly_invoices enable row level security;
alter table public.invoice_payments enable row level security;

create policy plans_read on public.billing_plans for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy plans_insert on public.billing_plans for insert to authenticated
with check (private.has_org_role(organization_id,array['admin']));
create policy plans_update on public.billing_plans for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']));

create policy student_billing_read on public.student_billing for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy student_billing_insert on public.student_billing for insert to authenticated
with check (private.has_org_role(organization_id,array['admin','reception']));
create policy student_billing_update on public.student_billing for update to authenticated
using (private.has_org_role(organization_id,array['admin','reception']))
with check (private.has_org_role(organization_id,array['admin','reception']));

create policy invoices_read on public.monthly_invoices for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy invoices_insert on public.monthly_invoices for insert to authenticated
with check (created_by = (select auth.uid()) and private.has_org_role(organization_id,array['admin','reception']));
create policy invoices_update on public.monthly_invoices for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']) and voided_by = (select auth.uid()));

create policy payments_read on public.invoice_payments for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy payments_insert on public.invoice_payments for insert to authenticated
with check (received_by = (select auth.uid()) and private.has_org_role(organization_id,array['admin','reception']));
create policy payments_update on public.invoice_payments for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (private.has_org_role(organization_id,array['admin']) and voided_by = (select auth.uid()));

revoke all on public.billing_plans, public.student_billing, public.monthly_invoices, public.invoice_payments from anon;
grant select,insert,update on public.billing_plans, public.student_billing,
  public.monthly_invoices, public.invoice_payments to authenticated;

create function public.generate_monthly_invoices(p_org uuid,p_month date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if not private.has_org_role(p_org,array['admin','reception']) or p_month is null
    or extract(day from p_month) <> 1
    or p_month < (date_trunc('month',current_date) - interval '24 months')::date
    or p_month > (date_trunc('month',current_date) + interval '12 months')::date then
    raise exception 'Mês de faturamento inválido';
  end if;
  insert into public.monthly_invoices(
    organization_id,student_id,plan_id,billing_month,plan_name,amount_cents,due_on,created_by
  )
  select b.organization_id,b.student_id,p.id,p_month,p.name,p.amount_cents,
    make_date(extract(year from p_month)::int,extract(month from p_month)::int,p.due_day),
    (select auth.uid())
  from public.student_billing b
  join public.students s on s.organization_id = b.organization_id and s.id = b.student_id
  join public.billing_plans p on p.organization_id = b.organization_id and p.id = b.plan_id
  where b.organization_id = p_org and b.active and s.status = 'active'
    and b.started_on < (p_month + interval '1 month')::date
  on conflict (organization_id,student_id,billing_month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.generate_monthly_invoices(uuid,date) from public, anon;
grant execute on function public.generate_monthly_invoices(uuid,date) to authenticated;

create trigger billing_plans_audit after insert or update on public.billing_plans for each row execute function private.capture_audit();
create trigger student_billing_audit after insert or update on public.student_billing for each row execute function private.capture_audit();
create trigger monthly_invoices_audit after insert or update on public.monthly_invoices for each row execute function private.capture_audit();
create trigger invoice_payments_audit after insert or update on public.invoice_payments for each row execute function private.capture_audit();
