'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getGuideById, getGuideByPath, getSeenGuideIds, GUIDES, markGuideSeen } from '@/lib/guide/steps'
import GuideTour from './GuideTour'

interface GuideContextValue {
  /** 현재 페이지의 가이드 시작 */
  startCurrent: () => void
  /** id로 가이드 시작 — 다른 페이지 가이드면 해당 경로로 이동 후 시작 */
  startById: (id: string) => void
  available: { id: string; label: string }[]
}

const GuideContext = createContext<GuideContextValue | null>(null)

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext)
  if (!ctx) {
    return { startCurrent: () => {}, startById: () => {}, available: [] }
  }
  return ctx
}

export default function GuideProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null)
  // 다른 페이지로 이동 후 시작해야 하는 가이드 id
  const pendingIdRef = useRef<string | null>(null)

  // 첫 방문 자동 시작 — 현재 경로의 가이드를 아직 안 봤으면 한 번 띄움
  useEffect(() => {
    if (!pathname) return

    // 페이지 이동으로 대기 중인 가이드가 도착했으면 그걸 시작
    const pending = pendingIdRef.current
    if (pending) {
      const pg = getGuideById(pending)
      if (pg?.matchPath && pathname.startsWith(pg.matchPath)) {
        pendingIdRef.current = null
        const t = setTimeout(() => setActiveGuideId(pending), 600)
        return () => clearTimeout(t)
      }
    }

    const g = getGuideByPath(pathname)
    if (!g) return
    const seen = getSeenGuideIds()
    if (seen.includes(g.id)) return
    // DOM 마운트 대기 후 시작
    const t = setTimeout(() => setActiveGuideId(g.id), 600)
    return () => clearTimeout(t)
  }, [pathname])

  const startCurrent = useCallback(() => {
    if (!pathname) return
    const g = getGuideByPath(pathname)
    if (g) setActiveGuideId(g.id)
  }, [pathname])

  const startById = useCallback(
    (id: string) => {
      const g = getGuideById(id)
      if (!g) return
      // 다른 페이지의 가이드면 이동 후 시작
      if (g.matchPath && pathname && !pathname.startsWith(g.matchPath)) {
        pendingIdRef.current = id
        router.push(g.matchPath)
        return
      }
      setActiveGuideId(id)
    },
    [pathname, router],
  )

  const close = useCallback(() => {
    if (activeGuideId) markGuideSeen(activeGuideId)
    setActiveGuideId(null)
  }, [activeGuideId])

  const activeGuide = activeGuideId ? GUIDES.find((g) => g.id === activeGuideId) ?? null : null
  const available = GUIDES.map((g) => ({ id: g.id, label: g.label }))

  return (
    <GuideContext.Provider value={{ startCurrent, startById, available }}>
      {children}
      {activeGuide && <GuideTour key={activeGuide.id} open steps={activeGuide.steps} onClose={close} />}
    </GuideContext.Provider>
  )
}
