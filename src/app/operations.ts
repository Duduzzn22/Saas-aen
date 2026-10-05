'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization } from '@/lib/auth'

const uuid = z.uuid()
const label = z.string().trim().min(1).max(100)
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const date = z.iso.date()
const base = (org: string, section: string) => `/dashboard/${org}/${section}`
function validOrg(org: string) { if (!uuid.safeParse(org).success) redirect('/dashboard') }
function fail(url: string, reason = 'dados'): never { redirect(`${url}?erro=${reason}`) }

export async function createPool(org: string, form: FormData) {
  validOrg(org)
  const url = base(org, 'instalacoes')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const name = label.min(2).max(80).safeParse(form.get('name'))
  if (!name.success) fail(url)
  const { error } = await supabase.from('pools').insert({ organization_id: org, name: name.data })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function createLane(org: string, form: FormData) {
  validOrg(org)
  const url = base(org, 'instalacoes')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ pool_id: uuid, name: label.max(40) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  const { error } = await supabase.from('lanes').insert({ organization_id: org, ...parsed.data })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function createClass(org: string, form: FormData) {
  validOrg(org)
  const url = base(org, 'turmas')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const parsed = z.object({ name: label.min(2), teacher_id: uuid, capacity: z.coerce.number().int().min(1).max(100) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  const { error } = await supabase.from('swim_classes').insert({ organization_id: org, ...parsed.data })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function addSchedule(org: string, classId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(classId).success) redirect(base(org, 'turmas'))
  const url = base(org, `turmas/${classId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const parsed = z.object({ pool_id: uuid, lane_id: uuid, weekday: z.coerce.number().int().min(0).max(6), starts_at: clock, ends_at: clock })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success || parsed.data.starts_at >= parsed.data.ends_at) fail(url)
  const { error } = await supabase.from('class_schedules').insert({ organization_id: org, class_id: classId, ...parsed.data })
  if (error) fail(url, 'conflito')
  redirect(`${url}?sucesso=1`)
}

export async function enrollStudent(org: string, classId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(classId).success) redirect(base(org, 'turmas'))
  const url = base(org, `turmas/${classId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const student = uuid.safeParse(form.get('student_id'))
  if (!student.success) fail(url)
  const { error } = await supabase.from('class_enrollments').upsert(
    { organization_id: org, class_id: classId, student_id: student.data, active: true },
    { onConflict: 'organization_id,class_id,student_id' },
  )
  if (error) fail(url, 'vagas')
  redirect(`${url}?sucesso=1`)
}

export async function setEnrollment(org: string, classId: string, studentId: string, active: boolean) {
  validOrg(org)
  if (![classId, studentId].every(id => uuid.safeParse(id).success)) redirect(base(org, 'turmas'))
  const url = base(org, `turmas/${classId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const { data, error } = await supabase.from('class_enrollments').update({ active })
    .eq('organization_id', org).eq('class_id', classId).eq('student_id', studentId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function generateLessons(org: string, form: FormData) {
  validOrg(org)
  const url = base(org, 'calendario')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const start = date.safeParse(form.get('start'))
  if (!start.success || Math.abs(Date.parse(start.data) - Date.now()) > 366 * 86400000) fail(url)
  const { data: schedules, error: readError } = await supabase.from('class_schedules')
    .select('id,class_id,weekday,starts_at,ends_at,swim_classes!inner(active)')
    .eq('organization_id', org).eq('active', true).eq('swim_classes.active', true)
  if (readError) fail(url, 'salvar')
  const rows = (schedules ?? []).flatMap(s => Array.from({ length: 28 }, (_, i) => {
    const lesson_date = addDays(start.data, i)
    return new Date(`${lesson_date}T12:00:00Z`).getUTCDay() === s.weekday
      ? { organization_id: org, class_id: s.class_id, schedule_id: s.id, lesson_date, starts_at: s.starts_at, ends_at: s.ends_at }
      : null
  }).filter(row => row !== null))
  if (rows.length) {
    const { error } = await supabase.from('class_sessions').upsert(rows,
      { onConflict: 'organization_id,schedule_id,lesson_date', ignoreDuplicates: true })
    if (error) fail(url, 'salvar')
  }
  redirect(`${url}?semana=${start.data}&sucesso=1`)
}

export async function setSessionStatus(org: string, sessionId: string, status: 'scheduled' | 'cancelled') {
  validOrg(org)
  if (!uuid.safeParse(sessionId).success) redirect(base(org, 'calendario'))
  const url = base(org, `aulas/${sessionId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const { data, error } = await supabase.from('class_sessions').update({ status })
    .eq('organization_id', org).eq('id', sessionId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function markAttendance(org: string, sessionId: string, studentId: string, form: FormData) {
  validOrg(org)
  if (![sessionId, studentId].every(id => uuid.safeParse(id).success)) redirect(base(org, 'calendario'))
  const url = base(org, `aulas/${sessionId}`)
  const { supabase, userId } = await requireOrganization(org)
  const status = z.enum(['present','absent','justified']).safeParse(form.get('status'))
  if (!status.success) fail(url)
  const { data: session } = await supabase.from('class_sessions').select('class_id,status')
    .eq('organization_id', org).eq('id', sessionId).maybeSingle()
  if (!session || session.status !== 'scheduled') fail(url, 'aula')
  const { data: enrolled } = await supabase.from('class_enrollments').select('id')
    .eq('organization_id', org).eq('class_id', session.class_id).eq('student_id', studentId).eq('active', true).maybeSingle()
  if (!enrolled) fail(url, 'aluno')
  const { error } = await supabase.from('attendance').upsert({
    organization_id: org, class_id: session.class_id, session_id: sessionId,
    student_id: studentId, status: status.data, recorded_by: userId, recorded_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,session_id,student_id' })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}
