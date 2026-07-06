import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppHeader from '@/components/AppHeader'
import type { Sale } from '@/lib/types'
import SalesClient from './SalesClient'
import styles from '@/styles/crud.module.css'

export default async function StudentsPage() {
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

  const { data: sales } = await supabase
    .from('sales')
    .select('*, customer:customers(name)')
    .eq('owner_id', user.id)
    .order('contract_date', { ascending: false, nullsFirst: false })

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name')
    .eq('owner_id', user.id)
    .order('name')

  return (
    <div className={styles.page}>
      <AppHeader displayName={displayName} isAdmin={isAdmin} />
      <SalesClient
        initial={(sales as Sale[]) ?? []}
        customers={customers ?? []}
        userId={user.id}
        heading="학습자 신규"
      />
    </div>
  )
}
