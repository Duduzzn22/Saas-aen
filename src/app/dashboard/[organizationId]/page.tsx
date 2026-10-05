import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { signOut } from '@/app/actions'

export default async function OrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params
  const { supabase, membership } = await requireOrganization(organizationId)
  const { data: org } = await supabase.from('organizations').select('name').eq('id', organizationId).single()
  const allowed = membership.role !== 'teacher'
  return <main className="shell"><header><div><Link href="/dashboard" className="back">← Escolas</Link><h1>{org?.name || 'Escola'}</h1><p>Olá, {membership.full_name}. Perfil: {membership.role}.</p></div><form action={signOut}><button className="secondary">Sair</button></form></header>
    <div className="grid">
      {allowed ? ([['alunos','Alunos','Cadastros e dados básicos'],['responsaveis','Responsáveis','Contatos dos alunos'],['professores','Professores','Equipe da escola']] as const).map(([route,label,detail]) =>
        <Link className="card tile" href={`/dashboard/${organizationId}/${route}`} key={route}><h2>{label}</h2><p>{detail}</p><strong>Abrir →</strong></Link>) :
        <div className="card"><h2>Área do professor</h2><p>Suas turmas e chamadas serão liberadas na Fase 2.</p></div>}
    </div>
  </main>
}
