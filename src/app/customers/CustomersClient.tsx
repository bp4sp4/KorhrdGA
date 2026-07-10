'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  type Customer,
  INSTITUTION_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  COURSE_TYPE_OPTIONS,
  INFLOW_SOURCE_OPTIONS,
} from '@/lib/types'
import crud from '@/styles/crud.module.css'
import styles from './customers.module.css'

type FormState = {
  course_type: string
  course: string
  institution: string
  name: string
  phone: string
  education_level: string
  source: string
  notes: string
}

const EMPTY: FormState = {
  course_type: COURSE_TYPE_OPTIONS[0],
  course: '',
  institution: INSTITUTION_OPTIONS[0],
  name: '',
  phone: '',
  education_level: EDUCATION_LEVEL_OPTIONS[0],
  source: INFLOW_SOURCE_OPTIONS[0],
  notes: '',
}

const PAGE_SIZE = 12
const EXCEL_HEADERS = ['과정유형', '과정', '기관', '고객명', '연락처', '교육수준', '제휴시설', '기타사항'] as const

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.selectWrap}>
        <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span className={styles.caret}>▾</span>
      </div>
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.selectWrap}>
        <select className={styles.filterSelect} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span className={styles.caret}>▾</span>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <div
      className={checked ? `${styles.checkbox} ${styles.checkboxOn}` : styles.checkbox}
      onClick={(e) => { e.stopPropagation(); onChange?.() }}
    >
      {checked && <span className={styles.checkMark}>✓</span>}
    </div>
  )
}

export default function CustomersClient({ initial, userId }: { initial: Customer[]; userId: string }) {
  const [supabase] = useState(() => createClient())
  const [rows, setRows] = useState<Customer[]>(initial)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [year, setYear] = useState('전체')
  const [month, setMonth] = useState('전체')
  const [page, setPage] = useState(1)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const setF = <K extends keyof FormState>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const years = useMemo(() => {
    const ys = new Set<string>()
    for (const r of rows) if (r.created_at) ys.add(r.created_at.slice(0, 4))
    return ['전체', ...Array.from(ys).sort((a, b) => b.localeCompare(a))]
  }, [rows])
  const months = ['전체', ...Array.from({ length: 12 }, (_, i) => `${i + 1}월`)]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (year !== '전체' && (r.created_at ?? '').slice(0, 4) !== year) return false
      if (month !== '전체') {
        const m = Number((r.created_at ?? '').slice(5, 7))
        if (m !== Number(month.replace('월', ''))) return false
      }
      if (q) {
        const hay = `${r.name} ${r.phone ?? ''} ${r.institution ?? ''} ${r.course ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, query, year, month])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  async function reload() {
    const { data } = await supabase.from('customers').select('*').eq('owner_id', userId).order('created_at', { ascending: false })
    setRows((data as Customer[]) ?? [])
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY)
    setError(null)
  }

  function openEdit(c: Customer) {
    setEditingId(c.id)
    setForm({
      course_type: c.course_type ?? COURSE_TYPE_OPTIONS[0],
      course: c.course ?? '',
      institution: c.institution ?? INSTITUTION_OPTIONS[0],
      name: c.name ?? '',
      phone: c.phone ?? '',
      education_level: c.education_level ?? EDUCATION_LEVEL_OPTIONS[0],
      source: c.source ?? INFLOW_SOURCE_OPTIONS[0],
      notes: c.notes ?? '',
    })
    setError(null)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError('고객명은 필수입니다.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      course_type: form.course_type.trim() || null,
      course: form.course.trim() || null,
      institution: form.institution.trim() || null,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      education_level: form.education_level.trim() || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (editingId) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert({ ...payload, owner_id: userId })
        if (error) throw error
      }
      await reload()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editingId) return
    if (!window.confirm(`'${form.name}' 가망고객을 삭제할까요?`)) return
    const { error } = await supabase.from('customers').delete().eq('id', editingId)
    if (error) {
      window.alert(error.message)
      return
    }
    await reload()
    resetForm()
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const data = filtered.map((c) => ({
      과정유형: c.course_type ?? '', 과정: c.course ?? '', 기관: c.institution ?? '', 고객명: c.name,
      연락처: c.phone ?? '', 교육수준: c.education_level ?? '', 제휴시설: c.source ?? '', 기타사항: c.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data, { header: [...EXCEL_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '가망고객')
    XLSX.writeFile(wb, '가망고객_내역.xlsx')
  }
  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([[...EXCEL_HEADERS], ['학점은행제', '사회복지사2급', '한평생학점은행', '홍길동', '010-1234-5678', '고등학교 졸업', '당근마켓', '메모']])
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
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const payloads: Record<string, unknown>[] = []
      let skipped = 0
      for (const row of rowsJson) {
        const name = String(row['고객명'] ?? '').trim()
        if (!name) { skipped++; continue }
        payloads.push({
          owner_id: userId, name,
          course_type: String(row['과정유형'] ?? '').trim() || null,
          course: String(row['과정'] ?? '').trim() || null,
          institution: String(row['기관'] ?? '').trim() || null,
          phone: String(row['연락처'] ?? '').trim() || null,
          education_level: String(row['교육수준'] ?? '').trim() || null,
          source: String(row['제휴시설'] ?? '').trim() || null,
          notes: String(row['기타사항'] ?? '').trim() || null,
        })
      }
      if (payloads.length === 0) { setBulkMsg('등록할 유효한 행이 없습니다. (고객명 필수)'); return }
      const { error } = await supabase.from('customers').insert(payloads)
      if (error) throw error
      await reload()
      setBulkMsg(`${payloads.length}건 등록 완료${skipped ? ` · ${skipped}건 건너뜀` : ''}`)
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : '일괄등록에 실패했습니다.')
    } finally {
      setBulkBusy(false)
    }
  }

  const pageList = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
    .reduce<number[]>((acc, n) => { if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1); acc.push(n); return acc }, [])

  return (
    <div className={styles.page}>
      <div className={styles.body}>
        {/* 등록/수정 폼 */}
        <aside className={styles.formCard}>
          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>{editingId ? '가망고객 수정' : '가망고객 등록'}</h2>
            <p className={styles.formSub}>{editingId ? '선택한 가망고객 정보를 수정하세요' : '새 가망고객 정보를 입력하세요'}</p>
          </div>

          <div className={styles.formBody}>
            <SelectField label="과정 유형" value={form.course_type} options={COURSE_TYPE_OPTIONS} onChange={(v) => setF('course_type', v)} />
            <div className={styles.field}>
              <label className={styles.label}>과정</label>
              <input className={styles.input} value={form.course} onChange={(e) => setF('course', e.target.value)} placeholder="사회복지사2급 등" />
            </div>
            <SelectField label="기관" value={form.institution} options={INSTITUTION_OPTIONS} onChange={(v) => setF('institution', v)} />

            <div className={styles.divider} />

            <div className={styles.field}>
              <label className={styles.label}>고객명</label>
              <input className={styles.input} value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="고객명" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>연락처</label>
              <input className={styles.input} value={form.phone} onChange={(e) => setF('phone', e.target.value)} placeholder="010-0000-0000" />
            </div>

            <SelectField label="교육수준" value={form.education_level} options={EDUCATION_LEVEL_OPTIONS} onChange={(v) => setF('education_level', v)} />
            <SelectField label="제휴시설 / 유입경로" value={form.source} options={INFLOW_SOURCE_OPTIONS} onChange={(v) => setF('source', v)} />

            <div className={styles.field}>
              <label className={styles.label}>기타사항</label>
              <textarea className={styles.textarea} value={form.notes} onChange={(e) => setF('notes', e.target.value)} placeholder="특이사항이나 메모를 입력하세요" rows={3} />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.submitBtn} onClick={handleSubmit} disabled={saving}>
              {saving ? '저장 중…' : editingId ? '수정 저장' : '＋ 가망고객 등록'}
            </button>
            {editingId && (
              <div className={styles.editActions}>
                <button className={styles.cancelBtn} onClick={resetForm}>취소</button>
                <button className={styles.deleteBtn} onClick={remove}>삭제</button>
              </div>
            )}
          </div>
        </aside>

        {/* 리스트 */}
        <main className={styles.main}>
          <div className={styles.listHead}>
            <div>
              <h1 className={styles.h1}>가망고객</h1>
              <p className={styles.subtitle}>등록된 가망고객을 검색하고 관리하세요</p>
            </div>
            <div className={styles.headActions}>
              <button className={styles.ghostBtn} onClick={exportExcel}>엑셀 다운로드</button>
              <button className={styles.ghostBtn} onClick={() => { setBulkMsg(null); setBulkOpen(true) }}>일괄등록</button>
            </div>
          </div>

          {/* 툴바 */}
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              </span>
              <input
                className={styles.searchInput}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                placeholder="고객명, 연락처, 기관명으로 검색..."
              />
            </div>
            <FilterSelect label="연도" value={year} options={years} onChange={(v) => { setYear(v); setPage(1) }} />
            <FilterSelect label="월" value={month} options={months} onChange={(v) => { setMonth(v); setPage(1) }} />
            <div className={styles.countBadge}>
              <span className={styles.countLabel}>총</span>
              <span className={styles.countNum}>{filtered.length}</span>
              <span className={styles.countLabel}>명</span>
            </div>
          </div>

          {/* 표 */}
          <div className={styles.tableCard}>
            <div className={styles.tableHead}>
              <div><Checkbox /></div>
              <div>과정유형</div><div>과정</div><div>기관</div><div>고객명</div><div>연락처</div><div>교육수준</div><div>제휴시설</div><div>기타사항</div>
              <div className={styles.headRight}>등록일</div>
            </div>

            {paged.length === 0 ? (
              <div className={styles.empty}>
                {rows.length === 0 ? '아직 등록된 가망고객이 없습니다. 좌측에서 등록하세요.' : '조건에 맞는 가망고객이 없습니다.'}
              </div>
            ) : (
              paged.map((r) => (
                <div
                  key={r.id}
                  className={editingId === r.id ? `${styles.row} ${styles.rowActive}` : styles.row}
                  onClick={() => openEdit(r)}
                >
                  <div><Checkbox /></div>
                  <div><span className={styles.badgeCourse}>{r.course_type ?? '-'}</span></div>
                  <div className={styles.cellCourse}>{r.course ?? '-'}</div>
                  <div className={styles.cellMuted}>{r.institution ?? '-'}</div>
                  <div className={styles.cellName}>{r.name}</div>
                  <div className={styles.cellPhone}>{r.phone ?? '-'}</div>
                  <div className={styles.cellMuted}>{r.education_level ?? '-'}</div>
                  <div><span className={styles.badgeSource}>{r.source ?? '-'}</span></div>
                  <div className={styles.cellMemo} title={r.notes ?? ''}>{r.notes ? '📝' : '-'}</div>
                  <div className={styles.cellDate}>{r.created_at?.slice(0, 10)}</div>
                </div>
              ))
            )}
          </div>

          {pageCount > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageArrow} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
              {pageList.map((n, i) => n === -1
                ? <span key={`g${i}`} className={styles.pageGap}>…</span>
                : <button key={n} className={n === safePage ? styles.pageDotActive : styles.pageDot} onClick={() => setPage(n)}>{n}</button>)}
              <button className={styles.pageArrow} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}>›</button>
            </div>
          )}
        </main>
      </div>

      {/* 일괄등록 모달 */}
      {bulkOpen && (
        <div className={crud.overlay} onClick={() => !bulkBusy && setBulkOpen(false)}>
          <div className={crud.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={crud.modalTitle}>일괄등록 (엑셀)</h2>
            <p className={crud.bulkDesc}>템플릿을 내려받아 작성한 뒤 업로드하세요. “고객명”은 필수입니다.</p>
            <div className={crud.bulkActions}>
              <button className={crud.ghostBtn} type="button" onClick={downloadTemplate}>템플릿 다운로드</button>
              <label className={crud.uploadBtn}>
                {bulkBusy ? '업로드 중…' : '엑셀 파일 선택'}
                <input type="file" accept=".xlsx,.xls" hidden disabled={bulkBusy} onChange={handleBulkFile} />
              </label>
            </div>
            {bulkMsg && <p className={crud.bulkMsg}>{bulkMsg}</p>}
            <div className={crud.modalActions}>
              <button className={crud.cancelBtn} type="button" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
