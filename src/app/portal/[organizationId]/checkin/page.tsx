import Link from 'next/link'
import { requireGuardianOrganization } from '@/lib/auth'
import { displayDate } from '@/lib/operations'
import { guardianCheckin } from '@/app/checkin'

export default async function Checkin({params,searchParams}: {
  params:Promise<{organizationId:string}>;
  searchParams:Promise<{session?:string;token?:string;erro?:string;sucesso?:string}>
}) {
  const {organizationId:org} = await params
  const {session:sessionId,token,erro,sucesso} = await searchParams
  const {supabase,guardians} = await requireGuardianOrganization(org)
  const {data:session} = sessionId ? await supabase.from('class_sessions')
    .select('id,class_id,lesson_date,starts_at,ends_at,status,swim_classes(name)')
    .eq('organization_id',org).eq('id',sessionId).maybeSingle() : {data:null}
  const {data:links} = await supabase.from('student_guardians').select('student_id,students(full_name)')
    .eq('organization_id',org).in('guardian_id',guardians.map(g=>g.id))
  const ids = [...new Set(links?.map(l=>l.student_id) ?? [])]
  const [{data:enrollments},{data:makeups}] = session && ids.length ? await Promise.all([
    supabase.from('class_enrollments').select('student_id').eq('organization_id',org)
      .eq('class_id',session.class_id).eq('active',true).in('student_id',ids),
    supabase.from('makeup_requests').select('student_id').eq('organization_id',org)
      .eq('target_session_id',session.id).eq('status','approved').in('student_id',ids),
  ]) : [{data:[]},{data:[]}]
  const eligible = links?.filter((link,index,all) => all.findIndex(x=>x.student_id===link.student_id) === index &&
    (enrollments?.some(e=>e.student_id===link.student_id) || makeups?.some(m=>m.student_id===link.student_id))) ?? []
  const name = (value:{name?:string} | {name?:string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  const studentName = (value:{full_name?:string} | {full_name?:string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name
  return <main className="shell"><header><div><Link className="back" href={`/portal/${org}`}>← Portal</Link><span className="eyebrow">Presença</span><h1>Check-in da aula</h1></div></header>
    {sucesso && <p className="success">Presença confirmada.</p>}
    {erro && <p role="alert" className="error">Não foi possível confirmar. Peça um novo código ao professor e verifique o horário da aula.</p>}
    {!session && <section className="card"><p>Aula indisponível para esta conta.</p></section>}
    {session && <section className="card"><h2>{name(session.swim_classes)}</h2><p>{displayDate(session.lesson_date)} · {session.starts_at.slice(0,5)}–{session.ends_at.slice(0,5)}</p>
      {!sucesso && token && eligible.length > 0 && <form className="stack" action={guardianCheckin.bind(null,org,session.id,token)}><label>Aluno<select name="student_id" required>{eligible.map(l=><option value={l.student_id} key={l.student_id}>{studentName(l.students)}</option>)}</select></label><button>Confirmar presença</button></form>}
      {!token && !sucesso && <p>Escaneie o QR Code mostrado pelo professor para confirmar a presença.</p>}
      {!eligible.length && <p>Nenhum aluno vinculado à sua conta participa desta aula.</p>}
    </section>}
  </main>
}
