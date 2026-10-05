import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { createClass } from '@/app/operations'

export default async function Classes({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const [{ data: classes, error }, { data: teachers }] = await Promise.all([
    supabase.from('swim_classes').select('id,name,capacity,active,teachers(full_name)').eq('organization_id', org).order('name'),
    membership.role === 'teacher' ? Promise.resolve({ data: [] }) : supabase.from('teachers').select('id,full_name').eq('organization_id', org).eq('active', true).order('full_name'),
  ])
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Operação</span><h1>Turmas</h1><p>Vincule o professor e depois adicione horários e alunos.</p></div></header>
    {(error || erro) && <p role="alert" className="error">{erro === 'salvar' ? 'Não foi possível salvar a turma.' : 'Não foi possível carregar ou validar os dados.'}</p>}
    {sucesso && <p className="success">Turma salva.</p>}
    {membership.role !== 'teacher' && <section className="card"><h2>Nova turma</h2><form className="form-row" action={createClass.bind(null, org)}><label>Nome<input name="name" required minLength={2} maxLength={100} placeholder="Infantil iniciante" /></label><label>Professor<select name="teacher_id" required defaultValue=""><option value="" disabled>Selecione</option>{teachers?.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label><label>Vagas<input type="number" name="capacity" required min={1} max={100} defaultValue={8} /></label><button disabled={!teachers?.length}>Criar turma</button></form>{!teachers?.length && <p>Cadastre um professor antes de criar turmas.</p>}</section>}
    <section className="grid spacing">{classes?.map(c => <Link className="card tile" key={c.id} href={`/dashboard/${org}/turmas/${c.id}`}><span className="eyebrow">{c.active ? 'Ativa' : 'Inativa'}</span><h2>{c.name}</h2><p>{Array.isArray(c.teachers) ? c.teachers[0]?.full_name : (c.teachers as {full_name?: string} | null)?.full_name} · {c.capacity} vagas</p><strong>Abrir →</strong></Link>)}</section>
    {!classes?.length && !error && <p>Nenhuma turma disponível para sua conta.</p>}
  </main>
}
