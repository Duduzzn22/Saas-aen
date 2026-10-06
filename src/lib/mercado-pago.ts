import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function encryptionKey() {
  const value = process.env.MP_TOKEN_ENCRYPTION_KEY
  if (!value) throw new Error('MP encryption not configured')
  const key = Buffer.from(value,'base64')
  if (key.length !== 32) throw new Error('Invalid MP encryption key')
  return key
}

export function encryptToken(value:string) {
  const iv=randomBytes(12)
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv)
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
  return [iv,encrypted,cipher.getAuthTag()].map(v=>v.toString('base64url')).join('.')
}

export function decryptToken(value:string) {
  const parts=value.split('.').map(p=>Buffer.from(p,'base64url'))
  if (parts.length !== 3 || parts[0].length !== 12 || parts[2].length !== 16) throw new Error('Invalid token envelope')
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),parts[0])
  decipher.setAuthTag(parts[2])
  return Buffer.concat([decipher.update(parts[1]),decipher.final()]).toString('utf8')
}

export function adminClient() {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Supabase service role not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,
    {auth:{persistSession:false,autoRefreshToken:false}})
}

export function mpConfigured() {
  return !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET
    && process.env.MP_TOKEN_ENCRYPTION_KEY && process.env.MP_REDIRECT_URI
    && process.env.MP_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

type OAuthToken={access_token:string;refresh_token:string;expires_in:number;user_id:number;live_mode:boolean}
export async function exchangeToken(body:Record<string,string>) {
  const response=await fetch('https://api.mercadopago.com/oauth/token',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({client_id:process.env.MP_CLIENT_ID,client_secret:process.env.MP_CLIENT_SECRET,...body}),
    cache:'no-store',signal:AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('MP OAuth failed')
  const token:OAuthToken=await response.json()
  if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in)
    || !token.user_id) throw new Error('Invalid MP OAuth response')
  return token
}

export async function accessToken(org:string) {
  const client=adminClient()
  const {data:connection,error}=await client.from('mp_connections').select('*')
    .eq('organization_id',org).maybeSingle()
  if (error || !connection) throw new Error('School MP account missing')
  if (new Date(connection.expires_at).getTime()>Date.now()+60*60*1000)
    return {token:decryptToken(connection.access_cipher),sellerId:connection.seller_id,liveMode:connection.live_mode}
  const refreshed=await exchangeToken({grant_type:'refresh_token',refresh_token:decryptToken(connection.refresh_cipher)})
  if (String(refreshed.user_id)!==connection.seller_id) throw new Error('MP seller changed')
  const {error:updateError}=await client.from('mp_connections').update({
    access_cipher:encryptToken(refreshed.access_token),refresh_cipher:encryptToken(refreshed.refresh_token),
    expires_at:new Date(Date.now()+refreshed.expires_in*1000).toISOString(),
  }).eq('organization_id',org)
  if (updateError) throw new Error('Could not persist renewed MP tokens')
  return {token:refreshed.access_token,sellerId:connection.seller_id,liveMode:connection.live_mode}
}

export async function getPayment(org:string,paymentId:string) {
  const {token,sellerId,liveMode}=await accessToken(org)
  const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{
    headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('Could not query MP payment')
  const payment: {id:number;status:string;external_reference:string;transaction_amount:number;
    collector_id:number;payment_method_id:string;currency_id:string;live_mode:boolean;date_approved?:string}=await response.json()
  if (String(payment.id)!==paymentId || String(payment.collector_id)!==sellerId
    || payment.live_mode!==liveMode) throw new Error('MP payment seller mismatch')
  return payment
}

export function verifyWebhook(signature:string | null,requestId:string | null,dataId:string | null) {
  const secret=process.env.MP_WEBHOOK_SECRET
  if (!secret || !signature || !requestId || !dataId) return false
  const parts=Object.fromEntries(signature.split(',').map(part=>part.trim().split('=',2)))
  if (!/^\d{10,13}$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false
  const stamp=Number(parts.ts)
  const seconds=parts.ts.length===13 ? stamp/1000 : stamp
  if (Math.abs(Date.now()/1000-seconds)>600) return false
  const message=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected=createHmac('sha256',secret).update(message).digest()
  const given=Buffer.from(parts.v1,'hex')
  return given.length===expected.length && timingSafeEqual(expected,given)
}
