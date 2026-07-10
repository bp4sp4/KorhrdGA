import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppHeader from '@/components/AppHeader'
import type { Sale } from '@/lib/types'
import SalesFileClient from './SalesFileClient'
import styles from '@/styles/crud.module.css'

export default async function SalesPage() {
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
    .order('created_at', { ascending: false })

  return (
    <div className={styles.page}>
      <AppHeader displayName={displayName} isAdmin={isAdmin} />
      <SalesFileClient initial={(sales as Sale[]) ?? []} isAdmin={isAdmin} />
    </div>
  )
}
