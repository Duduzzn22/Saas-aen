import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { inviteStaff, revokeStaffInvite } from '@/app/staff'

export default async function TeamPage({params,searchParams}: {
  params: Promise<{organizationId:string}>, searchParams: Promise<{erro?:string,sucesso?:string}>
}) {
  const {organizationId} = await params
  const {supabase,membership} = await requireOrganization(organizationId)
  if (membership.role !== 'admin') redirect(`/dashboard/${organizationId}`)
  const {erro,sucesso} = await searchParams
  const [teachersResult, invitationsResult, membersResult] = await Promise.all([
    supabase.from('teachers').select('id,full_name,email,user_id,active').eq('organization_id',organizationId).order('full_name'),
    supabase.from('staff_invitations').select('id,email,full_name,role,status,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(100),
    supabase.from('memberships').select('user_id,full_name,role,active').eq('organization_id',organizationId).order('created_at',{ascending:false}),
  ])
  const teachers = (teachersResult.data || []).filter(t => t.active && !t.user_id && t.email)
  const invites = invitationsResult.data || []
  const members = membersResult.data || []
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${organizationId}`}>← Painel</Link><h1>Equipe e acessos</h1><p>Convide professores cadastrados ou pessoas da recepção pelo e-mail da conta.</p></div></header>
    {erro && <p role="alert" className="error">{erro === 'dados' ? 'Confira os dados do convite.' : 'Não foi possível salvar o convite. Verifique o e-mail do professor e se já existe um convite pendente.'}</p>}
    {sucesso && <p role="status" className="success">Convite atualizado.</p>}
    {(teachersResult.error || invitationsResult.error || membersResult.error) && <p role="alert" className="error">Não foi possível carregar toda a equipe.</p>}
    <div className="columns">
      <section className="card"><h2>Convidar recepção</h2><form className="stack" action={inviteStaff.bind(null,organizationId)}>
        <input type="hidden" name="role" value="reception" />
        <label>Nome completo<input name="full_name" required minLength={2} maxLength={120} /></label>
        <label>E-mail da conta<input name="email" type="email" required /></label><button>Gerar convite</button>
      </form></section>
      <section className="card"><h2>Convidar professor</h2><p>Cadastre o professor com e-mail antes de enviar o convite. O e-mail deve ser igual ao da conta dele.</p>
        <form className="stack" action={inviteStaff.bind(null,organizationId)}>
          <input type="hidden" name="role" value="teacher" />
          <label>Professor<select name="teacher_id" required defaultValue=""><option value="" disabled>Selecione</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.full_name} · {t.email}</option>)}</select></label>
          <label>Nome no acesso<input name="full_name" required minLength={2} maxLength={120} /></label>
          <label>E-mail cadastrado<input name="email" type="email" required /></label>
          <button disabled={!teachers.length}>Gerar convite</button>
        </form><p><Link className="back" href={`/dashboard/${organizationId}/professores`}>Cadastrar professor →</Link></p>
      </section>
    </div>
    <section className="card spacing"><h2>Convites</h2><p>Peça à pessoa que crie uma conta com o e-mail indicado, confirme o e-mail e acesse “Convites” no painel. O sistema não envia mensagens automaticamente.</p>
      {invites.length ? <ul className="list">{invites.map(i=><li key={i.id}>{i.full_name} · {i.email} · {i.role === 'teacher' ? 'Professor' : 'Recepção'} · {i.status === 'pending' ? 'Pendente' : i.status === 'claimed' ? 'Aceito' : 'Revogado'}
        {i.status === 'pending' && <form action={revokeStaffInvite.bind(null,organizationId,i.id)}><button className="secondary">Revogar</button></form>}
      </li>)}</ul> : <p>Nenhum convite ainda.</p>}
    </section>
    <section className="card spacing"><h2>Acessos da escola</h2>{members.length ? <ul className="list">{members.map(m=><li key={m.user_id}>{m.full_name} · {m.role} · {m.active ? 'Ativo' : 'Inativo'}</li>)}</ul> : <p>Nenhum acesso.</p>}</section>
  </main>
}
