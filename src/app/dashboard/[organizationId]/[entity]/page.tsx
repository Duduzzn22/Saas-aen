import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createRecord, linkGuardian } from '@/app/actions'
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
  const { data: rows, error } = await supabase.from(info.table).select('id, full_name, created_at')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100)
  let students: { id: string, full_name: string }[] = []
  let guardians: { id: string, full_name: string }[] = []
  if (entity === 'alunos') {
    const [s, g] = await Promise.all([
      supabase.from('students').select('id,full_name').eq('organization_id',organizationId).order('full_name').limit(500),
      supabase.from('guardians').select('id,full_name').eq('organization_id',organizationId).order('full_name').limit(500),
    ])
    students = s.data || []; guardians = g.data || []
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
        rows?.length ? <ul className="list">{rows.map((row) => <li key={row.id}>{row.full_name}</li>)}</ul> : <p>Nenhum cadastro ainda.</p>}
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
