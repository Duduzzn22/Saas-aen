alter table public.whatsapp_delivery_log add column reminder_on date
  not null default (now() at time zone 'America/Sao_Paulo')::date;
alter table public.whatsapp_delivery_log add constraint whatsapp_reminder_daily_unique
  unique (organization_id,invoice_id,guardian_id,reminder_on);
create or replace function private.validate_whatsapp_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status<>'pending' or new.organization_id<>old.organization_id
    or new.invoice_id<>old.invoice_id or new.guardian_id<>old.guardian_id
    or new.consent_user_id<>old.consent_user_id or new.requested_by<>old.requested_by
    or new.created_at<>old.created_at or new.reminder_on<>old.reminder_on then
    raise exception 'Registro de envio imutável';
  end if;
  return new;
end;
$$;
