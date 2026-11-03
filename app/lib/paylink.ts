/**
 * 대관료 결제 링크 — 화면 공통 (docs/specs/paylink.md). 서버: api/paylink/*, api/admin/paylinks.php
 *  - 금액·기한·상태의 최종 판단은 서버(api/paylink/_lib.php). 여기 규칙은 입력 중 안내용으로 같은 값을 쓴다.
 *  - 환불 규정 표는 파티 규정(app/lib/refund.ts REFUND_TABLE)을 그대로 쓰고 "파티" 낱말만 "이용일"로 바꾼다.
 */

import { REFUND_TABLE } from "./refund";

export const PAYLINK_LIMITS = {
  amountMin: 1000,
  amountMax: 2000000,
  titleMin: 2,
  titleMax: 40,
  useInfoMax: 100,
  noticeMax: 500,
  memoMax: 500,
  payerNameMax: 20,
  deadlineDays: 30,
  defaultDays: 7,
  cancelReasonMax: 100,
} as const;

/** 저장 상태 + "기한 지남"(open 이면서 기한이 지남) */
export type PaylinkState = "open" | "expired" | "stopped" | "paid" | "partial_cancelled" | "cancelled";

export const PAYLINK_STATE_META: Record<PaylinkState, { label: string; tone: string }> = {
  open: { label: "결제 대기", tone: "bg-sky-100 text-sky-800" },
  expired: { label: "기한 지남", tone: "bg-gray-100 text-gray-600" },
  stopped: { label: "중지", tone: "bg-gray-200 text-gray-700" },
  paid: { label: "결제 완료", tone: "bg-emerald-100 text-emerald-800" },
  partial_cancelled: { label: "부분 취소", tone: "bg-amber-100 text-amber-800" },
  cancelled: { label: "전액 취소", tone: "bg-red-100 text-red-700" },
};

/** 결제 페이지용 환불 규정 표 — 파티 규정 그대로, 문구만 "파티" → "이용일" */
export const PAYLINK_REFUND_ROWS = REFUND_TABLE.map(r => ({ ...r, when: r.when.replace("파티", "이용일") }));

export const PAYLINK_SUPPORT_EMAIL = "info@thewoollim.com";

/** 결제자 정보 수집·이용 동의 (명세 5장 문구 그대로) */
export const PAYLINK_PRIVACY_TEXT: { label: string; body: string }[] = [
  { label: "수집 항목", body: "이름, 휴대폰 번호, 결제 기록" },
  { label: "이용 목적", body: "대관료 결제 확인, 결제·취소 안내, 결제 관련 문의 응대" },
  { label: "보유 기간", body: "관계 법령에 따른 보존 기간(전자상거래 등에서의 소비자보호에 관한 법률상 대금결제 및 재화 등의 공급에 관한 기록 5년)" },
];
export const PAYLINK_PRIVACY_NOTE = "동의를 거부할 수 있으나 거부 시 결제할 수 없습니다.";

export const won = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("ko-KR")}원`;

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-20" → "2026년 11월 20일 (목)" */
export function formatUseDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 (${WEEK[dt.getDay()]})`;
}

/** "2026-11-12 23:59:59" → "11월 12일 (목) 23:59" */
export function formatDeadline(dt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(dt);
  if (!m) return dt;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}월 ${Number(m[3])}일 (${WEEK[d.getDay()]}) ${m[4]}:${m[5]}`;
}

/** "2026-11-12 23:59:59" → "2026-11-12 23:59" (관리자 목록) */
export const shortDateTime = (dt: string) => (dt ? dt.slice(0, 16).replace("T", " ") : "-");

export const isMobilePhone = (digits: string) => /^01\d{8,9}$/.test(digits);

/** 오늘(브라우저 기준) "YYYY-MM-DD" + n일 */
export function localDate(addDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 기본 결제 기한 (입력칸 형식 "YYYY-MM-DDTHH:MM") — 오늘부터 7일 뒤 23:59, 이용일이 더 빠르면 이용일 23:59 */
export function defaultDeadlineInput(useDate: string): string {
  let d = localDate(PAYLINK_LIMITS.defaultDays);
  if (/^\d{4}-\d{2}-\d{2}$/.test(useDate) && useDate < d) d = useDate;
  return `${d}T23:59`;
}

/** 서버 기한 "YYYY-MM-DD HH:MM:SS" → 입력칸 "YYYY-MM-DDTHH:MM" */
export const deadlineToInput = (dt: string) => (dt ? dt.slice(0, 16).replace(" ", "T") : "");

/** 오늘 기준 규정 문구 — "이용일 4일 전 · 80% 환불" */
export function quoteLabel(q: { days: number; rate: number }): string {
  const when = q.days > 0 ? `이용일 ${q.days}일 전` : q.days === 0 ? "이용일 당일" : `이용일 ${-q.days}일 지남`;
  return `${when} · ${q.rate > 0 ? `${Math.round(q.rate * 100)}% 환불` : "환불 불가"}`;
}
