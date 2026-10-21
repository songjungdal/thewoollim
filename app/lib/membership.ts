/**
 * 어울림 멤버십(자동결제) 화면 공용 — 서버 API 응답 타입, 호출, 문구.
 * 서버: api/membership/state.php · confirm.php · cancel.php (공통 규칙 api/membership/_lib.php)
 * 이번 단계(1-A)는 카드 등록 + 첫 결제 + 해지 예약까지. 파티 예약 혜택 연동은 없다.
 */

export const MEMBERSHIP_PRICE = 99000;

export type MembershipPayment = {
  cycleNo: number;
  orderId: string;
  amount: number;
  status: "success" | "failed" | "refunded" | string;
  approvedAt: string | null;
  failMessage: string | null;
};

export type MembershipView = {
  status: "pending" | "active" | "canceled" | "expired" | string;
  price: number;
  isTest: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  cardCompany: string | null;
  cardLast4: string | null;
  payments: MembershipPayment[];
};

export type MembershipState = {
  ok: boolean;
  ready: boolean;
  mode: "test" | "live";
  price: number;
  today: string;
  nextBillingDate: string;
  loggedIn: boolean;
  clientKey?: string;
  customerKey?: string;
  membership: MembershipView | null;
};

/** 결제한 기간 안에서 이용 중인지 */
export function isMembershipCurrent(m: MembershipView | null | undefined): boolean {
  return !!m && m.status === "active";
}

export async function fetchMembershipState(join = false): Promise<MembershipState | null> {
  try {
    const r = await fetch(`/api/membership/state.php${join ? "?join=1" : ""}`, { credentials: "include", cache: "no-store" });
    const d = await r.json().catch(() => null);
    return d && d.ok ? (d as MembershipState) : null;
  } catch {
    return null;
  }
}

/** "2026-10-21" → "2026년 10월 21일" */
export function formatYmd(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : "-";
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 토스 결제창·결제 API 오류 코드 → 사용자 안내 (없는 코드는 토스 메시지를 그대로 보여준다) */
const FAIL_MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: "카드 등록을 취소했습니다.",
  USER_CANCEL: "카드 등록을 취소했습니다.",
  PAY_PROCESS_ABORTED: "카드 등록이 중단되었습니다. 다시 시도해주세요.",
  REJECT_CARD_COMPANY: "카드사에서 등록을 거절했습니다. 다른 카드로 시도해주세요.",
  INVALID_CARD_NUMBER: "카드 번호를 다시 확인해주세요.",
  NOT_SUPPORTED_CARD_TYPE: "등록할 수 없는 카드입니다. 국내에서 발급된 다른 카드로 시도해주세요.",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "오늘 결제 가능 횟수를 넘었습니다. 내일 다시 시도해주세요.",
  NOT_ENOUGH_BALANCE: "잔액이나 한도가 부족합니다. 다른 카드로 시도해주세요.",
  CUSTOMER_KEY_MISMATCH: "로그인한 회원의 카드 등록 정보가 아닙니다. 다시 시도해주세요.",
  NOT_READY: "멤버십 결제를 준비하고 있습니다. 잠시 후 다시 시도해주세요.",
  NETWORK_ERROR: "결제사와 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

export function failMessageFor(code: string | null | undefined, fallback?: string | null): string {
  if (code && FAIL_MESSAGES[code]) return FAIL_MESSAGES[code];
  if (fallback && fallback.trim()) return fallback.trim();
  return "카드 등록 또는 결제를 완료하지 못했습니다. 다시 시도해주세요.";
}

// ── 토스 결제창 SDK v2 (자동결제) — checkout 의 결제위젯 타입 선언과 겹치지 않게 지역 타입으로 쓴다 ──
type TossBillingPayment = {
  requestBillingAuth: (opts: {
    method: "CARD";
    successUrl: string;
    failUrl: string;
    customerEmail?: string;
    customerName?: string;
  }) => Promise<void>;
};
type TossBillingFactory = (clientKey: string) => { payment: (opts: { customerKey: string }) => TossBillingPayment };

/** SDK(app/layout.tsx 의 js.tosspayments.com/v2/standard) 로드를 최대 5초 기다린다 */
export async function loadTossBilling(): Promise<TossBillingFactory | null> {
  const w = window as unknown as { TossPayments?: TossBillingFactory };
  for (let i = 0; i < 50 && !w.TossPayments; i++) await new Promise(r => setTimeout(r, 100));
  return w.TossPayments ?? null;
}
