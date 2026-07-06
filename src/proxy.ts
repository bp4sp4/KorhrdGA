import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 proxy 컨벤션 (구 middleware)
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // _next 정적파일/이미지·favicon·이미지 확장자 제외한 모든 경로
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
