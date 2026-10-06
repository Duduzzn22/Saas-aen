'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization } from '@/lib/auth'

const uuid = z.uuid()
const entitySchema = z.enum(['alunos', 'responsaveis', 'professores'])
const name = z.string().trim().min(2).max(120)
const optionalText = z.string().trim().max(200).optional()

export async function signIn(form: FormData) {
  const email = z.email().safeParse(form.get('email'))
  const password = z.string().min(1).safeParse(form.get('password'))
  if (!email.success || !password.success) redirect('/login?erro=credenciais')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: password.data })
  if (error) redirect('/login?erro=credenciais')
  redirect('/dashboard')
}

export async function signUp(form: FormData) {
  const parsed = z.object({ email: z.email(), password: z.string().min(8).max(72) })
    .safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect('/cadastro?erro=dados')
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp(parsed.data)
  if (error) redirect('/cadastro?erro=salvar')
  redirect(data.session ? '/dashboard' : '/login?cadastro=1')
}

export async function signOut() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function createRecord(orgId: string, entity: string, form: FormData) {
  if (!uuid.safeParse(orgId).success || !entitySchema.safeParse(entity).success) redirect('/dashboard')
  const { supabase, membership } = await requireOrganization(orgId)
  const url = `/dashboard/${orgId}/${entity}`
  if (membership.role === 'teacher' || (entity === 'professores' && membership.role !== 'admin')) redirect(url)

  const common = z.object({ full_name: name }).safeParse({ full_name: form.get('full_name') })
  if (!common.success) redirect(`${url}?erro=dados`)
  let table: 'students' | 'guardians' | 'teachers'
  let payload: Record<string, string | null> = { organization_id: orgId, full_name: common.data.full_name }

  if (entity === 'alunos') {
    const birth = z.union([z.iso.date(), z.literal('')]).safeParse(form.get('birth_date'))
    if (!birth.success) redirect(`${url}?erro=dados`)
    table = 'students'
    payload = { ...payload, birth_date: birth.data || null }
  } else {
    const extra = z.object({
      email: z.union([z.email(), z.literal('')]),
      phone: optionalText,
    }).safeParse({ email: form.get('email'), phone: form.get('phone') })
    if (!extra.success) redirect(`${url}?erro=dados`)
    table = entity === 'professores' ? 'teachers' : 'guardians'
    payload = { ...payload, email: extra.data.email || null, phone: extra.data.phone || null }
  }
  const { error } = await supabase.from(table).insert(payload)
  if (error) redirect(`${url}?erro=salvar`)
  redirect(`${url}?sucesso=1`)
}

export async function updateRecord(orgId: string, entity: string, rowId: string, form: FormData) {
  if (![orgId, rowId].every(id => uuid.safeParse(id).success) || !entitySchema.safeParse(entity).success) redirect('/dashboard')
  const { supabase, membership } = await requireOrganization(orgId)
  const url = `/dashboard/${orgId}/${entity}`
  if (membership.role === 'teacher' || (entity === 'professores' && membership.role !== 'admin')) redirect(url)

  const parsedName = name.safeParse(form.get('full_name'))
  if (!parsedName.success) redirect(`${url}?erro=dados`)
  let table: 'students' | 'guardians' | 'teachers'
  let payload: Record<string, string | boolean | null> = { full_name: parsedName.data }

  if (entity === 'alunos') {
    const birth = z.union([z.iso.date(), z.literal('')]).safeParse(form.get('birth_date'))
    const status = z.enum(['active','inactive']).safeParse(form.get('status'))
    if (!birth.success || !status.success) redirect(`${url}?erro=dados`)
    table = 'students'
    payload = { ...payload, birth_date: birth.data || null, status: status.data }
  } else {
    const extra = z.object({
      email: z.union([z.email(), z.literal('')]),
      phone: optionalText,
    }).safeParse({ email: form.get('email'), phone: form.get('phone') })
    if (!extra.success) redirect(`${url}?erro=dados`)
    table = entity === 'professores' ? 'teachers' : 'guardians'
    payload = { ...payload, email: extra.data.email || null, phone: extra.data.phone || null }
    if (entity === 'professores') {
      const active = z.enum(['true','false']).safeParse(form.get('active'))
      if (!active.success) redirect(`${url}?erro=dados`)
      payload.active = active.data === 'true'
    }
  }
  const { data, error } = await supabase.from(table).update(payload)
    .eq('organization_id', orgId).eq('id', rowId).select('id').maybeSingle()
  if (error || !data) redirect(`${url}?erro=salvar`)
  redirect(`${url}?sucesso=1`)
}

export async function linkGuardian(orgId: string, form: FormData) {
  if (!uuid.safeParse(orgId).success) redirect('/dashboard')
  const url = `/dashboard/${orgId}/alunos`
  const { supabase, membership } = await requireOrganization(orgId)
  if (membership.role === 'teacher') redirect(url)
  const data = z.object({ student_id: uuid, guardian_id: uuid, relationship: name })
    .safeParse(Object.fromEntries(form))
  if (!data.success) redirect(`${url}?erro=vinculo`)
  const { error } = await supabase.from('student_guardians').insert({
    organization_id: orgId,
    ...data.data,
    is_financial: form.get('is_financial') === 'on',
    is_emergency: form.get('is_emergency') === 'on',
  })
  if (error) redirect(`${url}?erro=vinculo`)
  redirect(`${url}?sucesso=1`)
}
