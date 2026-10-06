import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'
import { connectMercadoPago } from '@/app/mercado-pago'
import { mpConfigured } from '@/lib/mercado-pago'

export default async function MercadoPagoSettings({params,searchParams}: {
  params:Promise<{organizationId:string}>;searchParams:Promise<{erro?:string;sucesso?:string}>
}) {
  const {organizationId:org}=await params
  const {erro,sucesso}=await searchParams
  const {supabase,membership}=await requireOrganization(org)
  if (membership.role!=='admin') redirect(`/dashboard/${org}`)
  const {data:connection}=await supabase.from('mp_connections')
    .select('seller_id,expires_at,live_mode,connected_at').eq('organization_id',org).maybeSingle()
  return <main className="shell"><header><div><Link className="back" href={`/dashboard/${org}/financeiro`}>← Financeiro</Link><span className="eyebrow">Pagamentos</span><h1>Mercado Pago</h1><p>Conecte a conta da própria escola para receber suas mensalidades via PIX.</p></div></header>
    {erro && <p role="alert" className="error">Não foi possível concluir a conexão. Confira as credenciais e o endereço de retorno da aplicação.</p>}
    {sucesso && <p className="success">Conta Mercado Pago conectada.</p>}
    <section className="card"><h2>{connection ? 'Conta conectada' : 'Conectar conta'}</h2>
      {connection ? <p>Vendedor {connection.seller_id} · {connection.live_mode ? 'Produção' : 'Teste'} · token válido até {new Date(connection.expires_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}. A renovação acontece no servidor quando necessário.</p>
        : <p>Um administrador será direcionado ao Mercado Pago para autorizar esta escola. O dinheiro vai para a conta do vendedor conectado.</p>}
      {!mpConfigured() && <p className="error">A aplicação Mercado Pago ainda não foi configurada no servidor.</p>}
      <form action={connectMercadoPago.bind(null,org)}><button disabled={!mpConfigured()}>{connection ? 'Reconectar conta' : 'Conectar Mercado Pago'}</button></form>
    </section>
  </main>
}
