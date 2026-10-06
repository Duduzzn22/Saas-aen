import Link from 'next/link'
import { requireGuardianOrganization } from '@/lib/auth'
import { displayDate, todayInSaoPaulo } from '@/lib/operations'
import { requestMakeup, requestTrial } from '@/app/experience'
import { setWhatsAppConsent } from '@/app/whatsapp'
import { createPixCharge } from '@/app/pix'
import { adminClient,mpConfigured } from '@/lib/mercado-pago'

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'})
const makeupStatus: Record<string,string> = {pending:'Aguardando análise',approved:'Aprovada',rejected:'Recusada'}
const trialStatus: Record<string,string> = {pending:'Aguardando contato',scheduled:'Agendada',completed:'Concluída',cancelled:'Cancelada'}

export default async function GuardianSchool({params,searchParams}: {
  params: Promise<{organizationId:string}>; searchParams: Promise<{erro?:string;sucesso?:string}>
}) {
  const {organizationId: org} = await params
  const {erro,sucesso} = await searchParams
  const {supabase,guardians,userId} = await requireGuardianOrganization(org)
  const {data:mpConnection} = mpConfigured() ? await adminClient().from('mp_connections')
    .select('organization_id').eq('organization_id',org).maybeSingle() : {data:null}
  const guardianIds = guardians.map(g => g.id)
  const [{data: school}, {data: relations}, {data: notices}, {data: trials}, {data: consents}] = await Promise.all([
    supabase.from('organizations').select('name').eq('id',org).maybeSingle(),
    supabase.from('student_guardians').select('student_id,is_financial,students(full_name,status)')
      .eq('organization_id',org).in('guardian_id',guardianIds),
    supabase.from('portal_notices').select('id,title,body,created_at,guardian_id,expires_on')
      .eq('organization_id',org).eq('active',true).order('created_at',{ascending:false}).limit(15),
    supabase.from('trial_requests').select('id,prospect_name,status,preferred_date,session_id,class_sessions(lesson_date,starts_at)')
      .eq('organization_id',org).eq('requested_by',userId).order('created_at',{ascending:false}).limit(15),
    supabase.from('whatsapp_consents').select('guardian_id,active').eq('organization_id',org).eq('user_id',userId),
  ])
  const studentIds = [...new Set(relations?.map(r => r.student_id) ?? [])]
  const today = todayInSaoPaulo()
  const firstDay = new Date(`${today}T12:00:00Z`)
  firstDay.setUTCDate(firstDay.getUTCDate() - 45)
  const since = firstDay.toISOString().slice(0,10)
  const [enrollmentResult,sessionResult,attendanceResult,levelResult,invoiceResult,makeupResult] = studentIds.length ? await Promise.all([
    supabase.from('class_enrollments').select('student_id,class_id,swim_classes(name)').eq('organization_id',org).in('student_id',studentIds).eq('active',true),
    supabase.from('class_sessions').select('id,class_id,lesson_date,starts_at,status,swim_classes(name)')
      .eq('organization_id',org).gte('lesson_date',since).order('lesson_date',{ascending:false}).limit(120),
    supabase.from('attendance').select('student_id,session_id,status').eq('organization_id',org).in('student_id',studentIds),
    supabase.from('student_level_history').select('student_id,assigned_at,swim_levels(name)').eq('organization_id',org)
      .in('student_id',studentIds).order('assigned_at',{ascending:false}).limit(100),
    supabase.from('monthly_invoices').select('id,student_id,due_on,amount_cents,status,invoice_payments(amount_cents,voided_at)')
      .eq('organization_id',org).in('student_id',studentIds).order('due_on',{ascending:false}).limit(50),
    supabase.from('makeup_requests').select('id,student_id,original_session_id,target_session_id,status,requested_at')
      .eq('organization_id',org).in('student_id',studentIds).order('requested_at',{ascending:false}).limit(100),
  ]) : [{data:[]},{data:[]},{data:[]},{data:[]},{data:[]},{data:[]}]
  const enrollments = enrollmentResult.data ?? []
  const sessions = sessionResult.data ?? []
  const attendances = attendanceResult.data ?? []
  const levels = levelResult.data ?? []
  const invoices = invoiceResult.data ?? []
  const makeups = makeupResult.data ?? []
  const {data:pixCharges}=invoices.length ? await supabase.from('pix_charges')
    .select('id,invoice_id,status').eq('organization_id',org).in('invoice_id',invoices.map(i=>i.id))
    .in('status',['creating','pending']).order('created_at',{ascending:false}) : {data:[]}
  const rel = (value: {name?:string} | {name?:string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  const lesson = (value: {lesson_date?:string;starts_at?:string} | {lesson_date?:string;starts_at?:string}[] | null) => Array.isArray(value) ? value[0] : value
  return <main className="shell"><header><div><Link className="back" href="/portal">← Escolas</Link><span className="eyebrow">Portal do responsável</span><h1>{school?.name || 'Minha escola'}</h1></div></header>
    {erro && <p role="alert" className="error">Não foi possível concluir a solicitação. Confira os dados e se a aula está elegível.</p>}
    {sucesso && <p className="success">Solicitação enviada.</p>}
    <section className="card"><h2>Comunicados</h2>{!notices?.length && <p>Nenhum comunicado ativo.</p>}<ul className="list">{notices?.map(n => <li key={n.id}><strong>{n.title}</strong><p>{n.body}</p><small>{displayDate(n.created_at.slice(0,10))}</small></li>)}</ul></section>
    <section className="card spacing"><h2>Lembretes pelo WhatsApp</h2><p>Com sua autorização, a escola pode enviar lembretes de mensalidades vencidas ao telefone cadastrado. Você pode desativar a qualquer momento.</p>
      {guardians.map(g => { const active = consents?.some(c=>c.guardian_id===g.id && c.active); return <div className="group-row" key={g.id}><span><strong>{g.full_name}</strong> · {g.phone || 'Peça à escola que cadastre um telefone'} · {active ? 'Autorizado' : 'Desativado'}</span><form action={setWhatsAppConsent.bind(null,org,g.id,!active)}><button className="secondary" disabled={!g.phone && !active}>{active ? 'Desativar' : 'Autorizar'}</button></form></div> })}
    </section>
    <div className="grid spacing">{studentIds.map(studentId => {
      const relation = relations?.find(r => r.student_id === studentId)
      const student = Array.isArray(relation?.students) ? relation?.students[0] : relation?.students
      const classes = enrollments.filter(e => e.student_id === studentId)
      const current = levels.find(l => l.student_id === studentId)
      const eligible = sessions.filter(s => classes.some(e => e.class_id === s.class_id) && s.lesson_date <= today
        && (s.status === 'cancelled' || attendances.some(a => a.student_id === studentId && a.session_id === s.id && ['absent','justified'].includes(a.status)))
        && !makeups.some(m => m.student_id === studentId && m.original_session_id === s.id))
      return <section className="card" key={studentId}><span className="eyebrow">Aluno</span><h2>{student?.full_name || 'Aluno'}</h2>
        <p>Turmas: {classes.map(c => rel(c.swim_classes)).join(', ') || 'Sem matrícula ativa'}</p>
        <p>Nível atual: {current ? rel(current.swim_levels) : 'Ainda não registrado'}</p>
        <details><summary>Presenças e aulas</summary><ul className="list">{sessions.filter(s => classes.some(e => e.class_id === s.class_id)).slice(0,15).map(s => {
          const attendance = attendances.find(a => a.student_id === studentId && a.session_id === s.id)
          return <li key={s.id}>{displayDate(s.lesson_date)} · {rel(s.swim_classes)} · {s.status === 'cancelled' ? 'Cancelada' : attendance?.status === 'present' ? 'Presente' : attendance?.status === 'absent' ? 'Ausente' : attendance?.status === 'justified' ? 'Justificada' : 'Sem chamada'}</li>
        })}</ul></details>
        <details><summary>Reposições</summary><ul className="list">{makeups.filter(m => m.student_id === studentId).map(m => {
          const target = sessions.find(s => s.id === m.target_session_id)
          return <li key={m.id}>{makeupStatus[m.status]}{target ? ` · ${displayDate(target.lesson_date)}` : ''}</li>
        })}</ul>{eligible.map(s => <form className="edit-form stack" key={s.id} action={requestMakeup.bind(null,org,studentId,s.id,s.class_id)}>
          <strong>{displayDate(s.lesson_date)} · {rel(s.swim_classes)}</strong><label>Observação (opcional)<input name="note" maxLength={500} /></label><button>Solicitar reposição</button>
        </form>)}{!eligible.length && <p>Nenhuma aula elegível para nova solicitação nos últimos 45 dias.</p>}</details>
        {relation?.is_financial && <details><summary>Mensalidades</summary><ul className="list">{invoices.filter(i => i.student_id === studentId).map(i => {
          const paid = i.invoice_payments?.filter(p => !p.voided_at).reduce((sum,p) => sum + p.amount_cents,0) ?? 0
          const charge=pixCharges?.find(c=>c.invoice_id===i.id)
          return <li key={i.id}>{displayDate(i.due_on)} · {money(i.amount_cents)} · {i.status === 'void' ? 'Cancelada' : paid >= i.amount_cents ? 'Paga' : `Em aberto: ${money(i.amount_cents - paid)}`}
            {i.status==='open' && paid<i.amount_cents && charge?.status==='pending' && <p><Link className="back" href={`/portal/${org}/pix/${charge.id}`}>Ver PIX gerado →</Link></p>}
            {i.status==='open' && paid<i.amount_cents && mpConnection && (!charge || charge.status==='creating') && <form className="form-row edit-form" action={createPixCharge.bind(null,org,i.id)}><label>CPF do pagador<input name="cpf" inputMode="numeric" pattern="[0-9. -]{11,18}" required placeholder="000.000.000-00" autoComplete="off" /></label><button>{charge ? 'Tentar novamente' : 'Gerar PIX'}</button></form>}
          </li>
        })}</ul></details>}
      </section>
    })}</div>
    <section className="card spacing"><h2>Aula experimental</h2><p>Peça uma aula para outra criança. A escola entrará em contato para escolher uma turma e confirmar a data.</p>
      <form className="stack" action={requestTrial.bind(null,org)}><div className="columns"><label>Nome da criança<input name="prospect_name" required maxLength={120} /></label><label>Nome do contato<input name="contact_name" required maxLength={120} defaultValue={guardians[0]?.full_name} /></label></div>
        <div className="columns"><label>E-mail de contato<input name="contact_email" type="email" required /></label><label>Telefone<input name="contact_phone" maxLength={40} /></label></div>
        <label>Data preferida<input name="preferred_date" type="date" min={today} /></label><label>Observação<textarea name="note" maxLength={500} /></label><button>Solicitar aula experimental</button>
      </form><ul className="list spacing">{trials?.map(t => <li key={t.id}>{t.prospect_name} · {trialStatus[t.status]}{lesson(t.class_sessions)?.lesson_date ? ` · ${displayDate(lesson(t.class_sessions)!.lesson_date!)}` : ''}</li>)}</ul>
    </section>
  </main>
}
