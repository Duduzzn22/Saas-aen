import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { weekdays, time } from '@/lib/operations'
import { addSchedule, enrollStudent, setEnrollment } from '@/app/operations'

export default async function ClassDetail({ params, searchParams }: {
  params: Promise<{ organizationId: string; classId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org, classId } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const [{ data: swimClass }, { data: schedules, error: schedulesError }, { data: enrollments, error: enrollmentsError }, { data: pools }, { data: lanes }, { data: students }] = await Promise.all([
    supabase.from('swim_classes').select('id,name,capacity,active,teachers(full_name)').eq('organization_id', org).eq('id', classId).maybeSingle(),
    supabase.from('class_schedules').select('id,weekday,starts_at,ends_at,active,pools(name),lanes(name)').eq('organization_id', org).eq('class_id', classId).order('weekday').order('starts_at'),
    supabase.from('class_enrollments').select('id,student_id,active,students(full_name)').eq('organization_id', org).eq('class_id', classId).order('enrolled_at'),
    membership.role === 'teacher' ? Promise.resolve({ data: [] }) : supabase.from('pools').select('id,name').eq('organization_id', org).eq('active', true).order('name'),
    membership.role === 'teacher' ? Promise.resolve({ data: [] }) : supabase.from('lanes').select('id,pool_id,name').eq('organization_id', org).eq('active', true).order('name'),
    membership.role === 'teacher' ? Promise.resolve({ data: [] }) : supabase.from('students').select('id,full_name').eq('organization_id', org).eq('status', 'active').order('full_name'),
  ])
  if (!swimClass) notFound()
  const nameOf = (value: {full_name?: string} | {full_name?: string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name
  const activeCount = enrollments?.filter(e => e.active).length ?? 0
  const available = students?.filter(s => !enrollments?.some(e => e.student_id === s.id && e.active))
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}/turmas`}>← Turmas</Link><span className="eyebrow">Operação</span><h1>{swimClass.name}</h1><p>{nameOf(swimClass.teachers)} · {activeCount}/{swimClass.capacity} alunos · {swimClass.active ? 'Ativa' : 'Inativa'}</p></div><Link className="back" href={`/dashboard/${org}/calendario`}>Ver calendário →</Link></header>
    {(erro || schedulesError || enrollmentsError) && <p role="alert" className="error">{erro === 'conflito' ? 'Horário inválido ou raia ocupada nesse período.' : erro === 'vagas' ? 'Não há vaga ou o aluno já está inativo.' : 'Não foi possível carregar ou salvar os dados.'}</p>}
    {sucesso && <p className="success">Alteração salva.</p>}
    <div className="columns">
      <section className="card"><h2>Horários semanais</h2>{!schedules?.length && <p>Nenhum horário cadastrado.</p>}
        <ul className="list">{schedules?.map(s => <li key={s.id}><strong>{weekdays[s.weekday]} · {time(s.starts_at)}–{time(s.ends_at)}</strong><br />{Array.isArray(s.pools) ? s.pools[0]?.name : (s.pools as {name?: string} | null)?.name} · {Array.isArray(s.lanes) ? s.lanes[0]?.name : (s.lanes as {name?: string} | null)?.name}</li>)}</ul>
      </section>
      <section className="card"><h2>Alunos matriculados</h2>{!enrollments?.length && <p>Nenhum aluno matriculado.</p>}
        <ul className="list">{enrollments?.map(e => <li key={e.id} className="inline-row"><span>{nameOf(e.students)} {e.active ? '' : '(inativo)'}</span>{membership.role !== 'teacher' && <form action={setEnrollment.bind(null, org, classId, e.student_id, !e.active)}><button className="secondary">{e.active ? 'Retirar' : 'Reativar'}</button></form>}</li>)}</ul>
      </section>
    </div>
    {membership.role !== 'teacher' && swimClass.active && <div className="columns spacing">
      <section className="card"><h2>Adicionar horário</h2><form className="stack" action={addSchedule.bind(null, org, classId)}><label>Dia da semana<select name="weekday" required>{weekdays.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label><label>Piscina<select name="pool_id" required defaultValue=""><option value="" disabled>Selecione</option>{pools?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Raia<select name="lane_id" required defaultValue=""><option value="" disabled>Selecione</option>{lanes?.map(l => <option key={l.id} value={l.id}>{pools?.find(p => p.id === l.pool_id)?.name} · {l.name}</option>)}</select></label><div className="form-row"><label>Início<input name="starts_at" type="time" required /></label><label>Fim<input name="ends_at" type="time" required /></label></div><button disabled={!lanes?.length}>Adicionar horário</button></form><p>Selecione uma raia da piscina escolhida. O sistema impede sobreposição de horários na mesma raia.</p></section>
      <section className="card"><h2>Matricular aluno</h2><form className="stack" action={enrollStudent.bind(null, org, classId)}><label>Aluno<select name="student_id" required defaultValue=""><option value="" disabled>Selecione</option>{available?.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label><button disabled={!available?.length || activeCount >= swimClass.capacity}>Matricular</button></form>{activeCount >= swimClass.capacity && <p>A turma atingiu a capacidade.</p>}</section>
    </div>}
  </main>
}
