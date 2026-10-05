import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { displayDate, monday, shiftDate, time, todayInSaoPaulo, weekdays } from '@/lib/operations'
import { generateLessons } from '@/app/operations'

export default async function Calendar({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ semana?: string; erro?: string; sucesso?: string }>
}) {
  const { organizationId: org } = await params
  const { semana, erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const selected = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) && !Number.isNaN(Date.parse(semana)) ? semana : todayInSaoPaulo()
  const first = monday(selected)
  const last = shiftDate(first, 6)
  const [{ data: sessions, error }, { count: scheduleCount }] = await Promise.all([
    supabase.from('class_sessions').select('id,lesson_date,starts_at,ends_at,status,swim_classes(name),class_schedules(pools(name),lanes(name))')
      .eq('organization_id', org).gte('lesson_date', first).lte('lesson_date', last).order('lesson_date').order('starts_at'),
    supabase.from('class_schedules').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('active', true),
  ])
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(first, i))
  const className = (value: {name?: string} | {name?: string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Operação</span><h1>Calendário de aulas</h1><p>Semana de {displayDate(first)} a {displayDate(last)}</p></div><div className="week-nav"><Link className="secondary nav-button" href={`?semana=${shiftDate(first, -7)}`}>← Anterior</Link><Link className="secondary nav-button" href={`?semana=${shiftDate(first, 7)}`}>Próxima →</Link></div></header>
    {(error || erro) && <p role="alert" className="error">Não foi possível gerar ou carregar as aulas. Confira os horários cadastrados.</p>}
    {sucesso && <p className="success">Aulas da programação geradas. As já existentes foram preservadas.</p>}
    {membership.role !== 'teacher' && <section className="card calendar-tools"><div><h2>Gerar aulas</h2><p>Cria as aulas dos horários semanais para 28 dias a partir desta segunda-feira. Pode repetir sem duplicar aulas.</p></div><form action={generateLessons.bind(null, org)}><input type="hidden" name="start" value={first} /><button disabled={!scheduleCount}>Gerar 4 semanas</button></form></section>}
    <div className="calendar-grid spacing">{days.map((day, i) => <section className="card day-card" key={day}><span className="eyebrow">{weekdays[(i + 1) % 7]}</span><h2>{displayDate(day)}</h2>{sessions?.filter(s => s.lesson_date === day).map(s => <Link className="lesson" href={`/dashboard/${org}/aulas/${s.id}`} key={s.id}><strong>{time(s.starts_at)}–{time(s.ends_at)}</strong><span>{className(s.swim_classes)}</span><small>{s.status === 'cancelled' ? 'Cancelada' : 'Abrir chamada →'}</small></Link>)}{!sessions?.some(s => s.lesson_date === day) && <p>Sem aulas.</p>}</section>)}</div>
  </main>
}
