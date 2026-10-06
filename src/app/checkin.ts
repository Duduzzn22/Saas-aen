'use server'

import { createHash, randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireGuardianOrganization, requireOrganization } from '@/lib/auth'
import { todayInSaoPaulo } from '@/lib/operations'

const uuid = z.uuid()

export async function createCheckinCode(org: string, sessionId: string) {
  if (!uuid.safeParse(org).success || !uuid.safeParse(sessionId).success) redirect('/dashboard')
  const url = `/dashboard/${org}/aulas/${sessionId}`
  const { supabase, userId } = await requireOrganization(org)
  const { data: session } = await supabase.from('class_sessions').select('id,lesson_date,status')
    .eq('organization_id',org).eq('id',sessionId).maybeSingle()
  if (!session || session.status !== 'scheduled' || session.lesson_date !== todayInSaoPaulo()) redirect(`${url}?erro=checkin`)
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { error } = await supabase.from('session_checkin_codes').upsert({
    organization_id: org, session_id: sessionId, token_hash: tokenHash,
    created_by: userId, updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  }, {onConflict:'organization_id,session_id'})
  if (error) redirect(`${url}?erro=checkin`)
  redirect(`${url}?codigo=${encodeURIComponent(token)}`)
}

export async function guardianCheckin(org: string, sessionId: string, token: string, form: FormData) {
  if (!uuid.safeParse(org).success || !uuid.safeParse(sessionId).success) redirect('/portal')
  const url = `/portal/${org}/checkin?session=${sessionId}`
  const student = uuid.safeParse(form.get('student_id'))
  if (!student.success || !/^[A-Za-z0-9_-]{43}$/.test(token)) redirect(`${url}&erro=dados`)
  const { supabase } = await requireGuardianOrganization(org)
  const { error } = await supabase.rpc('guardian_checkin', {
    p_org:org,p_session:sessionId,p_student:student.data,p_token:token,
  })
  if (error) redirect(`${url}&erro=checkin`)
  redirect(`${url}&sucesso=1`)
}
