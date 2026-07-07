import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/AppShell'
import type { Sale } from '@/lib/types'
import SalesClient from '../students/SalesClient'

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
    .order('contract_date', { ascending: false, nullsFirst: false })

  return (
    <AppShell displayName={displayName} isAdmin={isAdmin}>
      <SalesClient
        initial={(sales as Sale[]) ?? []}
        customers={[]}
        userId={user.id}
        heading="매출파일"
        readOnly
      />
    </AppShell>
  )
}
