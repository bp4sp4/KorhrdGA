'use client'

import { useMemo, useState, type CSSProperties } from 'react'
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
const GRID = '48px 1.1fr 1.3fr 1.3fr .9fr 1.2fr 1fr .9fr .7fr .9fr'

const EXCEL_HEADERS = ['과정유형', '과정', '기관', '고객명', '연락처', '교육수준', '제휴시설', '기타사항'] as const

const S: Record<string, CSSProperties> = {
  label: { fontSize: 13, fontWeight: 700, color: '#3a4257' },
  field: { display: 'flex', flexDirection: 'column', gap: 7 },
  input: {
    width: '100%', padding: '12px 14px', fontSize: 14.5, fontFamily: 'inherit', color: '#1c2333',
    background: '#fff', border: '1px solid #e3e8f0', borderRadius: 10, outline: 'none',
  },
  select: {
    width: '100%', appearance: 'none', padding: '12px 40px 12px 14px', fontSize: 14.5, fontFamily: 'inherit',
    fontWeight: 600, color: '#1c2333', background: '#fff', border: '1px solid #e3e8f0', borderRadius: 10,
    cursor: 'pointer', outline: 'none',
  },
  caret: { position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9aa3b2', pointerEvents: 'none' },
  card: { background: '#fff', border: '1px solid #eef0f4', borderRadius: 16, boxShadow: '0 1px 3px rgba(20,30,50,0.04)', overflow: 'hidden' },
}

const focusIn = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#2563eb'
  e.currentTarget.style.background = '#fff'
}
const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#e3e8f0'
  e.currentTarget.style.background = '#fff'
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div style={S.field}>
      <label style={S.label}>{label}</label>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} onFocus={focusIn} onBlur={focusOut} style={S.select}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span style={S.caret}>▾</span>
      </div>
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked?: boolean; onChange?: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange?.() }}
      style={{ width: 18, height: 18, border: '1.8px solid ' + (checked ? '#2563eb' : '#cbd3e0'), background: checked ? '#2563eb' : '#fff', borderRadius: 5, cursor: onChange ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {checked && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
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

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff', fontFamily: "'Pretendard', -apple-system, sans-serif", color: '#1c2333' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 28, padding: 32, maxWidth: 1680, margin: '0 auto', alignItems: 'start' }}>
        {/* 등록/수정 폼 */}
        <aside style={{ ...S.card, position: 'sticky', top: 24 }}>
          <div style={{ padding: '24px 26px 20px', borderBottom: '1px solid #eef1f6', background: 'linear-gradient(180deg,#fbfcfe,#fff)' }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>
              {editingId ? '가망고객 수정' : '가망고객 등록'}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8a93a6' }}>
              {editingId ? '선택한 가망고객 정보를 수정하세요' : '새 가망고객 정보를 입력하세요'}
            </p>
          </div>

          <div style={{ padding: '22px 26px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SelectField label="과정 유형" value={form.course_type} options={COURSE_TYPE_OPTIONS} onChange={(v) => setF('course_type', v)} />
            <div style={S.field}>
              <label style={S.label}>과정</label>
              <input value={form.course} onChange={(e) => setF('course', e.target.value)} onFocus={focusIn} onBlur={focusOut} placeholder="사회복지사2급 등" style={S.input} />
            </div>
            <SelectField label="기관" value={form.institution} options={INSTITUTION_OPTIONS} onChange={(v) => setF('institution', v)} />

            <div style={{ height: 1, background: '#eef1f6', margin: '2px 0' }} />

            <div style={S.field}>
              <label style={S.label}>고객명</label>
              <input value={form.name} onChange={(e) => setF('name', e.target.value)} onFocus={focusIn} onBlur={focusOut} placeholder="고객명" style={S.input} />
            </div>
            <div style={S.field}>
              <label style={S.label}>연락처</label>
              <input value={form.phone} onChange={(e) => setF('phone', e.target.value)} onFocus={focusIn} onBlur={focusOut} placeholder="010-0000-0000" style={S.input} />
            </div>

            <SelectField label="교육수준" value={form.education_level} options={EDUCATION_LEVEL_OPTIONS} onChange={(v) => setF('education_level', v)} />
            <SelectField label="제휴시설 / 유입경로" value={form.source} options={INFLOW_SOURCE_OPTIONS} onChange={(v) => setF('source', v)} />

            <div style={S.field}>
              <label style={S.label}>기타사항</label>
              <textarea value={form.notes} onChange={(e) => setF('notes', e.target.value)} onFocus={focusIn} onBlur={focusOut} placeholder="특이사항이나 메모를 입력하세요" rows={3} style={{ ...S.input, resize: 'none', lineHeight: 1.5 }} />
            </div>

            {error && <p style={{ margin: 0, padding: '10px 12px', fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ marginTop: 4, width: '100%', padding: 14, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', color: '#fff', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'none', borderRadius: 12, cursor: saving ? 'default' : 'pointer', boxShadow: '0 6px 16px rgba(37,99,235,.28)', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '저장 중…' : editingId ? '수정 저장' : '＋ 가망고객 등록'}
            </button>
            {editingId && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={resetForm} style={{ flex: 1, padding: 11, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: '#3a4257', background: '#fff', border: '1.5px solid #e3e8f0', borderRadius: 12, cursor: 'pointer' }}>취소</button>
                <button onClick={remove} style={{ flex: 1, padding: 11, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: '#dc2626', background: '#fff', border: '1.5px solid #fecaca', borderRadius: 12, cursor: 'pointer' }}>삭제</button>
              </div>
            )}
          </div>
        </aside>

        {/* 리스트 */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-.03em' }}>가망고객</h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#8a93a6' }}>등록된 가망고객을 검색하고 관리하세요</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={exportExcel} style={btnGhost}>엑셀 다운로드</button>
              <button onClick={() => { setBulkMsg(null); setBulkOpen(true) }} style={btnGhost}>일괄등록</button>
            </div>
          </div>

          {/* 툴바 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
              <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9aa3b2' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              </span>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                placeholder="고객명, 연락처, 기관명으로 검색..."
                style={{ width: '100%', padding: '14px 16px 14px 46px', fontSize: 15, fontFamily: 'inherit', color: '#1c2333', background: '#fff', border: '1.5px solid #e3e8f0', borderRadius: 14, outline: 'none', boxShadow: '0 1px 2px rgba(20,27,46,.04)' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37,99,235,.1)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e3e8f0'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(20,27,46,.04)' }}
              />
            </div>
            <FilterSelect label="연도" value={year} options={years} onChange={(v) => { setYear(v); setPage(1) }} />
            <FilterSelect label="월" value={month} options={months} onChange={(v) => { setMonth(v); setPage(1) }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: '#eef4ff', borderRadius: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#3b6fd4' }}>총</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#2563eb' }}>{filtered.length}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#3b6fd4' }}>명</span>
            </div>
          </div>

          {/* 표 */}
          <div style={S.card}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '16px 24px', background: '#f9fafd', borderBottom: '1px solid #eef1f6', fontSize: 12.5, fontWeight: 700, color: '#7a8397' }}>
              <div><Checkbox /></div>
              <div>과정유형</div><div>과정</div><div>기관</div><div>고객명</div><div>연락처</div><div>교육수준</div><div>제휴시설</div><div>기타사항</div>
              <div style={{ textAlign: 'right' }}>등록일</div>
            </div>

            {paged.length === 0 ? (
              <div style={{ padding: '56px 24px', textAlign: 'center', color: '#9aa3b2', fontSize: 14 }}>
                {rows.length === 0 ? '아직 등록된 가망고객이 없습니다. 좌측에서 등록하세요.' : '조건에 맞는 가망고객이 없습니다.'}
              </div>
            ) : (
              paged.map((r) => (
                <div
                  key={r.id}
                  onClick={() => openEdit(r)}
                  style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #f2f4f8', fontSize: 14, cursor: 'pointer', background: editingId === r.id ? '#f4f8ff' : 'transparent' }}
                  onMouseEnter={(e) => { if (editingId !== r.id) e.currentTarget.style.background = '#f8faff' }}
                  onMouseLeave={(e) => { if (editingId !== r.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div><Checkbox /></div>
                  <div>
                    <span style={{ display: 'inline-flex', padding: '4px 10px', background: '#eef4ff', color: '#2563eb', fontSize: 12.5, fontWeight: 700, borderRadius: 7 }}>{r.course_type ?? '-'}</span>
                  </div>
                  <div style={{ fontWeight: 600, color: '#2b3346' }}>{r.course ?? '-'}</div>
                  <div style={{ color: '#4b5468' }}>{r.institution ?? '-'}</div>
                  <div style={{ fontWeight: 800, color: '#141b2e' }}>{r.name}</div>
                  <div style={{ color: '#4b5468', fontVariantNumeric: 'tabular-nums' }}>{r.phone ?? '-'}</div>
                  <div style={{ color: '#4b5468' }}>{r.education_level ?? '-'}</div>
                  <div>
                    <span style={{ display: 'inline-flex', padding: '4px 10px', background: '#f1f3f8', color: '#5a6377', fontSize: 12.5, fontWeight: 600, borderRadius: 7 }}>{r.source ?? '-'}</span>
                  </div>
                  <div style={{ color: '#9aa3b2' }} title={r.notes ?? ''}>{r.notes ? '📝' : '-'}</div>
                  <div style={{ textAlign: 'right', color: '#7a8397', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{r.created_at?.slice(0, 10)}</div>
                </div>
              ))
            )}
          </div>

          {pageCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <button style={pageArrow} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
              {Array.from({ length: pageCount }, (_, i) => i + 1)
                .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
                .reduce<number[]>((acc, n) => { if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1); acc.push(n); return acc }, [])
                .map((n, i) => n === -1
                  ? <span key={`g${i}`} style={{ color: '#9aa3b2', padding: '0 4px' }}>…</span>
                  : <button key={n} onClick={() => setPage(n)} style={n === safePage ? pageDotActive : pageDot}>{n}</button>)}
              <button style={pageArrow} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage === pageCount}>›</button>
            </div>
          )}
        </main>
      </div>

      {/* 일괄등록 모달 */}
      {bulkOpen && (
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
    </div>
  )
}

const btnGhost: CSSProperties = {
  height: 40, padding: '0 16px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', color: '#3a4257',
  background: '#fff', border: '1.5px solid #e3e8f0', borderRadius: 11, cursor: 'pointer',
}
const pageDot: CSSProperties = {
  minWidth: 40, height: 40, border: 'none', background: 'transparent', color: '#5a6274', fontWeight: 600, fontSize: 15, cursor: 'pointer', borderRadius: '50%', fontFamily: 'inherit',
}
const pageDotActive: CSSProperties = { ...pageDot, background: '#e7ecfb', color: '#2563eb', fontWeight: 700 }
const pageArrow: CSSProperties = { width: 40, height: 40, border: 'none', background: 'transparent', color: '#9aa3b2', fontSize: 18, cursor: 'pointer', borderRadius: 8, fontFamily: 'inherit' }

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#7a8397' }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ appearance: 'none', padding: '11px 34px 11px 14px', fontSize: 14, fontFamily: 'inherit', fontWeight: 600, color: '#1c2333', background: '#fff', border: '1.5px solid #e3e8f0', borderRadius: 11, cursor: 'pointer', outline: 'none' }}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9aa3b2', pointerEvents: 'none' }}>▾</span>
      </div>
    </div>
  )
}
