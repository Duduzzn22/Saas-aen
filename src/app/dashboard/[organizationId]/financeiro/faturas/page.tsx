import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { brl, brlInput, invoiceLabel, monthLabel, monthStart, shiftMonth } from '@/lib/finance'
import { todayInSaoPaulo } from '@/lib/operations'
import { generateInvoices, recordPayment, voidInvoice, voidPayment } from '@/app/finance'

const methodLabels: Record<string,string> = { cash: 'Dinheiro', bank_transfer: 'Transferência', pix: 'PIX manual', card: 'Cartão manual', other: 'Outro' }
const nameOf = (value: {full_name?: string} | {full_name?: string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name

export default async function Invoices({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ mes?: string; pagina?: string; erro?: string; sucesso?: string; criadas?: string }>
}) {
  const { organizationId: org } = await params
  const { mes, pagina, erro, sucesso, criadas } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(`/dashboard/${org}`)
  const month = monthStart(mes) || `${todayInSaoPaulo().slice(0, 7)}-01`
  const page = Math.max(0, Math.min(1000, Number.isSafeInteger(Number(pagina)) ? Number(pagina || 0) : 0))
  const today = todayInSaoPaulo()
  const [{ data: rows, error, count }, { data: summary, error: summaryError }] = await Promise.all([
    supabase.from('monthly_invoices').select('id,student_id,billing_month,plan_name,amount_cents,due_on,status,students(full_name),invoice_payments(id,amount_cents,paid_on,method,reference,voided_at,void_reason)', { count: 'exact' })
      .eq('organization_id', org).eq('billing_month', month).order('due_on').order('created_at').range(page * 100, page * 100 + 99),
    supabase.rpc('monthly_finance_summary', { p_org: org, p_month: month }),
  ])
  const report = Array.isArray(summary) ? summary[0] : summary
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}/financeiro`}>← Planos e alunos</Link><span className="eyebrow">Financeiro</span><h1>Mensalidades</h1><p>{monthLabel(month)}</p></div><div className="week-nav"><Link className="nav-button" href={`?mes=${shiftMonth(month,-1)}`}>← Mês anterior</Link><Link className="nav-button" href={`?mes=${shiftMonth(month,1)}`}>Próximo mês →</Link></div></header>
    {(error || summaryError || erro) && <p role="alert" className="error">{erro === 'saldo' ? 'Pagamento maior que o saldo ou mensalidade indisponível.' : erro === 'cancelar' ? 'Estorne pagamentos antes de cancelar a mensalidade.' : 'Não foi possível carregar ou registrar a operação.'}</p>}
    {(sucesso || criadas !== undefined) && <p className="success">{criadas !== undefined ? `${criadas} mensalidade(s) criada(s). As já existentes foram preservadas.` : 'Operação registrada.'}</p>}
    <div className="report-grid"><div className="card"><span className="eyebrow">Faturado</span><h2>{brl(Number(report?.invoiced_cents || 0))}</h2></div><div className="card"><span className="eyebrow">Recebido</span><h2>{brl(Number(report?.received_cents || 0))}</h2></div><div className="card"><span className="eyebrow">Em aberto</span><h2>{brl(Number(report?.outstanding_cents || 0))}</h2></div><div className="card"><span className="eyebrow">Vencido</span><h2>{brl(Number(report?.overdue_cents || 0))}</h2><small>{report?.overdue_count || 0} mensalidade(s)</small></div></div>
    <section className="card spacing"><h2>Gerar mensalidades</h2><p>Gera uma mensalidade para cada aluno ativo com vínculo de cobrança ativo. Valor e dia de vencimento são copiados do plano atual. Pode repetir sem duplicar; confira os vínculos antes de gerar.</p><form className="form-row" action={generateInvoices.bind(null, org)}><label>Mês<input type="month" name="month" defaultValue={month.slice(0, 7)} required /></label><button>Gerar mensalidades do mês</button></form></section>
    <section className="card spacing"><h2>Lançamentos {count !== null ? `(${count})` : ''}</h2>{!rows?.length && <p>Nenhuma mensalidade neste mês.</p>}
      {rows?.map(invoice => { const payments = invoice.invoice_payments || []; const paid = payments.filter(p => !p.voided_at).reduce((sum,p) => sum + Number(p.amount_cents),0); const balance = Math.max(0,Number(invoice.amount_cents)-paid); const status = invoiceLabel(invoice.status,paid,Number(invoice.amount_cents),invoice.due_on,today); return <details className="assessment" key={invoice.id}><summary><strong>{nameOf(invoice.students)}</strong> · {invoice.plan_name} · {brl(Number(invoice.amount_cents))} · vence {invoice.due_on.split('-').reverse().join('/')} · <span className={status === 'Atrasada' ? 'due' : ''}>{status}</span></summary>
        <p>Pago: {brl(paid)} · Saldo: {brl(balance)}</p>
        <ul className="list">{payments.map(payment => <li key={payment.id}><div className="inline-row"><span>{payment.paid_on.split('-').reverse().join('/')} · {methodLabels[payment.method]} · {brl(Number(payment.amount_cents))} {payment.voided_at ? '· estornado' : ''}{payment.reference ? ` · Ref. ${payment.reference}` : ''}</span>{membership.role === 'admin' && !payment.voided_at && <details><summary>Estornar</summary><form className="stack edit-form" action={voidPayment.bind(null, org, payment.id)}><label>Motivo<input name="reason" minLength={3} maxLength={500} required /></label><button className="secondary">Confirmar estorno</button></form></details>}</div></li>)}</ul>
        {invoice.status === 'open' && balance > 0 && <form className="form-row edit-form" action={recordPayment.bind(null, org, invoice.id)}><label>Valor recebido (R$)<input name="amount" inputMode="decimal" defaultValue={brlInput(balance)} required /></label><label>Data<input name="paid_on" type="date" max={today} defaultValue={today} required /></label><label>Forma<select name="method" defaultValue="pix"><option value="pix">PIX manual</option><option value="bank_transfer">Transferência</option><option value="cash">Dinheiro</option><option value="card">Cartão manual</option><option value="other">Outro</option></select></label><label>Referência<input name="reference" maxLength={120} placeholder="Comprovante" /></label><button>Registrar pagamento</button></form>}
        {membership.role === 'admin' && invoice.status === 'open' && <details><summary>Cancelar mensalidade</summary><form className="stack edit-form" action={voidInvoice.bind(null, org, invoice.id)}><p>Estorne todos os pagamentos antes de cancelar.</p><label>Motivo<input name="reason" minLength={3} maxLength={500} required /></label><button className="secondary">Confirmar cancelamento</button></form></details>}
      </details> })}
      {count !== null && count > 100 && <div className="week-nav spacing">{page > 0 && <Link className="nav-button" href={`?mes=${month.slice(0,7)}&pagina=${page-1}`}>← Anterior</Link>}{(page+1)*100 < count && <Link className="nav-button" href={`?mes=${month.slice(0,7)}&pagina=${page+1}`}>Próxima →</Link>}</div>}
    </section>
  </main>
}
