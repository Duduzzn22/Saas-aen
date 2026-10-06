import 'server-only'
import { adminClient,getPayment } from '@/lib/mercado-pago'

export async function reconcilePixCharge(chargeId:string) {
  const client=adminClient()
  const {data:charge,error}=await client.from('pix_charges').select('*').eq('id',chargeId).maybeSingle()
  if (error || !charge?.mp_payment_id) throw new Error('PIX charge unavailable')
  const payment=await getPayment(charge.organization_id,charge.mp_payment_id)
  if (payment.external_reference!==charge.id || payment.payment_method_id!=='pix'
    || payment.currency_id!=='BRL' || Math.round(payment.transaction_amount*100)!==Number(charge.amount_cents))
    throw new Error('PIX payment does not match invoice')
  if (payment.status==='approved') {
    const reference=`MP:${payment.id}`
    const {data:existing}=await client.from('invoice_payments').select('id')
      .eq('reference',reference).eq('source','mercado_pago').maybeSingle()
    if (!existing) {
      const date=payment.date_approved ? new Date(payment.date_approved) : new Date()
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
      const part=(name:string)=>parts.find(p=>p.type===name)?.value
      const paidOn=`${part('year')}-${part('month')}-${part('day')}`
      const {error:insertError}=await client.from('invoice_payments').insert({
        organization_id:charge.organization_id,invoice_id:charge.invoice_id,
        amount_cents:charge.amount_cents,paid_on:paidOn,method:'pix',reference,
        source:'mercado_pago',received_by:null,
      })
      if (insertError) {
        await client.from('pix_charges').update({status:'needs_review',paid_at:date.toISOString()}).eq('id',charge.id)
        return 'needs_review'
      }
    }
    await client.from('pix_charges').update({status:'approved',paid_at:payment.date_approved || new Date().toISOString()}).eq('id',charge.id)
    return 'approved'
  }
  if (['rejected','cancelled','refunded','charged_back'].includes(payment.status)) {
    const status=charge.status==='approved' ? 'needs_review':'failed'
    await client.from('pix_charges').update({status}).eq('id',charge.id)
    return status
  }
  return charge.status
}
