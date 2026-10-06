import { NextRequest,NextResponse } from 'next/server'
import { adminClient,verifyWebhook } from '@/lib/mercado-pago'
import { reconcilePixCharge } from '@/lib/pix'

export async function POST(request:NextRequest) {
  const paymentId=request.nextUrl.searchParams.get('data.id')
  if (!paymentId || !/^\d{1,30}$/.test(paymentId)
    || !verifyWebhook(request.headers.get('x-signature'),request.headers.get('x-request-id'),paymentId))
    return new NextResponse(null,{status:401})
  try {
    const body:{type?:string;data?:{id?:string}}=await request.json()
    if (body.type!=='payment' || String(body.data?.id)!==paymentId)
      return new NextResponse(null,{status:400})
    const client=adminClient()
    const {data:charge}=await client.from('pix_charges').select('id')
      .eq('mp_payment_id',paymentId).maybeSingle()
    if (!charge) return new NextResponse(null,{status:503})
    await reconcilePixCharge(charge.id)
    return NextResponse.json({ok:true})
  } catch {
    return new NextResponse(null,{status:503})
  }
}
