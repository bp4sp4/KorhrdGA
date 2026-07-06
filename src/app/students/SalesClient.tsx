'use client'

import { useState } from 'react'
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

  const totalCommission = rows.reduce((sum, r) => sum + (r.commission ?? 0), 0)

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

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>
          {heading}<span className={styles.count}>{rows.length}건</span>
          <span className={styles.count}>· 수수료 합계 {won(totalCommission)}원</span>
        </h1>
        {!readOnly && (
          <button className={styles.addBtn} type="button" onClick={openAdd}>
            + 매출 추가
          </button>
        )}
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
            {rows.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={readOnly ? 8 : 9}>
                  {readOnly
                    ? '아직 등록된 매출이 없습니다.'
                    : '아직 등록된 매출이 없습니다. “매출 추가”로 시작하세요.'}
                </td>
              </tr>
            ) : (
              rows.map((s) => (
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

      {!readOnly && open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <form
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <h2 className={styles.modalTitle}>{editingId ? '매출 수정' : '매출 추가'}</h2>
            <div className={styles.formGrid}>
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
            <div className={styles.modalActions}>
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
    </div>
  )
}
