'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/lib/types'
import styles from '@/styles/crud.module.css'

type FormState = {
  name: string
  phone: string
  birth: string
  source: string
  notes: string
}

const EMPTY: FormState = { name: '', phone: '', birth: '', source: '', notes: '' }

export default function CustomersClient({
  initial,
  userId,
}: {
  initial: Customer[]
  userId: string
}) {
  const [supabase] = useState(() => createClient())
  const [rows, setRows] = useState<Customer[]>(initial)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
    setRows((data as Customer[]) ?? [])
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
    setOpen(true)
  }

  function openEdit(c: Customer) {
    setEditingId(c.id)
    setForm({
      name: c.name ?? '',
      phone: c.phone ?? '',
      birth: c.birth ?? '',
      source: c.source ?? '',
      notes: c.notes ?? '',
    })
    setError(null)
    setOpen(true)
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('이름은 필수입니다.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      birth: form.birth || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customers')
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

  async function remove(c: Customer) {
    if (!window.confirm(`'${c.name}' 고객을 삭제할까요?`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
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
          고객 DB<span className={styles.count}>{rows.length}명</span>
        </h1>
        <button className={styles.addBtn} type="button" onClick={openAdd}>
          + 고객 추가
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>이름</th>
              <th className={styles.th}>연락처</th>
              <th className={styles.th}>생년월일</th>
              <th className={styles.th}>가입경로</th>
              <th className={styles.th}>메모</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={6}>
                  아직 등록된 고객이 없습니다. “고객 추가”로 시작하세요.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr className={styles.row} key={c.id}>
                  <td className={styles.td}>{c.name}</td>
                  <td className={styles.td}>{c.phone ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.birth ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.source ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.notes ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
                      <button className={styles.editBtn} type="button" onClick={() => openEdit(c)}>
                        수정
                      </button>
                      <button className={styles.delBtn} type="button" onClick={() => remove(c)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <form
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <h2 className={styles.modalTitle}>{editingId ? '고객 수정' : '고객 추가'}</h2>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>이름 *</span>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="홍길동"
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>연락처</span>
                <input
                  className={styles.input}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="010-0000-0000"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>생년월일</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.birth}
                  onChange={(e) => set('birth', e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>가입경로</span>
                <input
                  className={styles.input}
                  value={form.source}
                  onChange={(e) => set('source', e.target.value)}
                  placeholder="지인소개 / 온라인 등"
                />
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>메모</span>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="특이사항"
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
