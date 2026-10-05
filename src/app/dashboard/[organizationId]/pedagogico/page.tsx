import Link from 'next/link'
import { requireOrganization } from '@/lib/auth'
import { createLevel, createSkill, updateLevel, updateSkill } from '@/app/pedagogy'

export default async function Pedagogy({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  const [{ data: levels, error: levelsError }, { data: skills, error: skillsError }] = await Promise.all([
    supabase.from('swim_levels').select('id,name,description,rank,active').eq('organization_id', org).order('rank'),
    supabase.from('swim_skills').select('id,level_id,name,description,position,active').eq('organization_id', org).order('position').order('name'),
  ])
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Pedagógico</span><h1>Níveis e habilidades</h1><p>Defina a sequência pedagógica desta escola.</p></div></header>
    {(erro || levelsError || skillsError) && <p role="alert" className="error">Não foi possível carregar ou salvar. Confira se nome e ordem já existem.</p>}
    {sucesso && <p className="success">Alteração salva.</p>}
    {membership.role === 'admin' && <div className="columns">
      <section className="card"><h2>Novo nível</h2><form className="stack" action={createLevel.bind(null, org)}><label>Nome<input name="name" minLength={2} maxLength={80} required placeholder="Iniciante" /></label><label>Ordem<input name="rank" type="number" min={1} max={1000} required placeholder="1" /></label><label>Descrição<textarea name="description" maxLength={500} rows={2} /></label><button>Criar nível</button></form></section>
      <section className="card"><h2>Nova habilidade</h2><form className="stack" action={createSkill.bind(null, org)}><label>Nível<select name="level_id" required defaultValue=""><option value="" disabled>Selecione</option>{levels?.filter(l => l.active).map(l => <option key={l.id} value={l.id}>{l.rank}. {l.name}</option>)}</select></label><label>Habilidade<input name="name" minLength={2} maxLength={120} required placeholder="Flutuação dorsal" /></label><label>Ordem<input name="position" type="number" min={1} max={1000} required defaultValue={1} /></label><label>Descrição<textarea name="description" maxLength={500} rows={2} /></label><button disabled={!levels?.some(l => l.active)}>Criar habilidade</button></form></section>
    </div>}
    <section className="card spacing"><h2>Progressão da escola</h2>{!levels?.length && <p>Nenhum nível cadastrado. Comece pelo primeiro nível e suas habilidades.</p>}
      {levels?.map(level => <div className="level-group" key={level.id}><h3>{level.rank}. {level.name} {level.active ? '' : '· inativo'}</h3>{level.description && <p>{level.description}</p>}
        {membership.role === 'admin' && <details><summary>Editar nível</summary><form className="form-row edit-form" action={updateLevel.bind(null, org, level.id)}><label>Nome<input name="name" defaultValue={level.name} minLength={2} maxLength={80} required /></label><label>Ordem<input name="rank" type="number" defaultValue={level.rank} min={1} max={1000} required /></label><label>Descrição<input name="description" defaultValue={level.description || ''} maxLength={500} /></label><label>Situação<select name="active" defaultValue={String(level.active)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label><button>Salvar nível</button></form></details>}
        <ul className="list">{skills?.filter(skill => skill.level_id === level.id).map(skill => <li key={skill.id}><details><summary>{skill.position}. {skill.name} {skill.active ? '' : '· inativa'}</summary>{skill.description && <p>{skill.description}</p>}{membership.role === 'admin' && <form className="form-row edit-form" action={updateSkill.bind(null, org, skill.id)}><label>Nome<input name="name" defaultValue={skill.name} minLength={2} maxLength={120} required /></label><label>Ordem<input name="position" type="number" defaultValue={skill.position} min={1} max={1000} required /></label><label>Descrição<input name="description" defaultValue={skill.description || ''} maxLength={500} /></label><label>Situação<select name="active" defaultValue={String(skill.active)}><option value="true">Ativa</option><option value="false">Inativa</option></select></label><button>Salvar habilidade</button></form>}</details></li>)}</ul>
        {!skills?.some(skill => skill.level_id === level.id) && <p>Sem habilidades neste nível.</p>}
      </div>)}
    </section>
  </main>
}
