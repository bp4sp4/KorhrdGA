'use client'

import { useMemo, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { ko } from 'date-fns/locale'
import {
  addDays, startOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear,
  addMonths, differenceInCalendarDays,
  isSameDay, isAfter,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './DateRangeCalendar.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

export interface DateRangeCalendarProps {
  /** 초기 선택 범위 (비제어 기본값) */
  defaultValue?: DateRange
  /** 제어형 범위 값 */
  value?: DateRange
  /** 범위 변경 시 호출 (실시간) */
  onChange?: (range: DateRange | undefined) => void
  /** [완료] 클릭 시 호출 */
  onConfirm?: (range: DateRange | undefined) => void
  /** [초기화] 클릭 시 호출 */
  onReset?: () => void
  /** 최대 선택 기간(개월). 기본 6개월 */
  maxRangeMonths?: number
  /** 기준일 — 오늘/분기/상반기 계산에 사용. 기본 new Date() */
  referenceDate?: Date
  /**
   * 상단 프리셋 종류
   *  - 'month'   : 오늘 / 전일 / 주간 / 당월 / 전월 / 전전월 (기본)
   *  - 'quarter' : 오늘 / 전일 / 주간 / 1~4분기 / 상반기 / 하반기
   */
  variant?: 'month' | 'quarter'
}

type Preset =
  | { key: string; label: string; build: (ref: Date) => DateRange; noClamp?: boolean }

// ─────────────────────────────────────────────────────────────────────────────
// 프리셋
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_VARIANT_PRESETS: Preset[] = [
  { key: 'today',     label: '오늘',   build: (r) => ({ from: startOfDay(r), to: startOfDay(r) }) },
  { key: 'yesterday', label: '전일',   build: (r) => { const y = addDays(startOfDay(r), -1); return { from: y, to: y } } },
  { key: 'week',      label: '주간',   build: (r) => ({ from: startOfWeek(r, { weekStartsOn: 0 }), to: endOfWeek(r, { weekStartsOn: 0 }) }) },
  { key: 'thisMonth', label: '당월',   build: (r) => ({ from: startOfMonth(r), to: endOfMonth(r) }) },
  { key: 'lastMonth', label: '전월',   build: (r) => { const d = addMonths(r, -1); return { from: startOfMonth(d), to: endOfMonth(d) } } },
  { key: 'prevPrev',  label: '전전월', build: (r) => { const d = addMonths(r, -2); return { from: startOfMonth(d), to: endOfMonth(d) } } },
  { key: 'wholeYear', label: '전체',   build: (r) => ({ from: startOfYear(r), to: endOfYear(r) }), noClamp: true },
]

const QUARTER_VARIANT_PRESETS: Preset[] = [
  { key: 'today',     label: '오늘',   build: (r) => ({ from: startOfDay(r), to: startOfDay(r) }) },
  { key: 'yesterday', label: '전일',   build: (r) => { const y = addDays(startOfDay(r), -1); return { from: y, to: y } } },
  { key: 'week',      label: '주간',   build: (r) => ({ from: startOfWeek(r, { weekStartsOn: 0 }), to: endOfWeek(r, { weekStartsOn: 0 }) }) },
  { key: 'q1',        label: '1분기',  build: (r) => ({ from: startOfQuarter(new Date(r.getFullYear(), 0, 1)), to: endOfQuarter(new Date(r.getFullYear(), 0, 1)) }) },
  { key: 'q2',        label: '2분기',  build: (r) => ({ from: startOfQuarter(new Date(r.getFullYear(), 3, 1)), to: endOfQuarter(new Date(r.getFullYear(), 3, 1)) }) },
  { key: 'q3',        label: '3분기',  build: (r) => ({ from: startOfQuarter(new Date(r.getFullYear(), 6, 1)), to: endOfQuarter(new Date(r.getFullYear(), 6, 1)) }) },
  { key: 'q4',        label: '4분기',  build: (r) => ({ from: startOfQuarter(new Date(r.getFullYear(), 9, 1)), to: endOfQuarter(new Date(r.getFullYear(), 9, 1)) }) },
  { key: 'h1',        label: '상반기', build: (r) => ({ from: startOfYear(r), to: endOfMonth(new Date(r.getFullYear(), 5, 1)) }) },
  { key: 'h2',        label: '하반기', build: (r) => ({ from: startOfMonth(new Date(r.getFullYear(), 6, 1)), to: endOfYear(r) }) },
  { key: 'wholeYear', label: '전체',   build: (r) => ({ from: startOfYear(r), to: endOfYear(r) }), noClamp: true },
]

const MONTH_PRESETS: Preset[] = Array.from({ length: 12 }, (_, i) => ({
  key: `m${i + 1}`,
  label: `${i + 1}월`,
  build: (r) => {
    const d = new Date(r.getFullYear(), i, 1)
    return { from: startOfMonth(d), to: endOfMonth(d) }
  },
}))

// ─────────────────────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────────────────────

function rangeDays(r?: DateRange): number {
  if (!r?.from || !r?.to) return 0
  return differenceInCalendarDays(r.to, r.from) + 1
}

function rangesEqual(a?: DateRange, b?: DateRange): boolean {
  if (!a || !b) return a === b
  const fromEq = (!a.from && !b.from) || (a.from && b.from && isSameDay(a.from, b.from))
  const toEq   = (!a.to   && !b.to)   || (a.to   && b.to   && isSameDay(a.to, b.to))
  return Boolean(fromEq && toEq)
}

function clampRangeByMax(r: DateRange | undefined, maxMonths: number): DateRange | undefined {
  if (!r?.from || !r?.to) return r
  const limit = addDays(addMonths(r.from, maxMonths), -1)
  if (isAfter(r.to, limit)) return { from: r.from, to: limit }
  return r
}

// ─────────────────────────────────────────────────────────────────────────────
// DayPicker 클래스 매핑 (기존 Calendar와 동일한 스타일 사용)
// ─────────────────────────────────────────────────────────────────────────────

const dpClassNames: React.ComponentProps<typeof DayPicker>['classNames'] = {
  root:            styles.dp_root,
  months:          styles.dp_months,
  month:           styles.dp_month,
  month_caption:   styles.dp_caption,
  caption_label:   styles.dp_caption_label,
  nav:             styles.dp_nav,
  button_previous: styles.dp_nav_btn,
  button_next:     styles.dp_nav_btn,
  month_grid:      styles.dp_grid,
  weekdays:        styles.dp_weekdays,
  weekday:         styles.dp_weekday,
  week:            styles.dp_week,
  day:             styles.dp_day,
  day_button:      styles.dp_day_button,
  selected:        styles.dp_selected,
  today:           styles.dp_today,
  outside:         styles.dp_outside,
  disabled:        styles.dp_disabled,
  hidden:          styles.dp_hidden,
  range_start:     styles.dp_range_start,
  range_end:       styles.dp_range_end,
  range_middle:    styles.dp_range_middle,
  chevron:         styles.dp_chevron,
}

function NavChevron({ orientation }: { orientation?: 'left' | 'right' | 'up' | 'down' }) {
  if (orientation === 'left') return <ChevronLeft size={14} />
  return <ChevronRight size={14} />
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

export function DateRangeCalendar({
  defaultValue,
  value,
  onChange,
  onConfirm,
  onReset,
  maxRangeMonths = 6,
  referenceDate,
  variant = 'month',
}: DateRangeCalendarProps) {
  const ref = useMemo(() => referenceDate ?? new Date(), [referenceDate])
  const isControlled = value !== undefined

  // variant에 따라 상단 프리셋 선택
  const TOP_PRESETS: Preset[] = variant === 'quarter'
    ? QUARTER_VARIANT_PRESETS
    : MONTH_VARIANT_PRESETS

  const [internal, setInternal] = useState<DateRange | undefined>(defaultValue)
  const range = isControlled ? value : internal

  // 달력이 표시 중인 '왼쪽 월' (numberOfMonths=2 이므로 이 달 + 다음 달이 보임)
  const [displayMonth, setDisplayMonth] = useState<Date>(
    startOfMonth(defaultValue?.from ?? value?.from ?? ref)
  )

  // 정확한 월 단위 상한은 clampRangeByMax가 처리. max prop은 러프 가이드.
  const maxDays = maxRangeMonths * 31

  function setRange(next: DateRange | undefined, opts?: { noClamp?: boolean }) {
    const final = opts?.noClamp ? next : clampRangeByMax(next, maxRangeMonths)
    if (!isControlled) setInternal(final)
    onChange?.(final)
  }

  function applyPreset(p: Preset) {
    const next = p.build(ref)
    setRange(next, { noClamp: p.noClamp })
    // 프리셋 선택 시 달력을 해당 범위의 시작 월로 이동
    if (next?.from) setDisplayMonth(startOfMonth(next.from))
  }

  function handleReset() {
    setRange(undefined)
    onReset?.()
  }

  function handleConfirm() {
    onConfirm?.(range)
  }

  /** 선택된 범위와 정확히 일치하는 프리셋 하나만 활성 */
  const activeKeys = useMemo(() => {
    const set = new Set<string>()
    if (!range?.from || !range?.to) return set
    const all = [...TOP_PRESETS, ...MONTH_PRESETS]
    const exact = all.find((p) => rangesEqual(p.build(ref), range))
    if (exact) set.add(exact.key)
    return set
  }, [range, ref])

  const days = rangeDays(range)

  return (
    <div className={styles.root}>
      {/* 상단 프리셋 */}
      <div className={styles.presetRow}>
        {TOP_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.presetBtn} ${activeKeys.has(p.key) ? styles.presetBtnActive : ''}`}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 월 프리셋 */}
      <div className={styles.presetRow}>
        {MONTH_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`${styles.presetBtn} ${activeKeys.has(p.key) ? styles.presetBtnActive : ''}`}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 2개월 달력 */}
      <div className={styles.calendarWrap}>
        <DayPicker
          mode="range"
          locale={ko}
          numberOfMonths={2}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={range}
          onSelect={(r) => setRange(r)}
          classNames={dpClassNames}
          showOutsideDays
          components={{
            Chevron: NavChevron,
            // 더블 chevron (<< >>) — 월 전후 이동 버튼은 react-day-picker가 제공 안 하므로 UI에서 생략
          }}
          max={days > maxDays ? undefined : maxDays}
        />
      </div>

      {/* 푸터 */}
      <div className={styles.footer}>
        <div className={styles.summary}>
          선택기간 : <strong>{days}일</strong>
          
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnGhost} onClick={handleReset}>
            초기화
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleConfirm}>
            완료
          </button>
        </div>
      </div>

    </div>
  )
}

export type { DateRange }
