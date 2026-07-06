export type Role = 'agent' | 'admin'

export type PaymentMethod = 'payapp_transfer' | 'bank_transfer' | 'card'
export type SaleStatus = '정상' | '철회' | '실효' | '정산' | '보류'

export type Customer = {
  id: string
  owner_id: string
  name: string
  phone: string | null
  birth: string | null
  source: string | null
  notes: string | null
  created_at: string
}

export type Sale = {
  id: string
  owner_id: string
  customer_id: string | null
  product: string | null
  insurer: string | null
  premium: number | null
  total_amount: number | null
  commission: number | null
  payment_method: PaymentMethod | null
  contract_date: string | null
  term: number | null
  policy_number: string | null
  status: SaleStatus
  status_date: string | null
  notes: string | null
  created_at: string
  // 조인된 고객명 (select '*, customer:customers(name)')
  customer?: { name: string } | null
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  payapp_transfer: '페이앱',
  bank_transfer: '계좌이체',
  card: '카드',
}

export const SALE_STATUSES: SaleStatus[] = ['정상', '철회', '실효', '정산', '보류']
