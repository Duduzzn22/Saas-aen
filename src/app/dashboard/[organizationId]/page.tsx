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
        <div className="card"><h2>Área do professor</h2><p>Acompanhe suas turmas, aulas e chamadas.</p></div>}
      {membership.role === 'admin' && <Link className="card tile" href={`/dashboard/${organizationId}/instalacoes`}><h2>Piscinas e raias</h2><p>Organize os espaços de aula.</p><strong>Abrir →</strong></Link>}
      {membership.role === 'admin' && <Link className="card tile" href={`/dashboard/${organizationId}/equipe`}><h2>Equipe e acessos</h2><p>Convide professores e recepção.</p><strong>Abrir →</strong></Link>}
      <Link className="card tile" href={`/dashboard/${organizationId}/turmas`}><h2>Turmas</h2><p>Professores, horários e matrículas.</p><strong>Abrir →</strong></Link>
      <Link className="card tile" href={`/dashboard/${organizationId}/calendario`}><h2>Calendário e presença</h2><p>Consulte aulas e registre a chamada.</p><strong>Abrir →</strong></Link>
      <Link className="card tile" href={`/dashboard/${organizationId}/pedagogico`}><h2>Pedagógico</h2><p>Níveis, habilidades e evolução dos alunos.</p><strong>Abrir →</strong></Link>
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/financeiro`}><h2>Financeiro</h2><p>Planos, mensalidades e recebimentos.</p><strong>Abrir →</strong></Link>}
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/portal`}><h2>Portal do responsável</h2><p>Aprovações de acesso e comunicados.</p><strong>Abrir →</strong></Link>}
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/reposicoes`}><h2>Reposições</h2><p>Analise pedidos e escolha aulas com vagas.</p><strong>Abrir →</strong></Link>}
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/experimentais`}><h2>Aulas experimentais</h2><p>Agende solicitações de novos alunos.</p><strong>Abrir →</strong></Link>}
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/indicadores`}><h2>Indicadores</h2><p>Receita, presença e atendimento em um só lugar.</p><strong>Abrir →</strong></Link>}
      {allowed && <Link className="card tile" href={`/dashboard/${organizationId}/whatsapp`}><h2>WhatsApp</h2><p>Lembretes de mensalidades com consentimento.</p><strong>Abrir →</strong></Link>}
      {membership.role === 'admin' && <Link className="card tile" href={`/dashboard/${organizationId}/mercado-pago`}><h2>Mercado Pago</h2><p>Conecte a conta da escola para receber PIX.</p><strong>Abrir →</strong></Link>}
    </div>
  </main>
}
