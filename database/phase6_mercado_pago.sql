-- Each school authorizes its own seller account. OAuth tokens are encrypted by the
-- server before storage; the encryption key never enters the database or browser.
create table public.mp_connections (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  seller_id text not null unique,
  access_cipher text not null,
  refresh_cipher text not null,
  expires_at timestamptz not null,
  live_mode boolean not null,
  connected_by uuid not null references auth.users(id),
  connected_at timestamptz not null default now()
);
create index mp_connections_actor_idx on public.mp_connections(connected_by);
alter table public.mp_connections enable row level security;
create policy mp_connections_admin_read on public.mp_connections for select to authenticated
using (private.has_org_role(organization_id,array['admin']));
create policy mp_connections_admin_insert on public.mp_connections for insert to authenticated
with check (connected_by=(select auth.uid()) and private.has_org_role(organization_id,array['admin']));
create policy mp_connections_admin_update on public.mp_connections for update to authenticated
using (private.has_org_role(organization_id,array['admin']))
with check (connected_by=(select auth.uid()) and private.has_org_role(organization_id,array['admin']));
revoke all on public.mp_connections from anon;
grant select,insert,update on public.mp_connections to authenticated;
create trigger mp_connections_audit after insert or update on public.mp_connections
for each row execute function private.capture_audit();

create table public.mp_oauth_states (
  state_hash text primary key check (length(state_hash)=64),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index mp_oauth_states_user_idx on public.mp_oauth_states(user_id);
alter table public.mp_oauth_states enable row level security;
create policy mp_oauth_states_read on public.mp_oauth_states for select to authenticated
using (user_id=(select auth.uid()) and private.has_org_role(organization_id,array['admin']));
create policy mp_oauth_states_insert on public.mp_oauth_states for insert to authenticated
with check (user_id=(select auth.uid()) and private.has_org_role(organization_id,array['admin']));
create policy mp_oauth_states_delete on public.mp_oauth_states for delete to authenticated
using (user_id=(select auth.uid()) and private.has_org_role(organization_id,array['admin']));
revoke all on public.mp_oauth_states from anon;
grant select,insert,delete on public.mp_oauth_states to authenticated;

create table public.pix_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  payer_email text not null,
  status text not null default 'creating'
    check (status in ('creating','pending','approved','failed','expired','needs_review')),
  mp_payment_id text unique,
  idempotency_key uuid not null default gen_random_uuid() unique,
  qr_code text,
  ticket_url text,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  foreign key (organization_id,invoice_id) references public.monthly_invoices(organization_id,id) on delete restrict
);
create unique index pix_one_open_invoice on public.pix_charges(organization_id,invoice_id)
  where status in ('creating','pending');
create index pix_org_invoice_idx on public.pix_charges(organization_id,invoice_id,created_at desc);
create index pix_creator_idx on public.pix_charges(created_by);
alter table public.pix_charges enable row level security;
create policy pix_charge_read on public.pix_charges for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception'])
  or exists (select 1 from public.monthly_invoices i where i.organization_id=pix_charges.organization_id
    and i.id=pix_charges.invoice_id and private.financial_guardian_of_student(i.organization_id,i.student_id)));
revoke all on public.pix_charges from anon, authenticated;
grant select on public.pix_charges to authenticated;
create trigger pix_charges_audit after insert or update on public.pix_charges
for each row execute function private.capture_audit();

alter table public.invoice_payments alter column received_by drop not null;
alter table public.invoice_payments add column source text not null default 'manual'
  check (source in ('manual','mercado_pago'));
alter table public.invoice_payments add constraint payment_source_actor_check
  check ((source='manual' and received_by is not null)
    or (source='mercado_pago' and received_by is null and method='pix'));
create unique index mp_payment_reference_unique on public.invoice_payments(reference)
  where source='mercado_pago';
drop policy payments_insert on public.invoice_payments;
create policy payments_insert on public.invoice_payments for insert to authenticated
with check (source='manual' and received_by=(select auth.uid())
  and private.has_org_role(organization_id,array['admin','reception']));
