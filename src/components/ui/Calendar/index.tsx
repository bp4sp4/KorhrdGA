'use client'

import { DayPicker, type DateRange, type Matcher } from 'react-day-picker'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import styles from './Calendar.module.css'

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarBaseProps {
  /** 비활성화할 날짜 (react-day-picker Matcher 형식) */
  disabled?: Matcher | Matcher[]
  /** value가 없을 때 처음 표시할 월 */
  defaultMonth?: Date
}

export interface CalendarSingleProps extends CalendarBaseProps {
  mode?: 'single'
  value?: Date
  onChange?: (date: Date | undefined) => void
}

export interface CalendarRangeProps extends CalendarBaseProps {
  mode: 'range'
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
}

export type CalendarProps = CalendarSingleProps | CalendarRangeProps

// ─────────────────────────────────────────────────────────────────────────────
// CSS Modules 클래스 매핑
// ─────────────────────────────────────────────────────────────────────────────

const classNames: React.ComponentProps<typeof DayPicker>['classNames'] = {
  root:            styles.root,
  months:          styles.months,
  month:           styles.month,
  month_caption:   styles.month_caption,
  caption_label:   styles.caption_label,
  dropdowns:       styles.dropdowns,
  dropdown:        styles.dropdown,
  dropdown_root:   styles.dropdown_root,
  dropdown_month:  styles.dropdown_month,
  dropdown_year:   styles.dropdown_year,
  nav:             styles.nav,
  button_previous: styles.nav_btn,
  button_next:     styles.nav_btn,
  month_grid:      styles.month_grid,
  weekdays:        styles.weekdays,
  weekday:         styles.weekday,
  week:            styles.week,
  day:             styles.day,
  day_button:      styles.day_button,
  selected:        styles.day_selected,
  today:           styles.day_today,
  outside:         styles.day_outside,
  disabled:        styles.day_disabled,
  hidden:          styles.day_hidden,
  range_start:     styles.day_range_start,
  range_end:       styles.day_range_end,
  range_middle:    styles.day_range_middle,
  focused:         styles.day_focused,
  chevron:         styles.chevron,
}

// ─────────────────────────────────────────────────────────────────────────────
// 네비게이션 화살표
// ─────────────────────────────────────────────────────────────────────────────

function NavChevron({ orientation }: { orientation?: string }) {
  if (orientation === 'left') return <ChevronLeft size={13} />
  if (orientation === 'down') return <ChevronDown size={11} className={styles.dropdown_chevron} />
  return <ChevronRight size={13} />
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const START_MONTH = new Date(2020, 0)
const END_MONTH   = new Date(2035, 11)

export function Calendar(props: CalendarProps) {
  const { disabled, defaultMonth, mode = 'single' } = props

  const baseProps = {
    locale: ko,
    classNames,
    captionLayout: 'dropdown' as const,
    startMonth: START_MONTH,
    endMonth: END_MONTH,
    components: { Chevron: NavChevron },
    ...(disabled !== undefined && { disabled }),
    ...(defaultMonth !== undefined && { defaultMonth }),
  }

  if (mode === 'range') {
    const { value, onChange } = props as CalendarRangeProps
    return (
      <DayPicker
        {...baseProps}
        mode="range"
        selected={value}
        onSelect={onChange}
      />
    )
  }

  const { value, onChange } = props as CalendarSingleProps
  return (
    <DayPicker
      {...baseProps}
      mode="single"
      selected={value}
      onSelect={onChange}
    />
  )
}

export type { DateRange }
