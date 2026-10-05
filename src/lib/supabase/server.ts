import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(items: Parameters<SetAllCookies>[0]) {
          try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch { /* Server Components cannot set cookies; proxy handles refresh. */ }
        },
      },
    },
  )
}
