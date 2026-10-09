/**
 * 솔로파티 참가 구성 (회차 sessions · 참가 항목 options) — 화면 쪽 공용 정의.
 * 명세: docs/specs/party-options-solo.md. 서버 규칙(같은 제한): api/lib.php sanitizePartyOptions.
 *
 *  - 회차: 이름, 시작 시각(HH:MM, 당일 자정 전), 남/여 정원(1~100). 1~5개, 시작 시각 순서.
 *  - 항목: 이름, 포함 회차(1개 이상), 남/여 가격(1원 이상). 1~6개. 묶음 가격도 직접 입력.
 *  - id 는 서버가 만든다. 관리자 화면의 새 회차·항목은 임시 키("new-…")로 보내면 서버가 새 id 를 붙인다.
 */

export type PartySession = {
  id: string;
  name: string;
  startTime: string;      // "19:00"
  maleStock: number;
  femaleStock: number;
  maleBooked?: number;    // 공개 목록(api/parties.php)의 회차별 신청 인원
  femaleBooked?: number;
};

export type PartyOption = {
  id: string;
  name: string;
  sessionIds: string[];
  priceMale: number;
  priceFemale: number;
};

/** 관리자 GET 의 신청자 수 (취소되지 않은 예약 기준, 입금 전 무통장 포함) */
export type OptionApplicants = {
  options: Record<string, number>;
  sessions: Record<string, { male: number; female: number }>;
};

export const OPTION_LIMITS = { sessions: 5, options: 6, name: 20, stockMax: 100, priceMax: 10_000_000 } as const;
export const SESSION_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── 관리자 입력용 (숫자 칸은 비워 둘 수 있게 문자열) ─────────────────
export type SessionDraft = { key: string; name: string; startTime: string; maleStock: string; femaleStock: string };
export type OptionDraft = { key: string; name: string; sessionKeys: string[]; priceMale: string; priceFemale: string };
export type OptionsDraft = { sessions: SessionDraft[]; options: OptionDraft[] };

export const EMPTY_OPTIONS_DRAFT: OptionsDraft = { sessions: [], options: [] };

let newKeySeq = 0;
/** 새 회차·항목의 임시 키 — 서버가 실제 id 로 바꾼다 */
export function newDraftKey(): string {
  newKeySeq += 1;
  return `new-${Date.now().toString(36)}-${newKeySeq}`;
}

export function isNewDraftKey(key: string): boolean {
  return key.startsWith("new-");
}

/** 저장된 회차·항목 → 입력 상태 */
export function draftFromParty(sessions: PartySession[] | undefined, options: PartyOption[] | undefined): OptionsDraft {
  return {
    sessions: (sessions ?? []).map(s => ({
      key: s.id, name: s.name, startTime: s.startTime, maleStock: String(s.maleStock), femaleStock: String(s.femaleStock),
    })),
    options: (options ?? []).map(o => ({
      key: o.id, name: o.name, sessionKeys: [...o.sessionIds], priceMale: String(o.priceMale), priceFemale: String(o.priceFemale),
    })),
  };
}

/** [기본 구성 넣기] — 회차 1부·2부, 항목 1부·2부·1부+2부. 시각·가격·정원은 비워 두어 직접 입력 */
export function defaultOptionsDraft(): OptionsDraft {
  const s1 = newDraftKey(), s2 = newDraftKey();
  const blankSession = { startTime: "", maleStock: "", femaleStock: "" };
  const blankPrice = { priceMale: "", priceFemale: "" };
  return {
    sessions: [{ key: s1, name: "1부", ...blankSession }, { key: s2, name: "2부", ...blankSession }],
    options: [
      { key: newDraftKey(), name: "1부", sessionKeys: [s1], ...blankPrice },
      { key: newDraftKey(), name: "2부", sessionKeys: [s2], ...blankPrice },
      { key: newDraftKey(), name: "1부+2부", sessionKeys: [s1, s2], ...blankPrice },
    ],
  };
}

const intIn = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

/**
 * 저장 전 화면 검사 (6-1) — 문제 목록(누락 알림에 그대로 붙인다). 비어 있으면 저장 가능.
 * 신청자가 있을 때의 제한(삭제·포함 회차 변경)은 편집기에서 버튼을 막고, 정원은 여기서 확인한다. 서버가 최종 판정.
 */
export function validateOptionsDraft(d: OptionsDraft, applicants?: OptionApplicants | null): string[] {
  const errs: string[] = [];
  if (d.sessions.length < 1 || d.sessions.length > OPTION_LIMITS.sessions) errs.push(`회차 1~${OPTION_LIMITS.sessions}개`);
  if (d.options.length < 1 || d.options.length > OPTION_LIMITS.options) errs.push(`참가 항목 1~${OPTION_LIMITS.options}개`);
  const sNames = new Set<string>();
  d.sessions.forEach((s, i) => {
    const label = s.name.trim() || `회차 ${i + 1}`;
    if (!s.name.trim()) errs.push(`회차 ${i + 1} 이름`);
    else if (s.name.trim().length > OPTION_LIMITS.name) errs.push(`${label} 이름(${OPTION_LIMITS.name}자 이하)`);
    else if (sNames.has(s.name.trim())) errs.push(`회차 이름 중복(${label})`);
    sNames.add(s.name.trim());
    if (!SESSION_TIME_RE.test(s.startTime.trim())) errs.push(`${label} 시작 시각(예: 19:00)`);
    if (!intIn(s.maleStock, 1, OPTION_LIMITS.stockMax)) errs.push(`${label} 남 정원(1~${OPTION_LIMITS.stockMax})`);
    if (!intIn(s.femaleStock, 1, OPTION_LIMITS.stockMax)) errs.push(`${label} 여 정원(1~${OPTION_LIMITS.stockMax})`);
    const a = applicants?.sessions?.[s.key];
    if (a && intIn(s.maleStock, 1, OPTION_LIMITS.stockMax) && Number(s.maleStock) < a.male) errs.push(`${label} 남 정원(신청 ${a.male}명보다 적게 불가)`);
    if (a && intIn(s.femaleStock, 1, OPTION_LIMITS.stockMax) && Number(s.femaleStock) < a.female) errs.push(`${label} 여 정원(신청 ${a.female}명보다 적게 불가)`);
  });
  const keys = new Set(d.sessions.map(s => s.key));
  const oNames = new Set<string>();
  d.options.forEach((o, i) => {
    const label = o.name.trim() || `항목 ${i + 1}`;
    if (!o.name.trim()) errs.push(`참가 항목 ${i + 1} 이름`);
    else if (o.name.trim().length > OPTION_LIMITS.name) errs.push(`${label} 이름(${OPTION_LIMITS.name}자 이하)`);
    else if (oNames.has(o.name.trim())) errs.push(`참가 항목 이름 중복(${label})`);
    oNames.add(o.name.trim());
    if (o.sessionKeys.filter(k => keys.has(k)).length === 0) errs.push(`${label} 포함 회차`);
    if (!intIn(o.priceMale, 1, OPTION_LIMITS.priceMax)) errs.push(`${label} 남 가격`);
    if (!intIn(o.priceFemale, 1, OPTION_LIMITS.priceMax)) errs.push(`${label} 여 가격`);
  });
  return errs;
}

/** 입력 상태 → 저장 요청 (sessions·options). 새 회차·항목은 임시 키를 id 로 보낸다 */
export function draftToPayload(d: OptionsDraft): { sessions: object[]; options: object[] } {
  const keys = new Set(d.sessions.map(s => s.key));
  return {
    sessions: d.sessions.map(s => ({
      id: s.key, name: s.name.trim(), startTime: s.startTime.trim(),
      maleStock: Number(s.maleStock), femaleStock: Number(s.femaleStock),
    })),
    options: d.options.map(o => ({
      id: o.key, name: o.name.trim(), sessionIds: o.sessionKeys.filter(k => keys.has(k)),
      priceMale: Number(o.priceMale), priceFemale: Number(o.priceFemale),
    })),
  };
}

/** 항목 가격 중 최솟값 (목록의 "₩30,000~") */
export function optionsMinPrice(options: PartyOption[]): number {
  return Math.min(...options.flatMap(o => [o.priceMale, o.priceFemale]));
}

/** 응답 값 → 회차·항목 (형식이 맞지 않는 값은 버린다) */
export function normalizeSessions(raw: unknown): PartySession[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(s => s && typeof s === "object").map(s => {
    const r = s as Record<string, unknown>;
    return {
      id: String(r.id ?? ""), name: String(r.name ?? ""), startTime: String(r.startTime ?? ""),
      maleStock: Number(r.maleStock ?? 0), femaleStock: Number(r.femaleStock ?? 0),
      ...(r.maleBooked != null ? { maleBooked: Number(r.maleBooked) } : {}),
      ...(r.femaleBooked != null ? { femaleBooked: Number(r.femaleBooked) } : {}),
    };
  }).filter(s => s.id !== "");
}

export function normalizeOptions(raw: unknown): PartyOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(o => o && typeof o === "object").map(o => {
    const r = o as Record<string, unknown>;
    return {
      id: String(r.id ?? ""), name: String(r.name ?? ""),
      sessionIds: Array.isArray(r.sessionIds) ? r.sessionIds.map(String) : [],
      priceMale: Number(r.priceMale ?? 0), priceFemale: Number(r.priceFemale ?? 0),
    };
  }).filter(o => o.id !== "");
}
