import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { brl, brlInput } from '@/lib/finance'
import { todayInSaoPaulo } from '@/lib/operations'
import { assignPlan, createPlan, setBillingActive, updatePlan } from '@/app/finance'

export default async function Finance({ params, searchParams }: {
  params: Promise<{ organizationId: string }>
  searchParams: Promise<{ erro?: string; sucesso?: string }>
}) {
  const { organizationId: org } = await params
  const { erro, sucesso } = await searchParams
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(`/dashboard/${org}`)
  const [{ data: plans, error: plansError }, { data: students, error: studentsError }, { data: billing, error: billingError }] = await Promise.all([
    supabase.from('billing_plans').select('id,name,description,amount_cents,due_day,active').eq('organization_id', org).order('name'),
    supabase.from('students').select('id,full_name').eq('organization_id', org).eq('status', 'active').order('full_name').limit(500),
    supabase.from('student_billing').select('id,student_id,plan_id,started_on,active,students(full_name),billing_plans(name,amount_cents)')
      .eq('organization_id', org).order('updated_at', { ascending: false }).limit(500),
  ])
  const relatedName = (value: {name?: string;full_name?: string} | {name?: string;full_name?: string}[] | null) =>
    Array.isArray(value) ? (value[0]?.full_name || value[0]?.name) : (value?.full_name || value?.name)
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}`}>← Escola</Link><span className="eyebrow">Financeiro</span><h1>Planos e alunos</h1><p>Configure mensalidades e vincule cada aluno ao plano vigente.</p></div><Link className="nav-button" href={`/dashboard/${org}/financeiro/faturas`}>Mensalidades e relatório →</Link></header>
    {(erro || plansError || studentsError || billingError) && <p role="alert" className="error">Não foi possível carregar ou salvar. Confira os valores, o vencimento e os nomes dos planos.</p>}
    {sucesso && <p className="success">Alteração salva.</p>}
    {membership.role === 'admin' && <section className="card"><h2>Novo plano mensal</h2><form className="form-row" action={createPlan.bind(null, org)}><label>Nome<input name="name" minLength={2} maxLength={100} required placeholder="Natação 2x por semana" /></label><label>Valor mensal (R$)<input name="amount" inputMode="decimal" required placeholder="189,90" /></label><label>Dia do vencimento<input name="due_day" type="number" min={1} max={28} defaultValue={10} required /></label><label>Descrição<input name="description" maxLength={500} /></label><button>Criar plano</button></form></section>}
    <section className="card spacing"><h2>Planos</h2>{!plans?.length && <p>Nenhum plano cadastrado.</p>}
      {plans?.map(plan => <details className="assessment" key={plan.id}><summary><strong>{plan.name}</strong> · {brl(Number(plan.amount_cents))}/mês · vence dia {plan.due_day}{plan.active ? '' : ' · inativo'}</summary>{plan.description && <p>{plan.description}</p>}{membership.role === 'admin' && <form className="form-row edit-form" action={updatePlan.bind(null, org, plan.id)}><label>Nome<input name="name" defaultValue={plan.name} minLength={2} maxLength={100} required /></label><label>Valor (R$)<input name="amount" inputMode="decimal" defaultValue={brlInput(Number(plan.amount_cents))} required /></label><label>Vencimento<input name="due_day" type="number" defaultValue={plan.due_day} min={1} max={28} required /></label><label>Descrição<input name="description" defaultValue={plan.description || ''} maxLength={500} /></label><label>Situação<select name="active" defaultValue={String(plan.active)}><option value="true">Ativo</option><option value="false">Inativo</option></select></label><button>Salvar plano</button></form>}</details>)}
      <p>Alterações de preço ou vencimento afetam apenas mensalidades geradas depois da mudança. Um plano inativo continua válido para alunos já vinculados.</p>
    </section>
    <section className="card spacing"><h2>Vincular aluno a um plano</h2><form className="form-row" action={assignPlan.bind(null, org)}><label>Aluno<select name="student_id" required defaultValue=""><option value="" disabled>Selecione</option>{students?.map(student => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></label><label>Plano<select name="plan_id" required defaultValue=""><option value="" disabled>Selecione</option>{plans?.filter(p => p.active).map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {brl(Number(plan.amount_cents))}</option>)}</select></label><label>Início<input name="started_on" type="date" defaultValue={todayInSaoPaulo()} required /></label><button disabled={!students?.length || !plans?.some(p => p.active)}>Vincular plano</button></form><p>Trocar o plano não altera mensalidades já geradas. A cobrança do mês não é proporcional aos dias.</p></section>
    <section className="card spacing"><h2>Vínculos atuais</h2>{!billing?.length && <p>Nenhum aluno vinculado.</p>}<ul className="list">{billing?.map(item => <li className="inline-row" key={item.id}><span><strong>{relatedName(item.students)}</strong> · {relatedName(item.billing_plans)} · {item.active ? 'ativo' : 'pausado'}<br /><small>Início: {item.started_on.split('-').reverse().join('/')}</small></span><form action={setBillingActive.bind(null, org, item.student_id, !item.active)}><button className="secondary">{item.active ? 'Pausar' : 'Retomar'}</button></form></li>)}</ul></section>
  </main>
}
