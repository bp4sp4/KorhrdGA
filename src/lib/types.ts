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
  '2년제 졸업',
  '4년제 졸업',
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
  notes: string | null // 기재사항
  created_at: string // 등록일자
  // 학습자 신규(NMS 매출등록) 필드
  manager: string | null // 담당자
  course_type: string | null // 과정분류
  course_detail: string | null // 세부과정
  institution: string | null // 기관명
  class_start: string | null // 개강반
  student_id: string | null // 학생아이디
  customer_name: string | null // 고객명
  phone: string | null // 연락처
  education_level: string | null // 최종학력
  region: string | null // 지역
  sub_region: string | null // 세부지역
  practice_schedule: string | null // 실습예정일
  payment_date: string | null // 결제일자
  payment_amount: number | null // 결제금액
  subject_count: number | null // 과목수
  special_note: string | null // 특이사항
  custom: Record<string, string> | null // 커스텀 항목 값 (JSONB)
  // 조인된 고객명 (select '*, customer:customers(name)')
  customer?: { name: string } | null
}

// 커스텀 항목 정의 + 컬럼 표시/순서 설정 (app_config 'sales_view')
export type SalesCustomFieldType = 'text' | 'number' | 'date'
export type SalesCustomField = { key: string; label: string; type?: SalesCustomFieldType }
export type SalesViewConfig = {
  order?: string[] // 컬럼 순서 (standard + custom 키)
  hidden?: string[] // 숨긴 컬럼 키
  customFields?: SalesCustomField[]
  pageSize?: number // 페이지당 표시 개수
}

// 학습자 신규 표준 컬럼 (key = Sale 필드, label = 헤더)
export const STANDARD_SALE_COLUMNS: { key: string; label: string }[] = [
  { key: 'created_at', label: '등록일자' },
  { key: 'manager', label: '담당자' },
  { key: 'course_type', label: '과정분류' },
  { key: 'course_detail', label: '세부과정' },
  { key: 'institution', label: '기관명' },
  { key: 'class_start', label: '개강반' },
  { key: 'student_id', label: '학생아이디' },
  { key: 'customer_name', label: '고객명' },
  { key: 'phone', label: '연락처' },
  { key: 'education_level', label: '최종학력' },
  { key: 'region', label: '지역' },
  { key: 'sub_region', label: '세부지역' },
  { key: 'practice_schedule', label: '실습예정일' },
  { key: 'payment_date', label: '결제일자' },
  { key: 'payment_amount', label: '결제금액' },
  { key: 'subject_count', label: '과목수' },
  { key: 'special_note', label: '특이사항' },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  payapp_transfer: '페이앱',
  bank_transfer: '계좌이체',
  card: '카드',
}

export const SALE_STATUSES: SaleStatus[] = ['정상', '철회', '실효', '정산', '보류']
