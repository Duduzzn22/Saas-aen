'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'

export async function createSchool(form: FormData) {
  const { supabase } = await requireUser()
  const parsed = z.object({
    school_name: z.string().trim().min(2).max(120),
    admin_name: z.string().trim().min(2).max(120),
  }).safeParse(Object.fromEntries(form))
  if (!parsed.success) redirect('/nova-escola?erro=dados')
  const base = parsed.data.school_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40).replace(/-$/,'') || 'escola'
  const slug = `${base}-${randomUUID().replace(/-/g,'').slice(0,12)}`
  const { data: orgId, error } = await supabase.rpc('create_school', {
    p_name: parsed.data.school_name, p_admin_name: parsed.data.admin_name, p_slug: slug,
  })
  if (error || !z.uuid().safeParse(orgId).success) {
    redirect(`/nova-escola?erro=${error?.code === '23505' ? 'limite' : error?.code === '42501' ? 'confirmacao' : 'salvar'}`)
  }
  redirect(`/dashboard/${orgId}`)
}
