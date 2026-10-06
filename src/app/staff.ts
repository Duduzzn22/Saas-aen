'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization, requireUser } from '@/lib/auth'

const uuid = z.uuid()

export async function inviteStaff(orgId: string, form: FormData) {
  if (!uuid.safeParse(orgId).success) redirect('/dashboard')
  const url = `/dashboard/${orgId}/equipe`
  const { supabase, membership } = await requireOrganization(orgId)
  if (membership.role !== 'admin') redirect(`/dashboard/${orgId}`)
  const parsed = z.object({
    email: z.email().max(254),
    full_name: z.string().trim().min(2).max(120),
    role: z.enum(['reception','teacher']),
  }).safeParse(Object.fromEntries(form))
  const teacher = form.get('teacher_id')
  if (!parsed.success || (parsed.data.role === 'teacher' && !uuid.safeParse(teacher).success)) redirect(`${url}?erro=dados`)
  const { error } = await supabase.rpc('create_staff_invitation', {
    p_org: orgId, p_email: parsed.data.email.toLowerCase().trim(), p_name: parsed.data.full_name,
    p_role: parsed.data.role, p_teacher: parsed.data.role === 'teacher' ? teacher : null,
  })
  if (error) redirect(`${url}?erro=convite`)
  redirect(`${url}?sucesso=1`)
}

export async function revokeStaffInvite(orgId: string, id: string) {
  if (![orgId,id].every(v => uuid.safeParse(v).success)) redirect('/dashboard')
  const url = `/dashboard/${orgId}/equipe`
  const { supabase, membership } = await requireOrganization(orgId)
  if (membership.role !== 'admin') redirect(`/dashboard/${orgId}`)
  const { data } = await supabase.from('staff_invitations').select('id').eq('id',id).eq('organization_id',orgId).eq('status','pending').maybeSingle()
  if (!data) redirect(`${url}?erro=convite`)
  const { error } = await supabase.rpc('revoke_staff_invitation', { p_id: id })
  if (error) redirect(`${url}?erro=convite`)
  redirect(`${url}?sucesso=1`)
}

export async function claimStaffInvite(id: string) {
  if (!uuid.safeParse(id).success) redirect('/convites?erro=1')
  const { supabase } = await requireUser()
  const { data: orgId, error } = await supabase.rpc('claim_staff_invitation', { p_id: id })
  if (error || !uuid.safeParse(orgId).success) redirect('/convites?erro=1')
  redirect(`/dashboard/${orgId}`)
}
