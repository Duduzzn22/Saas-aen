import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { signOut } from '@/app/actions'
import { requestAccess } from '@/app/experience'

export default async function Access({ searchParams }: {searchParams: Promise<{erro?: string;sucesso?: string}>}) {
  const { erro, sucesso } = await searchParams
  const { supabase, userId } = await requireUser()
  const [{data: guardians,error}, {data: requests}, {data: links}] = await Promise.all([
    supabase.from('guardians').select('id,organization_id,full_name,organizations(name)').order('full_name'),
    supabase.from('guardian_access_requests').select('guardian_id,status').eq('user_id', userId),
    supabase.from('guardian_portal_links').select('guardian_id,active').eq('user_id', userId),
  ])
  const schoolName = (value: {name?: string} | {name?: string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><Link className="back" href="/portal">← Portal</Link><h1>Solicitar acesso</h1><p>Os vínculos encontrados usam o e-mail confirmado da sua conta.</p></div><form action={signOut}><button className="secondary">Sair</button></form></header>
    {(erro || error) && <p role="alert" className="error">Não foi possível enviar ou carregar a solicitação. Confira seu cadastro com a escola.</p>}
    {sucesso && <p className="success">Pedido enviado. A escola precisa aprová-lo.</p>}
    {!guardians?.length && <section className="card"><h2>Nenhum cadastro encontrado</h2><p>Confirme seu e-mail e peça à escola que cadastre esse mesmo endereço no responsável e vincule o aluno.</p></section>}
    <div className="grid">{guardians?.map(g => {
      const linked = links?.some(l => l.guardian_id === g.id && l.active)
      const latest = requests?.filter(r => r.guardian_id === g.id).at(-1)
      return <section className="card" key={g.id}><span className="eyebrow">{schoolName(g.organizations) || 'Escola'}</span><h2>{g.full_name}</h2>
        {linked ? <Link className="back" href={`/portal/${g.organization_id}`}>Acessar portal →</Link> : latest?.status === 'pending' ? <p>Aguardando aprovação.</p> : latest ? <p>{latest.status === 'rejected' ? 'Pedido recusado. Fale com a escola.' : 'Acesso suspenso. Fale com a escola.'}</p> : <form action={requestAccess.bind(null,g.organization_id,g.id)}><button>Solicitar acesso</button></form>}
      </section>
    })}</div>
  </main>
}
