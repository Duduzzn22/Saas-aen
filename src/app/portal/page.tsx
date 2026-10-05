import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { signOut } from '@/app/actions'

export default async function Portal() {
  const { supabase, userId } = await requireUser()
  const { data: links } = await supabase.from('guardian_portal_links')
    .select('organization_id,guardian_id,guardians(full_name),organizations(name)')
    .eq('user_id', userId).eq('active', true)
  const { data: verified } = await supabase.from('guardians').select('id')
    .in('id', links?.map(l => l.guardian_id) ?? [])
  const schools = links?.filter(l => verified?.some(g => g.id === l.guardian_id)) ?? []
  const name = (value: {name?: string} | {name?: string}[] | null) => Array.isArray(value) ? value[0]?.name : value?.name
  return <main className="shell"><header><div><span className="eyebrow">Natação</span><h1>Portal do responsável</h1></div><form action={signOut}><button className="secondary">Sair</button></form></header>
    {!schools.length && <section className="card"><h2>Seu acesso</h2><p>Solicite acesso usando o e-mail que a escola cadastrou para você.</p><Link className="back" href="/portal/acesso">Solicitar acesso →</Link></section>}
    <div className="grid">{schools.map(l => <Link className="card tile" href={`/portal/${l.organization_id}`} key={l.guardian_id}><span className="eyebrow">{name(l.organizations)}</span><h2>{Array.isArray(l.guardians) ? l.guardians[0]?.full_name : (l.guardians as {full_name?: string} | null)?.full_name}</h2><strong>Ver alunos →</strong></Link>)}</div>
    <p className="spacing"><Link className="back" href="/portal/acesso">Gerenciar acesso</Link> · <Link className="back" href="/dashboard">Painel da escola</Link></p>
  </main>
}
