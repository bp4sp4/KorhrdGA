'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useGuide } from './GuideProvider'
import { getGuidesGroupedByCategory, type GuideDef } from '@/lib/guide/steps'
import styles from './GuidePicker.module.css'

interface Props {
  open: boolean
  onClose: () => void
  /** 카테고리/페이지로 필터링 (없으면 전체) */
  filter?: (g: GuideDef) => boolean
  title?: string
}

export default function GuidePicker({ open, onClose, filter, title = '가이드 모음' }: Props) {
  const { startById } = useGuide()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  const groups = getGuidesGroupedByCategory(filter)
  const categories = Object.keys(groups)

  const handlePick = (id: string) => {
    onClose()
    // 모달 닫힘 애니메이션 후 가이드 시작
    setTimeout(() => startById(id), 150)
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {categories.length === 0 ? (
            <p className={styles.empty}>표시할 가이드가 없습니다.</p>
          ) : (
            categories.map((cat) => (
              <section key={cat} className={styles.section}>
                <h4 className={styles.sectionTitle}>{cat}</h4>
                <ul className={styles.list}>
                  {groups[cat].map((g) => (
                    <li key={g.id}>
                      <button type="button" className={styles.item} onClick={() => handlePick(g.id)}>
                        <span className={styles.itemLabel}>{g.label}</span>
                        {g.description && <span className={styles.itemDescription}>{g.description}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
