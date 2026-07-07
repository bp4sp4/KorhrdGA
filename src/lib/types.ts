export type Role = 'agent' | 'admin'

export type PaymentMethod = 'payapp_transfer' | 'bank_transfer' | 'card'
export type SaleStatus = '정상' | '철회' | '실효' | '정산' | '보류'

export type Customer = {
  id: string
  owner_id: string
  name: string
  phone: string | null
  birth: string | null
  source: string | null // 유입경로
  institution: string | null // 기관
  education_level: string | null // 교육수준
  course_type: string | null // 과정유형
  course: string | null // 과정
  notes: string | null
  created_at: string
}

// 가망관리(prospect-register) 선택 옵션
export const INSTITUTION_OPTIONS = [
  '한평생학점은행',
  '한국평생교육진흥원',
  '제휴시설',
  '기타',
] as const

export const EDUCATION_LEVEL_OPTIONS = [
  '고등학교 졸업',
  '대학교 졸업',
  '대학원 졸업',
  '기타',
] as const

export const COURSE_TYPE_OPTIONS = [
  '학점은행제',
  '평생교육사',
  '한국어교원',
  '사회복지학사',
  '아동학사',
  '유학',
  '어학연수',
  '기타',
] as const

export const INFLOW_SOURCE_OPTIONS = [
  '블로그',
  '맘카페',
  '당근마켓',
  '영업',
  '고객지원',
  '기타',
] as const

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
