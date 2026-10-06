import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { brl } from '@/lib/finance'
import { monthLabel } from '@/lib/finance'
import { todayInSaoPaulo } from '@/lib/operations'

type MonthlyRow = {month:string;billed_cents:number|string;received_cents:number|string;
  sessions_count:number;present_count:number;absent_count:number}

export default async function Indicators({params}: {params:Promise<{organizationId:string}>}) {
  const {organizationId:org} = await params
  const {supabase,membership} = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(`/dashboard/${org}`)
  const today = todayInSaoPaulo()
  const lastMonth = `${today.slice(0,7)}-01`
  const first = new Date(`${lastMonth}T12:00:00Z`)
  first.setUTCMonth(first.getUTCMonth()-5)
  const firstMonth = first.toISOString().slice(0,10)
  const [{data:report,error},{count:students},{count:pendingMakeups},{count:pendingTrials}] = await Promise.all([
    supabase.rpc('management_dashboard',{p_org:org,p_start:firstMonth,p_end:lastMonth}),
    supabase.from('students').select('id',{head:true,count:'exact'}).eq('organization_id',org).eq('status','active'),
    supabase.from('makeup_requests').select('id',{head:true,count:'exact'}).eq('organization_id',org).eq('status','pending'),
    supabase.from('trial_requests').select('id',{head:true,count:'exact'}).eq('organization_id',org).eq('status','pending'),
  ])
  const rows: MonthlyRow[] = report ?? []
  const billed = rows.reduce((sum,r)=>sum+Number(r.billed_cents),0)
  const received = rows.reduce((sum,r)=>sum+Number(r.received_cents),0)
  const present = rows.reduce((sum,r)=>sum+Number(r.present_count),0)
  const absent = rows.reduce((sum,r)=>sum+Number(r.absent_count),0)
  const max = Math.max(1,...rows.flatMap(r=>[Number(r.billed_cents),Number(r.received_cents)]))
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Gestão</span><h1>Indicadores</h1><p>Últimos seis meses, incluindo o mês atual. Valores recebidos consideram a data do pagamento.</p></div></header>
    {error && <p role="alert" className="error">Não foi possível carregar os indicadores.</p>}
    <div className="report-grid"><div className="card"><span className="eyebrow">Alunos ativos</span><h2>{students ?? '—'}</h2></div>
      <div className="card"><span className="eyebrow">Presença registrada</span><h2>{present+absent ? `${Math.round(present/(present+absent)*100)}%` : '—'}</h2><small>{present} presentes em {present+absent} chamadas</small></div>
      <div className="card"><span className="eyebrow">Reposições pendentes</span><h2>{pendingMakeups ?? '—'}</h2></div>
      <div className="card"><span className="eyebrow">Experimentais pendentes</span><h2>{pendingTrials ?? '—'}</h2></div></div>
    <section className="card spacing"><h2>Receita por mês</h2><p>Faturado: {brl(billed)} · recebido: {brl(received)} no período.</p>
      <div className="chart-legend"><span><i className="legend-billed" /> Faturado</span><span><i className="legend-received" /> Recebido</span></div>
      <div className="monthly-chart">{rows.map(r=><div className="chart-row" key={r.month}><strong>{monthLabel(r.month)}</strong><div className="chart-bars">
        <div className="bar billed" style={{width:`${Number(r.billed_cents)/max*100}%`}} title={`Faturado ${brl(Number(r.billed_cents))}`} />
        <div className="bar received" style={{width:`${Number(r.received_cents)/max*100}%`}} title={`Recebido ${brl(Number(r.received_cents))}`} />
      </div><span>{brl(Number(r.received_cents))}</span></div>)}</div>
    </section>
    <section className="card spacing"><h2>Operação</h2><div className="table-wrap"><table><thead><tr><th>Mês</th><th>Aulas</th><th>Presentes</th><th>Ausentes ou justificados</th><th>Faturado</th><th>Recebido</th></tr></thead><tbody>{rows.map(r=><tr key={r.month}><td>{monthLabel(r.month)}</td><td>{r.sessions_count}</td><td>{r.present_count}</td><td>{r.absent_count}</td><td>{brl(Number(r.billed_cents))}</td><td>{brl(Number(r.received_cents))}</td></tr>)}</tbody></table></div></section>
  </main>
}
