'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import {
  type Customer,
  INSTITUTION_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  COURSE_TYPE_OPTIONS,
  INFLOW_SOURCE_OPTIONS,
} from '@/lib/types'
import styles from '@/styles/crud.module.css'

type FormState = {
  name: string
  phone: string
  birth: string
  institution: string
  education_level: string
  course_type: string
  course: string
  source: string
  notes: string
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  birth: '',
  institution: '',
  education_level: '',
  course_type: '',
  course: '',
  source: '',
  notes: '',
}

const PAGE_SIZE = 20

const EXCEL_HEADERS = [
  '이름',
  '연락처',
  '생년월일',
  '기관',
  '교육수준',
  '과정유형',
  '과정',
  '유입경로',
  '메모',
] as const

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

  const [search, setSearch] = useState('')
  const [regFrom, setRegFrom] = useState('')
  const [regTo, setRegTo] = useState('')
  const [courseTypeFilter, setCourseTypeFilter] = useState('')
  const [page, setPage] = useState(1)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((c) => {
      if (courseTypeFilter && c.course_type !== courseTypeFilter) return false
      if (!inRange(c.created_at, regFrom, regTo)) return false
      if (q) {
        const hay = [
          c.name,
          c.phone ?? '',
          c.institution ?? '',
          c.course_type ?? '',
          c.course ?? '',
          c.source ?? '',
          c.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, regFrom, regTo, courseTypeFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const hasFilter = !!search || !!regFrom || !!regTo || !!courseTypeFilter

  function resetFilters() {
    setSearch('')
    setRegFrom('')
    setRegTo('')
    setCourseTypeFilter('')
    setPage(1)
  }

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
      institution: c.institution ?? '',
      education_level: c.education_level ?? '',
      course_type: c.course_type ?? '',
      course: c.course ?? '',
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
      institution: form.institution.trim() || null,
      education_level: form.education_level.trim() || null,
      course_type: form.course_type.trim() || null,
      course: form.course.trim() || null,
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
    if (!window.confirm(`'${c.name}' 가망고객을 삭제할까요?`)) return
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    if (error) {
      window.alert(error.message)
      return
    }
    await reload()
  }

  function exportExcel() {
    const data = filtered.map((c) => ({
      이름: c.name,
      연락처: c.phone ?? '',
      생년월일: c.birth ?? '',
      기관: c.institution ?? '',
      교육수준: c.education_level ?? '',
      과정유형: c.course_type ?? '',
      과정: c.course ?? '',
      유입경로: c.source ?? '',
      메모: c.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data, { header: [...EXCEL_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '가망고객')
    XLSX.writeFile(wb, '가망고객_내역.xlsx')
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      [...EXCEL_HEADERS],
      [
        '홍길동',
        '010-1234-5678',
        '1990-01-01',
        '한평생학점은행',
        '고등학교 졸업',
        '학점은행제',
        '사회복지사2급',
        '블로그',
        '메모 예시',
      ],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '템플릿')
    XLSX.writeFile(wb, '가망고객_일괄등록_템플릿.xlsx')
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

      const payloads: Record<string, unknown>[] = []
      let skipped = 0
      for (const row of rowsJson) {
        const name = String(row['이름'] ?? '').trim()
        if (!name) {
          skipped++
          continue
        }
        payloads.push({
          owner_id: userId,
          name,
          phone: String(row['연락처'] ?? '').trim() || null,
          birth: toDateStr(row['생년월일']),
          institution: String(row['기관'] ?? '').trim() || null,
          education_level: String(row['교육수준'] ?? '').trim() || null,
          course_type: String(row['과정유형'] ?? '').trim() || null,
          course: String(row['과정'] ?? '').trim() || null,
          source: String(row['유입경로'] ?? '').trim() || null,
          notes: String(row['메모'] ?? '').trim() || null,
        })
      }

      if (payloads.length === 0) {
        setBulkMsg('등록할 유효한 행이 없습니다. (이름 필수)')
        return
      }

      const { error } = await supabase.from('customers').insert(payloads)
      if (error) throw error
      await reload()
      setBulkMsg(
        `${payloads.length}건 등록 완료${skipped ? ` · ${skipped}건 건너뜀` : ''}`,
      )
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : '일괄등록에 실패했습니다.')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>
          가망관리<span className={styles.count}>{filtered.length}명</span>
        </h1>
        <div className={styles.toolActions}>
          <button className={styles.ghostBtn} type="button" onClick={exportExcel}>
            엑셀다운로드
          </button>
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
        </div>
      </div>

      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="이름·연락처·기관·과정·유입경로·메모 검색"
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
        <select
          className={styles.filterSelect}
          value={courseTypeFilter}
          onChange={(e) => {
            setCourseTypeFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="">과정유형 전체</option>
          {COURSE_TYPE_OPTIONS.map((s) => (
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
              <th className={styles.th}>이름</th>
              <th className={styles.th}>연락처</th>
              <th className={styles.th}>기관</th>
              <th className={styles.th}>과정유형</th>
              <th className={styles.th}>과정</th>
              <th className={styles.th}>유입경로</th>
              <th className={styles.th}>등록일</th>
              <th className={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={8}>
                  {rows.length === 0
                    ? '아직 등록된 가망고객이 없습니다. “개별등록”으로 시작하세요.'
                    : '조건에 맞는 가망고객이 없습니다.'}
                </td>
              </tr>
            ) : (
              paged.map((c) => (
                <tr className={styles.row} key={c.id}>
                  <td className={styles.td}>{c.name}</td>
                  <td className={styles.td}>{c.phone ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.institution ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.course_type ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.course ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.source ?? <span className={styles.muted}>-</span>}</td>
                  <td className={styles.td}>{c.created_at.slice(0, 10)}</td>
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

      {open && (
        <div className={styles.drawerOverlay} onClick={() => setOpen(false)}>
          <form
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>{editingId ? '가망고객 수정' : '개별등록'}</h2>
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
                <span className={styles.label}>고객명 *</span>
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
                <span className={styles.label}>기관</span>
                <select
                  className={styles.select}
                  value={form.institution}
                  onChange={(e) => set('institution', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {INSTITUTION_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>교육수준</span>
                <select
                  className={styles.select}
                  value={form.education_level}
                  onChange={(e) => set('education_level', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {EDUCATION_LEVEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>과정유형</span>
                <select
                  className={styles.select}
                  value={form.course_type}
                  onChange={(e) => set('course_type', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {COURSE_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>과정</span>
                <input
                  className={styles.input}
                  value={form.course}
                  onChange={(e) => set('course', e.target.value)}
                  placeholder="사회복지사2급 등"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>유입경로</span>
                <select
                  className={styles.select}
                  value={form.source}
                  onChange={(e) => set('source', e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {INFLOW_SOURCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.label}>특이사항 / 메모</span>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="특이사항"
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

      {bulkOpen && (
        <div className={styles.overlay} onClick={() => !bulkBusy && setBulkOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>일괄등록 (엑셀)</h2>
            <p className={styles.bulkDesc}>
              템플릿을 내려받아 작성한 뒤 업로드하세요. “이름”은 필수입니다.
            </p>
            <div className={styles.bulkActions}>
              <button className={styles.ghostBtn} type="button" onClick={downloadTemplate}>
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
