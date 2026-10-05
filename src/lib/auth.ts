import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) redirect('/login')
  return { supabase, userId: data.claims.sub }
}

export async function requireOrganization(organizationId: string) {
  const { supabase, userId } = await requireUser()
  const { data: membership } = await supabase.from('memberships')
    .select('role, full_name, organization_id')
    .eq('organization_id', organizationId).eq('user_id', userId).eq('active', true).maybeSingle()
  if (!membership) redirect('/dashboard')
  return { supabase, membership, userId }
}

export async function requireGuardianOrganization(organizationId: string) {
  const { supabase, userId } = await requireUser()
  const { data: links } = await supabase.from('guardian_portal_links')
    .select('guardian_id').eq('organization_id', organizationId).eq('user_id', userId).eq('active', true)
  const guardianIds = links?.map(link => link.guardian_id) ?? []
  if (!guardianIds.length) redirect('/portal/acesso')
  const { data: guardians } = await supabase.from('guardians').select('id,full_name')
    .eq('organization_id', organizationId).in('id', guardianIds)
  if (!guardians?.length) redirect('/portal/acesso')
  return { supabase, userId, guardians }
}
