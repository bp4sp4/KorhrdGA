'use client'

import React, { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { parse, format, isValid } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { Calendar } from './index'
import styles from './DateInput.module.css'

interface DateInputProps {
  value?: string          // 'YYYY-MM-DD'
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  triggerClassName?: string    // trigger 버튼에 추가할 className (외관 커스터마이징)
  disabled?: boolean
  align?: 'left' | 'right'      // 팝오버 좌우 정렬 (기본 left)
  direction?: 'down' | 'up'    // 팝오버 열리는 방향 (기본 down)
  variant?: 'input' | 'button' // 트리거 스타일 (기본 input)
  label?: string               // variant="button" 일 때 버튼 텍스트 (기본 "연락예정")
  showIcon?: boolean           // 트리거에 캘린더 아이콘 표시 여부 (기본 true)
  minDate?: Date               // 선택 가능 최소 날짜 (포함)
  maxDate?: Date               // 선택 가능 최대 날짜 (포함)
  defaultMonth?: Date          // value가 없을 때 캘린더 첫 진입 월 (미지정 시 minDate로 fallback)
  clearable?: boolean          // 팝오버 하단에 "초기화" 버튼 표시 (선택값 비우기)
}

// 저장 표준은 'yyyy-MM-dd' 이지만, 과거 데이터/수기 입력이 한글·점 포맷으로
// 들어간 경우(예: "26년 03월 03일", "2026.03.03")도 표시되도록 관대하게 파싱한다.
const PARSE_FORMATS = [
  'yyyy-MM-dd',
  'yyyy.MM.dd',
  'yyyy/MM/dd',
  'yyyy년 MM월 dd일',
  'yyyy년 M월 d일',
  'yy.MM.dd',
  'yy년 MM월 dd일',
  'yy년 M월 d일',
]

function parseDate(str: string): Date | undefined {
  if (!str) return undefined
  const s = str.trim()
  for (const fmt of PARSE_FORMATS) {
    const d = parse(s, fmt, new Date())
    if (isValid(d)) {
      // 2자리 연도("26년")가 0026으로 파싱되는 경우 20xx로 보정
      if (d.getFullYear() < 100) d.setFullYear(d.getFullYear() + 2000)
      return d
    }
  }
  return undefined
}

function formatDisplay(str: string): string {
  const d = parseDate(str)
  return d ? format(d, 'yyyy.MM.dd') : ''
}

const CALENDAR_HEIGHT = 310 // 달력 팝오버 예상 높이 (px)

export function DateInput({
  value = '',
  onChange,
  placeholder = '날짜 선택',
  className,
  triggerClassName,
  disabled,
  align = 'left',
  direction,          // 미지정 시 자동 감지
  variant = 'input',
  label = '연락예정',
  showIcon = true,
  minDate,
  maxDate,
  defaultMonth,
  clearable = false,
}: DateInputProps) {
  const [open, setOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      // 팝오버는 body로 포탈되므로 wrap 안에 없음 — 팝오버 내부 클릭도 "바깥"으로 보지 않도록 함께 검사
      if (
        wrapRef.current &&
        !wrapRef.current.contains(t) &&
        (!popoverRef.current || !popoverRef.current.contains(t))
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function handleToggle() {
    if (disabled) return
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const resolvedDirection = direction ?? (spaceBelow < CALENDAR_HEIGHT && spaceAbove > CALENDAR_HEIGHT ? 'up' : 'down')

      const style: React.CSSProperties = { position: 'fixed', zIndex: 9999 }
      if (resolvedDirection === 'up') {
        style.bottom = window.innerHeight - rect.top + 6
      } else {
        style.top = rect.bottom + 6
      }
      if (align === 'right') {
        style.right = window.innerWidth - rect.right
      } else {
        style.left = rect.left
      }
      setPopoverStyle(style)
    }
    setOpen(v => !v)
  }

  const display = formatDisplay(value)
  const selected = parseDate(value)

  function handleSelect(date: Date | undefined) {
    onChange?.(date ? format(date, 'yyyy-MM-dd') : '')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ''}`}>
      {variant === 'button' ? (
        display ? (
          // 날짜 있을 때: [날짜 텍스트 | ×] 한 덩어리
          <div className={styles.scheduleBtnWithX}>
            <button
              type="button"
              className={styles.scheduleBtnDate}
              onClick={handleToggle}
              disabled={disabled}
            >
              {display}
            </button>
            <button
              type="button"
              className={styles.scheduleBtnX}
              onClick={(e) => { e.stopPropagation(); onChange?.('') }}
              disabled={disabled}
              aria-label="해제"
            >×</button>
          </div>
        ) : (
          // 날짜 없을 때: "연락예정" 버튼
          <button
            type="button"
            className={styles.scheduleBtn}
            onClick={handleToggle}
            disabled={disabled}
          >
            {label}
          </button>
        )
      ) : (
        // 인풋 스타일 (기본)
        <button
          type="button"
          className={`${triggerClassName ?? styles.trigger} ${!display ? styles.trigger_placeholder : ''} ${open ? styles.trigger_open : ''}`}
          onClick={handleToggle}
          disabled={disabled}
          style={triggerClassName ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left' } : undefined}
        >
          <span style={triggerClassName ? { color: display ? '#191f28' : '#9ca3af', flex: 1 } : undefined}>{display || placeholder}</span>
          {showIcon && <CalendarDays size={triggerClassName ? 16 : 13} className={styles.icon} style={triggerClassName ? { color: '#9ca3af', flexShrink: 0 } : undefined} />}
        </button>
      )}

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            className={styles.popoverFixed}
            style={popoverStyle}
          >
            <Calendar
              value={selected}
              onChange={handleSelect}
              disabled={
                minDate || maxDate
                  ? [
                      ...(minDate ? [{ before: minDate }] : []),
                      ...(maxDate ? [{ after: maxDate }] : []),
                    ]
                  : undefined
              }
              defaultMonth={defaultMonth ?? minDate ?? maxDate}
            />
            {clearable && (
              <div className={styles.popoverFooter}>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => {
                    onChange?.('')
                    setOpen(false)
                  }}
                  disabled={!display}
                >
                  초기화
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
