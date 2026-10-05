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

export async function updatePool(org: string, poolId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(poolId).success) redirect(base(org, 'instalacoes'))
  const url = base(org, 'instalacoes')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name: label.min(2).max(80), active: z.enum(['true','false']) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  if (parsed.data.active === 'false') {
    const { count } = await supabase.from('class_schedules').select('id', { count: 'exact', head: true })
      .eq('organization_id', org).eq('pool_id', poolId).eq('active', true)
    if (count) fail(url, 'horarios')
  }
  const { data, error } = await supabase.from('pools').update({ name: parsed.data.name, active: parsed.data.active === 'true' })
    .eq('organization_id', org).eq('id', poolId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
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

export async function updateLane(org: string, laneId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(laneId).success) redirect(base(org, 'instalacoes'))
  const url = base(org, 'instalacoes')
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name: label.max(40), active: z.enum(['true','false']) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  if (parsed.data.active === 'false') {
    const { count } = await supabase.from('class_schedules').select('id', { count: 'exact', head: true })
      .eq('organization_id', org).eq('lane_id', laneId).eq('active', true)
    if (count) fail(url, 'horarios')
  }
  const { data, error } = await supabase.from('lanes').update({ name: parsed.data.name, active: parsed.data.active === 'true' })
    .eq('organization_id', org).eq('id', laneId).select('id').maybeSingle()
  if (error || !data) fail(url, 'salvar')
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

export async function updateClass(org: string, classId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(classId).success) redirect(base(org, 'turmas'))
  const url = base(org, `turmas/${classId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const parsed = z.object({ name: label.min(2), teacher_id: uuid,
    capacity: z.coerce.number().int().min(1).max(100), active: z.enum(['true','false']) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) fail(url)
  if (parsed.data.active === 'false') {
    const { count } = await supabase.from('class_schedules').select('id', { count: 'exact', head: true })
      .eq('organization_id', org).eq('class_id', classId).eq('active', true)
    if (count) fail(url, 'horarios')
  }
  const { data, error } = await supabase.from('swim_classes').update({
    name: parsed.data.name, teacher_id: parsed.data.teacher_id,
    capacity: parsed.data.capacity, active: parsed.data.active === 'true',
  }).eq('organization_id', org).eq('id', classId).select('id').maybeSingle()
  if (error || !data) fail(url, 'capacidade')
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

export async function setScheduleActive(org: string, classId: string, scheduleId: string, active: boolean) {
  validOrg(org)
  if (![classId, scheduleId].every(id => uuid.safeParse(id).success)) redirect(base(org, 'turmas'))
  const url = base(org, `turmas/${classId}`)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'teacher') redirect(url)
  const { data, error } = await supabase.from('class_schedules').update({ active })
    .eq('organization_id', org).eq('class_id', classId).eq('id', scheduleId).select('id').maybeSingle()
  if (error || !data) fail(url, 'conflito')
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

export async function openLesson(org: string, scheduleId: string, lessonDate: string) {
  validOrg(org)
  const url = base(org, 'calendario')
  if (!uuid.safeParse(scheduleId).success || !date.safeParse(lessonDate).success ||
    Math.abs(Date.parse(lessonDate) - Date.now()) > 366 * 86400000) fail(url)
  const { supabase } = await requireOrganization(org)
  const { data: schedule } = await supabase.from('class_schedules')
    .select('id,class_id,weekday,starts_at,ends_at,active,swim_classes!inner(active)')
    .eq('organization_id', org).eq('id', scheduleId).eq('active', true).eq('swim_classes.active', true).maybeSingle()
  if (!schedule || new Date(`${lessonDate}T12:00:00Z`).getUTCDay() !== schedule.weekday) fail(url)
  const { data: inserted, error } = await supabase.from('class_sessions').upsert({
    organization_id: org, class_id: schedule.class_id, schedule_id: scheduleId,
    lesson_date: lessonDate, starts_at: schedule.starts_at, ends_at: schedule.ends_at,
  }, { onConflict: 'organization_id,schedule_id,lesson_date', ignoreDuplicates: true }).select('id').maybeSingle()
  if (error) fail(url, 'salvar')
  let id = inserted?.id
  if (!id) {
    const { data: existing } = await supabase.from('class_sessions').select('id')
      .eq('organization_id', org).eq('schedule_id', scheduleId).eq('lesson_date', lessonDate).maybeSingle()
    id = existing?.id
  }
  if (!id) fail(url, 'salvar')
  redirect(base(org, `aulas/${id}`))
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
  if (!enrolled) {
    const { data: makeup } = await supabase.from('makeup_requests').select('id')
      .eq('organization_id', org).eq('target_session_id', sessionId).eq('student_id', studentId)
      .eq('status', 'approved').maybeSingle()
    if (!makeup) fail(url, 'aluno')
  }
  const { error } = await supabase.from('attendance').upsert({
    organization_id: org, class_id: session.class_id, session_id: sessionId,
    student_id: studentId, status: status.data, recorded_by: userId, recorded_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,session_id,student_id' })
  if (error) fail(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}
