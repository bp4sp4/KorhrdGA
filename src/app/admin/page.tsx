import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/AppShell'
import type { Sale } from '@/lib/types'
import AdminClient, { type Agent } from './AdminClient'

export default async function AdminPage() {
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

  const { data: agents } = await supabase
    .from('profiles')
    .select('id, name, role')
    .order('name')

  // 관리자는 RLS상 전체 매출 조회 가능
  const { data: sales } = await supabase
    .from('sales')
    .select('*, customer:customers(name)')
    .order('contract_date', { ascending: false, nullsFirst: false })

  return (
    <AppShell displayName={displayName} isAdmin>
      <AdminClient
        agents={(agents as Agent[]) ?? []}
        sales={(sales as Sale[]) ?? []}
      />
    </AppShell>
  )
}
