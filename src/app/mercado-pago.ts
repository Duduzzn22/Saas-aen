'use server'

import { createHash,randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireOrganization } from '@/lib/auth'
import { mpConfigured } from '@/lib/mercado-pago'

export async function connectMercadoPago(org:string) {
  if (!z.uuid().safeParse(org).success) redirect('/dashboard')
  const url=`/dashboard/${org}/mercado-pago`
  const {supabase,membership,userId}=await requireOrganization(org)
  if (membership.role!=='admin') redirect(url)
  if (!mpConfigured()) redirect(`${url}?erro=config`)
  const state=randomBytes(32).toString('base64url')
  const hash=createHash('sha256').update(state).digest('hex')
  const {error}=await supabase.from('mp_oauth_states').insert({state_hash:hash,
    organization_id:org,user_id:userId,expires_at:new Date(Date.now()+10*60_000).toISOString()})
  if (error) redirect(`${url}?erro=salvar`)
  const auth=new URL('https://auth.mercadopago.com/authorization')
  auth.searchParams.set('client_id',process.env.MP_CLIENT_ID!)
  auth.searchParams.set('response_type','code')
  auth.searchParams.set('platform_id','mp')
  auth.searchParams.set('scope','read write offline_access')
  auth.searchParams.set('state',state)
  auth.searchParams.set('redirect_uri',process.env.MP_REDIRECT_URI!)
  redirect(auth.toString())
}
