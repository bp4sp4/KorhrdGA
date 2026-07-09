'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type Sale,
  type SalesViewConfig,
  COURSE_TYPE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  STANDARD_SALE_COLUMNS,
} from '@/lib/types'
import styles from '@/styles/crud.module.css'

const DEFAULT_HIDDEN = ['payment_amount', 'subject_count', 'special_note']

type FormState = {
  manager: string
  course_type: string
  course_detail: string
  institution: string
  class_start: string
  student_id: string
  customer_name: string
  phone: string
  education_level: string
  region: string
  sub_region: string
  practice_schedule: string
  payment_date: string
  payment_amount: string
  subject_count: string
  special_note: string
  notes: string
}

const EMPTY: FormState = {
  manager: '', course_type: '', course_detail: '', institution: '', class_start: '',
  student_id: '', customer_name: '', phone: '', education_level: '', region: '',
  sub_region: '', practice_schedule: '', payment_date: '', payment_amount: '',
  subject_count: '', special_note: '', notes: '',
}

const EXCEL_HEADERS = [
  '등록일자', '담당자', '과정분류', '세부과정', '기관명', '개강반', '학생아이디',
  '고객명', '연락처', '최종학력', '지역', '세부지역', '실습예정일', '결제일자',
  '결제금액', '과목수', '특이사항', '기재사항',
] as const

const PAGE_SIZES = [10, 20, 50, 100]

function won(n: number | null): string {
  return n == null ? '-' : n.toLocaleString('ko-KR')
}
function toNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
function toInt(s: string): number | null {
  const n = toNum(s)
  return n == null ? null : Math.trunc(n)
}
function toDateStr(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    if (serial > 59) {
      const ms = (serial - 25569) * 86400 * 1000
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  const m = s.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s.slice(0, 10)
}
function inRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!value) return false
  const v = value.slice(0, 10)
  if (from && v < from) return false
  if (to && v > to) return false
  return true
}
function cell(s: Sale, key: keyof Sale): string {
  const v = s[key]
  if (key === 'created_at' || key === 'payment_date') return v ? String(v).slice(0, 10) : '-'
  return v == null || v === '' ? '-' : String(v)
}

/* ---- 인라인 스타일 (레퍼런스 디자인) ---- */
const primaryBtn: React.CSSProperties = {
  border: 'none', background: '#2f5fef', color: '#fff', fontFamily: 'inherit',
  borderRadius: 10, cursor: 'pointer',
}
const chipBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e6ee',
  background: '#fff', color: '#3a4256', fontSize: 15, fontWeight: 600,
  fontFamily: 'inherit', padding: '11px 20px', borderRadius: 10, cursor: 'pointer',
}
const chipBtnActive: React.CSSProperties = {
  ...chipBtn, borderColor: '#2f5fef', color: '#2f5fef', background: '#eef3ff',
}
const thStyle: React.CSSProperties = {
  padding: '18px 12px', fontWeight: 700, color: '#5a6274', whiteSpace: 'nowrap', textAlign: 'center',
}
const tdStyle: React.CSSProperties = {
  padding: '17px 12px', textAlign: 'center', whiteSpace: 'nowrap', color: '#2b3244',
}
const pageBtn: React.CSSProperties = {
  minWidth: 42, height: 42, border: 'none', background: 'transparent', color: '#5a6274',
  fontWeight: 600, fontSize: 15, cursor: 'pointer', borderRadius: '50%', padding: '0 6px',
}
const pageBtnActive: React.CSSProperties = {
  ...pageBtn, background: '#e7ecfb', color: '#2f5fef', fontWeight: 700,
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9aa2b1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export default function SalesClient({
  initial,
  userId,
  readOnly = false,
  heading = '매출등록',
  managerName = '',
  viewConfig = {},
}: {
  initial: Sale[]
  customers?: { id: string; name: string }[]
  userId: string
  readOnly?: boolean
  heading?: string
  managerName?: string
  viewConfig?: SalesViewConfig
}) {
  const [supabase] = useState(() => createClient())
  const [rows, setRows] = useState<Sale[]>(initial)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [customVals, setCustomVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 뷰 설정 (컬럼 순서/표시 + 커스텀 항목)
  const [config, setConfig] = useState<SalesViewConfig>(viewConfig)
  const customFields = useMemo(() => config.customFields ?? [], [config.customFields])
  const allColumns = useMemo(
    () => [
      ...STANDARD_SALE_COLUMNS.map((c) => ({ key: c.key, label: c.label, custom: false })),
      ...customFields.map((f) => ({ key: f.key, label: f.label, custom: true })),
    ],
    [customFields],
  )
  const orderedColumns = useMemo(() => {
    const order = config.order && config.order.length ? config.order : STANDARD_SALE_COLUMNS.map((c) => c.key)
    const byKey = new Map(allColumns.map((c) => [c.key, c]))
    const seen = new Set<string>()
    const out: { key: string; label: string; custom: boolean }[] = []
    for (const k of order) {
      const c = byKey.get(k)
      if (c && !seen.has(k)) { out.push(c); seen.add(k) }
    }
    for (const c of allColumns) if (!seen.has(c.key)) out.push(c)
    return out
  }, [config.order, allColumns])
  const hidden = config.hidden ?? DEFAULT_HIDDEN
  const visibleColumns = orderedColumns.filter((c) => !hidden.includes(c.key))

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date'>('text')
  const [savedFlash, setSavedFlash] = useState(false)

  const [search, setSearch] = useState('')
  const [regFrom, setRegFrom] = useState('')
  const [regTo, setRegTo] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [picker, setPicker] = useState<'reg' | 'pay' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(viewConfig.pageSize ?? 10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<string | null>(null)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const editable = !readOnly

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (!inRange(r.created_at, regFrom, regTo)) return false
      if (!inRange(r.payment_date, payFrom, payTo)) return false
      if (q) {
        const hay = [r.customer_name, r.phone, r.institution, r.manager, r.student_id, r.course_detail]
          .map((x) => x ?? '').join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, regFrom, regTo, payFrom, payTo])

  const totalSales = filtered.reduce((s, r) => s + (r.payment_amount ?? 0), 0)
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const hasFilter = !!search || !!regFrom || !!regTo || !!payFrom || !!payTo

  const pageIds = paged.map((r) => r.id)
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function resetFilters() {
    setSearch(''); setRegFrom(''); setRegTo(''); setPayFrom(''); setPayTo('')
    setPicker(null); setPage(1)
  }

  async function reload() {
    const { data } = await supabase
      .from('sales')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false })
    setRows((data as Sale[]) ?? [])
    setSelected(new Set())
  }

  function openAdd() {
    setEditingId(null)
    setForm({ ...EMPTY, manager: managerName })
    setCustomVals({})
    setError(null)
    setOpen(true)
  }
  function openEdit(s: Sale) {
    if (!editable) return
    setEditingId(s.id)
    setCustomVals({ ...(s.custom ?? {}) })
    setForm({
      manager: s.manager ?? '', course_type: s.course_type ?? '', course_detail: s.course_detail ?? '',
      institution: s.institution ?? '', class_start: s.class_start ?? '', student_id: s.student_id ?? '',
      customer_name: s.customer_name ?? '', phone: s.phone ?? '', education_level: s.education_level ?? '',
      region: s.region ?? '', sub_region: s.sub_region ?? '', practice_schedule: s.practice_schedule ?? '',
      payment_date: s.payment_date ?? '', payment_amount: s.payment_amount?.toString() ?? '',
      subject_count: s.subject_count?.toString() ?? '', special_note: s.special_note ?? '', notes: s.notes ?? '',
    })
    setError(null)
    setOpen(true)
  }
  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_name.trim()) {
      setError('고객명은 필수입니다.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      manager: form.manager.trim() || null, course_type: form.course_type.trim() || null,
      course_detail: form.course_detail.trim() || null, institution: form.institution.trim() || null,
      class_start: form.class_start || null, student_id: form.student_id.trim() || null,
      customer_name: form.customer_name.trim() || null, phone: form.phone.trim() || null,
      education_level: form.education_level.trim() || null, region: form.region.trim() || null,
      sub_region: form.sub_region.trim() || null, practice_schedule: form.practice_schedule.trim() || null,
      payment_date: form.payment_date || null, payment_amount: toNum(form.payment_amount),
      subject_count: toInt(form.subject_count), special_note: form.special_note.trim() || null,
      notes: form.notes.trim() || null, custom: customVals,
    }
    try {
      if (editingId) {
        const { error } = await supabase.from('sales').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sales').insert({ ...payload, owner_id: userId })
        if (error) throw error
      }
      await reload()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function removeById(id: string, label: string) {
    if (!window.confirm(`'${label || '이 건'}' 을(를) 삭제할까요?`)) return
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) {
      window.alert(error.message)
      return
    }
    await reload()
    setOpen(false)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const data = filtered.map((r) => ({
      등록일자: r.created_at?.slice(0, 10) ?? '', 담당자: r.manager ?? '', 과정분류: r.course_type ?? '',
      세부과정: r.course_detail ?? '', 기관명: r.institution ?? '', 개강반: r.class_start ?? '',
      학생아이디: r.student_id ?? '', 고객명: r.customer_name ?? '', 연락처: r.phone ?? '',
      최종학력: r.education_level ?? '', 지역: r.region ?? '', 세부지역: r.sub_region ?? '',
      실습예정일: r.practice_schedule ?? '', 결제일자: r.payment_date ?? '', 결제금액: r.payment_amount ?? '',
      과목수: r.subject_count ?? '', 특이사항: r.special_note ?? '', 기재사항: r.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data, { header: [...EXCEL_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매출등록')
    XLSX.writeFile(wb, '매출등록_내역.xlsx')
  }
  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      [...EXCEL_HEADERS],
      ['', '홍길동', '학점은행제', '사회복지사2급', '올티칭', '2026-07-24', 'skyssoing', '김현열',
        '010-4503-4081', '고등학교 졸업', '경북', '구미시', '27년도 1학기 03월', '2026-06-07', 450000, 6, '', ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '템플릿')
    XLSX.writeFile(wb, '매출등록_일괄등록_템플릿.xlsx')
  }
  async function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const payloads: Record<string, unknown>[] = []
      let skipped = 0
      for (const row of rowsJson) {
        const customer_name = String(row['고객명'] ?? '').trim()
        if (!customer_name) { skipped++; continue }
        payloads.push({
          owner_id: userId, manager: String(row['담당자'] ?? '').trim() || null,
          course_type: String(row['과정분류'] ?? '').trim() || null,
          course_detail: String(row['세부과정'] ?? '').trim() || null,
          institution: String(row['기관명'] ?? '').trim() || null,
          class_start: toDateStr(row['개강반']) ?? (String(row['개강반'] ?? '').trim() || null),
          student_id: String(row['학생아이디'] ?? '').trim() || null, customer_name,
          phone: String(row['연락처'] ?? '').trim() || null,
          education_level: String(row['최종학력'] ?? '').trim() || null,
          region: String(row['지역'] ?? '').trim() || null,
          sub_region: String(row['세부지역'] ?? '').trim() || null,
          practice_schedule: String(row['실습예정일'] ?? '').trim() || null,
          payment_date: toDateStr(row['결제일자']), payment_amount: toNum(String(row['결제금액'] ?? '')),
          subject_count: toInt(String(row['과목수'] ?? '')),
          special_note: String(row['특이사항'] ?? '').trim() || null,
          notes: String(row['기재사항'] ?? '').trim() || null,
        })
      }
      if (payloads.length === 0) { setBulkMsg('등록할 유효한 행이 없습니다. (고객명 필수)'); return }
      const { error } = await supabase.from('sales').insert(payloads)
      if (error) throw error
      await reload()
      setBulkMsg(`${payloads.length}건 등록 완료${skipped ? ` · ${skipped}건 건너뜀` : ''}`)
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : '일괄등록에 실패했습니다.')
    } finally {
      setBulkBusy(false)
    }
  }

  // ---- 테이블/커스텀 설정 (개인별 · 실시간 자동 저장) ----
  function resolved(): SalesViewConfig {
    return {
      order: orderedColumns.map((c) => c.key),
      hidden: [...hidden],
      customFields: customFields.map((f) => ({ ...f })),
      pageSize,
    }
  }
  function changePageSize(n: number) {
    setPageSize(n)
    setPage(1)
    persist({ ...resolved(), pageSize: n })
  }
  async function persist(next: SalesViewConfig) {
    setConfig(next) // 즉시 표 반영
    const { error } = await supabase.from('user_prefs').upsert({ user_id: userId, sales_view: next })
    if (error) {
      window.alert(error.message)
      return
    }
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1200)
  }
  function toggleColumn(key: string) {
    const r = resolved()
    const h = new Set(r.hidden ?? [])
    if (h.has(key)) h.delete(key)
    else h.add(key)
    persist({ ...r, hidden: Array.from(h) })
  }
  function moveColumn(key: string, dir: -1 | 1) {
    const r = resolved()
    const order = [...(r.order ?? [])]
    const i = order.indexOf(key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    persist({ ...r, order })
  }
  function addField() {
    const label = newFieldLabel.trim()
    if (!label) return
    const key = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const r = resolved()
    persist({
      ...r,
      order: [...(r.order ?? []), key],
      customFields: [...(r.customFields ?? []), { key, label, type: newFieldType }],
    })
    setNewFieldLabel('')
    setNewFieldType('text')
  }
  function deleteField(key: string) {
    const r = resolved()
    persist({
      order: (r.order ?? []).filter((k) => k !== key),
      hidden: (r.hidden ?? []).filter((k) => k !== key),
      customFields: (r.customFields ?? []).filter((f) => f.key !== key),
    })
  }
  // 커스텀 항목 이름은 타이핑 중 로컬 반영, blur 시 저장 (키는 유지)
  function setFieldLabelLocal(key: string, label: string) {
    setConfig((prev) => ({
      ...prev,
      customFields: (prev.customFields ?? []).map((f) => (f.key === key ? { ...f, label } : f)),
    }))
  }
  function commitFieldLabel() {
    persist(resolved())
  }
  function setFieldType(key: string, type: 'text' | 'number' | 'date') {
    const r = resolved()
    persist({ ...r, customFields: (r.customFields ?? []).map((f) => (f.key === key ? { ...f, type } : f)) })
  }
  function resetConfig() {
    if (!window.confirm('테이블 설정을 기본값으로 되돌릴까요? (커스텀 항목 정의도 삭제)')) return
    persist({})
  }

  function renderCell(r: Sale, col: { key: string; custom: boolean }) {
    if (col.custom) {
      const v = r.custom?.[col.key]
      return <td key={col.key} style={tdStyle}>{v ? String(v) : '-'}</td>
    }
    const key = col.key as keyof Sale
    if (key === 'student_id') {
      const v = cell(r, key)
      return (
        <td key={col.key} style={tdStyle}>
          <span title={v} style={{ display: 'inline-block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{v}</span>
        </td>
      )
    }
    if (key === 'payment_amount') {
      return <td key={col.key} style={tdStyle}>{r.payment_amount != null ? `${won(r.payment_amount)}원` : '-'}</td>
    }
    if (key === 'subject_count') {
      return <td key={col.key} style={tdStyle}>{r.subject_count ?? '-'}</td>
    }
    return <td key={col.key} style={tdStyle}>{cell(r, key)}</td>
  }

  const pageList = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
    .reduce<number[]>((acc, n) => {
      if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1)
      acc.push(n)
      return acc
    }, [])

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', fontFamily: "'Pretendard', -apple-system, sans-serif", color: '#1f2430' }}>
      <div style={{ padding: '28px 32px 48px' }}>
        {/* 타이틀 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px' }}>{heading}</h1>
          {editable && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ ...chipBtn, padding: '12px 18px' }} onClick={() => setSettingsOpen(true)}>⚙ 테이블설정</button>
              <button style={{ ...primaryBtn, fontSize: 16, fontWeight: 700, padding: '13px 30px' }} onClick={openAdd}>개별등록</button>
              <button style={{ ...primaryBtn, fontSize: 16, fontWeight: 700, padding: '13px 30px' }} onClick={() => { setBulkMsg(null); setBulkOpen(true) }}>일괄등록</button>
            </div>
          )}
        </div>

        {/* 검색 + 액션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 440 }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }}><SearchIcon /></span>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="고객명, 연락처, 기관명, 담당자로 검색..."
              style={{ width: '100%', border: '1px solid #e2e6ee', borderRadius: 12, padding: '15px 18px 15px 46px', fontSize: 15, fontFamily: 'inherit', outline: 'none', color: '#1f2430' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ ...primaryBtn, background: hasFilter ? '#8b93a4' : '#c3c8d2', fontSize: 15, fontWeight: 600, padding: '12px 24px', cursor: hasFilter ? 'pointer' : 'not-allowed' }} onClick={resetFilters} disabled={!hasFilter}>초기화</button>
            <button style={{ ...primaryBtn, fontSize: 15, fontWeight: 600, padding: '12px 24px' }} onClick={exportExcel}>엑셀 다운로드</button>
          </div>
        </div>

        {/* 기간 칩 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 22 }}>
          <div style={{ position: 'relative' }}>
            <button style={regFrom || regTo ? chipBtnActive : chipBtn} onClick={() => setPicker(picker === 'reg' ? null : 'reg')}>
              <CalendarIcon /> 등록기간선택
            </button>
            {picker === 'reg' && (
              <div style={pickerPop}>
                <input type="date" value={regFrom} onChange={(e) => { setRegFrom(e.target.value); setPage(1) }} style={dateInput} />
                <span style={{ color: '#9aa2b1' }}>~</span>
                <input type="date" value={regTo} onChange={(e) => { setRegTo(e.target.value); setPage(1) }} style={dateInput} />
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button style={payFrom || payTo ? chipBtnActive : chipBtn} onClick={() => setPicker(picker === 'pay' ? null : 'pay')}>
              <CalendarIcon /> 결제기간선택
            </button>
            {picker === 'pay' && (
              <div style={pickerPop}>
                <input type="date" value={payFrom} onChange={(e) => { setPayFrom(e.target.value); setPage(1) }} style={dateInput} />
                <span style={{ color: '#9aa2b1' }}>~</span>
                <input type="date" value={payTo} onChange={(e) => { setPayTo(e.target.value); setPage(1) }} style={dateInput} />
              </div>
            )}
          </div>
        </div>

        {/* 요약 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, fontSize: 15, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ color: '#6b7385' }}>
            총 {filtered.length.toLocaleString('ko-KR')}건의 데이터{' '}
            <span style={{ color: '#9aa2b1' }}>(※ 데이터 색상이 노란색이면 수정요청, 빨간색이면 환불 표시입니다.)</span>
          </span>
          <span style={{ color: '#6b7385', fontWeight: 600 }}>
            전체 매출: <span style={{ color: '#2f5fef', fontWeight: 700 }}>{won(totalSales)}원</span>
          </span>
        </div>

        {/* 표 */}
        <div style={{ border: '1px solid #eef0f4', borderRadius: 16, overflowX: 'auto', boxShadow: '0 1px 3px rgba(20,30,50,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: '#fff', borderBottom: '1px solid #eef0f4' }}>
                {editable && (
                  <th style={{ padding: '18px 12px', textAlign: 'center', width: 52 }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ width: 18, height: 18, accentColor: '#2f5fef', cursor: 'pointer' }} />
                  </th>
                )}
                {visibleColumns.map((c) => <th key={c.key} style={thStyle}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={editable ? visibleColumns.length + 1 : visibleColumns.length} style={{ padding: '48px 12px', textAlign: 'center', color: '#9aa2b1' }}>
                    {rows.length === 0
                      ? (editable ? '아직 등록된 데이터가 없습니다. “개별등록”으로 시작하세요.' : '아직 등록된 데이터가 없습니다.')
                      : '조건에 맞는 데이터가 없습니다.'}
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openEdit(r)}
                    onMouseEnter={() => setHovered(r.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      borderBottom: '1px solid #f3f5f9',
                      background: hovered === r.id ? '#f7f9fd' : '#fff',
                      cursor: editable ? 'pointer' : 'default',
                    }}
                  >
                    {editable && (
                      <td style={{ padding: '17px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} style={{ width: 18, height: 18, accentColor: '#2f5fef', cursor: 'pointer' }} />
                      </td>
                    )}
                    {visibleColumns.map((c) => renderCell(r, c))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 30, position: 'relative', flexWrap: 'wrap' }}>
          <button style={{ ...pageBtn, minWidth: 40, color: '#9aa2b1', fontSize: 18 }} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
          {pageList.map((n, i) =>
            n === -1 ? (
              <span key={`g${i}`} style={{ color: '#9aa2b1', padding: '0 6px' }}>...</span>
            ) : (
              <button key={n} style={n === safePage ? pageBtnActive : pageBtn} onClick={() => setPage(n)}>{n}</button>
            ),
          )}
          <button style={{ ...pageBtn, minWidth: 40, fontSize: 18 }} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}>›</button>
          <div style={{ position: 'absolute', right: 0 }}>
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              style={{ border: '1px solid #e2e6ee', borderRadius: 10, padding: '11px 16px', fontSize: 14, color: '#5a6274', background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}개씩 보기</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 개별등록/수정 드로어 */}
      {editable && open && (
        <div className={styles.drawerOverlay} onClick={() => setOpen(false)}>
          <form className={styles.drawer} onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>{editingId ? '매출 수정' : '개별등록'}</h2>
              <button type="button" className={styles.drawerClose} onClick={() => setOpen(false)} aria-label="닫기">×</button>
            </div>
            <div className={styles.drawerBody}>
              <label className={styles.field}>
                <span className={styles.label}>과정분류 *</span>
                <select className={styles.select} value={form.course_type} onChange={(e) => set('course_type', e.target.value)}>
                  <option value="">선택</option>
                  {COURSE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>세부과정 *</span>
                <input className={styles.input} value={form.course_detail} onChange={(e) => set('course_detail', e.target.value)} placeholder="사회복지사2급" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>기관명 *</span>
                <input className={styles.input} value={form.institution} onChange={(e) => set('institution', e.target.value)} placeholder="서사평" />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>개강반</span>
                <input className={styles.input} type="date" value={form.class_start} onChange={(e) => set('class_start', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>학생아이디 *</span>
                <input className={styles.input} value={form.student_id} onChange={(e) => set('student_id', e.target.value)} />
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>고객명 *</span>
                  <input className={styles.input} value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} required />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>연락처 *</span>
                  <input className={styles.input} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="010-1234-5678" />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>최종학력 *</span>
                <select className={styles.select} value={form.education_level} onChange={(e) => set('education_level', e.target.value)}>
                  <option value="">선택</option>
                  {EDUCATION_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>지역 *</span>
                  <input className={styles.input} value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="서울" />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>세부지역 *</span>
                  <input className={styles.input} value={form.sub_region} onChange={(e) => set('sub_region', e.target.value)} placeholder="강남구" />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>실습예정일</span>
                <input className={styles.input} value={form.practice_schedule} onChange={(e) => set('practice_schedule', e.target.value)} placeholder="예: 27년도 1학기 03월" />
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>결제일자 *</span>
                  <input className={styles.input} type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>결제금액 (원)</span>
                  <input className={styles.input} type="number" inputMode="numeric" value={form.payment_amount} onChange={(e) => set('payment_amount', e.target.value)} placeholder="450000" />
                </label>
              </div>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>과목수</span>
                  <input className={styles.input} type="number" inputMode="numeric" value={form.subject_count} onChange={(e) => set('subject_count', e.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>담당자</span>
                  <input className={styles.input} value={form.manager} onChange={(e) => set('manager', e.target.value)} />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>특이사항</span>
                <input className={styles.input} value={form.special_note} onChange={(e) => set('special_note', e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>기재사항</span>
                <textarea className={styles.textarea} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </label>
              {customFields.map((f) => (
                <label key={f.key} className={styles.field}>
                  <span className={styles.label}>{f.label} <span style={{ color: '#9aa2b1', fontWeight: 400 }}>(커스텀)</span></span>
                  <input
                    className={styles.input}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    inputMode={f.type === 'number' ? 'numeric' : undefined}
                    value={customVals[f.key] ?? ''}
                    onChange={(e) => setCustomVals((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
              {error && <p className={styles.modalError}>{error}</p>}
            </div>
            <div className={styles.drawerFooter}>
              {editingId && (
                <button className={styles.delBtnRed} type="button" onClick={() => removeById(editingId, form.customer_name)} style={{ marginRight: 'auto' }}>삭제</button>
              )}
              <button className={styles.cancelBtn} type="button" onClick={() => setOpen(false)}>취소</button>
              <button className={styles.saveBtn} type="submit" disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
            </div>
          </form>
        </div>
      )}

      {/* 일괄등록 모달 */}
      {editable && bulkOpen && (
        <div className={styles.overlay} onClick={() => !bulkBusy && setBulkOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>일괄등록 (엑셀)</h2>
            <p className={styles.bulkDesc}>템플릿을 내려받아 작성한 뒤 업로드하세요. “고객명”은 필수입니다.</p>
            <div className={styles.bulkActions}>
              <button className={styles.ghostBtn} type="button" onClick={downloadTemplate}>템플릿 다운로드</button>
              <label className={styles.uploadBtn}>
                {bulkBusy ? '업로드 중…' : '엑셀 파일 선택'}
                <input type="file" accept=".xlsx,.xls" hidden disabled={bulkBusy} onChange={handleBulkFile} />
              </label>
            </div>
            {bulkMsg && <p className={styles.bulkMsg}>{bulkMsg}</p>}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} type="button" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 테이블 설정 패널 (개인별 · 즉시 반영/자동 저장 · 표 실시간 미리보기) */}
      {editable && settingsOpen && (
        <>
          <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,50,0.06)', zIndex: 60 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, height: '100dvh', width: 380, maxWidth: '100%', background: '#fff', borderLeft: '1px solid #eef0f4', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', zIndex: 61, display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #f1f3f8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>내 테이블 설정</h2>
                <span style={{ fontSize: 12, color: savedFlash ? '#059669' : '#9ca3af', transition: 'color .2s' }}>{savedFlash ? '✓ 저장됨' : '자동 저장'}</span>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="닫기" style={{ width: 32, height: 32, border: 'none', background: 'none', fontSize: 22, color: '#6b7280', cursor: 'pointer', borderRadius: 8 }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* 커스텀 항목 추가 */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#3a4257', marginBottom: 8 }}>커스텀 항목 추가</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addField() } }}
                    placeholder="항목명 (예: 지역교육청)"
                    style={{ flex: 1, height: 40, padding: '0 12px', fontSize: 14, border: '1px solid #e3e8f0', borderRadius: 10, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as 'text' | 'number' | 'date')} style={{ height: 40, padding: '0 8px', fontSize: 13, border: '1px solid #e3e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <option value="text">텍스트</option>
                    <option value="number">숫자</option>
                    <option value="date">날짜</option>
                  </select>
                  <button type="button" onClick={addField} style={{ flexShrink: 0, height: 40, padding: '0 16px', fontSize: 14, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>추가</button>
                </div>
              </div>

              {/* 컬럼 목록 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#3a4257' }}>컬럼 ({visibleColumns.length}/{orderedColumns.length} 표시)</span>
                  <button type="button" onClick={resetConfig} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>기본값으로</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orderedColumns.map((c, i) => {
                    const isHidden = hidden.includes(c.key)
                    const cf = c.custom ? customFields.find((f) => f.key === c.key) : undefined
                    return (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #eef0f4', borderRadius: 10, background: isHidden ? '#f9fafb' : '#fff' }}>
                        <button type="button" onClick={() => toggleColumn(c.key)} title={isHidden ? '표시' : '숨김'} style={{ width: 38, height: 22, borderRadius: 999, border: 'none', background: isHidden ? '#d1d5db' : '#2563eb', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' }}>
                          <span style={{ position: 'absolute', top: 2, left: isHidden ? 2 : 18, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                        </button>
                        {c.custom ? (
                          <div style={{ flex: 1, display: 'flex', gap: 6, minWidth: 0 }}>
                            <input
                              value={c.label}
                              onChange={(e) => setFieldLabelLocal(c.key, e.target.value)}
                              onBlur={commitFieldLabel}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              title="이름 수정"
                              style={{ flex: 1, minWidth: 0, height: 30, padding: '0 8px', fontSize: 13, border: '1px solid #e3e8f0', borderRadius: 7, outline: 'none', fontFamily: 'inherit', color: '#111827' }}
                            />
                            <select value={cf?.type ?? 'text'} onChange={(e) => setFieldType(c.key, e.target.value as 'text' | 'number' | 'date')} style={{ height: 30, fontSize: 12, border: '1px solid #e3e8f0', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                              <option value="text">텍스트</option>
                              <option value="number">숫자</option>
                              <option value="date">날짜</option>
                            </select>
                          </div>
                        ) : (
                          <span style={{ flex: 1, fontSize: 14, color: isHidden ? '#9ca3af' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                        )}
                        <button type="button" onClick={() => moveColumn(c.key, -1)} disabled={i === 0} style={miniBtn(i === 0)}>▲</button>
                        <button type="button" onClick={() => moveColumn(c.key, 1)} disabled={i === orderedColumns.length - 1} style={miniBtn(i === orderedColumns.length - 1)}>▼</button>
                        {c.custom && <button type="button" onClick={() => deleteField(c.key)} title="삭제" style={{ ...miniBtn(false), color: '#dc2626', borderColor: '#fecaca' }}>🗑</button>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 30, fontSize: 12, borderRadius: 7, border: '1px solid #d1d5db',
    background: '#fff', color: '#374151', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1, flexShrink: 0,
  }
}

const pickerPop: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, display: 'flex',
  alignItems: 'center', gap: 6, padding: 10, background: '#fff', border: '1px solid #e2e6ee',
  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
}
const dateInput: React.CSSProperties = {
  height: 38, padding: '0 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8,
  outline: 'none', fontFamily: 'inherit', color: '#1f2430',
}
