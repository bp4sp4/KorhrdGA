import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppHeader from '@/components/AppHeader'
import ReconcileClient, { type DbRow } from './ReconcileClient'
import styles from '@/styles/crud.module.css'

export default async function ReconcilePage() {
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

  // 관리자 전용
  if (profile?.role !== 'admin') redirect('/')

  const displayName = profile?.name ?? user.email ?? ''

  const { data: sales } = await supabase
    .from('sales')
    .select('id, manager, student_id, payment_amount, payment_date, customer_name, institution, owner:profiles(name)')

  // 임베드된 owner는 배열/객체로 올 수 있어 단일 객체로 정규화
  const dbRows: DbRow[] = ((sales as unknown as Record<string, unknown>[]) ?? []).map((s) => {
    const o = s.owner
    const owner = Array.isArray(o) ? (o[0] ?? null) : (o ?? null)
    return {
      id: s.id as string,
      manager: (s.manager as string) ?? null,
      student_id: (s.student_id as string) ?? null,
      payment_amount: (s.payment_amount as number) ?? null,
      payment_date: (s.payment_date as string) ?? null,
      customer_name: (s.customer_name as string) ?? null,
      institution: (s.institution as string) ?? null,
      owner: owner as { name: string | null } | null,
    }
  })

  // 기본 대사 년월 = 전월 (정산은 항상 저번달 기준)
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const currentYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  // 우리 시스템 담당자 계정 (예비 GA 사용자) — 누락 건 등록 시 담당자명→계정 매칭에 사용
  const { data: agentRows } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('role', 'agent')
    .order('name')
  const agents = (agentRows ?? [])
    .map((a) => ({ id: a.id as string, name: ((a.name as string | null) ?? '').trim() }))
    .filter((a) => a.name !== '')

  return (
    <div className={styles.page}>
      <AppHeader displayName={displayName} isAdmin />
      <ReconcileClient
        dbRows={dbRows}
        agents={agents}
        currentYm={currentYm}
        adminId={user.id}
        adminName={displayName}
      />
    </div>
  )
}
