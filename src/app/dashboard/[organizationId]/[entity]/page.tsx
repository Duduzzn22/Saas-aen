import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { assignTeacherAccount, createRecord, linkGuardian, updateRecord } from '@/app/actions'
import { requireOrganization } from '@/lib/auth'

const entities = {
  alunos: { table: 'students', title: 'Alunos' },
  responsaveis: { table: 'guardians', title: 'Responsáveis' },
  professores: { table: 'teachers', title: 'Professores' },
} as const

export default async function EntityPage({ params, searchParams }: {
  params: Promise<{ organizationId: string, entity: string }>
  searchParams: Promise<{ erro?: string, sucesso?: string }>
}) {
  const { organizationId, entity } = await params
  const info = entities[entity as keyof typeof entities]
  if (!info) notFound()
  const { supabase, membership } = await requireOrganization(organizationId)
  if (membership.role === 'teacher') redirect(`/dashboard/${organizationId}`)
  const { erro, sucesso } = await searchParams
  const { data: rows, error } = await supabase.from(info.table).select('*')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100)
  let students: { id: string, full_name: string }[] = []
  let guardians: { id: string, full_name: string }[] = []
  let teacherMembers: { user_id: string, full_name: string }[] = []
  if (entity === 'alunos') {
    const [s, g] = await Promise.all([
      supabase.from('students').select('id,full_name').eq('organization_id',organizationId).order('full_name').limit(500),
      supabase.from('guardians').select('id,full_name').eq('organization_id',organizationId).order('full_name').limit(500),
    ])
    students = s.data || []; guardians = g.data || []
  }
  if (entity === 'professores' && membership.role === 'admin') {
    const { data } = await supabase.from('memberships').select('user_id,full_name')
      .eq('organization_id', organizationId).eq('role', 'teacher').eq('active', true).order('full_name')
    teacherMembers = data || []
  }

  return <main className="shell">
    <header><div><Link href={`/dashboard/${organizationId}`} className="back">← Painel</Link><h1>{info.title}</h1><p>Escola: {membership.full_name}</p></div></header>
    {erro && <p role="alert" className="error">Não foi possível salvar. Confira os dados e tente novamente.</p>}
    {sucesso && <p role="status" className="success">Registro salvo.</p>}
    <div className="columns">
      {(entity !== 'professores' || membership.role === 'admin') && <section className="card"><h2>Novo cadastro</h2>
        <form action={createRecord.bind(null, organizationId, entity)} className="stack">
          <label>Nome completo<input name="full_name" required minLength={2} maxLength={120} /></label>
          {entity === 'alunos' ? <label>Data de nascimento<input name="birth_date" type="date" /></label> : <>
            <label>Telefone<input name="phone" type="tel" maxLength={200} /></label>
            <label>E-mail<input name="email" type="email" /></label>
          </>}
          <button type="submit">Salvar {entity === 'alunos' ? 'aluno' : entity === 'professores' ? 'professor' : 'responsável'}</button>
        </form>
      </section>}
      <section className="card"><h2>Cadastros recentes</h2>
        {error ? <p role="alert" className="error">Não foi possível carregar os cadastros.</p> :
        rows?.length ? <ul className="list">{rows.map((row) => <li key={row.id}>
          <details><summary>{row.full_name}{entity === 'alunos' && row.status === 'inactive' ? ' · inativo' : ''}{entity === 'professores' && row.active === false ? ' · inativo' : ''}</summary>
            {(entity !== 'professores' || membership.role === 'admin') && <form action={updateRecord.bind(null, organizationId, entity, row.id)} className="stack edit-form">
              <label>Nome completo<input name="full_name" defaultValue={row.full_name} required minLength={2} maxLength={120} /></label>
              {entity === 'alunos' ? <>
                <label>Data de nascimento<input name="birth_date" type="date" defaultValue={row.birth_date || ''} /></label>
                <label>Situação<select name="status" defaultValue={row.status}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
              </> : <>
                <label>Telefone<input name="phone" type="tel" defaultValue={row.phone || ''} maxLength={200} /></label>
                <label>E-mail<input name="email" type="email" defaultValue={row.email || ''} /></label>
                {entity === 'professores' && <label>Situação<select name="active" defaultValue={String(row.active)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>}
              </>}
              <button type="submit">Salvar alterações</button>
            </form>}
            {entity === 'professores' && membership.role === 'admin' && <form action={assignTeacherAccount.bind(null, organizationId, row.id)} className="stack edit-form">
              <strong>Acesso do professor</strong><p>Vincule uma conta já criada no Supabase e adicionada como membro professor desta escola.</p>
              <label>Conta<select name="user_id" defaultValue={row.user_id || ''} required><option value="" disabled>Selecione</option>{teacherMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label>
              <button disabled={!teacherMembers.length}>Vincular conta</button>
            </form>}
          </details>
        </li>)}</ul> : <p>Nenhum cadastro ainda.</p>}
      </section>
    </div>
    {entity === 'alunos' && <section className="card spacing"><h2>Vincular responsável a aluno</h2>
      <p>Cadastre ambos antes de criar o vínculo.</p>
      <form action={linkGuardian.bind(null, organizationId)} className="stack">
        <label>Aluno<select name="student_id" required defaultValue=""><option value="" disabled>Selecione</option>{students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></label>
        <label>Responsável<select name="guardian_id" required defaultValue=""><option value="" disabled>Selecione</option>{guardians.map(g => <option key={g.id} value={g.id}>{g.full_name}</option>)}</select></label>
        <label>Parentesco<input name="relationship" placeholder="Mãe, pai, tutor..." required maxLength={120} /></label>
        <label className="check"><input name="is_financial" type="checkbox" /> Responsável financeiro</label>
        <label className="check"><input name="is_emergency" type="checkbox" /> Contato de emergência</label>
        <button disabled={!students.length || !guardians.length}>Criar vínculo</button>
      </form>
    </section>}
  </main>
}
