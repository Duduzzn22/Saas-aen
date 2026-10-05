import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { displayDate, todayInSaoPaulo } from '@/lib/operations'
import { reviewTrial } from '@/app/experience'

export default async function Trials({params,searchParams}: {params:Promise<{organizationId:string}>;searchParams:Promise<{erro?:string;sucesso?:string}>}) {
  const {organizationId:org} = await params
  const {erro,sucesso} = await searchParams
  const {supabase,membership} = await requireOrganization(org)
  if (membership.role === 'teacher') return <main className="shell"><Link href={`/dashboard/${org}`}>← Escola</Link><p>Acesso reservado à secretaria.</p></main>
  const [{data:requests,error},{data:sessions}] = await Promise.all([
    supabase.from('trial_requests').select('id,prospect_name,contact_name,contact_email,contact_phone,preferred_date,note,status,session_id,created_at')
      .eq('organization_id',org).order('created_at',{ascending:false}).limit(100),
    supabase.from('class_sessions').select('id,lesson_date,starts_at,status,swim_classes(name)')
      .eq('organization_id',org).gte('lesson_date',todayInSaoPaulo()).order('lesson_date').limit(150),
  ])
  const className = (value:{name?:string} | {name?:string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Atendimento</span><h1>Aulas experimentais</h1><p>Entre em contato para combinar a turma. Abra a aula no calendário antes de confirmar.</p></div><Link className="secondary nav-button" href={`/dashboard/${org}/calendario`}>Abrir calendário</Link></header>
    {(erro || error) && <p role="alert" className="error">Não foi possível atualizar o pedido. Confira a data e as vagas.</p>}
    {sucesso && <p className="success">Pedido atualizado.</p>}
    <section className="card"><h2>Solicitações</h2>{!requests?.length && <p>Nenhuma solicitação.</p>}
      <ul className="list">{requests?.map(r => <li key={r.id}><strong>{r.prospect_name}</strong> · {r.status === 'pending' ? 'Pendente' : r.status === 'scheduled' ? 'Agendada' : r.status === 'completed' ? 'Concluída' : 'Cancelada'}
        <p>Contato: {r.contact_name} · {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ''}{r.preferred_date ? ` · Preferência: ${displayDate(r.preferred_date)}` : ''}</p>
        {r.note && <p>Observação: {r.note}</p>}{r.session_id && <p><Link className="back" href={`/dashboard/${org}/aulas/${r.session_id}`}>Ver aula agendada →</Link></p>}
        {r.status === 'pending' && <div className="form-row"><form className="form-row" action={reviewTrial.bind(null,org,r.id)}><input type="hidden" name="status" value="scheduled" /><label>Aula<select name="session_id" required defaultValue=""><option value="" disabled>Selecione</option>{sessions?.filter(s => s.status === 'scheduled').map(s => <option value={s.id} key={s.id}>{displayDate(s.lesson_date)} · {s.starts_at.slice(0,5)} · {className(s.swim_classes)}</option>)}</select></label><button>Agendar</button></form><form action={reviewTrial.bind(null,org,r.id)}><input type="hidden" name="status" value="cancelled" /><button className="secondary">Cancelar</button></form></div>}
        {r.status === 'scheduled' && <div className="form-row"><form action={reviewTrial.bind(null,org,r.id)}><input type="hidden" name="status" value="completed" /><button>Concluir</button></form><form action={reviewTrial.bind(null,org,r.id)}><input type="hidden" name="status" value="cancelled" /><button className="secondary">Cancelar</button></form></div>}
      </li>)}</ul>
    </section>
  </main>
}
