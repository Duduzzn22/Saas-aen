import Link from 'next/link'
import { signUp } from '@/app/actions'

export default async function Cadastro({ searchParams }: { searchParams: Promise<{erro?: string}> }) {
  const { erro } = await searchParams
  return <main className="auth"><section className="card narrow">
    <Link className="back" href="/login">← Entrar</Link><span className="eyebrow">Plataforma de gestão</span>
    <h1>Criar conta</h1><p>Confirme seu e-mail e entre. Depois você poderá criar uma escola, aceitar um convite da equipe ou solicitar acesso como responsável. Responsáveis devem usar o mesmo e-mail cadastrado pela escola.</p>
    {erro && <p role="alert" className="error">Não foi possível criar a conta. Confira o e-mail e use uma senha com pelo menos 8 caracteres.</p>}
    <form action={signUp} className="stack">
      <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <button>Criar conta</button>
    </form>
  </section></main>
}
