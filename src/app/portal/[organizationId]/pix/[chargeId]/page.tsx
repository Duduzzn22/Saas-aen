import Link from 'next/link'
import Image from 'next/image'
import QRCode from 'qrcode'
import { requireGuardianOrganization } from '@/lib/auth'
import { brl } from '@/lib/finance'
import { refreshPixCharge } from '@/app/pix'

const statusLabels:Record<string,string>={creating:'Gerando código',pending:'Aguardando pagamento',
  approved:'Pagamento confirmado',failed:'Não concluído',expired:'Expirado',needs_review:'Em análise pela escola'}

export default async function PixDetails({params,searchParams}: {
  params:Promise<{organizationId:string;chargeId:string}>;searchParams:Promise<{erro?:string}>
}) {
  const {organizationId:org,chargeId}=await params
  const {erro}=await searchParams
  const {supabase}=await requireGuardianOrganization(org)
  const {data:charge}=await supabase.from('pix_charges')
    .select('id,invoice_id,amount_cents,status,qr_code,ticket_url,expires_at')
    .eq('organization_id',org).eq('id',chargeId).maybeSingle()
  if (!charge) return <main className="shell"><Link className="back" href={`/portal/${org}`}>← Portal</Link><p>Pagamento indisponível.</p></main>
  const qr=charge.status==='pending' && charge.qr_code
    ? await QRCode.toDataURL(charge.qr_code,{width:260,margin:2}) : null
  return <main className="shell"><header><div><Link className="back" href={`/portal/${org}`}>← Portal</Link><span className="eyebrow">Mensalidade</span><h1>Pagamento PIX</h1></div></header>
    {erro && <p className="error">Não foi possível consultar o pagamento agora. Tente novamente.</p>}
    <section className="card narrow"><h2>{statusLabels[charge.status]}</h2><p>Valor: {brl(Number(charge.amount_cents))}</p>
      {qr && <Image unoptimized src={qr} width={260} height={260} alt="QR Code PIX para pagamento" />}
      {charge.status==='pending' && charge.qr_code && <label>PIX Copia e Cola<textarea readOnly defaultValue={charge.qr_code} rows={4} /></label>}
      {charge.status==='pending' && charge.ticket_url?.startsWith('https://www.mercadopago.com.br/') && <p><a className="back" href={charge.ticket_url} target="_blank" rel="noopener noreferrer">Abrir instruções do Mercado Pago →</a></p>}
      {charge.expires_at && charge.status==='pending' && <p>Válido até {new Date(charge.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.</p>}
      {charge.status==='pending' && <form action={refreshPixCharge.bind(null,org,charge.id)}><button>Atualizar situação</button></form>}
    </section>
  </main>
}
