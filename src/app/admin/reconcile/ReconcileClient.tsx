'use client'

import { useMemo, useState } from 'react'
import styles from '@/styles/crud.module.css'

export type DbRow = {
  manager: string | null
  student_id: string | null
  payment_amount: number | null
  payment_date: string | null // 결제일자 (월 필터 기준)
  customer_name: string | null
  institution: string | null
  owner: { name: string | null } | null // 등록한 계정
}

type Status = 'matched' | 'mismatch' | 'missing'

type SheetInfo = {
  name: string
  records: Record<string, unknown>[]
  mgrKey: string | null
  idKey: string | null
  amtKey: string | null
  nameKey: string | null
  matchable: boolean
  dataCount: number
}

type ResultRow = {
  sheet: string
  manager: string
  student_id: string
  name: string
  excelAmount: number | null
  dbAmount: number | null
  status: Status
  owner: string | null // 매칭된 DB행을 등록한 계정
}

const MANAGER_KEYS = ['담당자', '직원명', '상담사', '매니저', '사원명']
const ID_KEYS = ['학생아이디', '아이디', 'id', '학생ID', '회원아이디', '학생 아이디']
const AMOUNT_KEYS = ['결제금액', '매출', '금액', '결제 금액', '결제금액(원)']
const NAME_KEYS = ['고객명', '이름', '학생명', '성명', '학생 이름']

function pickKey(headers: string[], candidates: string[]): string | null {
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase()
  const set = headers.map((h) => ({ raw: h, n: norm(h) }))
  for (const c of candidates) {
    const cn = norm(c)
    const hit = set.find((h) => h.n === cn)
    if (hit) return hit.raw
  }
  for (const c of candidates) {
    const cn = norm(c)
    const hit = set.find((h) => h.n.includes(cn))
    if (hit) return hit.raw
  }
  return null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}
function won(n: number | null): string {
  return n == null ? '-' : n.toLocaleString('ko-KR')
}

const NO_OWNER = '(소유자 없음)'

const isSalesSheet = (n: string) => !/(선승인|환불|보훈|국가유공자)/.test(n)
function monthRegex(ym: string) {
  const mn = Number(ym.slice(5, 7))
  return new RegExp(`(?<!\\d)${mn}\\s*월`)
}

export default function ReconcileClient({ dbRows, agents = [], currentYm }: { dbRows: DbRow[]; agents?: string[]; currentYm: string }) {
  const [ym, setYm] = useState(currentYm)
  const [combine, setCombine] = useState(true) // 학생아이디별 합산
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | Status | 'dbonly'>('all')
  const [managerFilter, setManagerFilter] = useState('')
  const [search, setSearch] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setParseError(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const infos: SheetInfo[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name]
        const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        const headers = records.length ? Object.keys(records[0]) : []
        const mgrKey = pickKey(headers, MANAGER_KEYS)
        const idKey = pickKey(headers, ID_KEYS)
        const amtKey = pickKey(headers, AMOUNT_KEYS)
        const nameKey = pickKey(headers, NAME_KEYS)
        const dataCount = idKey
          ? records.filter((r) => String(r[idKey] ?? '').trim() !== '').length
          : 0
        return {
          name,
          records,
          mgrKey,
          idKey,
          amtKey,
          nameKey,
          matchable: !!(mgrKey && idKey && amtKey),
          dataCount,
        }
      })

      // 기본 선택: 선택 년월의 매출 시트 (선승인·환불·보훈·국가유공자 제외). 없으면 대사 가능한 모든 시트.
      const re = monthRegex(ym)
      const monthMatchable = infos.filter((s) => s.matchable && re.test(s.name) && isSalesSheet(s.name))
      const def = (monthMatchable.length ? monthMatchable : infos.filter((s) => s.matchable)).map((s) => s.name)

      setSheets(infos)
      setSelected(new Set(def))
      setFileName(file.name)
      setFilter('all')
      if (!infos.some((s) => s.matchable)) {
        setParseError('담당자·아이디·결제금액 컬럼을 가진 시트를 찾지 못했습니다.')
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '파일 처리 실패')
    } finally {
      setBusy(false)
    }
  }

  function toggleSheet(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }
  function selectMonthSheets(targetYm = ym) {
    const re = monthRegex(targetYm)
    setSelected(new Set(sheets.filter((s) => s.matchable && re.test(s.name) && isSalesSheet(s.name)).map((s) => s.name)))
  }
  function selectAllMatchable() {
    setSelected(new Set(sheets.filter((s) => s.matchable).map((s) => s.name)))
  }
  function changeYm(v: string) {
    if (!v) return
    setYm(v)
    if (sheets.length) selectMonthSheets(v)
  }

  // 대사 계산
  const { results, dbOnly } = useMemo(() => {
    const excelRows: ResultRow[] = []
    for (const s of sheets) {
      if (!selected.has(s.name) || !s.matchable) continue
      for (const row of s.records) {
        const student_id = String(row[s.idKey!] ?? '').trim()
        if (!student_id) continue
        const manager = String(row[s.mgrKey!] ?? '').trim()
        const excelAmount = toNum(row[s.amtKey!])
        const name = s.nameKey ? String(row[s.nameKey] ?? '').trim() : ''
        excelRows.push({ sheet: s.name, manager, student_id, name, excelAmount, dbAmount: null, status: 'missing', owner: null })
      }
    }

    // 선택 년월(결제일자 기준)의 DB만 대사
    const monthDbRows = dbRows.filter((d) => (d.payment_date ?? '').slice(0, 7) === ym)

    // ── 학생별 합산 모드: 학생아이디별로 결제금액을 합쳐 한 줄로 대사 ──
    if (combine) {
      type Ex = { name: string; manager: string; amount: number; count: number; sheets: Set<string> }
      const ex = new Map<string, Ex>()
      for (const r of excelRows) {
        let o = ex.get(r.student_id)
        if (!o) { o = { name: r.name, manager: r.manager, amount: 0, count: 0, sheets: new Set() }; ex.set(r.student_id, o) }
        o.amount += r.excelAmount ?? 0
        o.count++
        o.sheets.add(r.sheet)
        if (!o.name && r.name) o.name = r.name
        if (!o.manager && r.manager) o.manager = r.manager
      }
      type Db = { amount: number; owner: string | null; name: string | null; institution: string | null }
      const db = new Map<string, Db>()
      for (const d of monthDbRows) {
        const id = (d.student_id ?? '').trim()
        if (!id) continue
        let o = db.get(id)
        if (!o) { o = { amount: 0, owner: null, name: null, institution: null }; db.set(id, o) }
        o.amount += d.payment_amount ?? 0
        if (!o.owner && d.owner?.name) o.owner = d.owner.name
        if (!o.name && d.customer_name) o.name = d.customer_name
        if (!o.institution && d.institution) o.institution = d.institution
      }
      const out: ResultRow[] = []
      for (const [id, e] of ex) {
        const label = e.count > 1 ? `${e.count}건 합산` : (Array.from(e.sheets)[0] ?? '')
        const d = db.get(id)
        if (!d) {
          out.push({ sheet: label, manager: e.manager, student_id: id, name: e.name, excelAmount: e.amount, dbAmount: null, status: 'missing', owner: null })
          continue
        }
        const status: Status = Number(d.amount) === Number(e.amount) ? 'matched' : 'mismatch'
        out.push({ sheet: label, manager: e.manager, student_id: id, name: e.name || (d.name ?? ''), excelAmount: e.amount, dbAmount: d.amount, status, owner: d.owner ?? '(소유자 없음)' })
      }
      const leftover: DbRow[] = []
      for (const [id, d] of db) {
        if (ex.has(id)) continue
        leftover.push({ manager: null, student_id: id, payment_amount: d.amount, payment_date: null, customer_name: d.name, institution: d.institution, owner: d.owner ? { name: d.owner } : null })
      }
      return { results: out, dbOnly: leftover }
    }

    // ── 개별 행 모드: 행마다 대사 (멀티셋) ──
    const map = new Map<string, DbRow[]>()
    for (const d of monthDbRows) {
      const key = (d.student_id ?? '').trim()
      if (!key) continue
      const arr = map.get(key)
      if (arr) arr.push({ ...d })
      else map.set(key, [{ ...d }])
    }

    for (const r of excelRows) {
      const arr = map.get(r.student_id)
      if (!arr || arr.length === 0) {
        r.status = 'missing'
        continue
      }
      const idx = arr.findIndex((d) => Number(d.payment_amount) === r.excelAmount)
      const d = idx >= 0 ? arr.splice(idx, 1)[0] : arr.shift()!
      r.status = idx >= 0 ? 'matched' : 'mismatch'
      r.dbAmount = d.payment_amount
      r.owner = d.owner?.name ?? '(소유자 없음)'
      if (!r.name) r.name = d.customer_name ?? ''
    }

    const leftover: DbRow[] = []
    for (const arr of map.values()) leftover.push(...arr)
    return { results: excelRows, dbOnly: leftover }
  }, [sheets, selected, dbRows, ym, combine])

  const summary = useMemo(() => {
    const s = { total: results.length, matched: 0, mismatch: 0, missing: 0 }
    for (const r of results) s[r.status]++
    return s
  }, [results])

  // 계정별 요약 — 매출을 등록한 계정(owner) 기준. 시스템 담당자 계정을 먼저 0으로 노출.
  const byManager = useMemo(() => {
    type Stat = { name: string; entered: number; matched: number; mismatch: number; notInExcel: number; isAgent: boolean }
    const m = new Map<string, Stat>()
    const ensure = (name: string, isAgent = false) => {
      let o = m.get(name)
      if (!o) { o = { name, entered: 0, matched: 0, mismatch: 0, notInExcel: 0, isAgent }; m.set(name, o) }
      if (isAgent) o.isAgent = true
      return o
    }
    for (const a of agents) ensure(a, true)
    for (const r of results) {
      if (r.status === 'matched' || r.status === 'mismatch') {
        const o = ensure(r.owner || NO_OWNER)
        o.entered++
        if (r.status === 'matched') o.matched++
        else o.mismatch++
      }
    }
    for (const d of dbOnly) {
      const o = ensure(d.owner?.name || NO_OWNER)
      o.entered++
      o.notInExcel++
    }
    return Array.from(m.values()).sort(
      (a, b) => Number(b.isAgent) - Number(a.isAgent) || b.entered - a.entered || a.name.localeCompare(b.name),
    )
  }, [results, dbOnly, agents])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = results
    if (managerFilter) base = base.filter((r) => (r.owner ?? '') === managerFilter)
    if (filter === 'matched' || filter === 'mismatch' || filter === 'missing') {
      base = base.filter((r) => r.status === filter)
    }
    if (!q) return base
    return base.filter((r) => `${r.manager} ${r.owner ?? ''} ${r.student_id} ${r.name} ${r.sheet}`.toLowerCase().includes(q))
  }, [results, filter, managerFilter, search])

  async function exportMissing() {
    const XLSX = await import('xlsx')
    const miss = results.filter((r) => r.status === 'missing' || r.status === 'mismatch')
    const data = miss.map((r) => ({
      시트: r.sheet,
      담당자: r.manager,
      학생아이디: r.student_id,
      고객명: r.name,
      '엑셀 결제금액': r.excelAmount ?? '',
      'DB 결제금액': r.dbAmount ?? '',
      상태: r.status === 'missing' ? '누락' : '금액상이',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '누락·상이')
    XLSX.writeFile(wb, '정산대사_누락상이.xlsx')
  }

  const badge = (st: Status) => {
    const m = {
      matched: { bg: '#d1fae5', color: '#065f46', label: '✅ 일치' },
      mismatch: { bg: '#fef3c7', color: '#92400e', label: '⚠️ 금액상이' },
      missing: { bg: '#fee2e2', color: '#b91c1c', label: '❌ 누락' },
    }[st]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', fontSize: 12, fontWeight: 700, borderRadius: 999, background: m.bg, color: m.color }}>
        {m.label}
      </span>
    )
  }

  const hasFile = sheets.length > 0

  return (
    <div style={{ flex: 1, minWidth: 0, background: '#fff' }}>
      <div style={{ padding: '28px 32px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>정산 대사기</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px', fontSize: 14, fontWeight: 700, color: '#fff', background: '#2563eb', borderRadius: 10, cursor: 'pointer' }}>
              {busy ? '분석 중…' : '엑셀 업로드'}
              <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={handleFile} />
            </label>
            {results.length > 0 && (
              <button className={styles.ghostBtn} type="button" onClick={exportMissing}>
                누락·상이 엑셀
              </button>
            )}
          </div>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280' }}>
          엑셀을 올리면 <b>학생아이디 · 결제금액</b> 기준으로, <b>선택한 년월(결제일자)</b>에 등록된 매출과 계정별로 대조합니다. (저장 없이 조회만)
          {fileName && <span style={{ marginLeft: 8, color: '#2563eb' }}>· {fileName}</span>}
        </p>

        {/* 대사 대상 년월 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3a4257' }}>대사 년월</span>
          <input type="month" value={ym} onChange={(e) => changeYm(e.target.value)} style={{ height: 40, padding: '0 12px', fontSize: 14, border: '1px solid #e3e8f0', borderRadius: 10, outline: 'none', fontFamily: 'inherit', color: '#111827' }} />
          {ym !== currentYm && (
            <button className={styles.ghostBtn} type="button" onClick={() => changeYm(currentYm)}>현재월로</button>
          )}
          <span style={{ fontSize: 12.5, color: '#9ca3af' }}>해당 월 결제 건만 대사합니다</span>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#3a4257' }}>
            <button
              type="button"
              onClick={() => setCombine((v) => !v)}
              aria-pressed={combine}
              style={{ width: 40, height: 23, borderRadius: 999, border: 'none', background: combine ? '#2563eb' : '#d1d5db', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .15s' }}
            >
              <span style={{ position: 'absolute', top: 2, left: combine ? 19 : 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
            </button>
            학생별 합산 <span style={{ fontWeight: 400, color: '#9ca3af' }}>(같은 아이디 금액 합치기)</span>
          </label>
        </div>

        {parseError && (
          <p style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, fontSize: 13 }}>{parseError}</p>
        )}

        {/* 시트 선택 */}
        {hasFile && (
          <div style={{ marginBottom: 20, padding: 16, border: '1px solid #e5e7eb', borderRadius: 14, background: '#f9fafb' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <b style={{ fontSize: 14 }}>대사할 시트 선택 <span style={{ color: '#6b7280', fontWeight: 400 }}>({selected.size}개 선택)</span></b>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.ghostBtn} type="button" onClick={() => selectMonthSheets()}>{Number(ym.slice(5, 7))}월 시트만</button>
                <button className={styles.ghostBtn} type="button" onClick={selectAllMatchable}>대사가능 전체</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 160, overflowY: 'auto' }}>
              {sheets.map((s) => (
                <label
                  key={s.name}
                  title={s.matchable ? `담당자:${s.mgrKey} / 아이디:${s.idKey} / 금액:${s.amtKey}` : '대사 불가 (컬럼 미인식)'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12.5,
                    borderRadius: 8, cursor: s.matchable ? 'pointer' : 'not-allowed',
                    border: '1px solid ' + (selected.has(s.name) ? '#2563eb' : '#e5e7eb'),
                    background: selected.has(s.name) ? '#eff6ff' : s.matchable ? '#fff' : '#f3f4f6',
                    color: s.matchable ? '#111827' : '#9ca3af',
                  }}
                >
                  <input type="checkbox" checked={selected.has(s.name)} disabled={!s.matchable} onChange={() => toggleSheet(s.name)} />
                  {s.name}
                  {s.matchable && <span style={{ color: '#6b7280' }}>({s.dataCount})</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: '엑셀 건수', value: summary.total, color: '#111827', key: 'all' as const },
                { label: '✅ 일치', value: summary.matched, color: '#059669', key: 'matched' as const },
                { label: '⚠️ 금액상이', value: summary.mismatch, color: '#d97706', key: 'mismatch' as const },
                { label: '❌ 누락', value: summary.missing, color: '#dc2626', key: 'missing' as const },
                { label: '🔵 DB에만', value: dbOnly.length, color: '#2563eb', key: 'dbonly' as const },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  style={{ textAlign: 'left', padding: '16px 18px', borderRadius: 14, cursor: 'pointer', background: '#fff', border: filter === c.key ? `2px solid ${c.color}` : '1px solid #e5e7eb' }}
                >
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value.toLocaleString('ko-KR')}</div>
                </button>
              ))}
            </div>

            {/* 계정(담당자)별 요약 — 매출을 등록한 계정 기준 */}
            <div style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <b style={{ fontSize: 14 }}>계정별 요약 <span style={{ fontWeight: 400, color: '#6b7280' }}>· 매출 등록 계정 기준 · 담당자 {agents.length}명</span></b>
                {managerFilter && (
                  <button className={styles.ghostBtn} type="button" onClick={() => setManagerFilter('')}>
                    필터 해제: {managerFilter} ✕
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>계정</th>
                      <th className={styles.th}>입력</th>
                      <th className={styles.th}>✅ 일치</th>
                      <th className={styles.th}>⚠️ 금액상이</th>
                      <th className={styles.th}>🔵 엑셀에없음</th>
                      <th className={styles.th}>일치율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byManager.map((m) => {
                      const rate = m.entered ? Math.round((m.matched / m.entered) * 100) : 0
                      const active = managerFilter === m.name
                      return (
                        <tr
                          key={m.name}
                          className={styles.row}
                          onClick={() => setManagerFilter(active ? '' : m.name)}
                          style={{ cursor: 'pointer', background: active ? '#eff6ff' : undefined }}
                        >
                          <td className={styles.td} style={{ fontWeight: 700, color: m.isAgent ? '#111827' : '#9ca3af' }}>{m.name}</td>
                          <td className={styles.td}>{m.entered.toLocaleString('ko-KR')}</td>
                          <td className={styles.td} style={{ color: '#059669' }}>{m.matched}</td>
                          <td className={styles.td} style={{ color: m.mismatch ? '#d97706' : '#9ca3af' }}>{m.mismatch}</td>
                          <td className={styles.td} style={{ color: m.notInExcel ? '#2563eb' : '#9ca3af' }}>{m.notInExcel}</td>
                          <td className={styles.td} style={{ color: rate === 100 && m.entered ? '#059669' : '#6b7280' }}>{m.entered ? `${rate}%` : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="담당자 · 학생아이디 · 고객명 · 시트 검색"
                style={{ width: 340, maxWidth: '100%', height: 42, padding: '0 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none' }}
              />
              {managerFilter && (
                <span style={{ fontSize: 13, color: '#2563eb', fontWeight: 600 }}>담당자: {managerFilter}</span>
              )}
            </div>

            {filter === 'dbonly' ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>담당자</th>
                      <th className={styles.th}>학생아이디</th>
                      <th className={styles.th}>고객명</th>
                      <th className={styles.th}>기관명</th>
                      <th className={styles.th}>DB 결제금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbOnly.length === 0 ? (
                      <tr><td className={styles.empty} colSpan={5}>DB에만 있는 항목이 없습니다.</td></tr>
                    ) : (
                      dbOnly
                        .filter((d) => {
                          if (managerFilter && (d.owner?.name || NO_OWNER) !== managerFilter) return false
                          const q = search.trim().toLowerCase()
                          if (!q) return true
                          return `${d.manager ?? ''} ${d.student_id ?? ''} ${d.customer_name ?? ''}`.toLowerCase().includes(q)
                        })
                        .map((d, i) => (
                          <tr className={styles.row} key={i}>
                            <td className={styles.td}>{d.manager ?? '-'}</td>
                            <td className={styles.td}>
                              <span title={d.student_id ?? ''} style={{ display: 'inline-block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{d.student_id ?? '-'}</span>
                            </td>
                            <td className={styles.td}>{d.customer_name ?? '-'}</td>
                            <td className={styles.td}>{d.institution ?? '-'}</td>
                            <td className={`${styles.td} ${styles.num}`}>{won(d.payment_amount)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>시트</th>
                      <th className={styles.th}>담당자</th>
                      <th className={styles.th}>학생아이디</th>
                      <th className={styles.th}>고객명</th>
                      <th className={styles.th}>엑셀 금액</th>
                      <th className={styles.th}>DB 금액</th>
                      <th className={styles.th}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td className={styles.empty} colSpan={7}>해당 항목이 없습니다.</td></tr>
                    ) : (
                      filtered.slice(0, 1000).map((r, i) => (
                        <tr className={styles.row} key={i}>
                          <td className={styles.td} style={{ color: '#6b7280', fontSize: 12 }}>{r.sheet}</td>
                          <td className={styles.td}>{r.manager || '-'}</td>
                          <td className={styles.td}>
                            <span title={r.student_id} style={{ display: 'inline-block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{r.student_id || '-'}</span>
                          </td>
                          <td className={styles.td}>{r.name || '-'}</td>
                          <td className={`${styles.td} ${styles.num}`}>{won(r.excelAmount)}</td>
                          <td className={`${styles.td} ${styles.num}`} style={r.status === 'mismatch' ? { color: '#d97706', fontWeight: 700 } : undefined}>{won(r.dbAmount)}</td>
                          <td className={styles.td}>{badge(r.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {filtered.length > 1000 && (
                  <p style={{ padding: '10px 14px', margin: 0, fontSize: 12, color: '#9ca3af' }}>… 상위 1,000행만 표시 (전체 {filtered.length.toLocaleString('ko-KR')}행은 “누락·상이 엑셀”로 내려받으세요)</p>
                )}
              </div>
            )}
          </>
        )}

        {!hasFile && !parseError && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af', border: '1px dashed #d1d5db', borderRadius: 16 }}>
            엑셀 파일을 업로드하면 대사 결과가 표시됩니다.
          </div>
        )}
      </div>
    </div>
  )
}
