import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createSchool } from '@/app/schools'

const messages: Record<string,string> = {
  dados: 'Informe o nome da escola e o nome do administrador.',
  limite: 'Esta conta já criou uma escola nesta etapa piloto.',
  confirmacao: 'Confirme seu e-mail antes de criar a escola.',
  salvar: 'Não foi possível criar a escola. Tente novamente.',
}

export default async function NewSchool({searchParams}: {searchParams:Promise<{erro?:string}>}) {
  const {supabase} = await requireUser()
  const {data:{user}} = await supabase.auth.getUser()
  const {erro} = await searchParams
  return <main className="auth"><section className="card narrow">
    <Link href="/dashboard" className="back">← Suas escolas</Link><span className="eyebrow">Nova escola</span>
    <h1>Criar espaço da escola</h1><p>Comece com uma escola e configure a equipe, turmas e alunos no painel. O acesso de cada escola fica separado.</p>
    <p>Conta: {user?.email}</p>
    {erro && <p role="alert" className="error">{messages[erro] || messages.salvar}</p>}
    {user && !user.email_confirmed_at && <p className="error">Confirme seu e-mail para continuar.</p>}
    <form action={createSchool} className="stack">
      <label>Nome da escola<input name="school_name" required minLength={2} maxLength={120} placeholder="Ex.: Escola de Natação Azul" /></label>
      <label>Seu nome completo<input name="admin_name" required minLength={2} maxLength={120} autoComplete="name" /></label>
      <button disabled={!user?.email_confirmed_at}>Criar escola</button>
    </form><p className="spacing">Uma escola por conta nesta etapa piloto.</p>
  </section></main>
}
