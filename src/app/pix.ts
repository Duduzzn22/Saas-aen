'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireGuardianOrganization } from '@/lib/auth'
import { accessToken,adminClient,mpConfigured } from '@/lib/mercado-pago'
import { reconcilePixCharge } from '@/lib/pix'

const uuid=z.uuid()
function validCPF(value:string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false
  for (let digit=9;digit<11;digit++) {
    const sum=value.slice(0,digit).split('').reduce((acc,character,index)=>acc+Number(character)*(digit+1-index),0)
    if (Number(value[digit])!==(sum*10)%11%10) return false
  }
  return true
}

export async function createPixCharge(org:string,invoiceId:string,form:FormData) {
  if (![org,invoiceId].every(x=>uuid.safeParse(x).success)) redirect('/portal')
  const url=`/portal/${org}`
  const {supabase,userId}=await requireGuardianOrganization(org)
  if (!mpConfigured()) redirect(`${url}?erro=pix_config`)
  const cpf=String(form.get('cpf') || '').replace(/\D/g,'')
  if (!validCPF(cpf)) redirect(`${url}?erro=cpf`)
  const {data:user}=await supabase.auth.getUser()
  if (!user.user?.email) redirect(`${url}?erro=pix`)
  const {data:invoice}=await supabase.from('monthly_invoices').select('id,status,amount_cents,plan_name')
    .eq('organization_id',org).eq('id',invoiceId).maybeSingle()
  if (!invoice || invoice.status!=='open') redirect(`${url}?erro=pix`)
  const {data:payments}=await supabase.from('invoice_payments').select('amount_cents,voided_at')
    .eq('organization_id',org).eq('invoice_id',invoiceId).is('voided_at',null)
  const balance=Number(invoice.amount_cents)-(payments?.reduce((sum,p)=>sum+Number(p.amount_cents),0) ?? 0)
  if (balance<=0) redirect(`${url}?erro=pix`)
  let token:string
  try { token=(await accessToken(org)).token }
  catch { redirect(`${url}?erro=pix_config`) }
  const client=adminClient()
  let {data:charge}=await client.from('pix_charges').select('*').eq('organization_id',org)
    .eq('invoice_id',invoiceId).in('status',['creating','pending']).maybeSingle()
  if (charge?.status==='pending') redirect(`/portal/${org}/pix/${charge.id}`)
  if (!charge) {
    const {data,error}=await client.from('pix_charges').insert({organization_id:org,
      invoice_id:invoiceId,amount_cents:balance,payer_email:user.user.email,created_by:userId,
    }).select('*').single()
    if (error || !data) redirect(`${url}?erro=pix`)
    charge=data
  }
  if (Number(charge.amount_cents)!==balance || charge.payer_email!==user.user.email) redirect(`${url}?erro=pix`)
  try {
    const response=await fetch('https://api.mercadopago.com/v1/payments',{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',
        'X-Idempotency-Key':charge.idempotency_key},
      body:JSON.stringify({transaction_amount:balance/100,description:`Mensalidade ${invoice.plan_name}`,
        payment_method_id:'pix',payer:{email:user.user.email,identification:{type:'CPF',number:cpf}},
        external_reference:charge.id,date_of_expiration:new Date(Date.now()+24*60*60*1000).toISOString(),
        notification_url:`${process.env.NEXT_PUBLIC_SITE_URL || 'https://saas-aen.vercel.app'}/api/mercado-pago/webhook`,
      }),cache:'no-store',signal:AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      if (response.status>=400 && response.status<500)
        await client.from('pix_charges').update({status:'failed'}).eq('id',charge.id)
      redirect(`${url}?erro=pix`)
    }
    const payment:{id:number;status:string;external_reference:string;transaction_amount:number;
      point_of_interaction?:{transaction_data?:{qr_code?:string;ticket_url?:string}};
      date_of_expiration?:string}=await response.json()
    if (!payment.id || payment.external_reference!==charge.id
      || Math.round(payment.transaction_amount*100)!==balance) throw new Error('Payment mismatch')
    const {error}=await client.from('pix_charges').update({
      mp_payment_id:String(payment.id),status:payment.status==='rejected' ? 'failed':'pending',
      qr_code:payment.point_of_interaction?.transaction_data?.qr_code || null,
      ticket_url:payment.point_of_interaction?.transaction_data?.ticket_url || null,
      expires_at:payment.date_of_expiration || new Date(Date.now()+24*60*60*1000).toISOString(),
    }).eq('id',charge.id)
    if (error) throw new Error('Could not persist PIX payment')
    if (payment.status==='approved') await reconcilePixCharge(charge.id)
    redirect(`/portal/${org}/pix/${charge.id}`)
  } catch (error) {
    if (error && typeof error==='object' && 'digest' in error) throw error
    redirect(`${url}?erro=pix`)
  }
}

export async function refreshPixCharge(org:string,chargeId:string) {
  if (![org,chargeId].every(x=>uuid.safeParse(x).success)) redirect('/portal')
  const url=`/portal/${org}/pix/${chargeId}`
  const {supabase}=await requireGuardianOrganization(org)
  const {data:charge}=await supabase.from('pix_charges').select('id,mp_payment_id')
    .eq('organization_id',org).eq('id',chargeId).maybeSingle()
  if (!charge?.mp_payment_id) redirect(`/portal/${org}`)
  try { await reconcilePixCharge(chargeId) }
  catch { redirect(`${url}?erro=consulta`) }
  redirect(url)
}
