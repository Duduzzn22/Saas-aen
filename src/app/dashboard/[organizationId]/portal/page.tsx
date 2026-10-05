import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { createNotice, reviewAccess, setNoticeActive } from '@/app/experience'

export default async function ManagePortal({params,searchParams}: {params:Promise<{organizationId:string}>;searchParams:Promise<{erro?:string;sucesso?:string}>}) {
  const {organizationId:org} = await params
  const {erro,sucesso} = await searchParams
  const {supabase,membership} = await requireOrganization(org)
  if (membership.role === 'teacher') return <main className="shell"><Link href={`/dashboard/${org}`}>← Escola</Link><p>Acesso reservado à administração.</p></main>
  const [{data:requests,error}, {data:guardians}, {data:notices}] = await Promise.all([
    supabase.from('guardian_access_requests').select('id,guardian_id,status,requested_at,guardians(full_name,email)')
      .eq('organization_id',org).order('requested_at',{ascending:false}).limit(100),
    supabase.from('guardians').select('id,full_name,email').eq('organization_id',org).order('full_name'),
    supabase.from('portal_notices').select('id,title,body,active,guardian_id,created_at')
      .eq('organization_id',org).order('created_at',{ascending:false}).limit(50),
  ])
  const guardian = (value:{full_name?:string;email?:string} | {full_name?:string;email?:string}[] | null) => Array.isArray(value) ? value[0] : value
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Experiência do cliente</span><h1>Portal e comunicados</h1></div></header>
    {(erro || error) && <p role="alert" className="error">Não foi possível salvar ou carregar os dados. Confira o cadastro e tente novamente.</p>}
    {sucesso && <p className="success">Alteração salva.</p>}
    <section className="card"><h2>Solicitações de acesso</h2><p>Confira o responsável cadastrado antes de aprovar. O e-mail da conta precisa estar confirmado e corresponder ao cadastro.</p>
      {!requests?.length && <p>Nenhuma solicitação.</p>}<ul className="list">{requests?.map(r => <li className="group-row" key={r.id}><div><strong>{guardian(r.guardians)?.full_name}</strong><br /><small>{guardian(r.guardians)?.email} · {r.status === 'pending' ? 'Pendente' : r.status === 'approved' ? 'Aprovado' : 'Recusado'}</small></div>
        {r.status === 'pending' && membership.role === 'admin' && <div className="form-row"><form action={reviewAccess.bind(null,org,r.id,true)}><button>Aprovar</button></form><form action={reviewAccess.bind(null,org,r.id,false)}><button className="secondary">Recusar</button></form></div>}
      </li>)}</ul>
    </section>
    <section className="card spacing"><h2>Novo comunicado</h2><form className="stack" action={createNotice.bind(null,org)}>
      <label>Título<input name="title" minLength={3} maxLength={120} required /></label>
      <label>Mensagem<textarea name="body" minLength={3} maxLength={2000} required /></label>
      <div className="columns"><label>Destinatário<select name="guardian_id"><option value="">Todos os responsáveis</option>{guardians?.map(g => <option value={g.id} key={g.id}>{g.full_name} · {g.email}</option>)}</select></label>
      <label>Válido até (opcional)<input name="expires_on" type="date" /></label></div><button>Publicar comunicado</button>
    </form></section>
    <section className="card spacing"><h2>Comunicados publicados</h2><ul className="list">{notices?.map(n => <li className="group-row" key={n.id}><div><strong>{n.title}</strong><p>{n.body}</p><small>{n.guardian_id ? guardians?.find(g => g.id === n.guardian_id)?.full_name : 'Todos'} · {n.active ? 'Ativo' : 'Arquivado'}</small></div><form action={setNoticeActive.bind(null,org,n.id,!n.active)}><button className="secondary">{n.active ? 'Arquivar' : 'Reativar'}</button></form></li>)}</ul></section>
  </main>
}
