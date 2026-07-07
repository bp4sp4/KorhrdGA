import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/AppShell'
import type { Customer } from '@/lib/types'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
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

  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <AppShell displayName={displayName} isAdmin={isAdmin}>
      <CustomersClient initial={(customers as Customer[]) ?? []} userId={user.id} />
    </AppShell>
  )
}
