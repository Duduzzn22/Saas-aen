create table public.whatsapp_consents (
  organization_id uuid not null,
  guardian_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,guardian_id,user_id),
  foreign key (organization_id,guardian_id) references public.guardians(organization_id,id) on delete restrict
);
create index whatsapp_consents_user_idx on public.whatsapp_consents(user_id);
alter table public.whatsapp_consents enable row level security;
create policy whatsapp_consents_read on public.whatsapp_consents for select to authenticated
using ((user_id=(select auth.uid()) and private.verified_guardian_email_match(organization_id,guardian_id,user_id))
  or private.has_org_role(organization_id,array['admin','reception']));
create policy whatsapp_consents_insert on public.whatsapp_consents for insert to authenticated
with check (user_id=(select auth.uid()) and private.guardian_has_org_link(organization_id)
  and private.verified_guardian_email_match(organization_id,guardian_id,user_id));
create policy whatsapp_consents_update on public.whatsapp_consents for update to authenticated
using (user_id=(select auth.uid()) and private.verified_guardian_email_match(organization_id,guardian_id,user_id))
with check (user_id=(select auth.uid()) and private.verified_guardian_email_match(organization_id,guardian_id,user_id));
create function private.validate_whatsapp_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.guardian_id<>old.guardian_id
    or new.user_id<>old.user_id) then raise exception 'Vínculo de consentimento imutável'; end if;
  new.updated_at=now();
  if new.active and (tg_op='INSERT' or not old.active) then new.consented_at=now(); end if;
  return new;
end;
$$;
revoke all on function private.validate_whatsapp_consent() from public, anon, authenticated;
create trigger whatsapp_consent_guard before insert or update on public.whatsapp_consents
for each row execute function private.validate_whatsapp_consent();
revoke all on public.whatsapp_consents from anon;
grant select,insert,update on public.whatsapp_consents to authenticated;
create trigger whatsapp_consents_audit after insert or update on public.whatsapp_consents
for each row execute function private.capture_audit();

create table public.whatsapp_delivery_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  guardian_id uuid not null,
  consent_user_id uuid not null,
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (organization_id,invoice_id) references public.monthly_invoices(organization_id,id) on delete restrict,
  foreign key (organization_id,guardian_id,consent_user_id)
    references public.whatsapp_consents(organization_id,guardian_id,user_id) on delete restrict
);
create index whatsapp_log_org_idx on public.whatsapp_delivery_log(organization_id,created_at desc);
create index whatsapp_log_invoice_idx on public.whatsapp_delivery_log(organization_id,invoice_id);
create index whatsapp_log_requester_idx on public.whatsapp_delivery_log(requested_by);
create unique index whatsapp_log_pending_unique on public.whatsapp_delivery_log(organization_id,invoice_id,guardian_id)
  where status='pending';
alter table public.whatsapp_delivery_log enable row level security;
create policy whatsapp_log_staff_read on public.whatsapp_delivery_log for select to authenticated
using (private.has_org_role(organization_id,array['admin','reception']));
create policy whatsapp_log_staff_insert on public.whatsapp_delivery_log for insert to authenticated
with check (requested_by=(select auth.uid()) and status='pending'
  and private.has_org_role(organization_id,array['admin','reception']));
create policy whatsapp_log_staff_update on public.whatsapp_delivery_log for update to authenticated
using (requested_by=(select auth.uid()) and status='pending'
  and private.has_org_role(organization_id,array['admin','reception']))
with check (requested_by=(select auth.uid()) and status in ('sent','failed')
  and private.has_org_role(organization_id,array['admin','reception']));
create function private.validate_whatsapp_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status<>'pending' or new.organization_id<>old.organization_id
    or new.invoice_id<>old.invoice_id or new.guardian_id<>old.guardian_id
    or new.consent_user_id<>old.consent_user_id or new.requested_by<>old.requested_by
    or new.created_at<>old.created_at then
    raise exception 'Registro de envio imutável';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_whatsapp_log() from public, anon, authenticated;
create trigger whatsapp_log_guard before update on public.whatsapp_delivery_log
for each row execute function private.validate_whatsapp_log();
revoke all on public.whatsapp_delivery_log from anon;
grant select,insert,update on public.whatsapp_delivery_log to authenticated;
create trigger whatsapp_log_audit after insert or update on public.whatsapp_delivery_log
for each row execute function private.capture_audit();
