"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  type Sale,
  type PaymentMethod,
  type RefundStatus,
  PAYMENT_METHOD_OPTIONS,
  REFUND_STATUSES,
  SALES_FILE_COLUMNS,
} from "@/lib/types";
import st from "../students/students.module.css";
import sf from "./salesfile.module.css";

// 피커 열 때만 로드
const DateRangeCalendar = dynamic(
  () =>
    import("@/components/DateRangeCalendar").then((m) => m.DateRangeCalendar),
  { ssr: false },
);
const DateInput = dynamic(
  () => import("@/components/ui/Calendar/DateInput").then((m) => m.DateInput),
  { ssr: false },
);

const PAGE_SIZES = [10, 20, 50, 100];

// 환불상태별 행 배경색 (한평생 오피스 매출파일과 동일)
const REFUND_ROW_COLORS: Partial<Record<RefundStatus, string>> = {
  환불: "#F3C8DE",
  정산: "#D2DBE9",
  보류: "#FDF3D1",
};

// ── 표시/변환 헬퍼 ──────────────────────────────────────────────
function won(n: number | null): string {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}
function formatPhone(p: string | null): string {
  if (!p) return "-";
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
function autoHyphenPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
function inRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const v = value.slice(0, 10);
  if (from && v < from) return false;
  if (to && v > to) return false;
  return true;
}
function ymd(d?: Date): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseYmd(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9aa2b1"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export default function SalesFileClient({
  initial,
  isAdmin = false,
  heading = "매출파일",
}: {
  initial: Sale[];
  isAdmin?: boolean;
  heading?: string;
}) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Sale[]>(initial);
  const [search, setSearch] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [picker, setPicker] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 마스터관리자 전용 컬럼(발급일자·발행완료·환불) 표시 여부
  const columns = useMemo(
    () => SALES_FILE_COLUMNS.filter((c) => isAdmin || !c.adminOnly),
    [isAdmin],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inRange(r.payment_date, payFrom, payTo)) return false;
      if (q) {
        const hay = [
          r.customer_name,
          r.phone,
          r.institution,
          r.manager,
          r.student_id,
          r.process_number,
        ]
          .map((x) => x ?? "")
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, payFrom, payTo]);

  // 총매출(환불 제외)
  const totalSales = filtered
    .filter((r) => r.refund_status !== "환불")
    .reduce((s, r) => s + (r.payment_amount ?? 0), 0);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilter = !!search || !!payFrom || !!payTo;

  // ── 인라인 편집: 셀 변경 즉시 저장 ─────────────────────────────
  async function patchRow(row: Sale, patch: Partial<Sale>) {
    // 낙관적 업데이트
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)),
    );
    const { error } = await supabase
      .from("sales")
      .update(patch)
      .eq("id", row.id);
    if (error) {
      window.alert(error.message);
      await reload(); // 롤백
    }
  }

  async function reload() {
    const { data } = await supabase
      .from("sales")
      .select("*, customer:customers(name)")
      .order("created_at", { ascending: false });
    setRows((data as Sale[]) ?? []);
  }

  async function removeRow(row: Sale) {
    if (!window.confirm(`'${row.customer_name ?? "이 건"}' 매출 기록을 삭제할까요?`))
      return;
    const { error } = await supabase.from("sales").delete().eq("id", row.id);
    if (error) {
      window.alert(error.message);
      return;
    }
    await reload();
  }

  function resetFilters() {
    setSearch("");
    setPayFrom("");
    setPayTo("");
    setPicker(false);
    setPage(1);
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      교육원: r.institution ?? "",
      개강반: r.class_start ?? "",
      학생명: r.customer_name ?? "",
      아이디: r.student_id ?? "",
      전화번호: formatPhone(r.phone),
      단가: r.unit_price ?? "",
      매출: r.payment_amount ?? "",
      결제방법: r.payment_method
        ? PAYMENT_METHOD_OPTIONS.find((o) => o.value === r.payment_method)
            ?.label ?? ""
        : "",
      결제일: r.payment_date ?? "",
      과목수: r.subject_count ?? "",
      담당자: r.manager ?? "",
      특이사항: r.special_note ?? "",
      "(현)처리번호": r.process_number ?? "",
      "(현)발급일자": r.issue_date ?? "",
      발행완료: r.is_published ? "Y" : "",
      환불: r.refund_status,
      환불일: r.refund_date ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "매출파일");
    XLSX.writeFile(wb, "매출파일.xlsx");
  }

  const pageList = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
    .reduce<number[]>((acc, n) => {
      if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1);
      acc.push(n);
      return acc;
    }, []);

  // 단가·매출·과목수 관계: 매출 = 단가(학점당) × 과목수 × 3 (1과목=3학점)
  // 세 값 중 무엇을 수정하든 나머지를 맞춰 계산. 과목수가 비면 계산 불가 → 수정한 값만 저장.

  // 단가 수정 → 과목수 있으면 매출 재계산
  function editUnitPrice(r: Sale, v: number | null) {
    const patch: Partial<Sale> = { unit_price: v };
    if (v != null && r.subject_count != null && r.subject_count > 0) {
      patch.payment_amount = v * r.subject_count * 3;
    }
    patchRow(r, patch);
  }

  // 과목수 수정 → 단가 있으면 매출, 없고 매출 있으면 단가를 역산
  function editSubjectCount(r: Sale, v: number | null) {
    const patch: Partial<Sale> = { subject_count: v };
    if (v != null && v > 0) {
      if (r.unit_price != null) {
        patch.payment_amount = r.unit_price * v * 3;
      } else if (r.payment_amount != null) {
        patch.unit_price = Math.round(r.payment_amount / (v * 3));
      }
    }
    patchRow(r, patch);
  }

  // 매출 수정 → 과목수 있으면 단가 역산
  function editTotal(r: Sale, v: number | null) {
    const patch: Partial<Sale> = { payment_amount: v };
    if (v != null && r.subject_count != null && r.subject_count > 0) {
      patch.unit_price = Math.round(v / (r.subject_count * 3));
    }
    patchRow(r, patch);
  }

  // ── 셀 렌더링 (컬럼 key 별 인라인 편집기) ──────────────────────
  function renderCell(r: Sale, key: keyof Sale) {
    switch (key) {
      case "institution":
        return (
          <InlineText
            value={r.institution ?? ""}
            onSave={(v) => patchRow(r, { institution: v || null })}
          />
        );
      case "class_start":
        return (
          <DateInput
            value={r.class_start ?? ""}
            onChange={(v) => patchRow(r, { class_start: v || null })}
            placeholder="개강반"
            triggerClassName={sf.inlineDateTrigger}
          />
        );
      case "customer_name":
        return (
          <InlineText
            value={r.customer_name ?? ""}
            onSave={(v) => patchRow(r, { customer_name: v || null })}
            strong
          />
        );
      case "student_id":
        return (
          <InlineText
            value={r.student_id ?? ""}
            onSave={(v) => patchRow(r, { student_id: v || null })}
          />
        );
      case "phone":
        return (
          <InlinePhone
            value={r.phone ?? ""}
            onSave={(v) => patchRow(r, { phone: v || null })}
          />
        );
      case "unit_price":
        return (
          <InlineNumber
            value={r.unit_price}
            onSave={(v) => editUnitPrice(r, v)}
          />
        );
      case "payment_amount":
        return (
          <span
            className={`${sf.tdStrong} ${r.refund_status === "환불" ? sf.tdStrike : ""}`}
          >
            <InlineNumber
              value={r.payment_amount}
              onSave={(v) => editTotal(r, v)}
            />
          </span>
        );
      case "payment_method":
        return (
          <select
            className={sf.inlineSelect}
            value={r.payment_method ?? ""}
            onChange={(e) =>
              patchRow(r, {
                payment_method: (e.target.value || null) as PaymentMethod | null,
              })
            }
          >
            <option value="">-</option>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "payment_date":
        return (
          <DateInput
            value={r.payment_date ?? ""}
            onChange={(v) => patchRow(r, { payment_date: v || null })}
            placeholder="결제일"
            triggerClassName={sf.inlineDateTrigger}
          />
        );
      case "subject_count":
        return (
          <InlineNumber
            value={r.subject_count}
            onSave={(v) => editSubjectCount(r, v)}
          />
        );
      case "manager":
        return (
          <InlineText
            value={r.manager ?? ""}
            onSave={(v) => patchRow(r, { manager: v || null })}
          />
        );
      case "special_note":
        return (
          <InlineText
            value={r.special_note ?? ""}
            onSave={(v) => patchRow(r, { special_note: v || null })}
          />
        );
      case "process_number":
        return (
          <InlinePhone
            value={r.process_number ?? ""}
            onSave={(v) => patchRow(r, { process_number: v || null })}
          />
        );
      case "issue_date":
        return (
          <DateInput
            value={r.issue_date ?? ""}
            onChange={(v) => patchRow(r, { issue_date: v || null })}
            placeholder="발급일"
            triggerClassName={sf.inlineDateTrigger}
          />
        );
      case "is_published":
        return (
          <input
            type="checkbox"
            className={sf.inlineCheck}
            checked={r.is_published}
            onChange={(e) => patchRow(r, { is_published: e.target.checked })}
          />
        );
      case "refund_status":
        return (
          <div className={sf.refundCell}>
            <select
              className={sf.inlineSelect}
              value={r.refund_status}
              onChange={(e) =>
                patchRow(r, { refund_status: e.target.value as RefundStatus })
              }
            >
              {REFUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {r.refund_status === "환불" && (
              <DateInput
                value={r.refund_date ?? ""}
                onChange={(v) => patchRow(r, { refund_date: v || null })}
                placeholder="환불일"
                triggerClassName={sf.inlineDateTrigger}
              />
            )}
          </div>
        );
      default:
        return <span className={sf.tdDim}>-</span>;
    }
  }

  return (
    <div className={st.page}>
      <div className={st.inner}>
        {/* 타이틀 */}
        <div className={st.titleRow}>
          <h1 className={st.h1}>{heading}</h1>
        </div>

        {/* 검색 + 액션 */}
        <div className={st.searchRow}>
          <div className={st.searchWrap} data-guide="salesfile-search">
            <span className={st.searchIcon}>
              <SearchIcon />
            </span>
            <input
              className={st.searchInput}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="학생명, 전화번호, 교육원, 담당자, 처리번호로 검색..."
            />
          </div>
          <div className={st.rowRight}>
            <button
              className={st.resetBtn}
              onClick={resetFilters}
              disabled={!hasFilter}
            >
              초기화
            </button>
            <button className={st.excelBtn} onClick={exportExcel} data-guide="salesfile-excel">
              엑셀 다운로드
            </button>
          </div>
        </div>

        {/* 결제기간 칩 */}
        <div className={st.chipRow}>
          <div className={st.chipWrap} data-guide="salesfile-period">
            <button
              className={
                payFrom || payTo ? `${st.chip} ${st.chipActive}` : st.chip
              }
              onClick={() => setPicker((v) => !v)}
            >
              <CalendarIcon /> 결제기간선택
            </button>
            {picker && (
              <div className={st.calPop} onClick={(e) => e.stopPropagation()}>
                <DateRangeCalendar
                  defaultValue={{
                    from: parseYmd(payFrom),
                    to: parseYmd(payTo),
                  }}
                  onConfirm={(r) => {
                    setPayFrom(ymd(r?.from));
                    setPayTo(ymd(r?.to ?? r?.from));
                    setPage(1);
                    setPicker(false);
                  }}
                  onReset={() => {
                    setPayFrom("");
                    setPayTo("");
                    setPage(1);
                    setPicker(false);
                  }}
                />
              </div>
            )}
          </div>
          {(payFrom || payTo) && (
            <span className={st.rangePill}>
              {payFrom || "…"} ~ {payTo || "…"}
              <button
                type="button"
                className={st.rangePillX}
                onClick={() => {
                  setPayFrom("");
                  setPayTo("");
                  setPage(1);
                }}
                aria-label="결제기간 해제"
              >
                ×
              </button>
            </span>
          )}
        </div>

        {/* 요약 */}
        <div className={st.summaryRow}>
          <span className={st.summaryLeft}>
            총 {filtered.length.toLocaleString("ko-KR")}건의 데이터{" "}
          </span>
          <span className={st.summaryRight}>
            총매출(환불 제외):{" "}
            <span className={st.totalBlue}>{won(totalSales)}원</span>
          </span>
        </div>

        {/* 표 */}
        <div className={st.tableWrap} data-guide="salesfile-table">
          <table className={sf.table}>
            <thead className={sf.thead}>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={sf.th}>
                    {c.label}
                  </th>
                ))}
                {isAdmin && <th className={sf.th}>관리</th>}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (isAdmin ? 1 : 0)}
                    className={st.emptyCell}
                  >
                    {rows.length === 0
                      ? "아직 등록된 데이터가 없습니다."
                      : "조건에 맞는 데이터가 없습니다."}
                  </td>
                </tr>
              ) : (
                paged.map((r) => {
                  const bg = REFUND_ROW_COLORS[r.refund_status];
                  return (
                    <tr
                      key={r.id}
                      className={sf.tr}
                      style={bg ? { background: bg } : undefined}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={sf.td}>
                          {renderCell(r, c.key)}
                        </td>
                      ))}
                      {isAdmin && (
                        <td className={sf.td}>
                          <button
                            type="button"
                            className={sf.delBtn}
                            onClick={() => removeRow(r)}
                          >
                            삭제
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div className={st.pagination}>
          <button
            className={st.pageArrow}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            ‹
          </button>
          {pageList.map((n, i) =>
            n === -1 ? (
              <span key={`g${i}`} className={st.pageGap}>
                ...
              </span>
            ) : (
              <button
                key={n}
                className={n === safePage ? st.pageBtnActive : st.pageBtn}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button
            className={st.pageArrow}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage === pageCount}
          >
            ›
          </button>
          <div className={st.pageSizeWrap}>
            <select
              className={st.pageSize}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}개씩 보기
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 인라인 텍스트 ────────────────────────────────────────────────
function InlineText({
  value,
  onSave,
  strong,
}: {
  value: string;
  onSave: (v: string) => void;
  strong?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(value);
  }
  return (
    <input
      type="text"
      className={sf.inlineInput}
      value={local}
      placeholder="-"
      style={strong ? { fontWeight: 600 } : undefined}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local.trim() !== value) onSave(local.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

// ── 인라인 전화번호 (자동 하이픈) ────────────────────────────────
function InlinePhone({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(autoHyphenPhone(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(autoHyphenPhone(value));
  }
  return (
    <input
      type="text"
      className={sf.inlineInput}
      value={local}
      placeholder="-"
      inputMode="numeric"
      onChange={(e) => setLocal(autoHyphenPhone(e.target.value))}
      onBlur={() => {
        if (local !== value) onSave(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

// ── 인라인 숫자 (천단위 콤마) ────────────────────────────────────
function InlineNumber({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setLocal(value != null ? String(value) : "");
  }
  const display =
    local && /^\d+$/.test(local) ? Number(local).toLocaleString() : local;
  return (
    <input
      type="text"
      inputMode="numeric"
      className={sf.inlineInput}
      value={display}
      placeholder="-"
      onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => {
        const next = local ? Number(local) : null;
        if (next !== value) onSave(Number.isFinite(next) ? next : null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
