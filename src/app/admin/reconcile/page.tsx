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
    .select('manager, student_id, payment_amount, payment_date, customer_name, institution, owner:profiles(name)')

  // 임베드된 owner는 배열/객체로 올 수 있어 단일 객체로 정규화
  const dbRows: DbRow[] = ((sales as unknown as Record<string, unknown>[]) ?? []).map((s) => {
    const o = s.owner
    const owner = Array.isArray(o) ? (o[0] ?? null) : (o ?? null)
    return {
      manager: (s.manager as string) ?? null,
      student_id: (s.student_id as string) ?? null,
      payment_amount: (s.payment_amount as number) ?? null,
      payment_date: (s.payment_date as string) ?? null,
      customer_name: (s.customer_name as string) ?? null,
      institution: (s.institution as string) ?? null,
      owner: owner as { name: string | null } | null,
    }
  })

  // 현재 년월 (기본 대사 대상)
  const now = new Date()
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 우리 시스템 담당자 계정 (예비 GA 사용자)
  const { data: agentRows } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('role', 'agent')
    .order('name')
  const agents = (agentRows ?? [])
    .map((a) => (a.name ?? '').trim())
    .filter((n) => n !== '')

  return (
    <div className={styles.page}>
      <AppHeader displayName={displayName} isAdmin />
      <ReconcileClient dbRows={dbRows} agents={agents} currentYm={currentYm} />
    </div>
  )
}
