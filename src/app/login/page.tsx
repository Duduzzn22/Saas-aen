import { signIn } from '@/app/actions'

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  return <main className="auth"><section className="card narrow">
    <span className="eyebrow">Plataforma de gestão</span>
    <h1>Entre na sua escola</h1>
    <p>Use a conta criada pela administração da plataforma.</p>
    {erro && <p role="alert" className="error">Confira o e-mail e a senha e tente novamente.</p>}
    <form action={signIn} className="stack">
      <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">Entrar</button>
    </form>
  </section></main>
}
