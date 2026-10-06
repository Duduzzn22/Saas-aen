import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { signOut } from '@/app/actions'

export default async function Dashboard() {
  const { supabase, userId } = await requireUser()
  const { data: memberships, error } = await supabase.from('memberships')
    .select('organization_id, full_name, role, organizations(name)')
    .eq('user_id', userId).eq('active', true)
  return <main className="shell"><header><div><span className="eyebrow">Natação</span><h1>Suas escolas</h1></div><form action={signOut}><button className="secondary">Sair</button></form></header>
    {error && <p role="alert" className="error">Não foi possível carregar as escolas.</p>}
    {!error && memberships?.length === 0 && <div className="card"><h2>Nenhuma escola vinculada</h2><p>Se você é responsável, solicite acesso ao portal. Para trabalhar na equipe, peça um convite à administração.</p><Link className="back" href="/portal/acesso">Portal do responsável →</Link></div>}
    <div className="grid">{memberships?.map((m) => <Link className="card tile" href={`/dashboard/${m.organization_id}`} key={m.organization_id}>
      <span className="eyebrow">{m.role}</span><h2>{Array.isArray(m.organizations) ? m.organizations[0]?.name : (m.organizations as {name?: string} | null)?.name}</h2>
      <p>Entrar no painel →</p>
    </Link>)}</div><p className="spacing"><Link className="back" href="/convites">Convites para a equipe →</Link> · <Link className="back" href="/portal">Portal do responsável →</Link></p>
  </main>
}
