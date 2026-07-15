"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import {
  type Sale,
  type SalesViewConfig,
  COURSE_TYPE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  STANDARD_SALE_COLUMNS,
  SALES_FILE_COLUMNS,
} from "@/lib/types";
import styles from "@/styles/crud.module.css";
import st from "./students.module.css";

// 피커 열 때만 로드 (초기 번들 경량화)
const DateRangeCalendar = dynamic(
  () =>
    import("@/components/DateRangeCalendar").then((m) => m.DateRangeCalendar),
  { ssr: false },
);
const DateInput = dynamic(
  () => import("@/components/ui/Calendar/DateInput").then((m) => m.DateInput),
  {
    ssr: false,
    loading: () => (
      <div
        className={styles.input}
        style={{ color: "#9ca3af", display: "flex", alignItems: "center" }}
      >
        날짜 선택
      </div>
    ),
  },
);

const DEFAULT_HIDDEN = ["payment_amount", "subject_count", "special_note"];

type FormState = {
  manager: string;
  course_type: string;
  course_detail: string;
  institution: string;
  class_start: string;
  student_id: string;
  customer_name: string;
  phone: string;
  education_level: string;
  region: string;
  sub_region: string;
  practice_schedule: string;
  payment_date: string;
  payment_amount: string;
  subject_count: string;
  special_note: string;
  notes: string;
};

const EMPTY: FormState = {
  manager: "",
  course_type: "",
  course_detail: "",
  institution: "",
  class_start: "",
  student_id: "",
  customer_name: "",
  phone: "",
  education_level: "",
  region: "",
  sub_region: "",
  practice_schedule: "",
  payment_date: "",
  payment_amount: "",
  subject_count: "",
  special_note: "",
  notes: "",
};

const EXCEL_HEADERS = [
  "등록일자",
  "담당자",
  "과정분류",
  "세부과정",
  "기관명",
  "개강반",
  "학생아이디",
  "고객명",
  "연락처",
  "최종학력",
  "지역",
  "세부지역",
  "실습예정일",
  "결제일자",
  "결제금액",
  "과목수",
  "특이사항",
  "기재사항",
] as const;

const PAGE_SIZES = [10, 20, 50, 100];

// 일괄등록 필수/선택 안내
const BULK_REQUIRED = ["고객명"];

type BulkRow = {
  data: Record<string, unknown>;
  customer_name: string;
  manager: string;
  student_id: string;
  payAmt: number | null;
  payDate: string | null;
  errors: string[];
};

function won(n: number | null): string {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}
function toNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toInt(s: string): number | null {
  const n = toNum(s);
  return n == null ? null : Math.trunc(n);
}
function toDateStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 59) {
      const ms = (serial - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const m = s.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s.slice(0, 10);
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
function cell(s: Sale, key: keyof Sale): string {
  const v = s[key];
  if (key === "created_at" || key === "payment_date")
    return v ? String(v).slice(0, 10) : "-";
  return v == null || v === "" ? "-" : String(v);
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

export default function SalesClient({
  initial,
  userId,
  readOnly = false,
  heading = "학습자 신규",
  managerName = "",
  viewConfig = {},
}: {
  initial: Sale[];
  customers?: { id: string; name: string }[];
  userId: string;
  readOnly?: boolean;
  heading?: string;
  managerName?: string;
  viewConfig?: SalesViewConfig;
}) {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<Sale[]>(initial);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [customVals, setCustomVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 뷰 설정 (컬럼 순서/표시 + 커스텀 항목)
  const [config, setConfig] = useState<SalesViewConfig>(viewConfig);
  const customFields = useMemo(
    () => config.customFields ?? [],
    [config.customFields],
  );
  const allColumns = useMemo(
    () => [
      ...STANDARD_SALE_COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
        custom: false,
      })),
      ...customFields.map((f) => ({
        key: f.key,
        label: f.label,
        custom: true,
      })),
    ],
    [customFields],
  );
  const orderedColumns = useMemo(() => {
    const order =
      config.order && config.order.length
        ? config.order
        : STANDARD_SALE_COLUMNS.map((c) => c.key);
    const byKey = new Map(allColumns.map((c) => [c.key, c]));
    const seen = new Set<string>();
    const out: { key: string; label: string; custom: boolean }[] = [];
    for (const k of order) {
      const c = byKey.get(k);
      if (c && !seen.has(k)) {
        out.push(c);
        seen.add(k);
      }
    }
    for (const c of allColumns) if (!seen.has(c.key)) out.push(c);
    return out;
  }, [config.order, allColumns]);
  // 매출파일 필수 항목 = 숨김/순서변경 불가(잠금). 항상 표시.
  const essentialSet = useMemo(
    () => new Set(SALES_FILE_COLUMNS.map((c) => c.key as string)),
    [],
  );
  const isLocked = (key: string) => essentialSet.has(key);

  const hidden = config.hidden ?? DEFAULT_HIDDEN;
  const visibleColumns = orderedColumns.filter(
    (c) => isLocked(c.key) || !hidden.includes(c.key),
  );

  // 테이블설정 패널: 자유 그룹(위) / 매출파일 필수 그룹(아래) 분리
  const topCols = orderedColumns.filter((c) => !isLocked(c.key));
  const bottomCols = orderedColumns.filter((c) => isLocked(c.key));

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "date">(
    "text",
  );
  const [savedFlash, setSavedFlash] = useState(false);

  const [search, setSearch] = useState("");
  const [regFrom, setRegFrom] = useState("");
  const [regTo, setRegTo] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [payTo, setPayTo] = useState("");
  const [picker, setPicker] = useState<"reg" | "pay" | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(viewConfig.pageSize ?? 10);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);

  const editable = !readOnly;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inRange(r.created_at, regFrom, regTo)) return false;
      if (!inRange(r.payment_date, payFrom, payTo)) return false;
      if (q) {
        const hay = [
          r.customer_name,
          r.phone,
          r.institution,
          r.manager,
          r.student_id,
          r.course_detail,
        ]
          .map((x) => x ?? "")
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, regFrom, regTo, payFrom, payTo]);

  const totalSales = filtered.reduce((s, r) => s + (r.payment_amount ?? 0), 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const pageIds = paged.map((r) => r.id);
  const allChecked =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function reload() {
    const { data } = await supabase
      .from("sales")
      .select("*, customer:customers(name)")
      .order("created_at", { ascending: false });
    setRows((data as Sale[]) ?? []);
    setSelected(new Set());
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY, manager: managerName });
    setCustomVals({});
    setError(null);
    setOpen(true);
  }
  function openEdit(s: Sale) {
    if (!editable) return;
    setEditingId(s.id);
    setCustomVals({ ...(s.custom ?? {}) });
    setForm({
      manager: s.manager ?? "",
      course_type: s.course_type ?? "",
      course_detail: s.course_detail ?? "",
      institution: s.institution ?? "",
      class_start: s.class_start ?? "",
      student_id: s.student_id ?? "",
      customer_name: s.customer_name ?? "",
      phone: s.phone ?? "",
      education_level: s.education_level ?? "",
      region: s.region ?? "",
      sub_region: s.sub_region ?? "",
      practice_schedule: s.practice_schedule ?? "",
      payment_date: s.payment_date ?? "",
      payment_amount: s.payment_amount?.toString() ?? "",
      subject_count: s.subject_count?.toString() ?? "",
      special_note: s.special_note ?? "",
      notes: s.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }
  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim()) {
      setError("고객명은 필수입니다.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      manager: form.manager.trim() || null,
      course_type: form.course_type.trim() || null,
      course_detail: form.course_detail.trim() || null,
      institution: form.institution.trim() || null,
      class_start: form.class_start || null,
      student_id: form.student_id.trim() || null,
      customer_name: form.customer_name.trim() || null,
      phone: form.phone.trim() || null,
      education_level: form.education_level.trim() || null,
      region: form.region.trim() || null,
      sub_region: form.sub_region.trim() || null,
      practice_schedule: form.practice_schedule.trim() || null,
      payment_date: form.payment_date || null,
      payment_amount: toNum(form.payment_amount),
      subject_count: toInt(form.subject_count),
      special_note: form.special_note.trim() || null,
      notes: form.notes.trim() || null,
      custom: customVals,
    };
    const isNew = !editingId;
    try {
      if (editingId) {
        const { error } = await supabase
          .from("sales")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sales")
          .insert({ ...payload, owner_id: userId });
        if (error) throw error;
      }
      await reload();
      if (isNew) setPage(1); // 신규 등록은 최신이 맨 앞이므로 1페이지로
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function removeById(id: string, label: string) {
    if (!window.confirm(`'${label || "이 건"}' 을(를) 삭제할까요?`)) return;
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      window.alert(error.message);
      return;
    }
    await reload();
    setOpen(false);
  }

  // 체크박스 선택 항목 수정/삭제
  function editSelectedOne() {
    if (selected.size !== 1) return;
    const id = Array.from(selected)[0];
    const row = rows.find((r) => r.id === id);
    if (row) openEdit(row);
  }
  async function removeSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`선택한 ${ids.length}건을 삭제할까요?`)) return;
    const { error } = await supabase.from("sales").delete().in("id", ids);
    if (error) {
      window.alert(error.message);
      return;
    }
    await reload(); // reload에서 선택 해제됨
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      등록일자: r.created_at?.slice(0, 10) ?? "",
      담당자: r.manager ?? "",
      과정분류: r.course_type ?? "",
      세부과정: r.course_detail ?? "",
      기관명: r.institution ?? "",
      개강반: r.class_start ?? "",
      학생아이디: r.student_id ?? "",
      고객명: r.customer_name ?? "",
      연락처: r.phone ?? "",
      최종학력: r.education_level ?? "",
      지역: r.region ?? "",
      세부지역: r.sub_region ?? "",
      실습예정일: r.practice_schedule ?? "",
      결제일자: r.payment_date ?? "",
      결제금액: r.payment_amount ?? "",
      과목수: r.subject_count ?? "",
      특이사항: r.special_note ?? "",
      기재사항: r.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: [...EXCEL_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "학습자 신규");
    XLSX.writeFile(wb, "학습자신규_내역.xlsx");
  }
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      [...EXCEL_HEADERS],
      [
        "",
        "홍길동",
        "학점은행제",
        "사회복지사2급",
        "올티칭",
        "2026-07-24",
        "skyssoing",
        "김현열",
        "010-4503-4081",
        "고등학교 졸업",
        "경북",
        "구미시",
        "27년도 1학기 03월",
        "2026-06-07",
        450000,
        6,
        "",
        "",
      ],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "템플릿");
    XLSX.writeFile(wb, "학습자신규_일괄등록_템플릿.xlsx");
  }
  // 파일 선택 → 파싱 + 행별 검증 (아직 저장하지 않고 미리보기만)
  async function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkBusy(true);
    setBulkMsg(null);
    setBulkRows(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rowsJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
      });

      const parsed: BulkRow[] = [];
      for (const row of rowsJson) {
        const customer_name = String(row["고객명"] ?? "").trim();
        const student_id = String(row["학생아이디"] ?? "").trim();
        const course_detail = String(row["세부과정"] ?? "").trim();
        // 완전히 빈 행은 건너뜀
        if (!customer_name && !student_id && !course_detail) continue;

        const payAmtRaw = String(row["결제금액"] ?? "").trim();
        const subjRaw = String(row["과목수"] ?? "").trim();
        const payDateRaw = String(row["결제일자"] ?? "").trim();
        const classRaw = String(row["개강반"] ?? "").trim();

        const errors: string[] = [];
        if (!customer_name) errors.push("고객명 없음");
        const payment_amount = toNum(payAmtRaw);
        if (payAmtRaw && payment_amount === null)
          errors.push("결제금액 숫자 아님");
        const subject_count = toInt(subjRaw);
        if (subjRaw && subject_count === null) errors.push("과목수 숫자 아님");
        const payment_date = toDateStr(payDateRaw);
        if (payDateRaw && !payment_date) errors.push("결제일자 형식 오류");
        const class_start = toDateStr(classRaw) ?? (classRaw || null);

        parsed.push({
          data: {
            owner_id: userId,
            manager: String(row["담당자"] ?? "").trim() || null,
            course_type: String(row["과정분류"] ?? "").trim() || null,
            course_detail: course_detail || null,
            institution: String(row["기관명"] ?? "").trim() || null,
            class_start,
            student_id: student_id || null,
            customer_name: customer_name || null,
            phone: String(row["연락처"] ?? "").trim() || null,
            education_level: String(row["최종학력"] ?? "").trim() || null,
            region: String(row["지역"] ?? "").trim() || null,
            sub_region: String(row["세부지역"] ?? "").trim() || null,
            practice_schedule: String(row["실습예정일"] ?? "").trim() || null,
            payment_date,
            payment_amount,
            subject_count,
            special_note: String(row["특이사항"] ?? "").trim() || null,
            notes: String(row["기재사항"] ?? "").trim() || null,
          },
          customer_name,
          manager: String(row["담당자"] ?? "").trim(),
          student_id,
          payAmt: payment_amount,
          payDate: payment_date,
          errors,
        });
      }

      if (parsed.length === 0) {
        setBulkMsg(
          "데이터 행을 찾지 못했습니다. 헤더가 템플릿과 같은지 확인하세요.",
        );
        return;
      }
      setBulkRows(parsed);
      setBulkFileName(file.name);
    } catch (err) {
      setBulkMsg(err instanceof Error ? err.message : "파일 처리 실패");
    } finally {
      setBulkBusy(false);
    }
  }

  // 정상 행만 실제 등록
  async function commitBulk() {
    if (!bulkRows) return;
    const valid = bulkRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      setBulkMsg("정상인 행이 없습니다. 오류를 수정한 뒤 다시 올려주세요.");
      return;
    }
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const { error } = await supabase
        .from("sales")
        .insert(valid.map((r) => r.data));
      if (error) throw error;
      await reload();
      setPage(1);
      const errCount = bulkRows.length - valid.length;
      setBulkMsg(
        `${valid.length}건 등록 완료${errCount ? ` · 오류 ${errCount}건 제외` : ""}`,
      );
      setBulkRows(null);
      setBulkFileName(null);
    } catch (err) {
      setBulkMsg(
        err instanceof Error ? err.message : "일괄등록에 실패했습니다.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function closeBulk() {
    if (bulkBusy) return;
    setBulkOpen(false);
    setBulkRows(null);
    setBulkMsg(null);
    setBulkFileName(null);
  }

  // ---- 테이블/커스텀 설정 (개인별 · 실시간 자동 저장) ----
  function resolved(): SalesViewConfig {
    return {
      order: orderedColumns.map((c) => c.key),
      hidden: [...hidden],
      customFields: customFields.map((f) => ({ ...f })),
      pageSize,
    };
  }
  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
    persist({ ...resolved(), pageSize: n });
  }
  async function persist(next: SalesViewConfig) {
    setConfig(next); // 즉시 표 반영
    const { error } = await supabase
      .from("user_prefs")
      .upsert({ user_id: userId, sales_view: next });
    if (error) {
      window.alert(error.message);
      return;
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }
  function toggleColumn(key: string) {
    if (isLocked(key)) return; // 매출파일 필수 항목은 숨김 불가
    const r = resolved();
    const h = new Set(r.hidden ?? []);
    if (h.has(key)) h.delete(key);
    else h.add(key);
    persist({ ...r, hidden: Array.from(h) });
  }
  // 그룹(자유/매출파일 필수) 내에서만 위아래 이동 — 그룹 경계를 넘지 않음
  function moveColumnGrouped(groupKeys: string[], key: string, dir: -1 | 1) {
    const gi = groupKeys.indexOf(key);
    const gj = gi + dir;
    if (gi < 0 || gj < 0 || gj >= groupKeys.length) return;
    const other = groupKeys[gj];
    const r = resolved();
    const order = [...(r.order ?? [])];
    const i = order.indexOf(key);
    const j = order.indexOf(other);
    if (i < 0 || j < 0) return;
    [order[i], order[j]] = [order[j], order[i]];
    persist({ ...r, order });
  }
  function addField() {
    const label = newFieldLabel.trim();
    if (!label) return;
    const key = "c_" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const r = resolved();
    persist({
      ...r,
      order: [...(r.order ?? []), key],
      customFields: [
        ...(r.customFields ?? []),
        { key, label, type: newFieldType },
      ],
    });
    setNewFieldLabel("");
    setNewFieldType("text");
  }
  function deleteField(key: string) {
    const r = resolved();
    persist({
      order: (r.order ?? []).filter((k) => k !== key),
      hidden: (r.hidden ?? []).filter((k) => k !== key),
      customFields: (r.customFields ?? []).filter((f) => f.key !== key),
    });
  }
  // 커스텀 항목 이름은 타이핑 중 로컬 반영, blur 시 저장 (키는 유지)
  function setFieldLabelLocal(key: string, label: string) {
    setConfig((prev) => ({
      ...prev,
      customFields: (prev.customFields ?? []).map((f) =>
        f.key === key ? { ...f, label } : f,
      ),
    }));
  }
  function commitFieldLabel() {
    persist(resolved());
  }
  function setFieldType(key: string, type: "text" | "number" | "date") {
    const r = resolved();
    persist({
      ...r,
      customFields: (r.customFields ?? []).map((f) =>
        f.key === key ? { ...f, type } : f,
      ),
    });
  }
  function resetConfig() {
    if (
      !window.confirm(
        "테이블 설정을 기본값으로 되돌릴까요? (커스텀 항목 정의도 삭제)",
      )
    )
      return;
    persist({});
  }

  function renderCell(r: Sale, col: { key: string; custom: boolean }) {
    if (col.custom) {
      const v = r.custom?.[col.key];
      return (
        <td key={col.key} className={st.td}>
          {v ? String(v) : "-"}
        </td>
      );
    }
    const key = col.key as keyof Sale;
    if (key === "student_id") {
      const v = cell(r, key);
      return (
        <td key={col.key} className={st.td}>
          <span title={v} className={st.ellipsis}>
            {v}
          </span>
        </td>
      );
    }
    if (key === "payment_amount") {
      return (
        <td key={col.key} className={st.td}>
          {r.payment_amount != null ? `${won(r.payment_amount)}원` : "-"}
        </td>
      );
    }
    if (key === "subject_count") {
      return (
        <td key={col.key} className={st.td}>
          {r.subject_count ?? "-"}
        </td>
      );
    }
    return (
      <td key={col.key} className={st.td}>
        {cell(r, key)}
      </td>
    );
  }

  // 테이블설정 패널의 컬럼 한 줄 렌더 (그룹 내 위/아래 이동)
  // locked = 매출파일 필수 항목 → 숨김·순서변경 불가, 항상 표시
  function renderColItem(
    c: { key: string; label: string; custom: boolean },
    groupKeys: string[],
    gi: number,
    locked = false,
  ) {
    const isHidden = !locked && hidden.includes(c.key);
    const cf = c.custom
      ? customFields.find((f) => f.key === c.key)
      : undefined;
    return (
      <div
        key={c.key}
        className={`${st.colItem} ${isHidden ? st.colItemHidden : ""} ${
          locked ? st.colItemLocked : ""
        }`.trim()}
      >
        <button
          type="button"
          className={isHidden ? `${st.toggle} ${st.toggleOff}` : st.toggle}
          onClick={() => toggleColumn(c.key)}
          disabled={locked}
          title={locked ? "매출파일 필수 (숨김 불가)" : isHidden ? "표시" : "숨김"}
        >
          <span
            className={
              isHidden ? `${st.toggleKnob} ${st.toggleKnobOff}` : st.toggleKnob
            }
          />
        </button>
        {c.custom ? (
          <div className={st.customEdit}>
            <input
              className={st.customLabelInput}
              value={c.label}
              onChange={(e) => setFieldLabelLocal(c.key, e.target.value)}
              onBlur={commitFieldLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              title="이름 수정"
            />
            <select
              className={st.customTypeSelect}
              value={cf?.type ?? "text"}
              onChange={(e) =>
                setFieldType(
                  c.key,
                  e.target.value as "text" | "number" | "date",
                )
              }
            >
              <option value="text">텍스트</option>
              <option value="number">숫자</option>
              <option value="date">날짜</option>
            </select>
          </div>
        ) : (
          <span
            className={
              isHidden ? `${st.colLabel} ${st.colLabelHidden}` : st.colLabel
            }
          >
            {c.label}
          </span>
        )}
        <button
          type="button"
          className={st.miniBtn}
          onClick={() => moveColumnGrouped(groupKeys, c.key, -1)}
          disabled={locked || gi === 0}
        >
          ▲
        </button>
        <button
          type="button"
          className={st.miniBtn}
          onClick={() => moveColumnGrouped(groupKeys, c.key, 1)}
          disabled={locked || gi === groupKeys.length - 1}
        >
          ▼
        </button>
        {c.custom && (
          <button
            type="button"
            className={`${st.miniBtn} ${st.miniBtnDel}`}
            onClick={() => deleteField(c.key)}
            title="삭제"
          >
            🗑
          </button>
        )}
      </div>
    );
  }

  const pageList = Array.from({ length: pageCount }, (_, i) => i + 1)
    .filter((n) => Math.abs(n - safePage) <= 2 || n === 1 || n === pageCount)
    .reduce<number[]>((acc, n) => {
      if (acc.length && n - acc[acc.length - 1] > 1) acc.push(-1);
      acc.push(n);
      return acc;
    }, []);

  return (
    <div className={st.page}>
      <div className={st.inner}>
        {/* 타이틀 */}
        <div className={st.titleRow}>
          <h1 className={st.h1}>{heading}</h1>
        </div>

        {/* 검색 + 액션 */}
        <div className={st.searchRow}>
          <div className={st.searchWrap} data-guide="students-search">
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
              placeholder="고객명, 연락처, 기관명, 담당자로 검색..."
            />
          </div>
          {editable && (
            <div className={st.headActions}>
              <button
                className={st.settingsBtn}
                onClick={() => setSettingsOpen(true)}
                data-guide="students-settings"
              >
                ⚙ 테이블설정
              </button>
              <button
                className={st.primaryBtn}
                onClick={openAdd}
                data-guide="students-add"
              >
                개별등록
              </button>
              <button
                className={st.primaryBtn}
                onClick={() => {
                  setBulkMsg(null);
                  setBulkOpen(true);
                }}
                data-guide="students-bulk"
              >
                일괄등록
              </button>
            </div>
          )}
        </div>

        {/* 기간 칩 + 엑셀 */}
        <div className={st.chipRow}>
          <div className={st.chipLeft} data-guide="students-filters">
          <div className={st.chipWrap}>
            <button
              className={
                regFrom || regTo ? `${st.chip} ${st.chipActive}` : st.chip
              }
              onClick={() => setPicker(picker === "reg" ? null : "reg")}
            >
              <CalendarIcon />
              {regFrom || regTo
                ? `${regFrom || "…"} ~ ${regTo || "…"}`
                : "등록기간선택"}
              {(regFrom || regTo) && (
                <span
                  role="button"
                  className={st.chipClear}
                  aria-label="등록기간 해제"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRegFrom("");
                    setRegTo("");
                    setPage(1);
                  }}
                >
                  ×
                </span>
              )}
            </button>
            {picker === "reg" && (
              <div className={st.calPop} onClick={(e) => e.stopPropagation()}>
                <DateRangeCalendar
                  defaultValue={{
                    from: parseYmd(regFrom),
                    to: parseYmd(regTo),
                  }}
                  onConfirm={(r) => {
                    setRegFrom(ymd(r?.from));
                    setRegTo(ymd(r?.to ?? r?.from));
                    setPage(1);
                    setPicker(null);
                  }}
                  onReset={() => {
                    setRegFrom("");
                    setRegTo("");
                    setPage(1);
                    setPicker(null);
                  }}
                />
              </div>
            )}
          </div>
          <div className={st.chipWrap}>
            <button
              className={
                payFrom || payTo ? `${st.chip} ${st.chipActive}` : st.chip
              }
              onClick={() => setPicker(picker === "pay" ? null : "pay")}
            >
              <CalendarIcon />
              {payFrom || payTo
                ? `${payFrom || "…"} ~ ${payTo || "…"}`
                : "결제기간선택"}
              {(payFrom || payTo) && (
                <span
                  role="button"
                  className={st.chipClear}
                  aria-label="결제기간 해제"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPayFrom("");
                    setPayTo("");
                    setPage(1);
                  }}
                >
                  ×
                </span>
              )}
            </button>
            {picker === "pay" && (
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
                    setPicker(null);
                  }}
                  onReset={() => {
                    setPayFrom("");
                    setPayTo("");
                    setPage(1);
                    setPicker(null);
                  }}
                />
              </div>
            )}
          </div>
          {editable && selected.size > 0 && (
            <div className={st.selActions}>
              <button
                type="button"
                className={st.selEdit}
                onClick={editSelectedOne}
                disabled={selected.size !== 1}
                title={
                  selected.size !== 1
                    ? "수정은 1건만 선택했을 때 가능합니다"
                    : "수정"
                }
              >
                수정 ({selected.size})
              </button>
              <button
                type="button"
                className={st.selDelete}
                onClick={removeSelected}
              >
                삭제 ({selected.size})
              </button>
            </div>
          )}
          </div>
          <button className={st.excelBtn} onClick={exportExcel}>
            엑셀 다운로드
          </button>
        </div>

        {/* 요약 */}
        <div className={st.summaryRow}>
          <span className={st.summaryLeft}>
            총 {filtered.length.toLocaleString("ko-KR")}건의 데이터{" "}
          </span>
          <span className={st.summaryRight}>
            전체 매출: <span className={st.totalBlue}>{won(totalSales)}원</span>
          </span>
        </div>

        {/* 표 */}
        <div className={st.tableWrap} data-guide="students-table">
          <table className={st.table}>
            <thead>
              <tr className={st.theadRow}>
                {editable && (
                  <th className={st.checkTh}>
                    <input
                      type="checkbox"
                      className={st.checkbox}
                      checked={allChecked}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {visibleColumns.map((c) => (
                  <th key={c.key} className={st.th}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      editable
                        ? visibleColumns.length + 1
                        : visibleColumns.length
                    }
                    className={st.emptyCell}
                  >
                    {rows.length === 0
                      ? editable
                        ? "아직 등록된 데이터가 없습니다. “개별등록”으로 시작하세요."
                        : "아직 등록된 데이터가 없습니다."
                      : "조건에 맞는 데이터가 없습니다."}
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className={st.row} onClick={() => openEdit(r)}>
                    {editable && (
                      <td
                        className={st.checkCell}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className={st.checkbox}
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => renderCell(r, c))}
                  </tr>
                ))
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
              onChange={(e) => changePageSize(Number(e.target.value))}
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

      {/* 개별등록/수정 드로어 */}
      {editable && open && (
        <div className={styles.drawerOverlay} onClick={() => setOpen(false)}>
          <form
            className={styles.drawer}
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>
                {editingId ? "매출 수정" : "개별등록"}
              </h2>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <div className={styles.drawerBody}>
              <label className={styles.field}>
                <span className={styles.label}>과정분류 *</span>
                <select
                  className={styles.select}
                  value={form.course_type}
                  onChange={(e) => set("course_type", e.target.value)}
                >
                  <option value="">선택</option>
                  {COURSE_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>세부과정 *</span>
                <input
                  className={styles.input}
                  value={form.course_detail}
                  onChange={(e) => set("course_detail", e.target.value)}
                  placeholder="사회복지사2급"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>기관명 *</span>
                <input
                  className={styles.input}
                  value={form.institution}
                  onChange={(e) => set("institution", e.target.value)}
                  placeholder="서사평"
                />
              </label>
              <div className={styles.field}>
                <span className={styles.label}>개강반</span>
                <DateInput
                  value={form.class_start}
                  onChange={(v) => set("class_start", v)}
                  triggerClassName={styles.input}
                  placeholder="날짜 선택"
                  clearable
                />
              </div>
              <label className={styles.field}>
                <span className={styles.label}>학생아이디 *</span>
                <input
                  className={styles.input}
                  value={form.student_id}
                  onChange={(e) => set("student_id", e.target.value)}
                />
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>고객명 *</span>
                  <input
                    className={styles.input}
                    value={form.customer_name}
                    onChange={(e) => set("customer_name", e.target.value)}
                    required
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>연락처 *</span>
                  <input
                    className={styles.input}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="010-1234-5678"
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>최종학력 *</span>
                <select
                  className={styles.select}
                  value={form.education_level}
                  onChange={(e) => set("education_level", e.target.value)}
                >
                  <option value="">선택</option>
                  {EDUCATION_LEVEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>지역 *</span>
                  <input
                    className={styles.input}
                    value={form.region}
                    onChange={(e) => set("region", e.target.value)}
                    placeholder="서울"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>세부지역 *</span>
                  <input
                    className={styles.input}
                    value={form.sub_region}
                    onChange={(e) => set("sub_region", e.target.value)}
                    placeholder="강남구"
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>실습예정일</span>
                <input
                  className={styles.input}
                  value={form.practice_schedule}
                  onChange={(e) => set("practice_schedule", e.target.value)}
                  placeholder="예: 27년도 1학기 03월"
                />
              </label>
              <div className={styles.fieldPair}>
                <div className={styles.field}>
                  <span className={styles.label}>결제일자 *</span>
                  <DateInput
                    value={form.payment_date}
                    onChange={(v) => set("payment_date", v)}
                    triggerClassName={styles.input}
                    placeholder="날짜 선택"
                    clearable
                  />
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>결제금액 (원)</span>
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="numeric"
                    value={form.payment_amount}
                    onChange={(e) => set("payment_amount", e.target.value)}
                    placeholder="450000"
                  />
                </label>
              </div>
              <div className={styles.fieldPair}>
                <label className={styles.field}>
                  <span className={styles.label}>과목수</span>
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="numeric"
                    value={form.subject_count}
                    onChange={(e) => set("subject_count", e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>담당자</span>
                  <input
                    className={styles.input}
                    value={form.manager}
                    onChange={(e) => set("manager", e.target.value)}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>특이사항</span>
                <input
                  className={styles.input}
                  value={form.special_note}
                  onChange={(e) => set("special_note", e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>기재사항</span>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </label>
              {customFields.map((f) => (
                <div key={f.key} className={styles.field}>
                  <span className={styles.label}>
                    {f.label} <span className={st.customTag}>(커스텀)</span>
                  </span>
                  {f.type === "date" ? (
                    <DateInput
                      value={customVals[f.key] ?? ""}
                      onChange={(v) =>
                        setCustomVals((prev) => ({ ...prev, [f.key]: v }))
                      }
                      triggerClassName={styles.input}
                      placeholder="날짜 선택"
                      clearable
                    />
                  ) : (
                    <input
                      className={styles.input}
                      type={f.type === "number" ? "number" : "text"}
                      inputMode={f.type === "number" ? "numeric" : undefined}
                      value={customVals[f.key] ?? ""}
                      onChange={(e) =>
                        setCustomVals((v) => ({
                          ...v,
                          [f.key]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
              {error && <p className={styles.modalError}>{error}</p>}
            </div>
            <div className={styles.drawerFooter}>
              {editingId && (
                <button
                  className={styles.delBtnRed}
                  type="button"
                  onClick={() => removeById(editingId, form.customer_name)}
                  style={{ marginRight: "auto" }}
                >
                  삭제
                </button>
              )}
              <button
                className={styles.cancelBtn}
                type="button"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
              <button
                className={styles.saveBtn}
                type="submit"
                disabled={saving}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 일괄등록 모달 (미리보기 + 검증) */}
      {editable &&
        bulkOpen &&
        (() => {
          const validCount = bulkRows
            ? bulkRows.filter((r) => r.errors.length === 0).length
            : 0;
          const errCount = bulkRows ? bulkRows.length - validCount : 0;
          return (
            <div className={styles.overlay} onClick={closeBulk}>
              <div
                className={styles.modal}
                style={{ maxWidth: 880 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className={styles.modalTitle}>일괄등록 (엑셀)</h2>

                {/* 컬럼 안내 */}
                <div className={st.bulkGuide}>
                  <div className={st.bulkGuideHint}>
                    아래 컬럼명(1행)으로 작성하세요. <b className={st.req}>*</b>{" "}
                    는 필수입니다.
                  </div>
                  <div className={st.bulkChips}>
                    {[...EXCEL_HEADERS].map((h) => (
                      <span
                        key={h}
                        className={
                          BULK_REQUIRED.includes(h)
                            ? `${st.bulkChip} ${st.bulkChipReq}`
                            : st.bulkChip
                        }
                      >
                        {h}
                        {BULK_REQUIRED.includes(h) && (
                          <b className={st.req}> *</b>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={styles.bulkActions}>
                  <button
                    className={styles.ghostBtn}
                    type="button"
                    onClick={downloadTemplate}
                  >
                    템플릿 다운로드
                  </button>
                  <label className={styles.uploadBtn}>
                    {bulkBusy && !bulkRows
                      ? "분석 중…"
                      : bulkRows
                        ? "다른 파일 선택"
                        : "엑셀 파일 선택"}
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      hidden
                      disabled={bulkBusy}
                      onChange={handleBulkFile}
                    />
                  </label>
                  {bulkFileName && (
                    <span className={st.bulkFileName}>· {bulkFileName}</span>
                  )}
                </div>

                {/* 검증 요약 + 미리보기 */}
                {bulkRows && (
                  <>
                    <div className={st.bulkSummary}>
                      <span className={st.statTotal}>
                        총 <b>{bulkRows.length}</b>행
                      </span>
                      <span className={st.statOk}>
                        정상 <b>{validCount}</b>
                      </span>
                      <span className={errCount ? st.statErr : st.statMuted}>
                        오류 <b>{errCount}</b>
                      </span>
                    </div>
                    <div
                      className={styles.tableWrap}
                      style={{ maxHeight: 320, overflowY: "auto" }}
                    >
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.th}>상태</th>
                            <th className={styles.th}>고객명</th>
                            <th className={styles.th}>담당자</th>
                            <th className={styles.th}>학생아이디</th>
                            <th className={styles.th}>결제금액</th>
                            <th className={styles.th}>결제일자</th>
                            <th className={styles.th}>오류사유</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkRows.map((r, i) => {
                            const ok = r.errors.length === 0;
                            return (
                              <tr
                                key={i}
                                className={ok ? undefined : st.errRow}
                              >
                                <td className={styles.td}>
                                  {ok ? (
                                    <span className={st.previewOk}>정상</span>
                                  ) : (
                                    <span className={st.previewErr}>오류</span>
                                  )}
                                </td>
                                <td className={styles.td}>
                                  {r.customer_name || "-"}
                                </td>
                                <td className={styles.td}>
                                  {r.manager || "-"}
                                </td>
                                <td className={styles.td}>
                                  {r.student_id || "-"}
                                </td>
                                <td className={`${styles.td} ${styles.num}`}>
                                  {r.payAmt != null
                                    ? r.payAmt.toLocaleString("ko-KR")
                                    : "-"}
                                </td>
                                <td className={styles.td}>
                                  {r.payDate || "-"}
                                </td>
                                <td className={styles.td}>
                                  <span className={st.errText}>
                                    {r.errors.join(", ") || "-"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {bulkMsg && <p className={styles.bulkMsg}>{bulkMsg}</p>}

                <div className={styles.modalActions}>
                  <button
                    className={styles.cancelBtn}
                    type="button"
                    onClick={closeBulk}
                    disabled={bulkBusy}
                  >
                    닫기
                  </button>
                  {bulkRows && (
                    <button
                      className={styles.saveBtn}
                      type="button"
                      onClick={commitBulk}
                      disabled={bulkBusy || validCount === 0}
                    >
                      {bulkBusy ? "등록 중…" : `정상 ${validCount}건 등록`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* 테이블 설정 패널 (개인별 · 즉시 반영/자동 저장) */}
      {editable && settingsOpen && (
        <>
          <div
            className={st.settingsOverlay}
            onClick={() => setSettingsOpen(false)}
          />
          <div className={st.settingsPanel}>
            <div className={st.panelHeader}>
              <div className={st.panelHeadLeft}>
                <h2 className={st.panelTitle}>내 테이블 설정</h2>
                <span
                  className={
                    savedFlash ? `${st.saveHint} ${st.saveHintOn}` : st.saveHint
                  }
                >
                  {savedFlash ? "✓ 저장됨" : "자동 저장"}
                </span>
              </div>
              <button
                type="button"
                className={st.panelClose}
                onClick={() => setSettingsOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className={st.panelBody}>
              {/* 커스텀 항목 추가 */}
              <div>
                <div className={st.sectionTitle}>커스텀 항목 추가</div>
                <div className={st.addRow}>
                  <input
                    className={st.addInput}
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addField();
                      }
                    }}
                    placeholder="항목명 (예: 지역교육청)"
                  />
                  <select
                    className={st.typeSelect}
                    value={newFieldType}
                    onChange={(e) =>
                      setNewFieldType(
                        e.target.value as "text" | "number" | "date",
                      )
                    }
                  >
                    <option value="text">텍스트</option>
                    <option value="number">숫자</option>
                    <option value="date">날짜</option>
                  </select>
                  <button
                    type="button"
                    className={st.addBtn}
                    onClick={addField}
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 컬럼 목록 */}
              <div>
                <div className={st.colHeader}>
                  <span className={st.sectionTitle} style={{ marginBottom: 0 }}>
                    컬럼 ({visibleColumns.length}/{orderedColumns.length} 표시)
                  </span>
                  <button
                    type="button"
                    className={st.resetLink}
                    onClick={resetConfig}
                  >
                    기본값으로
                  </button>
                </div>
                <div className={st.colList}>
                  {topCols.map((c, gi) =>
                    renderColItem(
                      c,
                      topCols.map((x) => x.key),
                      gi,
                    ),
                  )}
                </div>
                {bottomCols.length > 0 && (
                  <>
                    <div className={st.groupDivider}>
                      🔒 매출파일 필수 항목
                      <span className={st.groupDividerHint}>
                        숨김·순서변경 불가
                      </span>
                    </div>
                    <div className={st.colList}>
                      {bottomCols.map((c, gi) =>
                        renderColItem(
                          c,
                          bottomCols.map((x) => x.key),
                          gi,
                          true,
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
