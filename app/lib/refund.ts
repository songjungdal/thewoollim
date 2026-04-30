/**
 * 어울림 환불 규정 (서버 권위 동일 규정 — api/payments/refund.php와 일치 유지).
 *
 *  파티 5일 전 이상 : 100% 환불
 *  파티 4일 전      :  80% 환불
 *  파티 3일 전      :  50% 환불
 *  파티 2일 전 이하 :   0% 환불 (불가)
 *
 * 일수는 자정(00:00) 기준으로 계산: floor((partyMidnight - todayMidnight) / 1 day).
 * 예) 오늘 4월 28일, 파티 5월 3일 → 5일 → 100%
 *     오늘 4월 28일, 파티 4월 30일 → 2일 → 0%
 */

export type RefundResult = {
  /** 오늘 자정 기준 파티 자정까지 남은 일수 (음수면 이미 지남) */
  days:   number;
  /** 0.0 ~ 1.0 비율 */
  rate:   number;
  /** 사람이 읽는 라벨 ("100% 환불" 등) */
  label:  string;
  /** 실제 환불 예정 금액 (원) — paid amount × rate, 소수점 버림 */
  refund: number;
};

export function refundTier(days: number): { rate: number; label: string } {
  if (days >= 5)      return { rate: 1.00, label: "100% 환불" };
  if (days === 4)     return { rate: 0.80, label: "80% 환불" };
  if (days === 3)     return { rate: 0.50, label: "50% 환불" };
  return                        { rate: 0,    label: "환불 불가" };
}

/** "YYYY-MM-DD" 형식의 파티 일자에서 오늘까지 남은 일수 계산 */
export function daysUntil(calendarDate: string, now: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(calendarDate);
  if (!m) return -9999;
  const Y = Number(m[1]), M = Number(m[2]) - 1, D = Number(m[3]);
  const partyMidnight = new Date(Y, M, D).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((partyMidnight - todayMidnight) / 86400000);
}

export function calculateRefund(paidAmount: number, calendarDate: string, now?: Date): RefundResult {
  const days = daysUntil(calendarDate, now);
  const { rate, label } = refundTier(days);
  return { days, rate, label, refund: Math.floor(Math.max(0, paidAmount) * rate) };
}

/** 환불 안내 표 렌더링용 데이터 */
export const REFUND_TABLE: Array<{ when: string; rate: string; tone: string }> = [
  { when: "파티 5일 전 이상",      rate: "100% 환불",  tone: "text-emerald-700 bg-emerald-50" },
  { when: "파티 4일 전",          rate: "80% 환불",   tone: "text-amber-700 bg-amber-50" },
  { when: "파티 3일 전",          rate: "50% 환불",   tone: "text-amber-700 bg-amber-50" },
  { when: "파티 2일 전 ~ 당일",   rate: "환불 불가",   tone: "text-red-700 bg-red-50" },
];
