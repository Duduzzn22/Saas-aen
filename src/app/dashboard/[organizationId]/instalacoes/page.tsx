import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { createLane, createPool, updateLane, updatePool } from '@/app/operations'

export default async function Facilities({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(`/dashboard/${org}`)
  const [{ data: pools, error: poolError }, { data: lanes, error: laneError }] = await Promise.all([
    supabase.from('pools').select('id,name,active').eq('organization_id', org).order('name'),
    supabase.from('lanes').select('id,pool_id,name,active').eq('organization_id', org).order('name'),
  ])
  return <main className="shell">
    <header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Operação</span><h1>Piscinas e raias</h1><p>Cadastre os espaços antes de definir horários.</p></div></header>
    {(poolError || laneError || erro) && <p role="alert" className="error">{erro === 'horarios' ? 'Desative os horários da raia antes de desativar esse espaço.' : erro === 'salvar' ? 'Não foi possível salvar. Confira se o nome já existe.' : 'Não foi possível carregar ou validar os dados.'}</p>}
    {sucesso && <p className="success">Cadastro salvo.</p>}
    <div className="columns">
      <section className="card"><h2>Nova piscina</h2><form className="stack" action={createPool.bind(null, org)}><label>Nome<input name="name" required minLength={2} maxLength={80} placeholder="Piscina principal" /></label><button>Adicionar piscina</button></form></section>
      <section className="card"><h2>Nova raia</h2><form className="stack" action={createLane.bind(null, org)}><label>Piscina<select name="pool_id" required defaultValue=""><option value="" disabled>Selecione</option>{pools?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Nome<input name="name" required maxLength={40} placeholder="Raia 1" /></label><button disabled={!pools?.length}>Adicionar raia</button></form></section>
    </div>
    <section className="card spacing"><h2>Espaços cadastrados</h2>{!pools?.length && <p>Nenhuma piscina cadastrada.</p>}
      {pools?.map(p => <div key={p.id} className="facility-group"><details><summary><strong>{p.name}</strong> {p.active ? '' : '· inativa'} · {lanes?.filter(l => l.pool_id === p.id).length || 0} raias</summary><form className="form-row edit-form" action={updatePool.bind(null, org, p.id)}><label>Nome<input name="name" defaultValue={p.name} required minLength={2} maxLength={80} /></label><label>Situação<select name="active" defaultValue={String(p.active)}><option value="true">Ativa</option><option value="false">Inativa</option></select></label><button>Salvar piscina</button></form></details>
        <ul className="list">{lanes?.filter(l => l.pool_id === p.id).map(l => <li key={l.id}><details><summary>{l.name} {l.active ? '' : '· inativa'}</summary><form className="form-row edit-form" action={updateLane.bind(null, org, l.id)}><label>Nome<input name="name" defaultValue={l.name} required maxLength={40} /></label><label>Situação<select name="active" defaultValue={String(l.active)}><option value="true">Ativa</option><option value="false">Inativa</option></select></label><button>Salvar raia</button></form></details></li>)}</ul></div>)}
    </section>
  </main>
}
