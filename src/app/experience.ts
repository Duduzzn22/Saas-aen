'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireGuardianOrganization, requireOrganization, requireUser } from '@/lib/auth'

const id = z.uuid()
const day = z.iso.date()
const school = (org: string, section: string) => `/dashboard/${org}/${section}`

export async function requestAccess(org: string, guardianId: string) {
  if (!id.safeParse(org).success || !id.safeParse(guardianId).success) redirect('/portal/acesso')
  const { supabase, userId } = await requireUser()
  const { data: guardian } = await supabase.from('guardians').select('id')
    .eq('organization_id', org).eq('id', guardianId).maybeSingle()
  if (!guardian) redirect('/portal/acesso?erro=vinculo')
  const { error } = await supabase.from('guardian_access_requests').insert({
    organization_id: org, guardian_id: guardianId, user_id: userId,
  })
  if (error) redirect('/portal/acesso?erro=salvar')
  redirect('/portal/acesso?sucesso=1')
}

export async function reviewAccess(org: string, requestId: string, approve: boolean) {
  if (![org,requestId].every(x => id.safeParse(x).success)) redirect('/dashboard')
  const url = school(org, 'portal')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const { data: request } = await supabase.from('guardian_access_requests').select('id')
    .eq('organization_id', org).eq('id', requestId).eq('status', 'pending').maybeSingle()
  if (!request) redirect(`${url}?erro=pedido`)
  const { error } = await supabase.rpc('review_guardian_access', { p_request: requestId, p_approve: approve })
  if (error) redirect(`${url}?erro=salvar`)
  redirect(`${url}?sucesso=1`)
}

export async function createNotice(org: string, form: FormData) {
  if (!id.safeParse(org).success) redirect('/dashboard')
  const url = school(org, 'portal')
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const parsed = z.object({ title: z.string().trim().min(3).max(120), body: z.string().trim().min(3).max(2000),
    guardian_id: z.union([id,z.literal('')]), expires_on: z.union([day,z.literal('')]) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect(`${url}?erro=dados`)
  const { error } = await supabase.from('portal_notices').insert({ organization_id: org,
    title: parsed.data.title, body: parsed.data.body, guardian_id: parsed.data.guardian_id || null,
    expires_on: parsed.data.expires_on || null, created_by: userId })
  if (error) redirect(`${url}?erro=salvar`)
  redirect(`${url}?sucesso=1`)
}

export async function setNoticeActive(org: string, noticeId: string, active: boolean) {
  if (![org,noticeId].every(x => id.safeParse(x).success)) redirect('/dashboard')
  const url = school(org, 'portal')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const { data, error } = await supabase.from('portal_notices').update({active})
    .eq('organization_id', org).eq('id', noticeId).select('id').maybeSingle()
  if (error || !data) redirect(`${url}?erro=salvar`)
  redirect(`${url}?sucesso=1`)
}

export async function requestMakeup(org: string, studentId: string, sessionId: string, classId: string, form: FormData) {
  if (![org,studentId,sessionId,classId].every(x => id.safeParse(x).success)) redirect('/portal')
  const url = `/portal/${org}`
  const { supabase, userId } = await requireGuardianOrganization(org)
  const { data: child } = await supabase.from('students').select('id')
    .eq('organization_id', org).eq('id', studentId).maybeSingle()
  if (!child) redirect(url)
  const note = z.string().trim().max(500).safeParse(form.get('note') || '')
  if (!note.success) redirect(`${url}?erro=dados`)
  const { error } = await supabase.from('makeup_requests').insert({ organization_id: org,
    student_id: studentId, original_session_id: sessionId, original_class_id: classId,
    requested_by: userId, note: note.data || null })
  if (error) redirect(`${url}?erro=reposicao`)
  redirect(`${url}?sucesso=1`)
}

export async function reviewMakeup(org: string, requestId: string, form: FormData) {
  if (![org,requestId].every(x => id.safeParse(x).success)) redirect('/dashboard')
  const url = school(org, 'reposicoes')
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const decision = z.enum(['approved','rejected']).safeParse(form.get('status'))
  const target = decision.success && decision.data === 'approved' ? id.safeParse(form.get('target_session_id')) : null
  if (!decision.success || (decision.data === 'approved' && !target?.success)) redirect(`${url}?erro=dados`)
  let classId: string | null = null
  if (target?.success) {
    const { data: session } = await supabase.from('class_sessions').select('class_id')
      .eq('organization_id', org).eq('id', target.data).maybeSingle()
    classId = session?.class_id ?? null
    if (!classId) redirect(`${url}?erro=aula`)
  }
  const { data, error } = await supabase.from('makeup_requests').update({ status: decision.data,
    target_session_id: target?.success ? target.data : null, target_class_id: classId,
    reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('organization_id', org).eq('id', requestId).eq('status', 'pending').select('id').maybeSingle()
  if (error || !data) redirect(`${url}?erro=vagas`)
  redirect(`${url}?sucesso=1`)
}

export async function requestTrial(org: string, form: FormData) {
  if (!id.safeParse(org).success) redirect('/portal')
  const url = `/portal/${org}`
  const { supabase, userId } = await requireGuardianOrganization(org)
  const parsed = z.object({ prospect_name: z.string().trim().min(2).max(120), contact_name: z.string().trim().min(2).max(120),
    contact_email: z.email(), contact_phone: z.string().trim().max(40), preferred_date: z.union([day,z.literal('')]),
    note: z.string().trim().max(500) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect(`${url}?erro=dados`)
  const { error } = await supabase.from('trial_requests').insert({ organization_id: org, requested_by: userId,
    ...parsed.data, preferred_date: parsed.data.preferred_date || null })
  if (error) redirect(`${url}?erro=experimental`)
  redirect(`${url}?sucesso=1`)
}

export async function reviewTrial(org: string, requestId: string, form: FormData) {
  if (![org,requestId].every(x => id.safeParse(x).success)) redirect('/dashboard')
  const url = school(org, 'experimentais')
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const status = z.enum(['scheduled','completed','cancelled']).safeParse(form.get('status'))
  const session = status.success && status.data === 'scheduled' ? id.safeParse(form.get('session_id')) : null
  if (!status.success || (status.data === 'scheduled' && !session?.success)) redirect(`${url}?erro=dados`)
  const payload: Record<string, string | null> = { status: status.data, reviewed_by: userId, reviewed_at: new Date().toISOString() }
  if (session?.success) payload.session_id = session.data
  const { data, error } = await supabase.from('trial_requests').update(payload)
    .eq('organization_id', org).eq('id', requestId).select('id').maybeSingle()
  if (error || !data) redirect(`${url}?erro=vagas`)
  redirect(`${url}?sucesso=1`)
}
