'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization } from '@/lib/auth'
import { todayInSaoPaulo } from '@/lib/operations'

const uuid = z.uuid()
const name = z.string().trim().min(2).max(120)
const optionalDescription = z.string().trim().max(500)
const page = (org: string) => `/dashboard/${org}/pedagogico`
const studentPage = (org: string, student: string) => `/dashboard/${org}/alunos/${student}`
function validOrg(org: string) { if (!uuid.safeParse(org).success) redirect('/dashboard') }
function failed(url: string, reason = 'dados'): never { redirect(`${url}?erro=${reason}`) }

export async function createLevel(org: string, form: FormData) {
  validOrg(org)
  const url = page(org)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name: name.max(80), description: optionalDescription,
    rank: z.coerce.number().int().min(1).max(1000) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) failed(url)
  const { error } = await supabase.from('swim_levels').insert({
    organization_id: org, name: parsed.data.name, rank: parsed.data.rank,
    description: parsed.data.description || null,
  })
  if (error) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function updateLevel(org: string, levelId: string, form: FormData) {
  validOrg(org)
  const url = page(org)
  if (!uuid.safeParse(levelId).success) redirect(url)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name: name.max(80), description: optionalDescription,
    rank: z.coerce.number().int().min(1).max(1000), active: z.enum(['true','false']) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) failed(url)
  const { data, error } = await supabase.from('swim_levels').update({
    name: parsed.data.name, description: parsed.data.description || null,
    rank: parsed.data.rank, active: parsed.data.active === 'true',
  }).eq('organization_id', org).eq('id', levelId).select('id').maybeSingle()
  if (error || !data) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function createSkill(org: string, form: FormData) {
  validOrg(org)
  const url = page(org)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ level_id: uuid, name, description: optionalDescription,
    position: z.coerce.number().int().min(1).max(1000) }).safeParse(Object.fromEntries(form))
  if (!parsed.success) failed(url)
  const { error } = await supabase.from('swim_skills').insert({
    organization_id: org, ...parsed.data, description: parsed.data.description || null,
  })
  if (error) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function updateSkill(org: string, skillId: string, form: FormData) {
  validOrg(org)
  const url = page(org)
  if (!uuid.safeParse(skillId).success) redirect(url)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role !== 'admin') redirect(url)
  const parsed = z.object({ name, description: optionalDescription,
    position: z.coerce.number().int().min(1).max(1000), active: z.enum(['true','false']) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) failed(url)
  const { data, error } = await supabase.from('swim_skills').update({
    name: parsed.data.name, description: parsed.data.description || null,
    position: parsed.data.position, active: parsed.data.active === 'true',
  }).eq('organization_id', org).eq('id', skillId).select('id').maybeSingle()
  if (error || !data) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function assignStudentLevel(org: string, studentId: string, form: FormData) {
  validOrg(org)
  if (!uuid.safeParse(studentId).success) redirect(`/dashboard/${org}`)
  const url = studentPage(org, studentId)
  const { supabase, membership, userId } = await requireOrganization(org)
  if (membership.role === 'reception') redirect(url)
  const level = uuid.safeParse(form.get('level_id'))
  const reason = z.string().trim().max(500).safeParse(form.get('reason'))
  if (!level.success || !reason.success) failed(url)
  const [{ data: student }, { data: selected }, { data: latest }] = await Promise.all([
    supabase.from('students').select('id,status').eq('organization_id', org).eq('id', studentId).maybeSingle(),
    supabase.from('swim_levels').select('id').eq('organization_id', org).eq('id', level.data).eq('active', true).maybeSingle(),
    supabase.from('student_level_history').select('level_id').eq('organization_id', org).eq('student_id', studentId)
      .order('assigned_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!student || student.status !== 'active' || !selected || latest?.level_id === level.data) failed(url, 'nivel')
  const { error } = await supabase.from('student_level_history').insert({
    organization_id: org, student_id: studentId, level_id: level.data,
    assigned_by: userId, reason: reason.data || null,
  })
  if (error) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}

export async function recordAssessment(org: string, studentId: string, levelId: string, form: FormData) {
  validOrg(org)
  if (![studentId, levelId].every(id => uuid.safeParse(id).success)) redirect(`/dashboard/${org}`)
  const url = studentPage(org, studentId)
  const { supabase, membership } = await requireOrganization(org)
  if (membership.role === 'reception') redirect(url)
  const assessed = z.iso.date().safeParse(form.get('assessed_on'))
  const summary = z.string().trim().max(1000).safeParse(form.get('summary'))
  if (!assessed.success || !summary.success || assessed.data > todayInSaoPaulo()) failed(url)
  const [{ data: student }, { data: level }, { data: skills, error: skillError }] = await Promise.all([
    supabase.from('students').select('id,status').eq('organization_id', org).eq('id', studentId).maybeSingle(),
    supabase.from('swim_levels').select('id').eq('organization_id', org).eq('id', levelId).eq('active', true).maybeSingle(),
    supabase.from('swim_skills').select('id').eq('organization_id', org).eq('level_id', levelId).eq('active', true),
  ])
  if (!student || student.status !== 'active' || !level || skillError || !skills?.length) failed(url, 'habilidades')
  const resultSchema = z.enum(['not_started','developing','achieved'])
  const results = skills.map(skill => ({ skill_id: skill.id, result: resultSchema.safeParse(form.get(`skill_${skill.id}`)) }))
  if (results.some(row => !row.result.success)) failed(url)
  const { error } = await supabase.rpc('record_swim_assessment', {
    p_org: org, p_student: studentId, p_level: levelId,
    p_date: assessed.data, p_summary: summary.data,
    p_results: results.map(row => ({ skill_id: row.skill_id, result: row.result.data })),
  })
  if (error) failed(url, 'salvar')
  redirect(`${url}?sucesso=1`)
}
