import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { claimStaffInvite } from '@/app/staff'

export default async function Invitations({searchParams}: {searchParams:Promise<{erro?:string}>}) {
  const {supabase} = await requireUser()
  const {data:user} = await supabase.auth.getUser()
  const {data:invites,error} = await supabase.from('staff_invitations')
    .select('id,organization_id,role,organizations(name)').eq('status','pending')
    .eq('email',user.user?.email?.toLowerCase() || '').order('created_at',{ascending:false})
  const {erro} = await searchParams
  return <main className="shell"><header><div><Link href="/dashboard" className="back">← Suas escolas</Link><h1>Convites para a equipe</h1><p>Conta: {user.user?.email}</p></div></header>
    {erro && <p role="alert" className="error">Não foi possível aceitar. O convite pode ter sido revogado ou a conta já está vinculada.</p>}
    {error && <p role="alert" className="error">Não foi possível carregar os convites.</p>}
    {invites?.length ? <div className="grid">{invites.map(i=><section className="card" key={i.id}>
      <h2>{Array.isArray(i.organizations) ? i.organizations[0]?.name : (i.organizations as {name?:string}|null)?.name}</h2>
      <p>Função: {i.role === 'teacher' ? 'Professor' : 'Recepção'}</p>
      <form action={claimStaffInvite.bind(null,i.id)}><button>Aceitar convite</button></form>
    </section>)}</div> : !error && <section className="card"><p>Nenhum convite pendente para seu e-mail confirmado.</p><p>Peça à administração que confira o e-mail usado no convite.</p></section>}
  </main>
}
