'use client'

import { useCallback, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from '@/styles/crud.module.css'
import ui from './reconcile.module.css'

export type DbRow = {
  id: string
  manager: string | null
  student_id: string | null
  payment_amount: number | null
  payment_date: string | null // 결제일자 (월 필터 기준)
  customer_name: string | null
  institution: string | null
  owner: { name: string | null } | null // 등록한 계정
}

export type AgentProfile = { id: string; name: string }

type Status = 'matched' | 'mismatch' | 'missing'

type SheetInfo = {
  name: string
  records: Record<string, unknown>[]
  mgrKey: string | null
  idKey: string | null
  amtKey: string | null
  nameKey: string | null
  dateKey: string | null
  subjKey: string | null
  priceKey: string | null
  instKey: string | null
  matchable: boolean
  dataCount: number
}

// 누락 건을 학습자 신규로 등록할 때 함께 채울 엑셀 부가 정보
type Extra = {
  payment_date: string | null
  subject_count: number | null
  unit_price: number | null
  institution: string | null
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
  dbIds: string[] // 매칭된 DB행 id (합산 모드는 여러 개일 수 있음)
  extra: Extra
}

const MANAGER_KEYS = ['담당자', '직원명', '상담사', '매니저', '사원명']
const ID_KEYS = ['학생아이디', '아이디', 'id', '학생ID', '회원아이디', '학생 아이디']
const AMOUNT_KEYS = ['결제금액', '매출', '금액', '결제 금액', '결제금액(원)']
const NAME_KEYS = ['고객명', '이름', '학생명', '성명', '학생 이름']
const DATE_KEYS = ['결제일자', '결제일', '입금일자', '입금일']
const SUBJECT_KEYS = ['과목수', '과목 수']
const PRICE_KEYS = ['단가']
const INSTITUTION_KEYS = ['교육원', '기관명', '기관']

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
const pad2 = (n: number) => String(n).padStart(2, '0')

// 엑셀 날짜 값(시리얼 숫자 또는 문자열) → 'YYYY-MM-DD'. 실패 시 null.
function parseExcelDate(v: unknown, fallbackYear: string): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`
  m = s.match(/(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/)
  if (m) return `${fallbackYear}-${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`
  return null
}

const NO_OWNER = '(소유자 없음)'

const isSalesSheet = (n: string) => !/(선승인|환불|보훈|국가유공자)/.test(n)
function monthRegex(ym: string) {
  const mn = Number(ym.slice(5, 7))
  return new RegExp(`(?<!\\d)${mn}\\s*월`)
}

export default function ReconcileClient({
  dbRows,
  agents = [],
  currentYm,
  adminId,
  adminName,
}: {
  dbRows: DbRow[]
  agents?: AgentProfile[]
  currentYm: string
  adminId: string
  adminName: string
}) {
  const [supabase] = useState(() => createClient())
  const [db, setDb] = useState<DbRow[]>(dbRows)
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
  const [dragOver, setDragOver] = useState(false)
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const agentNames = useMemo(() => agents.map((a) => a.name), [agents])

  const parseFile = useCallback(async (file: File) => {
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
          dateKey: pickKey(headers, DATE_KEYS),
          subjKey: pickKey(headers, SUBJECT_KEYS),
          priceKey: pickKey(headers, PRICE_KEYS),
          instKey: pickKey(headers, INSTITUTION_KEYS),
          matchable: !!(mgrKey && idKey && amtKey),
          dataCount,
        }
      })

      // 시트명에서 월 자동 인식: 선택 년월의 시트가 없고 다른 월 시트가 있으면 그 월로 전환
      let targetYm = ym
      const monthsInFile = Array.from({ length: 12 }, (_, i) => i + 1).filter((mn) =>
        infos.some((s) => s.matchable && isSalesSheet(s.name) && new RegExp(`(?<!\\d)${mn}\\s*월`).test(s.name)),
      )
      if (monthsInFile.length && !monthsInFile.includes(Number(ym.slice(5, 7)))) {
        const mn = Math.max(...monthsInFile)
        targetYm = `${ym.slice(0, 4)}-${pad2(mn)}`
        setYm(targetYm)
        setNotice(`시트명에서 ${mn}월을 인식해 대사 년월을 ${targetYm}로 변경했습니다.`)
      }

      // 기본 선택: 선택 년월의 매출 시트 (선승인·환불·보훈·국가유공자 제외). 없으면 대사 가능한 모든 시트.
      const re = monthRegex(targetYm)
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
  }, [ym])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await parseFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const file = Array.from(e.dataTransfer.files).find((f) => /\.(xlsx|xls)$/i.test(f.name))
    if (!file) {
      setParseError('엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.')
      return
    }
    void parseFile(file)
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
        const extra: Extra = {
          payment_date: s.dateKey ? parseExcelDate(row[s.dateKey], ym.slice(0, 4)) : null,
          subject_count: s.subjKey ? toNum(row[s.subjKey]) : null,
          unit_price: s.priceKey ? toNum(row[s.priceKey]) : null,
          institution: s.instKey ? String(row[s.instKey] ?? '').trim() || null : null,
        }
        excelRows.push({ sheet: s.name, manager, student_id, name, excelAmount, dbAmount: null, status: 'missing', owner: null, dbIds: [], extra })
      }
    }

    // 선택 년월(결제일자 기준)의 DB만 대사
    const monthDbRows = db.filter((d) => (d.payment_date ?? '').slice(0, 7) === ym)

    // ── 학생별 합산 모드: 학생아이디별로 결제금액을 합쳐 한 줄로 대사 ──
    if (combine) {
      type Ex = { name: string; manager: string; amount: number; count: number; sheets: Set<string>; extra: Extra }
      const ex = new Map<string, Ex>()
      for (const r of excelRows) {
        let o = ex.get(r.student_id)
        if (!o) { o = { name: r.name, manager: r.manager, amount: 0, count: 0, sheets: new Set(), extra: { ...r.extra } }; ex.set(r.student_id, o) }
        o.amount += r.excelAmount ?? 0
        o.count++
        o.sheets.add(r.sheet)
        if (!o.name && r.name) o.name = r.name
        if (!o.manager && r.manager) o.manager = r.manager
        if (!o.extra.payment_date && r.extra.payment_date) o.extra.payment_date = r.extra.payment_date
        if (!o.extra.institution && r.extra.institution) o.extra.institution = r.extra.institution
        // 여러 건 합산이면 과목수·단가는 한 행 값이 아니므로 비움
        if (o.count > 1) { o.extra.subject_count = null; o.extra.unit_price = null }
      }
      type Db = { amount: number; owner: string | null; name: string | null; institution: string | null; ids: string[] }
      const dbMap = new Map<string, Db>()
      for (const d of monthDbRows) {
        const id = (d.student_id ?? '').trim()
        if (!id) continue
        let o = dbMap.get(id)
        if (!o) { o = { amount: 0, owner: null, name: null, institution: null, ids: [] }; dbMap.set(id, o) }
        o.amount += d.payment_amount ?? 0
        o.ids.push(d.id)
        if (!o.owner && d.owner?.name) o.owner = d.owner.name
        if (!o.name && d.customer_name) o.name = d.customer_name
        if (!o.institution && d.institution) o.institution = d.institution
      }
      const out: ResultRow[] = []
      for (const [id, e] of ex) {
        const label = e.count > 1 ? `${e.count}건 합산` : (Array.from(e.sheets)[0] ?? '')
        const d = dbMap.get(id)
        if (!d) {
          out.push({ sheet: label, manager: e.manager, student_id: id, name: e.name, excelAmount: e.amount, dbAmount: null, status: 'missing', owner: null, dbIds: [], extra: e.extra })
          continue
        }
        const status: Status = Number(d.amount) === Number(e.amount) ? 'matched' : 'mismatch'
        out.push({ sheet: label, manager: e.manager, student_id: id, name: e.name || (d.name ?? ''), excelAmount: e.amount, dbAmount: d.amount, status, owner: d.owner ?? '(소유자 없음)', dbIds: d.ids, extra: e.extra })
      }
      const leftover: DbRow[] = []
      for (const [id, d] of dbMap) {
        if (ex.has(id)) continue
        leftover.push({ id: d.ids[0] ?? '', manager: null, student_id: id, payment_amount: d.amount, payment_date: null, customer_name: d.name, institution: d.institution, owner: d.owner ? { name: d.owner } : null })
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
      r.dbIds = [d.id]
      if (!r.name) r.name = d.customer_name ?? ''
    }

    const leftover: DbRow[] = []
    for (const arr of map.values()) leftover.push(...arr)
    return { results: excelRows, dbOnly: leftover }
  }, [sheets, selected, db, ym, combine])

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
    for (const a of agentNames) ensure(a, true)
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
  }, [results, dbOnly, agentNames])

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

  const rowKey = (r: ResultRow) => `${r.student_id}|${r.sheet}|${r.excelAmount ?? ''}`

  function setRowBusyFor(keys: string[], on: boolean) {
    setRowBusy((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (on) next.add(k)
        else next.delete(k)
      }
      return next
    })
  }

  // 금액상이 → DB 결제금액을 엑셀 금액으로 수정 (단일 DB행 매칭 건만)
  async function fixAmount(r: ResultRow) {
    if (r.dbIds.length !== 1 || r.excelAmount == null) return
    const id = r.dbIds[0]
    const k = rowKey(r)
    setRowBusyFor([k], true)
    setActionError(null)
    try {
      const { error } = await supabase.from('sales').update({ payment_amount: r.excelAmount }).eq('id', id)
      if (error) throw error
      setDb((prev) => prev.map((d) => (d.id === id ? { ...d, payment_amount: r.excelAmount } : d)))
      setNotice(`${r.name || r.student_id} 결제금액을 ${won(r.excelAmount)}원으로 수정했습니다.`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '금액 수정에 실패했습니다.')
    } finally {
      setRowBusyFor([k], false)
    }
  }

  // 누락 → 학습자 신규(sales)로 등록. 담당자명이 계정과 일치하면 그 계정 소유로.
  async function registerMissing(rows: ResultRow[]) {
    const targets = rows.filter((r) => r.status === 'missing' && r.student_id)
    if (targets.length === 0) return
    if (targets.length > 1 && !window.confirm(`누락 ${targets.length}건을 학습자 신규로 등록할까요?\n(담당자명이 계정과 일치하면 해당 계정 소유로 등록됩니다)`)) return
    const keys = targets.map(rowKey)
    setRowBusyFor(keys, true)
    setActionError(null)
    try {
      const payloads = targets.map((r) => {
        const agent = agents.find((a) => a.name === r.manager.trim())
        return {
          owner_id: agent?.id ?? adminId,
          manager: r.manager || null,
          student_id: r.student_id,
          customer_name: r.name || null,
          payment_amount: r.excelAmount,
          payment_date: r.extra.payment_date ?? `${ym}-01`,
          subject_count: r.extra.subject_count,
          unit_price: r.extra.unit_price,
          institution: r.extra.institution,
          special_note: '정산대사 누락분 등록',
        }
      })
      const { data, error } = await supabase.from('sales').insert(payloads).select('id')
      if (error) throw error
      const inserted: DbRow[] = payloads.map((p, i) => {
        const agent = agents.find((a) => a.id === p.owner_id)
        return {
          id: data?.[i]?.id ?? `tmp-${i}`,
          manager: p.manager,
          student_id: p.student_id,
          payment_amount: p.payment_amount,
          payment_date: p.payment_date,
          customer_name: p.customer_name,
          institution: p.institution,
          owner: { name: agent?.name ?? adminName },
        }
      })
      setDb((prev) => [...prev, ...inserted])
      setNotice(`누락 ${targets.length}건을 학습자 신규로 등록했습니다.`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '등록에 실패했습니다.')
    } finally {
      setRowBusyFor(keys, false)
    }
  }

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
      matched: { cls: ui.badgeMatched, label: '일치' },
      mismatch: { cls: ui.badgeMismatch, label: '금액상이' },
      missing: { cls: ui.badgeMissing, label: 'DB에 없음' },
    }[st]
    return (
      <span className={`${ui.badge} ${m.cls}`}>
        <span className={ui.badgeDot} />
        {m.label}
      </span>
    )
  }

  const hasFile = sheets.length > 0
  const missingInView = filtered.filter((r) => r.status === 'missing')

  const stats = [
    { label: '엑셀 건수', value: summary.total, color: '#111827', key: 'all' as const },
    { label: '일치', value: summary.matched, color: '#059669', key: 'matched' as const },
    { label: '금액상이', value: summary.mismatch, color: '#d97706', key: 'mismatch' as const },
    { label: 'DB에 없음', value: summary.missing, color: '#dc2626', key: 'missing' as const },
    { label: '엑셀에 없음', value: dbOnly.length, color: '#2563eb', key: 'dbonly' as const },
  ]

  return (
    <div
      className={`${ui.main} ${dragOver ? ui.mainDrag : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={handleDrop}
    >
      <div className={ui.inner}>
        {/* 헤더 */}
        <div className={ui.head}>
          <div>
            <h1 className={ui.title}>정산 대사</h1>
            <p className={ui.desc}>
              페이앱 · 계좌이체 등에서 내려받은 정산 엑셀을 올리면, 매출파일에 등록된 데이터와{' '}
              <b>학생아이디 · 결제금액</b> 기준으로 계정별 대조합니다. 파일은 화면에 끌어다 놓아도 됩니다.
              {fileName && <span className={ui.fileName}> · {fileName}</span>}
            </p>
          </div>
          <div className={ui.headActions}>
            {missingInView.length > 0 && (
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() => registerMissing(missingInView)}
                title="현재 필터에 보이는 누락 건을 학습자 신규로 일괄 등록"
              >
                누락 {missingInView.length}건 신규 등록
              </button>
            )}
            {results.length > 0 && (
              <button className={styles.ghostBtn} type="button" onClick={exportMissing}>
                누락·상이 엑셀
              </button>
            )}
            <label className={ui.uploadBtn}>
              {busy ? '분석 중…' : '엑셀 업로드'}
              <input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={handleFile} />
            </label>
          </div>
        </div>

        {/* 대사 옵션 */}
        <div className={ui.optionBar}>
          <span className={ui.optionLabel}>대사 년월</span>
          <input className={ui.monthInput} type="month" value={ym} onChange={(e) => changeYm(e.target.value)} />
          {ym !== currentYm && (
            <button className={styles.ghostBtn} type="button" onClick={() => changeYm(currentYm)}>전월로</button>
          )}
          <span className={ui.optionHint}>해당 월 결제 건만 대사합니다</span>
          <label className={ui.toggleWrap}>
            <button
              type="button"
              className={`${ui.toggle} ${combine ? ui.toggleOn : ''}`}
              onClick={() => setCombine((v) => !v)}
              aria-pressed={combine}
            >
              <span className={ui.toggleKnob} />
            </button>
            학생별 합산 <span className={ui.optionHint}>(같은 아이디 금액 합치기)</span>
          </label>
        </div>

        {/* 알림 */}
        {notice && (
          <p className={`${ui.banner} ${ui.bannerInfo}`}>
            <span>{notice}</span>
            <button type="button" className={ui.bannerClose} onClick={() => setNotice(null)}>✕</button>
          </p>
        )}
        {actionError && (
          <p className={`${ui.banner} ${ui.bannerError}`}>
            <span>{actionError}</span>
            <button type="button" className={ui.bannerClose} onClick={() => setActionError(null)}>✕</button>
          </p>
        )}
        {parseError && <p className={`${ui.banner} ${ui.bannerError}`}><span>{parseError}</span></p>}

        {/* 시트 선택 */}
        {hasFile && (
          <div className={ui.section}>
            <div className={ui.sectionHead}>
              <span className={ui.sectionTitle}>
                대사할 시트 <span className={ui.sectionSub}>({selected.size}개 선택)</span>
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={styles.ghostBtn} type="button" onClick={() => selectMonthSheets()}>{Number(ym.slice(5, 7))}월 시트만</button>
                <button className={styles.ghostBtn} type="button" onClick={selectAllMatchable}>대사가능 전체</button>
              </div>
            </div>
            <div className={ui.sectionBody}>
              <div className={ui.sheetChips}>
                {sheets.map((s) => (
                  <label
                    key={s.name}
                    title={s.matchable ? `담당자:${s.mgrKey} / 아이디:${s.idKey} / 금액:${s.amtKey}` : '대사 불가 (컬럼 미인식)'}
                    className={`${ui.sheetChip} ${selected.has(s.name) ? ui.sheetChipOn : ''} ${!s.matchable ? ui.sheetChipOff : ''}`}
                  >
                    <input type="checkbox" checked={selected.has(s.name)} disabled={!s.matchable} onChange={() => toggleSheet(s.name)} />
                    {s.name}
                    {s.matchable && <span className={ui.sheetCount}>({s.dataCount})</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            {/* 요약 카드 */}
            <div className={ui.stats}>
              {stats.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  className={`${ui.stat} ${filter === c.key ? ui.statActive : ''}`}
                  style={{ color: c.color }}
                >
                  <div className={ui.statLabel}>{c.label}</div>
                  <div className={ui.statValue}>{c.value.toLocaleString('ko-KR')}</div>
                </button>
              ))}
            </div>

            {/* 계정별 요약 — 매출을 등록한 계정 기준 */}
            <div className={ui.section}>
              <div className={ui.sectionHead}>
                <span className={ui.sectionTitle}>
                  계정별 요약 <span className={ui.sectionSub}>· 매출 등록 계정 기준 · 담당자 {agents.length}명</span>
                </span>
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
                      <th className={styles.th}>일치</th>
                      <th className={styles.th}>금액상이</th>
                      <th className={styles.th}>엑셀에 없음</th>
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

            {/* 검색 */}
            <div className={ui.filterRow}>
              <input
                className={ui.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="담당자 · 학생아이디 · 고객명 · 시트 검색"
              />
              {managerFilter && <span className={ui.activeFilter}>담당자: {managerFilter}</span>}
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
                      <tr><td className={styles.empty} colSpan={5}>엑셀에 없는 DB 항목이 없습니다.</td></tr>
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
                              <span className={ui.mono} title={d.student_id ?? ''}>{d.student_id ?? '-'}</span>
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
                      <th className={styles.th}>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td className={styles.empty} colSpan={8}>해당 항목이 없습니다.</td></tr>
                    ) : (
                      filtered.slice(0, 1000).map((r, i) => {
                        const k = rowKey(r)
                        const isBusy = rowBusy.has(k)
                        return (
                          <tr className={styles.row} key={i}>
                            <td className={styles.td} style={{ color: '#6b7280', fontSize: 12 }}>{r.sheet}</td>
                            <td className={styles.td}>{r.manager || '-'}</td>
                            <td className={styles.td}>
                              <span className={ui.mono} title={r.student_id}>{r.student_id || '-'}</span>
                            </td>
                            <td className={styles.td}>{r.name || '-'}</td>
                            <td className={`${styles.td} ${styles.num}`}>{won(r.excelAmount)}</td>
                            <td className={`${styles.td} ${styles.num}`} style={r.status === 'mismatch' ? { color: '#d97706', fontWeight: 700 } : undefined}>{won(r.dbAmount)}</td>
                            <td className={styles.td}>{badge(r.status)}</td>
                            <td className={styles.td}>
                              {r.status === 'mismatch' && (
                                r.dbIds.length === 1 ? (
                                  <button
                                    type="button"
                                    className={`${styles.ghostBtn} ${ui.rowBtn}`}
                                    disabled={isBusy}
                                    onClick={() => fixAmount(r)}
                                    title={`DB 결제금액을 엑셀 금액(${won(r.excelAmount)}원)으로 수정`}
                                  >
                                    {isBusy ? '수정 중…' : '금액 맞추기'}
                                  </button>
                                ) : (
                                  <span className={ui.muted} title="DB에 여러 건이 합산된 항목이라 개별 수정이 필요합니다 (학생별 합산을 끄고 처리하세요)" style={{ fontSize: 12, cursor: 'help' }}>합산 건</span>
                                )
                              )}
                              {r.status === 'missing' && (
                                <button
                                  type="button"
                                  className={`${styles.ghostBtn} ${ui.rowBtn}`}
                                  disabled={isBusy}
                                  onClick={() => registerMissing([r])}
                                  title="이 건을 학습자 신규(매출)로 등록"
                                >
                                  {isBusy ? '등록 중…' : '신규 등록'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                {filtered.length > 1000 && (
                  <p className={ui.overflowNote}>… 상위 1,000행만 표시 (전체 {filtered.length.toLocaleString('ko-KR')}행은 “누락·상이 엑셀”로 내려받으세요)</p>
                )}
              </div>
            )}
          </>
        )}

        {!hasFile && !parseError && (
          <div className={`${ui.empty} ${dragOver ? ui.emptyDrag : ''}`}>
            <div className={ui.emptyTitle}>정산 엑셀을 업로드하거나 여기로 끌어다 놓으세요</div>
            페이앱 · 계좌이체 등에서 내려받은 파일을 올리면 매출파일 데이터와 대조한 결과가 표시됩니다.
          </div>
        )}
      </div>
    </div>
  )
}
