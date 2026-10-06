'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireGuardianOrganization, requireOrganization } from '@/lib/auth'
import { todayInSaoPaulo } from '@/lib/operations'

const uuid = z.uuid()

export async function setWhatsAppConsent(org:string, guardianId:string, active:boolean) {
  if (!uuid.safeParse(org).success || !uuid.safeParse(guardianId).success) redirect('/portal')
  const url = `/portal/${org}`
  const {supabase,userId,guardians} = await requireGuardianOrganization(org)
  if (!guardians.some(g=>g.id===guardianId)) redirect(url)
  const {data:guardian} = await supabase.from('guardians').select('phone')
    .eq('organization_id',org).eq('id',guardianId).maybeSingle()
  const digits=guardian?.phone?.replace(/\D/g,'') ?? ''
  const phone=digits.startsWith('55') ? digits : `55${digits}`
  if (active && !/^55\d{10,11}$/.test(phone)) redirect(`${url}?erro=telefone`)
  const {error}=active ? await supabase.from('whatsapp_consents').upsert({
    organization_id:org,guardian_id:guardianId,user_id:userId,active,phone_e164:phone,
  },{onConflict:'organization_id,guardian_id,user_id'}) : await supabase.from('whatsapp_consents')
    .update({active:false}).eq('organization_id',org).eq('guardian_id',guardianId).eq('user_id',userId)
  if (error) redirect(`${url}?erro=whatsapp`)
  redirect(`${url}?sucesso=1`)
}

export async function sendWhatsAppReminder(org:string,invoiceId:string,guardianId:string) {
  if (![org,invoiceId,guardianId].every(x=>uuid.safeParse(x).success)) redirect('/dashboard')
  const url = `/dashboard/${org}/financeiro/faturas`
  const {supabase,membership,userId} = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const version = process.env.WHATSAPP_GRAPH_VERSION
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const template = process.env.WHATSAPP_REMINDER_TEMPLATE
  if (!version || !/^v\d+\.\d+$/.test(version) || !phoneId || !token || !template) redirect(`${url}?erro=config`)
  const {data:invoice} = await supabase.from('monthly_invoices').select('id,student_id,amount_cents,due_on,status')
    .eq('organization_id',org).eq('id',invoiceId).maybeSingle()
  if (!invoice || invoice.status !== 'open' || invoice.due_on >= todayInSaoPaulo()) redirect(`${url}?erro=elegibilidade`)
  const [{data:relation},{data:consent},{data:guardian},{data:payments}] = await Promise.all([
    supabase.from('student_guardians').select('is_financial').eq('organization_id',org)
      .eq('guardian_id',guardianId).eq('student_id',invoice.student_id).maybeSingle(),
    supabase.from('whatsapp_consents').select('user_id,active,phone_e164').eq('organization_id',org)
      .eq('guardian_id',guardianId).eq('active',true).limit(1).maybeSingle(),
    supabase.from('guardians').select('phone').eq('organization_id',org).eq('id',guardianId).maybeSingle(),
    supabase.from('invoice_payments').select('amount_cents,voided_at')
      .eq('organization_id',org).eq('invoice_id',invoiceId).is('voided_at',null),
  ])
  const paid = payments?.reduce((sum,p)=>sum+Number(p.amount_cents),0) ?? 0
  if (paid >= Number(invoice.amount_cents) || !relation?.is_financial || !consent?.active) redirect(`${url}?erro=elegibilidade`)
  const digits = guardian?.phone?.replace(/\D/g,'') ?? ''
  const phone = digits.startsWith('55') ? digits : `55${digits}`
  if (!/^55\d{10,11}$/.test(phone) || consent.phone_e164!==phone) redirect(`${url}?erro=telefone`)
  const {data:log,error:logError} = await supabase.from('whatsapp_delivery_log').insert({
    organization_id:org,invoice_id:invoiceId,guardian_id:guardianId,
    consent_user_id:consent.user_id,requested_by:userId,
  }).select('id').single()
  if (logError || !log) redirect(`${url}?erro=duplicado`)
  let sent = false
  let messageId: string | null = null
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'template',
        template:{name:template,language:{code:'pt_BR'}}}),
      cache:'no-store',signal:AbortSignal.timeout(15000),
    })
    if (response.ok) {
      const body: {messages?:{id?:string}[]} = await response.json()
      messageId = body.messages?.[0]?.id ?? null
      sent = !!messageId
    }
  } catch { /* The delivery log records the failure without exposing credentials. */ }
  await supabase.from('whatsapp_delivery_log').update({status:sent ? 'sent':'failed',
    provider_message_id:messageId,sent_at:sent ? new Date().toISOString():null})
    .eq('organization_id',org).eq('id',log.id)
  redirect(`${url}?${sent ? 'sucesso=lembrete':'erro=envio'}`)
}
