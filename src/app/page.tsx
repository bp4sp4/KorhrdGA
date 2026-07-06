import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AppHeader from '@/components/AppHeader'
import styles from './page.module.css'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const displayName = profile?.name ?? user.email ?? ''

  // 홈은 관리자 전용 — 담당자는 고객 DB로 바로 이동
  if (!isAdmin) redirect('/customers')

  return (
    <div className={styles.page}>
      <AppHeader displayName={displayName} isAdmin={isAdmin} />

      <main className={styles.main}>
        <h2 className={styles.greeting}>{displayName} 님, 안녕하세요 👋</h2>

        <div className={styles.grid}>
          <Link href="/students" className={styles.card}>
            <h3 className={styles.cardTitle}>학습자 신규</h3>
            <p className={styles.cardDesc}>계약·매출 기록 · 상태 관리</p>
          </Link>
          <Link href="/customers" className={styles.card}>
            <h3 className={styles.cardTitle}>가망관리</h3>
            <p className={styles.cardDesc}>가망 고객 명단 관리 · 수기입력</p>
          </Link>
          <Link href="/sales" className={styles.card}>
            <h3 className={styles.cardTitle}>매출파일</h3>
            <p className={styles.cardDesc}>등록된 매출 내역 조회</p>
          </Link>
          {isAdmin && (
            <Link href="/admin" className={styles.card}>
              <h3 className={styles.cardTitle}>관리자 대시보드</h3>
              <p className={styles.cardDesc}>전체 매출 · 담당자별 집계</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
