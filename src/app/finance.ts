'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization } from '@/lib/auth'
import { parseBRL, monthStart } from '@/lib/finance'
import { todayInSaoPaulo } from '@/lib/operations'

const uuid = z.uuid()
const name = z.string().trim().min(2).max(100)
const note = z.string().trim().max(500)
const finances = (org: string) => `/dashboard/${org}/financeiro`
const invoices = (org: string, month?: string) => `${finances(org)}/faturas${month ? `?mes=${month.slice(0, 7)}` : ''}`
function validOrg(org: string) { if (!uuid.safeParse(org).success) redirect('/dashboard') }
function fail(url: string, error = 'dados'): never { redirect(`${url}${url.includes('?') ? '&' : '?'}erro=${error}`) }

export async function createPlan(org: string, form: FormData) {
  validOrg(org)
  const url = finances(org)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name, description: note, due_day: z.coerce.number().int().min(1).max(28) })
    .safeParse(Object.fromEntries(form))
  const amount = parseBRL(form.get('amount'))
  if (!parsed.success || amount === null) fail(url)
  const { error } = await supabase.from('billing_plans').insert({
    organization_id: org, name: parsed.data.name, description: parsed.data.description || null,
    due_day: parsed.data.due_day, amount_cents: amount,
  })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function updatePlan(org: string, planId: string, form: FormData) {
  validOrg(org)
  const url = finances(org)
  if (!uuid.safeParse(planId).success) redirect(url)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name, description: note, due_day: z.coerce.number().int().min(1).max(28),
    active: z.enum(['true','false']) }).safeParse(Object.fromEntries(form))
  const amount = parseBRL(form.get('amount'))
  if (!parsed.success || amount === null) fail(url)
  const { data, error } = await supabase.from('billing_plans').update({
    name: parsed.data.name, description: parsed.data.description || null,
    due_day: parsed.data.due_day, amount_cents: amount, active: parsed.data.active === 'true',
  }).eq('organization_id', org).eq('id', planId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function assignPlan(org: string, form: FormData) {
  validOrg(org)
  const url = finances(org)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const parsed = z.object({ student_id: uuid, plan_id: uuid, started_on: z.iso.date() })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  const [{ data: student }, { data: plan }] = await Promise.all([
    supabase.from('students').select('id').eq('organization_id', org).eq('id', parsed.data.student_id).eq('status', 'active').maybeSingle(),
    supabase.from('billing_plans').select('id').eq('organization_id', org).eq('id', parsed.data.plan_id).eq('active', true).maybeSingle(),
  ])
  if (!student || !plan) fail(url)
  const { error } = await supabase.from('student_billing').upsert({
    organization_id: org, ...parsed.data, active: true, updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,student_id' })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function setBillingActive(org: string, studentId: string, active: boolean) {
  validOrg(org)
  const url = finances(org)
  if (!uuid.safeParse(studentId).success) redirect(url)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const payload = active ? { active, started_on: todayInSaoPaulo(), updated_at: new Date().toISOString() }
    : { active, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('student_billing').update(payload)
    .eq('organization_id', org).eq('student_id', studentId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function generateInvoices(org: string, form: FormData) {
  validOrg(org)
  const url = invoices(org)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(finances(org))
  const month = monthStart(String(form.get('month') || ''))
  if (!month) fail(url)
  const { data, error } = await supabase.rpc('generate_monthly_invoices', { p_org: org, p_month: month })
  if (error) fail(invoices(org, month), 'gerar')
  redirect(`${invoices(org, month)}&criadas=${Number(data) || 0}`)
}

export async function recordPayment(org: string, invoiceId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(invoiceId).success) redirect(invoices(org))
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(finances(org))
  const { data: invoice } = await supabase.from('monthly_invoices').select('billing_month,status')
    .eq('organization_id', org).eq('id', invoiceId).maybeSingle()
  const url = invoices(org, invoice?.billing_month)
  const parsed = z.object({ paid_on: z.iso.date(), method: z.enum(['cash','bank_transfer','pix','card','other']),
    reference: z.string().trim().max(120) }).safeParse(Object.fromEntries(form))
  const amount = parseBRL(form.get('amount'))
  if (!invoice || invoice.status !== 'open' || !parsed.success || amount === null || parsed.data.paid_on > todayInSaoPaulo()) fail(url)
  const { error } = await supabase.from('invoice_payments').insert({
    organization_id: org, invoice_id: invoiceId, amount_cents: amount,
    paid_on: parsed.data.paid_on, method: parsed.data.method,
    reference: parsed.data.reference || null, received_by: userId,
  })
  if (error) fail(url, 'saldo')
  redirect(`${url}&sucesso=1`)
}

export async function voidPayment(org: string, paymentId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(paymentId).success) redirect(invoices(org))
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(finances(org))
  const { data: payment } = await supabase.from('invoice_payments').select('invoice_id')
    .eq('organization_id', org).eq('id', paymentId).maybeSingle()
  const { data: invoice } = payment ? await supabase.from('monthly_invoices').select('billing_month')
    .eq('organization_id', org).eq('id', payment.invoice_id).maybeSingle() : { data: null }
  const url = invoices(org, invoice?.billing_month)
  const reason = z.string().trim().min(3).max(500).safeParse(form.get('reason'))
  if (!payment || !invoice || !reason.success) fail(url)
  const { data, error } = await supabase.from('invoice_payments').update({
    voided_by: userId, voided_at: new Date().toISOString(), void_reason: reason.data,
  }).eq('organization_id', org).eq('id', paymentId).is('voided_at', null).select('id').maybeSingle()
  if (error || !data) fail(url, 'estorno')
  redirect(`${url}&sucesso=1`)
}

export async function voidInvoice(org: string, invoiceId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(invoiceId).success) redirect(invoices(org))
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(finances(org))
  const { data: invoice } = await supabase.from('monthly_invoices').select('billing_month')
    .eq('organization_id', org).eq('id', invoiceId).maybeSingle()
  const url = invoices(org, invoice?.billing_month)
  const reason = z.string().trim().min(3).max(500).safeParse(form.get('reason'))
  if (!invoice || !reason.success) fail(url)
  const { data, error } = await supabase.from('monthly_invoices').update({
    status: 'void', voided_by: userId, voided_at: new Date().toISOString(), void_reason: reason.data,
  }).eq('organization_id', org).eq('id', invoiceId).eq('status', 'open').select('id').maybeSingle()
  if (error || !data) fail(url, 'cancelar')
  redirect(`${url}&sucesso=1`)
}
