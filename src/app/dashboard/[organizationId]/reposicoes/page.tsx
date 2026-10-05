import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { displayDate, todayInSaoPaulo } from '@/lib/operations'
import { reviewMakeup } from '@/app/experience'

export default async function Makeups({params,searchParams}: {params:Promise<{organizationId:string}>;searchParams:Promise<{erro?:string;sucesso?:string}>}) {
  const {organizationId:org} = await params
  const {erro,sucesso} = await searchParams
  const {supabase,membership} = await requireOrganization(org)
  if (membership.role === 'teacher') return <main className="shell"><Link href={`/dashboard/${org}`}>← Escola</Link><p>Acesso reservado à secretaria.</p></main>
  const [{data:requests,error},{data:sessions}] = await Promise.all([
    supabase.from('makeup_requests').select('id,student_id,original_session_id,original_class_id,target_session_id,status,note,requested_at,students(full_name)')
      .eq('organization_id',org).order('requested_at',{ascending:false}).limit(100),
    supabase.from('class_sessions').select('id,class_id,lesson_date,starts_at,status,swim_classes(name)')
      .eq('organization_id',org).gte('lesson_date',todayInSaoPaulo()).order('lesson_date').limit(150),
  ])
  const future = sessions?.filter(s => s.status === 'scheduled') ?? []
  const studentName = (value:{full_name?:string} | {full_name?:string}[] | null) => Array.isArray(value) ? value[0]?.full_name : value?.full_name
  const className = (value:{name?:string} | {name?:string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Atendimento</span><h1>Reposições</h1><p>Abra futuras aulas no calendário para disponibilizá-las como opções.</p></div><Link className="secondary nav-button" href={`/dashboard/${org}/calendario`}>Abrir calendário</Link></header>
    {(erro || error) && <p role="alert" className="error">Não foi possível concluir a análise. Confira a elegibilidade e as vagas da turma.</p>}
    {sucesso && <p className="success">Solicitação atualizada.</p>}
    <section className="card"><h2>Pedidos</h2>{!requests?.length && <p>Nenhum pedido de reposição.</p>}
      <ul className="list">{requests?.map(r => <li key={r.id}><strong>{studentName(r.students)}</strong> · {r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovada' : 'Recusada'}
        <p>Aula original: <Link className="back" href={`/dashboard/${org}/aulas/${r.original_session_id}`}>ver chamada →</Link>{r.note ? ` · ${r.note}` : ''}</p>
        {r.target_session_id && <p>Reposição: <Link className="back" href={`/dashboard/${org}/aulas/${r.target_session_id}`}>ver aula →</Link></p>}
        {r.status === 'pending' && <div className="form-row"><form className="form-row" action={reviewMakeup.bind(null,org,r.id)}><input type="hidden" name="status" value="approved" /><label>Aula disponível<select name="target_session_id" required defaultValue=""><option value="" disabled>Selecione</option>{future.map(s => <option value={s.id} key={s.id}>{displayDate(s.lesson_date)} · {s.starts_at.slice(0,5)} · {className(s.swim_classes)}</option>)}</select></label><button disabled={!future.length}>Aprovar</button></form>
          <form action={reviewMakeup.bind(null,org,r.id)}><input type="hidden" name="status" value="rejected" /><button className="secondary">Recusar</button></form></div>}
      </li>)}</ul>
    </section>
  </main>
}
