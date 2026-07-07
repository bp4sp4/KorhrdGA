'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import {
  type Sale,
  type SaleStatus,
  PAYMENT_METHOD_LABELS,
  SALE_STATUSES,
} from '@/lib/types'
import styles from '@/styles/crud.module.css'

type CustomerOption = { id: string; name: string }

type FormState = {
  customer_id: string
  product: string
  insurer: string
  premium: string
  total_amount: string
  commission: string
  payment_method: string
  contract_date: string
  term: string
  policy_number: string
  status: SaleStatus
  status_date: string
  notes: string
}

const EMPTY: FormState = {
  customer_id: '',
  product: '',
  insurer: '',
  premium: '',
  total_amount: '',
  commission: '',
  payment_method: '',
  contract_date: '',
  term: '',
  policy_number: '',
  status: '정상',
  status_date: '',
  notes: '',
}

const PAGE_SIZE = 20

// 엑셀 헤더 (일괄등록 템플릿 · 다운로드 공통)
const EXCEL_HEADERS = [
  '고객명',
  '상품',
  '보험사',
  '증권번호',
  '월납입료',
  '총액',
  '수수료',
  '결제수단',
  '청약일',
  '납입기간(개월)',
  '상태',
  '상태변경일',
  '메모',
] as const

const PM_LABEL_TO_VALUE: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => [l, v]),
)

function won(n: number | null): string {
  return n == null ? '-' : n.toLocaleString('ko-KR')
}

function toNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function toInt(s: string): number | null {
  const n = toNum(s)
  return n == null ? null : Math.trunc(n)
}

// 엑셀 셀 → 'YYYY-MM-DD' 문자열
function toDateStr(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  // 엑셀 날짜 시리얼(숫자)
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

export default function SalesClient({
  initial,
  customers,
  userId,
  readOnly = false,
  heading = '매출 / 계약',
}: {
  initial: Sale[]
  customers: CustomerOption[]
  userId: string
  readOnly?: boolean
  heading?: string
}) {
  const [supabase] = useState(() => createClient())
  const [rows, setRows] = useState<Sale[]>(initial)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 필터 상태
  const [search, setSearch] = useState('')
  const [regFrom, setRegFrom] = useState('')
  const [regTo, setRegTo] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // 일괄등록 상태
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!inRange(r.created_at, regFrom, regTo)) return false
      if (!inRange(r.contract_date, payFrom, payTo)) return false
      if (q) {
        const hay = [
          r.customer?.name ?? '',
          r.product ?? '',
          r.insurer ?? '',
          r.policy_number ?? '',
          r.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, regFrom, regTo, payFrom, payTo, statusFilter])

  const totalCommission = filtered.reduce((sum, r) => sum + (r.commission ?? 0), 0)
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilter =
    !!search || !!regFrom || !!regTo || !!payFrom || !!payTo || !!statusFilter

  function resetFilters() {
    setSearch('')
    setRegFrom('')
    setRegTo('')
    setPayFrom('')
    setPayTo('')
    setStatusFilter('')
    setPage(1)
  }

  async function reload() {
    const { data } = await supabase
      .from('sales')
      .select('*, customer:customers(name)')
      .eq('owner_id', userId)
      .order('contract_date', { ascending: false, nullsFirst: false })
    setRows((data as Sale[]) ?? [])
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
    setOpen(true)
  }

  function openEdit(s: Sale) {
    setEditingId(s.id)
    setForm({
      customer_id: s.customer_id ?? '',
      product: s.product ?? '',
      insurer: s.insurer ?? '',
      premium: s.premium?.toString() ?? '',
      total_amount: s.total_amount?.toString() ?? '',
      commission: s.commission?.toString() ?? '',
      payment_method: s.payment_method ?? '',
      contract_date: s.contract_date ?? '',
      term: s.term?.toString() ?? '',
      policy_number: s.policy_number ?? '',
      status: s.status,
      status_date: s.status_date ?? '',
      notes: s.notes ?? '',
    })
    setError(null)
    setOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer_id && !form.product.trim()) {
      setError('고객 또는 상품 중 하나는 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      customer_id: form.customer_id || null,
      product: form.product.trim() || null,
      insurer: form.insurer.trim() || null,
      premium: toNum(form.premium),
      total_amount: toNum(form.total_amount),
      commission: toNum(form.commission),
      payment_method: form.payment_method || null,
      contract_date: form.contract_date || null,
      term: toInt(form.term),
      policy_number: form.policy_number.trim() || null,
      status: form.status,
      status_date: form.status_date || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('sales')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('sales')
          .insert({ ...payload, owner_id: userId })
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

  async function remove(s: Sale) {
    const label = s.customer?.name || s.product || '이 매출'
    if (!window.confirm(`'${label}' 매출을 삭제할까요?`)) return
    const { error } = await supabase.from('sales').delete().eq('id', s.id)
    if (error) {
      window.alert(error.message)
      return
    }
    await reload()
  }

  // 엑셀 다운로드 (현재 필터 결과)
  function exportExcel() {
    const data = filtered.map((r) => ({
      고객명: r.customer?.name ?? '',
      상품: r.product ?? '',
      보험사: r.insurer ?? '',
      증권번호: r.policy_number ?? '',
      월납입료: r.premium ?? '',
      총액: r.total_amount ?? '',
      수수료: r.commission ?? '',
      결제수단: r.payment_method
        ? PAYMENT_METHOD_LABELS[r.payment_method]
        : '',
      청약일: r.contract_date ?? '',
      '납입기간(개월)': r.term ?? '',
      상태: r.status,
      상태변경일: r.status_date ?? '',
      메모: r.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data, { header: [...EXCEL_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '학습자')
    const today = filtered[0]?.created_at?.slice(0, 10) ?? '내역'
    XLSX.writeFile(wb, `학습자_${today}.xlsx`)
  }

  // 일괄등록 템플릿 다운로드
  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      [...EXCEL_HEADERS],
      [
        '홍길동',
        '종신보험',
        'OO생명',
        'P-0001',
        100000,
        1200000,
        50000,
        '카드',
        '2026-07-01',
        120,
        '정상',
        '',
        '메모 예시',
      ],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '템플릿')
    XLSX.writeFile(wb, '학습자_일괄등록_템플릿.xlsx')
  }

  // 고객명 → customer_id (없으면 생성). batchMap으로 배치 내 중복 방지
  async function ensureCustomer(
    name: string,
    batchMap: Map<string, string>,
  ): Promise<string | null> {
    const trimmed = name.trim()
    if (!trimmed) return null
    if (batchMap.has(trimmed)) return batchMap.get(trimmed)!
    const { data, error } = await supabase
      .from('customers')
      .insert({ owner_id: userId, name: trimmed })
      .select('id')
      .single()
    if (error) throw error
    batchMap.set(trimmed, data.id)
    return data.id
  }

  async function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: '',
      })
      if (rowsJson.length === 0) {
        setBulkMsg('데이터가 없습니다.')
        return
      }

      const batchMap = new Map<string, string>(
        customers.map((c) => [c.name, c.id]),
      )
      const payloads: Record<string, unknown>[] = []
      let skipped = 0

      for (const row of rowsJson) {
        const name = String(row['고객명'] ?? '').trim()
        const product = String(row['상품'] ?? '').trim()
        if (!name && !product) {
          skipped++
          continue
        }
        const customer_id = name ? await ensureCustomer(name, batchMap) : null
        const pmLabel = String(row['결제수단'] ?? '').trim()
        const statusRaw = String(row['상태'] ?? '').trim() as SaleStatus
        payloads.push({
          owner_id: userId,
          customer_id,
          product: product || null,
          insurer: String(row['보험사'] ?? '').trim() || null,
          policy_number: String(row['증권번호'] ?? '').trim() || null,
          premium: toNum(String(row['월납입료'] ?? '')),
          total_amount: toNum(String(row['총액'] ?? '')),
          commission: toNum(String(row['수수료'] ?? '')),
          payment_method: PM_LABEL_TO_VALUE[pmLabel] ?? null,
          contract_date: toDateStr(row['청약일']),
          term: toInt(String(row['납입기간(개월)'] ?? '')),
          status: SALE_STATUSES.includes(statusRaw) ? statusRaw : '정상',
          status_date: toDateStr(row['상태변경일']),
          notes: String(row['메모'] ?? '').trim() || null,
        })
      }

      if (payloads.length === 0) {
        setBulkMsg('등록할 유효한 행이 없습니다.')
        return
      }

      const { error } = await supabase.from('sales').insert(payloads)
      if (error) throw error
      await reload()
      setBulkMsg(
        `${payloads.length}건 등록 완료${skipped ? ` · ${skipped}건 건너뜀` : ''}`,
      )
    } catch (err) {
      setBulkMsg(
        err instanceof Error ? err.message : '일괄등록에 실패했습니다.',
      )
    } finally {
      setBulkBusy(false)
    }
  }

  const colCount = readOnly ? 8 : 9

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>
          {heading}
          <span className={styles.count}>{filtered.length}건</span>
          <span className={styles.count}>
            · 수수료 합계 {won(totalCommission)}원
          </span>
        </h1>
        <div className={styles.toolActions}>
          <button className={styles.ghostBtn} type="button" onClick={exportExcel}>
            엑셀다운로드
          </button>
          {!readOnly && (
            <>
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() => {
                  setBulkMsg(null)
                  setBulkOpen(true)
                }}
              >
                일괄등록
              </button>
              <button className={styles.addBtn} type="button" onClick={openAdd}>
                + 개별등록
              </button>
            </>
          )}
        </div>
      </div>

      {/* 필터 바 */}
      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="고객·상품·보험사·증권번호·메모 검색"
        />
        <div className={styles.dateGroup}>
          <span className={styles.rangeLabel}>등록기간</span>
          <input
            className={styles.dateInput}
            type="date"
            value={regFrom}
            onChange={(e) => {
              setRegFrom(e.target.value)
              setPage(1)
            }}
          />
          <span className={styles.tilde}>~</span>
          <input
            className={styles.dateInput}
            type="date"
            value={regTo}
            onChange={(e) => {
              setRegTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className={styles.dateGroup}>
          <span className={styles.rangeLabel}>결제기간</span>
          <input
            className={styles.dateInput}
            type="date"
            value={payFrom}
            onChange={(e) => {
              setPayFrom(e.target.value)
              setPage(1)
            }}
          />
          <span className={styles.tilde}>~</span>
          <input
            className={styles.dateInput}
            type="date"
            value={payTo}
            onChange={(e) => {
              setPayTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">상태 전체</option>
          {SALE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className={styles.ghostBtn}
          type="button"
          onClick={resetFilters}
          disabled={!hasFilter}
        >
          초기화
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>고객</th>
              <th className={styles.th}>상품</th>
              <th className={styles.th}>보험사</th>
              <th className={styles.th}>월납</th>
              <th className={styles.th}>총액</th>
              <th className={styles.th}>수수료</th>
              <th className={styles.th}>청약일</th>
              <th className={styles.th}>상태</th>
              {!readOnly && <th className={styles.th}></th>}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={colCount}>
                  {rows.length === 0
                    ? readOnly
                      ? '아직 등록된 매출이 없습니다.'
                      : '아직 등록된 매출이 없습니다. “개별등록”으로 시작하세요.'
                    : '조건에 맞는 내역이 없습니다.'}
                </td>
              </tr>
            ) : (
              paged.map((s) => (
                <tr className={styles.row} key={s.id}>
                  <td className={styles.td}>
                    {s.customer?.name ?? <span className={styles.muted}>-</span>}
                  </td>
                  <td className={styles.td}>
                    {s.product ?? <span className={styles.muted}>-</span>}
                  </td>
                  <td className={styles.td}>
                    {s.insurer ?? <span className={styles.muted}>-</span>}
                  </td>
                  <td className={`${styles.td} ${styles.num}`}>{won(s.premium)}</td>
                  <td className={`${styles.td} ${styles.num}`}>{won(s.total_amount)}</td>
                  <td className={`${styles.td} ${styles.num}`}>{won(s.commission)}</td>
                  <td className={styles.td}>
                    {s.contract_date ?? <span className={styles.muted}>-</span>}
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.badge} ${styles[`status${s.status}`]}`}>
                      {s.status}
                    </span>
                  </td>
                  {!readOnly && (
                    <td className={styles.td}>
                      <div className={styles.actions}>
                        <button className={styles.editBtn} type="button" onClick={() => openEdit(s)}>
                          수정
                        </button>
                        <button className={styles.delBtn} type="button" onClick={() => remove(s)}>
                          삭제
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pageCount > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            이전
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
            .reduce<number[]>((acc, n) => {
              if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1)
              acc.push(n)
              return acc
            }, [])
            .map((n, i) =>
              n === -1 ? (
                <span key={`gap${i}`} className={styles.pageGap}>
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={n === safePage ? styles.pageBtnActive : styles.pageBtn}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ),
            )}
          <button
            className={styles.pageBtn}
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage === pageCount}
          >
            다음
          </button>
        </div>
      )}

      {/* 개별등록/수정 드로어 */}
      {!readOnly && open && (
        <div className={styles.drawerOverlay} onClick={() => setOpen(false)}>
          <form
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>{editingId ? '매출 수정' : '개별등록'}</h2>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className={styles.drawerBody}>
              <label className={styles.field}>
                <span className={styles.label}>고객</span>
                <select
                  className={styles.select}
                  value={form.customer_id}
                  onChange={(e) => set('customer_id', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>상품명</span>
                <input
                  className={styles.input}
                  value={form.product}
                  onChange={(e) => set('product', e.target.value)}
                  placeholder="종신보험 등"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>보험사</span>
                <input
                  className={styles.input}
                  value={form.insurer}
                  onChange={(e) => set('insurer', e.target.value)}
                  placeholder="OO생명"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>증권번호</span>
                <input
                  className={styles.input}
                  value={form.policy_number}
                  onChange={(e) => set('policy_number', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>월납입료 (원)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  value={form.premium}
                  onChange={(e) => set('premium', e.target.value)}
                  placeholder="100000"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>총액 (원)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  value={form.total_amount}
                  onChange={(e) => set('total_amount', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>수수료/환산성적 (원)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  value={form.commission}
                  onChange={(e) => set('commission', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>납입기간 (개월)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="numeric"
                  value={form.term}
                  onChange={(e) => set('term', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>결제수단</span>
                <select
                  className={styles.select}
                  value={form.payment_method}
                  onChange={(e) => set('payment_method', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>청약일</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.contract_date}
                  onChange={(e) => set('contract_date', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>상태</span>
                <select
                  className={styles.select}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as SaleStatus)}
                >
                  {SALE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>상태변경일</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.status_date}
                  onChange={(e) => set('status_date', e.target.value)}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>메모</span>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </label>
              {error && <p className={styles.modalError}>{error}</p>}
            </div>
            <div className={styles.drawerFooter}>
              <button
                className={styles.cancelBtn}
                type="button"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button className={styles.saveBtn} type="submit" disabled={saving}>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 일괄등록 모달 */}
      {!readOnly && bulkOpen && (
        <div className={styles.overlay} onClick={() => !bulkBusy && setBulkOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>일괄등록 (엑셀)</h2>
            <p className={styles.bulkDesc}>
              템플릿을 내려받아 작성한 뒤 업로드하세요. “고객명”은 없으면 자동으로
              고객이 생성됩니다.
            </p>
            <div className={styles.bulkActions}>
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={downloadTemplate}
              >
                템플릿 다운로드
              </button>
              <label className={styles.uploadBtn}>
                {bulkBusy ? '업로드 중…' : '엑셀 파일 선택'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  disabled={bulkBusy}
                  onChange={handleBulkFile}
                />
              </label>
            </div>
            {bulkMsg && <p className={styles.bulkMsg}>{bulkMsg}</p>}
            <div className={styles.modalActions}>
              <button
                className={styles.cancelBtn}
                type="button"
                onClick={() => setBulkOpen(false)}
                disabled={bulkBusy}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
