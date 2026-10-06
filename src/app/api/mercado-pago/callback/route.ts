import { createHash } from 'node:crypto'
import { NextRequest,NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptToken,exchangeToken,mpConfigured } from '@/lib/mercado-pago'

export async function GET(request:NextRequest) {
  const state=request.nextUrl.searchParams.get('state')
  const code=request.nextUrl.searchParams.get('code')
  const fallback=new URL('/dashboard',request.url)
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length>500 || !mpConfigured())
    return NextResponse.redirect(fallback)
  const supabase=await createClient()
  const {data:claims}=await supabase.auth.getClaims()
  const userId=claims?.claims?.sub
  if (!userId) return NextResponse.redirect(new URL('/login',request.url))
  const hash=createHash('sha256').update(state).digest('hex')
  const {data:record}=await supabase.from('mp_oauth_states').select('organization_id,user_id,expires_at')
    .eq('state_hash',hash).maybeSingle()
  if (!record || record.user_id!==userId || new Date(record.expires_at).getTime()<Date.now())
    return NextResponse.redirect(fallback)
  const url=new URL(`/dashboard/${record.organization_id}/mercado-pago`,request.url)
  const {data:member}=await supabase.from('memberships').select('role').eq('organization_id',record.organization_id)
    .eq('user_id',userId).eq('active',true).maybeSingle()
  if (member?.role!=='admin') return NextResponse.redirect(fallback)
  const {error:deleteError}=await supabase.from('mp_oauth_states').delete().eq('state_hash',hash)
  if (deleteError) return NextResponse.redirect(new URL(`${url.pathname}?erro=estado`,request.url))
  try {
    const token=await exchangeToken({grant_type:'authorization_code',code,
      redirect_uri:process.env.MP_REDIRECT_URI!})
    const {error}=await supabase.from('mp_connections').upsert({
      organization_id:record.organization_id,seller_id:String(token.user_id),
      access_cipher:encryptToken(token.access_token),refresh_cipher:encryptToken(token.refresh_token),
      expires_at:new Date(Date.now()+token.expires_in*1000).toISOString(),
      live_mode:token.live_mode,connected_by:userId,connected_at:new Date().toISOString(),
    },{onConflict:'organization_id'})
    if (error) throw new Error('MP connection storage failed')
    url.searchParams.set('sucesso','1')
  } catch { url.searchParams.set('erro','conexao') }
  return NextResponse.redirect(url)
}
