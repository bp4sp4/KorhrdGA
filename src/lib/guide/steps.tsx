// 페이지별 가이드 투어 단계 정의
// target 은 CSS selector — data-guide 속성 사용 권장
// 새 가이드는 GUIDES 배열에 추가하면 가이드 모음과 자동 시작에 바로 반영됨

import type { ReactNode } from 'react'
import styles from './guideText.module.css'

/** 강조 헬퍼 — content 안에서 <B>, <C>, <W>, <S> 형태로 사용 */
const B = ({ children }: { children: ReactNode }) => (
  <strong className={styles.bold}>{children}</strong>
)
const C = ({ children }: { children: ReactNode }) => (
  <span className={styles.colorPrimary}>{children}</span>
)
const W = ({ children }: { children: ReactNode }) => (
  <span className={styles.colorWarn}>{children}</span>
)
const S = ({ children }: { children: ReactNode }) => (
  <span className={styles.colorSuccess}>{children}</span>
)

export interface GuideStep {
  /** spotlight를 비출 요소 선택자. 없으면 화면 중앙 모달처럼 표시 */
  target?: string
  title: string
  content: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** target 이 DOM에 나타날 때까지 대기할 ms (기본 600) */
  waitMs?: number
  /** 이 단계에서 '이전' 버튼 숨김 */
  hidePrev?: boolean
  /** 작은 코너 툴팁 (화면을 가리지 않아야 할 때) */
  compact?: boolean
  /** 툴팁 세로 위치 미세 조정 (px). 음수면 위로 */
  offsetY?: number
  /** 스포트라이트 여백(px). 기본 6 */
  spotlightPad?: number
}

export interface GuideDef {
  id: string
  /** 가이드 표시명 (가이드 모음에 노출) */
  label: string
  /**
   * pathname 기반 매칭 (startsWith).
   * - 해당 경로 첫 방문 시 자동 시작
   * - 다른 페이지에서 가이드를 고르면 이 경로로 이동 후 시작
   */
  matchPath?: string
  /** 가이드 모음에서 그룹핑할 카테고리 */
  category?: string
  /** 가이드 모음에서 보일 짧은 설명 */
  description?: string
  steps: GuideStep[]
}

export const GUIDES: GuideDef[] = [
  // ─── 학습자 신규 ─────────────────────────────────────────────
  {
    id: 'students-basics',
    label: '학습자 신규 사용법',
    matchPath: '/students',
    category: '기본 사용법',
    description: '개별등록 · 일괄등록 · 테이블설정',
    steps: [
      {
        title: '학습자 신규',
        content: (
          <>
            <B>학습자 신규</B>는 매출(학습자 등록) 건을 입력하고 관리하는
            페이지예요.
            {'\n'}
            여기에 등록한 데이터는 <C>매출파일</C>에도 자동으로 나타납니다.
            {'\n\n'}
            등록하는 방법 세 가지를 차례로 알려드릴게요.
          </>
        ),
        hidePrev: true,
      },
      {
        target: '[data-guide="students-add"]',
        title: '개별등록 — 한 건씩 입력',
        content: (
          <>
            <B>개별등록</B>을 누르면 오른쪽에 입력 창이 열려요.
            {'\n'}• <W>고객명은 필수</W>, 나머지(담당자·과정·결제일자·결제금액
            등)는 아는 만큼 입력
            {'\n'}• <C>저장</C>을 누르면 목록 맨 위에 추가됩니다
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="students-bulk"]',
        title: '일괄등록 — 엑셀로 한 번에',
        content: (
          <>
            여러 건은 <B>일괄등록</B>이 편해요.
            {'\n'}① <C>템플릿 다운로드</C>로 양식을 받고
            {'\n'}② 양식에 맞게 채운 뒤 <C>엑셀 파일 선택</C>
            {'\n'}③ 정상/오류 검증 결과를 확인하고 <S>정상 건만 등록</S>
            {'\n'}
            <W>오류 행은 사유가 표시되니 고쳐서 다시 올리면 됩니다.</W>
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="students-settings"]',
        title: '테이블설정 — 내 화면 맞춤',
        content: (
          <>
            <B>테이블설정</B>에서 표를 내 방식대로 바꿀 수 있어요.
            {'\n'}• 컬럼 <C>표시/숨김</C>과 <C>순서 이동</C>
            {'\n'}• <C>커스텀 항목</C>(텍스트·숫자·날짜) 추가
            {'\n'}
            설정은 <S>내 계정에만 적용</S>되고 자동 저장됩니다.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="students-search"]',
        title: '검색',
        content: (
          <>
            <B>고객명 · 연락처 · 기관명 · 담당자</B>로 빠르게 찾을 수 있어요.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="students-filters"]',
        title: '기간 필터 · 선택 수정/삭제',
        content: (
          <>
            <C>등록기간</C>·<C>결제기간</C>으로 조회 범위를 좁힐 수 있어요.
            {'\n'}
            표에서 행을 체크하면 이 자리에 <B>수정 · 삭제</B> 버튼이 나타납니다.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="students-table"]',
        title: '등록된 데이터',
        content: (
          <>
            등록한 건들이 여기에 쌓여요. 행을 체크한 뒤 수정하거나, 엑셀
            다운로드로 내려받을 수 있습니다.
            {'\n\n'}
            이 가이드는 상단의 <C>가이드</C> 버튼에서 언제든 다시 볼 수 있어요.
          </>
        ),
        placement: 'top',
        spotlightPad: 2,
      },
    ],
  },

  // ─── 가망관리 ────────────────────────────────────────────────
  {
    id: 'customers-basics',
    label: '가망관리 사용법',
    matchPath: '/customers',
    category: '기본 사용법',
    description: '가망고객 등록 · 수정 · 일괄등록',
    steps: [
      {
        title: '가망관리',
        content: (
          <>
            <B>가망관리</B>는 아직 결제 전인 <C>상담 중 고객</C>을 관리하는
            페이지예요.
            {'\n'}
            등록해두면 유입경로·과정별로 정리해서 볼 수 있습니다.
          </>
        ),
        hidePrev: true,
      },
      {
        target: '[data-guide="customers-form"]',
        title: '왼쪽 폼에서 등록',
        content: (
          <>
            <B>과정유형 · 과정 · 기관 · 고객명 · 연락처</B> 등을 입력하고{' '}
            <C>등록</C>을 누르면 바로 목록에 추가돼요.
            {'\n'}
            목록에서 행을 클릭하면 이 폼으로 불러와서 <B>수정 · 삭제</B>할 수
            있습니다.
          </>
        ),
        placement: 'right',
      },
      {
        target: '[data-guide="customers-bulk"]',
        title: '일괄등록 — 엑셀로 한 번에',
        content: (
          <>
            여러 명은 <B>일괄등록</B>으로 올리세요.
            {'\n'}
            템플릿을 내려받아 채운 뒤 업로드하면 검증 후 한 번에 등록됩니다.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="customers-search"]',
        title: '검색 · 기간 필터',
        content: (
          <>
            <B>고객명 · 연락처 · 기관명</B>으로 검색하고, 옆의{' '}
            <C>연도 · 월</C> 필터로 등록 시기를 좁힐 수 있어요.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="customers-table"]',
        title: '가망고객 목록',
        content: (
          <>
            등록된 가망고객이 여기에 표시돼요. 행을 클릭해 수정하고, 계약이
            되면 <C>학습자 신규</C>에 매출로 등록하면 됩니다.
            {'\n\n'}
            상단 <C>가이드</C> 버튼으로 언제든 다시 볼 수 있어요.
          </>
        ),
        placement: 'top',
        spotlightPad: 2,
      },
    ],
  },

  // ─── 매출파일 ────────────────────────────────────────────────
  {
    id: 'salesfile-basics',
    label: '매출파일 사용법',
    matchPath: '/sales',
    category: '기본 사용법',
    description: '인라인 편집 · 단가 자동 계산',
    steps: [
      {
        title: '매출파일',
        content: (
          <>
            <B>매출파일</B>은 한평생 오피스 학점은행제 양식 그대로 보는
            매출표예요.
            {'\n'}
            <C>학습자 신규</C>에서 등록한 건이 자동으로 나타나고, 여기서는
            빈 칸을 채우는 방식으로 관리합니다.
          </>
        ),
        hidePrev: true,
      },
      {
        target: '[data-guide="salesfile-table"]',
        title: '셀을 클릭해 바로 수정',
        content: (
          <>
            표의 <B>셀을 클릭하면 바로 수정</B>할 수 있고, 입력을 마치면 즉시
            저장돼요.
            {'\n'}• <C>단가 · 과목수 · 매출</C>은 서로 자동 계산됩니다
            {'\n'}
            <W>(매출 = 단가 × 과목수 × 3학점)</W>
            {'\n'}• 단가를 고치면 매출이, 매출을 고치면 단가가 다시 계산돼요
          </>
        ),
        placement: 'top',
        spotlightPad: 2,
      },
      {
        target: '[data-guide="salesfile-search"]',
        title: '검색',
        content: (
          <>
            <B>학생명 · 전화번호 · 교육원 · 담당자 · 처리번호</B>로 찾을 수
            있어요.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="salesfile-period"]',
        title: '결제기간 필터',
        content: (
          <>
            <C>결제기간선택</C>으로 특정 기간의 매출만 볼 수 있어요. 월별
            정산 확인할 때 편합니다.
          </>
        ),
        placement: 'bottom',
      },
      {
        target: '[data-guide="salesfile-excel"]',
        title: '엑셀 다운로드',
        content: (
          <>
            지금 화면의 조건(검색·기간) 그대로 <B>엑셀로 내려받을 수</B>{' '}
            있어요.
            {'\n\n'}
            상단 <C>가이드</C> 버튼으로 언제든 다시 볼 수 있습니다.
          </>
        ),
        placement: 'bottom',
      },
    ],
  },
]

export function getGuideByPath(pathname: string): GuideDef | null {
  return GUIDES.find((g) => !!g.matchPath && pathname.startsWith(g.matchPath)) ?? null
}

export function getGuideById(id: string): GuideDef | null {
  return GUIDES.find((g) => g.id === id) ?? null
}

/** 카테고리 → 가이드 목록 매핑 (가이드 모음 UI용) */
export function getGuidesGroupedByCategory(
  filter?: (g: GuideDef) => boolean,
): Record<string, GuideDef[]> {
  const groups: Record<string, GuideDef[]> = {}
  for (const g of GUIDES) {
    if (filter && !filter(g)) continue
    const cat = g.category ?? '기타'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(g)
  }
  return groups
}

// localStorage 로 '본 가이드' 관리 — 첫 방문 자동 시작 1회 제한용
const SEEN_KEY = 'guideSeenIds'

export function getSeenGuideIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function markGuideSeen(id: string) {
  if (typeof window === 'undefined') return
  try {
    const seen = getSeenGuideIds()
    if (!seen.includes(id)) {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]))
    }
  } catch {
    /* ignore */
  }
}
