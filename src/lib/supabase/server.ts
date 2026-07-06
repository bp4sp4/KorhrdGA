import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// 서버 컴포넌트/서버 액션용 Supabase 클라이언트
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // 서버 컴포넌트에서 호출된 경우 무시 (미들웨어가 세션 갱신 담당)
          }
        },
      },
    },
  )
}
