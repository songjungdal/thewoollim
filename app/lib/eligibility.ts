import type { Party } from "./data";

/**
 * "YYYY-MM-DD" → 만 나이 계산.
 *  - 생일이 지났으면 (오늘 - 생일년).
 *  - 생일이 안 지났으면 (오늘 - 생일년 - 1).
 *  - 잘못된 입력은 0 반환.
 */
export function calculateAge(birthDate: string, now: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? "");
  if (!m) return 0;
  const Y = +m[1], M = +m[2] - 1, D = +m[3];
  const birth = new Date(Y, M, D);
  if (isNaN(birth.getTime())) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export type EligibilityReason =
  | "missingProfile"     // 생년월일/혼인여부 미입력
  | "ageOutOfRange"      // 연령 미달/초과
  | "maritalMismatch";   // 혼인여부 불일치

export type EligibilityResult = {
  ok: boolean;
  reason?: EligibilityReason;
  message?: string;
};

/**
 * 회원이 해당 파티에 신청 가능한지 검증.
 *  - minAge/maxAge: 미설정 시 무제한
 *  - 혼인여부 차단 규칙은 '싱글' 전용 파티에만 적용:
 *    · allowedMaritalStatus="싱글" 또는 targetGroup="싱글" → 돌싱 회원 차단
 *    · 그 외(ams="돌싱"/all/null, tg="돌싱"/null) → 차단 없음 (싱글·돌싱 모두 가능)
 *  - "돌싱" 파티는 마케팅 분류일 뿐 자격 차단 규칙 없음 — 싱글 회원도 자유롭게 신청 가능
 */
export function checkEligibility(
  party: Pick<Party, "minAge" | "maxAge" | "allowedMaritalStatus" | "targetGroup">,
  user: { birthDate?: string; maritalStatus?: string } | null,
): EligibilityResult {
  if (!user) return { ok: false, reason: "missingProfile", message: "프로필 정보가 필요합니다." };

  const ageRequired   = party.minAge != null || party.maxAge != null;
  const singlesOnly   = party.allowedMaritalStatus === "싱글" || party.targetGroup === "싱글";

  // 연령 검증
  if (ageRequired) {
    if (!user.birthDate) {
      return { ok: false, reason: "missingProfile", message: "생년월일이 입력되지 않았습니다." };
    }
    const age = calculateAge(user.birthDate);
    if (party.minAge != null && age < party.minAge) {
      return { ok: false, reason: "ageOutOfRange", message: "본 파티의 참가 연령대가 아닙니다." };
    }
    if (party.maxAge != null && age > party.maxAge) {
      return { ok: false, reason: "ageOutOfRange", message: "본 파티의 참가 연령대가 아닙니다." };
    }
  }

  // 혼인여부 검증 — 오직 '싱글 전용' 파티에서만 돌싱 회원을 차단
  if (singlesOnly) {
    if (!user.maritalStatus) {
      return { ok: false, reason: "missingProfile", message: "혼인여부가 입력되지 않았습니다." };
    }
    if (user.maritalStatus !== "싱글") {
      return { ok: false, reason: "maritalMismatch", message: "본 파티는 '싱글' 회원 전용입니다." };
    }
  }

  return { ok: true };
}

/** 자격 라벨 (UI 노출용 짧은 요약) */
export function eligibilitySummary(p: Pick<Party, "minAge" | "maxAge" | "allowedMaritalStatus" | "targetGroup">): string {
  const parts: string[] = [];
  if (p.minAge != null && p.maxAge != null) parts.push(`만 ${p.minAge}~${p.maxAge}세`);
  else if (p.minAge != null)                parts.push(`만 ${p.minAge}세 이상`);
  else if (p.maxAge != null)                parts.push(`만 ${p.maxAge}세 이하`);
  // '싱글 전용' 만 명시 — '돌싱' 파티는 모두 허용이므로 라벨 노출 안 함
  if (p.allowedMaritalStatus === "싱글" || p.targetGroup === "싱글") {
    parts.push("싱글 전용");
  }
  return parts.join(" · ");
}
