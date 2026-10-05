-- Aggregate the complete month under the caller's RLS policies.
create function public.monthly_finance_summary(p_org uuid,p_month date)
returns table (
  invoice_count bigint, invoiced_cents numeric, received_cents numeric,
  outstanding_cents numeric, overdue_cents numeric, overdue_count bigint
) language sql stable security invoker set search_path = '' as $$
  with invoice_balances as (
    select i.amount_cents, i.due_on,
      coalesce((select sum(p.amount_cents) from public.invoice_payments p
        where p.organization_id = i.organization_id and p.invoice_id = i.id
          and p.voided_at is null),0) as paid
    from public.monthly_invoices i
    where i.organization_id = p_org and i.billing_month = p_month
      and i.status = 'open'
      and private.has_org_role(p_org,array['admin','reception'])
  )
  select count(*), coalesce(sum(amount_cents),0), coalesce(sum(paid),0),
    coalesce(sum(greatest(amount_cents-paid,0)),0),
    coalesce(sum(case when due_on < (now() at time zone 'America/Sao_Paulo')::date
      then greatest(amount_cents-paid,0) else 0 end),0),
    count(*) filter (where due_on < (now() at time zone 'America/Sao_Paulo')::date and paid < amount_cents)
  from invoice_balances;
$$;
revoke all on function public.monthly_finance_summary(uuid,date) from public, anon;
grant execute on function public.monthly_finance_summary(uuid,date) to authenticated;
