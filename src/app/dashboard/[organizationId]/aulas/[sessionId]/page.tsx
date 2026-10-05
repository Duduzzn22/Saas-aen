import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { displayDate, time } from '@/lib/operations'
import { markAttendance, setSessionStatus } from '@/app/operations'

const statusLabels: Record<string, string> = { present: 'Presente', absent: 'Ausente', justified: 'Justificado' }

export default async function Lesson({ params, searchParams }: {
  params: Promise<{ organizationId: string; sessionId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org, sessionId } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const { data: session } = await supabase.from('class_sessions')
    .select('id,class_id,lesson_date,starts_at,ends_at,status,swim_classes(name)')
    .eq('organization_id', org).eq('id', sessionId).maybeSingle()
  if (!session) notFound()
  const [{ data: enrollments, error: enrollmentError }, { data: attendance, error: attendanceError }] = await Promise.all([
    supabase.from('class_enrollments').select('student_id,students(full_name)')
      .eq('organization_id', org).eq('class_id', session.class_id).eq('active', true).order('enrolled_at'),
    supabase.from('attendance').select('student_id,status,recorded_at')
      .eq('organization_id', org).eq('session_id', sessionId),
  ])
  const className = Array.isArray(session.swim_classes) ? session.swim_classes[0]?.name : (session.swim_classes as {name?: string} | null)?.name
  const studentName = (value: {full_name?: string} | {full_name?: string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}/calendario?semana=${session.lesson_date}`}>← Calendário</Link><span className="eyebrow">Chamada</span><h1>{className}</h1><p>{displayDate(session.lesson_date)} · {time(session.starts_at)}–{time(session.ends_at)} · {session.status === 'cancelled' ? 'Cancelada' : 'Programada'}</p></div></header>
    {(erro || enrollmentError || attendanceError) && <p role="alert" className="error">Não foi possível registrar ou carregar a chamada. Atualize a página e confira a matrícula.</p>}
    {sucesso && <p className="success">Alteração salva.</p>}
    {membership.role !== 'teacher' && <form className="spacing" action={setSessionStatus.bind(null, org, sessionId, session.status === 'cancelled' ? 'scheduled' : 'cancelled')}><button className="secondary">{session.status === 'cancelled' ? 'Reativar aula' : 'Cancelar aula'}</button></form>}
    <section className="card spacing"><h2>Lista de presença</h2>{session.status === 'cancelled' && <p>Aula cancelada. Reative para registrar a presença.</p>}{!enrollments?.length && <p>Nenhum aluno matriculado.</p>}
      <ul className="list">{enrollments?.map(e => { const record = attendance?.find(a => a.student_id === e.student_id); return <li className="attendance-row" key={e.student_id}><div><strong>{studentName(e.students)}</strong><br /><span>{record ? statusLabels[record.status] : 'Sem registro'}</span></div>{session.status === 'scheduled' && <form className="attendance-form" action={markAttendance.bind(null, org, sessionId, e.student_id)}><label><span className="sr-only">Presença de {studentName(e.students)}</span><select name="status" defaultValue={record?.status || ''} required><option value="" disabled>Selecione</option><option value="present">Presente</option><option value="absent">Ausente</option><option value="justified">Justificado</option></select></label><button>Salvar</button></form>}</li> })}</ul>
    </section>
  </main>
}
