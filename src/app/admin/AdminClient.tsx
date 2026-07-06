'use client'

import { useMemo, useState } from 'react'
import type { Sale, Role } from '@/lib/types'
import crud from '@/styles/crud.module.css'
import styles from './admin.module.css'

export type Agent = { id: string; name: string | null; role: Role }

function won(n: number): string {
  return n.toLocaleString('ko-KR')
}

type Agg = {
  ownerId: string
  name: string
  count: number
  commission: number
  premium: number
  total: number
}

export default function AdminClient({
  agents,
  sales,
}: {
  agents: Agent[]
  sales: Sale[]
}) {
  const [filter, setFilter] = useState<string>('all')

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    agents.forEach((a) => m.set(a.id, a.name ?? '(이름없음)'))
    return m
  }, [agents])

  // 담당자별 집계 (수수료 내림차순)
  const ranking = useMemo(() => {
    const map = new Map<string, Agg>()
    for (const s of sales) {
      const key = s.owner_id
      const cur =
        map.get(key) ??
        {
          ownerId: key,
          name: nameById.get(key) ?? '(알수없음)',
          count: 0,
          commission: 0,
          premium: 0,
          total: 0,
        }
      cur.count += 1
      cur.commission += s.commission ?? 0
      cur.premium += s.premium ?? 0
      cur.total += s.total_amount ?? 0
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.commission - a.commission)
  }, [sales, nameById])

  const totals = useMemo(
    () => ({
      count: sales.length,
      commission: sales.reduce((s, r) => s + (r.commission ?? 0), 0),
      premium: sales.reduce((s, r) => s + (r.premium ?? 0), 0),
      designers: ranking.length,
    }),
    [sales, ranking],
  )

  const filtered = useMemo(
    () => (filter === 'all' ? sales : sales.filter((s) => s.owner_id === filter)),
    [sales, filter],
  )

  return (
    <div className={crud.wrap}>
      <h1 className={crud.heading}>관리자 대시보드</h1>

      {/* 요약 카드 */}
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>총 매출 건수</span>
          <span className={styles.cardValue}>{won(totals.count)}건</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>총 수수료</span>
          <span className={styles.cardValue}>{won(totals.commission)}원</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>총 월납 합계</span>
          <span className={styles.cardValue}>{won(totals.premium)}원</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>매출 담당자 수</span>
          <span className={styles.cardValue}>{won(totals.designers)}명</span>
        </div>
      </div>

      {/* 담당자별 집계 */}
      <h2 className={styles.section}>담당자별 집계</h2>
      <div className={crud.tableWrap}>
        <table className={crud.table}>
          <thead>
            <tr>
              <th className={crud.th}>순위</th>
              <th className={crud.th}>담당자</th>
              <th className={crud.th}>건수</th>
              <th className={crud.th}>수수료 합계</th>
              <th className={crud.th}>월납 합계</th>
              <th className={crud.th}>총액 합계</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 ? (
              <tr>
                <td className={crud.empty} colSpan={6}>
                  아직 매출 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              ranking.map((r, i) => (
                <tr className={crud.row} key={r.ownerId}>
                  <td className={crud.td}>{i + 1}</td>
                  <td className={crud.td}>{r.name}</td>
                  <td className={`${crud.td} ${crud.num}`}>{won(r.count)}</td>
                  <td className={`${crud.td} ${crud.num}`}>{won(r.commission)}</td>
                  <td className={`${crud.td} ${crud.num}`}>{won(r.premium)}</td>
                  <td className={`${crud.td} ${crud.num}`}>{won(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 담당자 필터 + 상세 매출 */}
      <div className={styles.detailHead}>
        <h2 className={styles.section}>매출 상세</h2>
        <select
          className={styles.filter}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">전체 담당자</option>
          {ranking.map((r) => (
            <option key={r.ownerId} value={r.ownerId}>
              {r.name} ({r.count}건)
            </option>
          ))}
        </select>
      </div>

      <div className={crud.tableWrap}>
        <table className={crud.table}>
          <thead>
            <tr>
              <th className={crud.th}>담당자</th>
              <th className={crud.th}>고객</th>
              <th className={crud.th}>상품</th>
              <th className={crud.th}>보험사</th>
              <th className={crud.th}>월납</th>
              <th className={crud.th}>수수료</th>
              <th className={crud.th}>청약일</th>
              <th className={crud.th}>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className={crud.empty} colSpan={8}>
                  매출 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr className={crud.row} key={s.id}>
                  <td className={crud.td}>{nameById.get(s.owner_id) ?? '-'}</td>
                  <td className={crud.td}>
                    {s.customer?.name ?? <span className={crud.muted}>-</span>}
                  </td>
                  <td className={crud.td}>
                    {s.product ?? <span className={crud.muted}>-</span>}
                  </td>
                  <td className={crud.td}>
                    {s.insurer ?? <span className={crud.muted}>-</span>}
                  </td>
                  <td className={`${crud.td} ${crud.num}`}>
                    {s.premium == null ? '-' : won(s.premium)}
                  </td>
                  <td className={`${crud.td} ${crud.num}`}>
                    {s.commission == null ? '-' : won(s.commission)}
                  </td>
                  <td className={crud.td}>
                    {s.contract_date ?? <span className={crud.muted}>-</span>}
                  </td>
                  <td className={crud.td}>
                    <span className={`${crud.badge} ${crud[`status${s.status}`]}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
