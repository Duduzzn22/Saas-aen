import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { displayDate, monday, shiftDate, time, todayInSaoPaulo, weekdays } from '@/lib/operations'
import { openLesson } from '@/app/operations'

export default async function Calendar({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ semana?: string; erro?: string }>
}) {
  const { organizationId: org } = await params
  const { semana, erro } = await searchParams
  const { supabase } = await requireOrganization(org)
  const selected = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) && !Number.isNaN(Date.parse(semana)) ? semana : todayInSaoPaulo()
  const first = monday(selected)
  const last = shiftDate(first, 6)
  const [{ data: sessions, error }, { data: schedules, error: scheduleError }] = await Promise.all([
    supabase.from('class_sessions').select('id,schedule_id,lesson_date,starts_at,ends_at,status,swim_classes(name)')
      .eq('organization_id', org).gte('lesson_date', first).lte('lesson_date', last).order('lesson_date').order('starts_at'),
    supabase.from('class_schedules').select('id,weekday,starts_at,ends_at,swim_classes!inner(name,active)')
      .eq('organization_id', org).eq('active', true).eq('swim_classes.active', true).order('starts_at'),
  ])
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(first, i))
  const className = (value: {name?: string} | {name?: string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Operação</span><h1>Calendário de aulas</h1><p>Semana de {displayDate(first)} a {displayDate(last)}</p></div><div className="week-nav"><Link className="secondary nav-button" href={`?semana=${shiftDate(first, -7)}`}>← Anterior</Link><Link className="secondary nav-button" href={`?semana=${shiftDate(first, 7)}`}>Próxima →</Link></div></header>
    {(error || scheduleError || erro) && <p role="alert" className="error">Não foi possível carregar ou abrir a aula. Confira os horários cadastrados.</p>}
    <section className="card calendar-tools"><p>Os horários semanais aparecem automaticamente. Abra uma aula para registrar a chamada; alterações futuras no horário preservam as aulas já abertas.</p></section>
    <div className="calendar-grid spacing">{days.map((day, i) => {
      const actual = sessions?.filter(s => s.lesson_date === day) ?? []
      const recurring = schedules?.filter(s => s.weekday === (i + 1) % 7 && !actual.some(a => a.schedule_id === s.id)) ?? []
      return <section className="card day-card" key={day}><span className="eyebrow">{weekdays[(i + 1) % 7]}</span><h2>{displayDate(day)}</h2>
        {actual.map(s => <Link className="lesson" href={`/dashboard/${org}/aulas/${s.id}`} key={s.id}><strong>{time(s.starts_at)}–{time(s.ends_at)}</strong><span>{className(s.swim_classes)}</span><small>{s.status === 'cancelled' ? 'Cancelada' : 'Abrir chamada →'}</small></Link>)}
        {recurring.map(s => <form action={openLesson.bind(null, org, s.id, day)} className="lesson" key={s.id}><strong>{time(s.starts_at)}–{time(s.ends_at)}</strong><span>{className(s.swim_classes)}</span><button className="link-button">Abrir chamada →</button></form>)}
        {!actual.length && !recurring.length && <p>Sem aulas.</p>}
      </section>
    })}</div>
  </main>
}
