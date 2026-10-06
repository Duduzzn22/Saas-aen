alter table public.whatsapp_consents add column phone_e164 text not null
  check (phone_e164 ~ '^55[0-9]{10,11}$');

create or replace function private.validate_whatsapp_consent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_phone text;
begin
  if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.guardian_id<>old.guardian_id
    or new.user_id<>old.user_id) then raise exception 'Vínculo de consentimento imutável'; end if;
  if not private.verified_guardian_email_match(new.organization_id,new.guardian_id,new.user_id) then
    raise exception 'Conta sem e-mail confirmado correspondente';
  end if;
  select regexp_replace(coalesce(g.phone,''),'[^0-9]','','g') into v_phone
    from public.guardians g where g.organization_id=new.organization_id and g.id=new.guardian_id;
  if left(v_phone,2)<>'55' then v_phone='55'||v_phone; end if;
  if new.active and new.phone_e164<>v_phone then raise exception 'Telefone alterado após consentimento'; end if;
  new.updated_at=now();
  if new.active and (tg_op='INSERT' or not old.active) then new.consented_at=now(); end if;
  return new;
end;
$$;

create function private.validate_whatsapp_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invoice public.monthly_invoices%rowtype; v_consent public.whatsapp_consents%rowtype;
v_phone text; v_paid bigint;
begin
  select * into v_invoice from public.monthly_invoices i
    where i.organization_id=new.organization_id and i.id=new.invoice_id;
  select * into v_consent from public.whatsapp_consents c
    where c.organization_id=new.organization_id and c.guardian_id=new.guardian_id
      and c.user_id=new.consent_user_id;
  select regexp_replace(coalesce(g.phone,''),'[^0-9]','','g') into v_phone
    from public.guardians g where g.organization_id=new.organization_id and g.id=new.guardian_id;
  if left(v_phone,2)<>'55' then v_phone='55'||v_phone; end if;
  select coalesce(sum(p.amount_cents),0) into v_paid from public.invoice_payments p
    where p.organization_id=new.organization_id and p.invoice_id=new.invoice_id and p.voided_at is null;
  if v_invoice.id is null or v_invoice.status<>'open'
    or v_invoice.due_on >= (now() at time zone 'America/Sao_Paulo')::date
    or v_paid>=v_invoice.amount_cents or not coalesce(v_consent.active,false)
    or v_consent.phone_e164<>v_phone
    or not private.verified_guardian_email_match(new.organization_id,new.guardian_id,new.consent_user_id)
    or not exists (select 1 from public.student_guardians sg
      where sg.organization_id=new.organization_id and sg.student_id=v_invoice.student_id
        and sg.guardian_id=new.guardian_id and sg.is_financial) then
    raise exception 'Destinatário sem consentimento válido ou mensalidade quitada';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_whatsapp_delivery() from public, anon, authenticated;
create trigger whatsapp_delivery_guard before insert on public.whatsapp_delivery_log
for each row execute function private.validate_whatsapp_delivery();
