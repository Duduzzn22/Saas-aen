import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { brl } from '@/lib/finance'
import { todayInSaoPaulo } from '@/lib/operations'
import { sendWhatsAppReminder } from '@/app/whatsapp'

export default async function WhatsAppReminders({params,searchParams}: {
  params:Promise<{organizationId:string}>;searchParams:Promise<{erro?:string;sucesso?:string}>
}) {
  const {organizationId:org} = await params
  const {erro,sucesso} = await searchParams
  const {supabase,membership} = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(`/dashboard/${org}`)
  const today = todayInSaoPaulo()
  const configured = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
    && process.env.WHATSAPP_REMINDER_TEMPLATE && process.env.WHATSAPP_GRAPH_VERSION)
  const {data:invoices,error} = await supabase.from('monthly_invoices')
    .select('id,student_id,amount_cents,due_on,students(full_name),invoice_payments(amount_cents,voided_at)')
    .eq('organization_id',org).eq('status','open').lt('due_on',today).order('due_on').limit(100)
  const studentIds = [...new Set(invoices?.map(i=>i.student_id) ?? [])]
  const {data:relations} = studentIds.length ? await supabase.from('student_guardians')
    .select('student_id,guardian_id,guardians(full_name,phone)')
    .eq('organization_id',org).eq('is_financial',true).in('student_id',studentIds) : {data:[]}
  const guardianIds = [...new Set(relations?.map(r=>r.guardian_id) ?? [])]
  const [{data:consents},{data:logs}] = await Promise.all([
    guardianIds.length ? supabase.from('whatsapp_consents').select('guardian_id,user_id,active')
      .eq('organization_id',org).eq('active',true).in('guardian_id',guardianIds) : Promise.resolve({data:[]}),
    invoices?.length ? supabase.from('whatsapp_delivery_log').select('invoice_id,guardian_id,status,reminder_on')
      .eq('organization_id',org).in('invoice_id',invoices.map(i=>i.id)).gte('reminder_on',today) : Promise.resolve({data:[]}),
  ])
  const studentName = (value:{full_name?:string} | {full_name?:string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name
  const guardian = (value:{full_name?:string;phone?:string} | {full_name?:string;phone?:string}[] | null) => Array.isArray(value) ? value[0] : value
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Atendimento</span><h1>Lembretes por WhatsApp</h1><p>Envie um modelo aprovado apenas a responsáveis financeiros que autorizaram o contato.</p></div></header>
    {!configured && <p className="error">Integração ainda não configurada. Defina as credenciais e o modelo aprovado nas variáveis de ambiente da Vercel.</p>}
    {(erro || error) && <p role="alert" className="error">{erro === 'duplicado' ? 'Já houve uma tentativa para este responsável hoje.' : 'Não foi possível enviar. Confira elegibilidade, telefone, consentimento e configuração.'}</p>}
    {sucesso && <p className="success">Solicitação aceita pelo WhatsApp. Consulte o registro de envio.</p>}
    <section className="card"><h2>Mensalidades vencidas</h2>{!invoices?.length && <p>Nenhuma mensalidade vencida.</p>}
      <ul className="list">{invoices?.map(i => {
        const paid = i.invoice_payments?.filter(p=>!p.voided_at).reduce((sum,p)=>sum+Number(p.amount_cents),0) ?? 0
        const balance = Number(i.amount_cents)-paid
        if (balance <= 0) return null
        const recipients = relations?.filter(r=>r.student_id===i.student_id && consents?.some(c=>c.guardian_id===r.guardian_id && c.active)) ?? []
        return <li key={i.id}><strong>{studentName(i.students)}</strong> · vence {i.due_on.split('-').reverse().join('/')} · saldo {brl(balance)}
          {!recipients.length && <p>Sem responsável financeiro com autorização ativa.</p>}
          {recipients.map(r=>{ const log=logs?.find(l=>l.invoice_id===i.id && l.guardian_id===r.guardian_id)
            return <div className="group-row" key={r.guardian_id}><span>{guardian(r.guardians)?.full_name} · {guardian(r.guardians)?.phone || 'telefone ausente'} {log && `· ${log.status === 'sent' ? 'Enviado' : log.status === 'pending' ? 'Processando' : 'Falhou'} hoje`}</span>
              <form action={sendWhatsAppReminder.bind(null,org,i.id,r.guardian_id)}><button disabled={!configured || !!log || !guardian(r.guardians)?.phone}>Enviar lembrete</button></form></div>
          })}
        </li>
      })}</ul>
    </section>
  </main>
}
