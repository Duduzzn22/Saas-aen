import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { todayInSaoPaulo } from '@/lib/operations'
import { assignStudentLevel, recordAssessment } from '@/app/pedagogy'

const resultLabels: Record<string,string> = { not_started: 'Ainda não iniciou', developing: 'Em desenvolvimento', achieved: 'Alcançada' }
function dateOnly(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`)) }
function dateTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) }
function relationName(value: {name?: string} | {name?: string}[] | null) { return Array.isArray(value) ? value[0]?.name : value?.name }

export default async function StudentPedagogy({ params, searchParams }: {
  params: Promise<{ organizationId: string; studentId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org, studentId } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const { data: student } = await supabase.from('students').select('id,full_name,status')
    .eq('organization_id', org).eq('id', studentId).maybeSingle()
  if (!student) notFound()
  const [{ data: history, error: historyError }, { data: assessments, error: assessmentError }, { data: levels }, { data: skills }] = await Promise.all([
    supabase.from('student_level_history').select('id,level_id,assigned_at,reason,swim_levels(name)')
      .eq('organization_id', org).eq('student_id', studentId).order('assigned_at', { ascending: false }).order('id', { ascending: false }).limit(100),
    supabase.from('student_assessments').select('id,assessed_on,summary,swim_levels(name),assessment_results(id,result,swim_skills(name))')
      .eq('organization_id', org).eq('student_id', studentId).order('assessed_on', { ascending: false }).limit(30),
    supabase.from('swim_levels').select('id,name,rank').eq('organization_id', org).eq('active', true).order('rank'),
    supabase.from('swim_skills').select('id,level_id,name,position').eq('organization_id', org).eq('active', true).order('position'),
  ])
  const canAssess = membership.role !== 'reception' && student.status === 'active'
  const current = history?.[0]
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Evolução do aluno</span><h1>{student.full_name}</h1><p>Nível atual: <strong>{current ? relationName(current.swim_levels) : 'não definido'}</strong> · {student.status === 'active' ? 'Ativo' : 'Inativo'}</p></div><Link className="back" href={`/dashboard/${org}/pedagogico`}>Ver níveis →</Link></header>
    {(erro || historyError || assessmentError) && <p role="alert" className="error">{erro === 'nivel' ? 'Selecione um nível ativo diferente do atual e confira a situação do aluno.' : erro === 'habilidades' ? 'Cadastre habilidades ativas antes de avaliar.' : 'Não foi possível carregar ou salvar os dados pedagógicos.'}</p>}
    {sucesso && <p className="success">Registro salvo.</p>}
    <div className="columns"><section className="card"><h2>Histórico de níveis</h2>{!history?.length && <p>Nenhum nível atribuído.</p>}<ul className="list">{history?.map(h => <li key={h.id}><strong>{relationName(h.swim_levels)}</strong> · {dateTime(h.assigned_at)}{h.reason && <p>{h.reason}</p>}</li>)}</ul></section>
      {canAssess && <section className="card"><h2>Registrar evolução</h2><form className="stack" action={assignStudentLevel.bind(null, org, studentId)}><label>Novo nível<select name="level_id" defaultValue="" required><option value="" disabled>Selecione</option>{levels?.filter(l => l.id !== current?.level_id).map(l => <option key={l.id} value={l.id}>{l.rank}. {l.name}</option>)}</select></label><label>Motivo<textarea name="reason" maxLength={500} rows={3} placeholder="Conquistas observadas" /></label><button disabled={!levels?.some(l => l.id !== current?.level_id)}>Atribuir nível</button></form></section>}
    </div>
    <section className="card spacing"><h2>Avaliações</h2>{!assessments?.length && <p>Nenhuma avaliação registrada.</p>}{assessments?.map(a => <details className="assessment" key={a.id}><summary><strong>{dateOnly(a.assessed_on)} · {relationName(a.swim_levels)}</strong> · {a.assessment_results?.filter(r => r.result === 'achieved').length || 0}/{a.assessment_results?.length || 0} habilidades alcançadas</summary>{a.summary && <p>{a.summary}</p>}<ul className="list">{a.assessment_results?.map(r => <li key={r.id}>{relationName(r.swim_skills)} — {resultLabels[r.result]}</li>)}</ul></details>)}</section>
    {canAssess && <section className="card spacing"><h2>Nova avaliação</h2><p>Escolha um nível e registre todas as habilidades ativas. A avaliação fica no histórico do aluno.</p>
      {levels?.map(level => { const items = skills?.filter(s => s.level_id === level.id) || []; return <details className="assessment" key={level.id}><summary>{level.rank}. {level.name} · {items.length} habilidades</summary>{items.length ? <form className="stack edit-form" action={recordAssessment.bind(null, org, studentId, level.id)}><label>Data<input type="date" name="assessed_on" defaultValue={todayInSaoPaulo()} max={todayInSaoPaulo()} required /></label>{items.map(skill => <label key={skill.id}>{skill.name}<select name={`skill_${skill.id}`} defaultValue="developing" required><option value="not_started">Ainda não iniciou</option><option value="developing">Em desenvolvimento</option><option value="achieved">Alcançada</option></select></label>)}<label>Observações<textarea name="summary" maxLength={1000} rows={3} /></label><button>Salvar avaliação</button></form> : <p>Cadastre habilidades para avaliar este nível.</p>}</details> })}
      {!levels?.length && <p>Cadastre níveis e habilidades na área pedagógica primeiro.</p>}
    </section>}
  </main>
}
