import { normalizeSessions, normalizeOptions } from "./partyOptions";
import { TARGET_GROUPS, THEMES, LOCATION_TAGS, partyTypeOf, type Party, type TargetGroup, type Theme, type LocationTag } from "./data";

/**
 * /api/parties.php 응답 한 건 → Party.
 * 브라우저(useParties)와 빌드 시점 조회(buildParties)가 같은 규칙으로 읽도록 한곳에 둔다.
 */
export function normalizeParty(p: Record<string, unknown>): Party {
  const ams = p.allowedMaritalStatus;
  const sessions = normalizeSessions(p.sessions);
  const options  = normalizeOptions(p.options);
  return {
    id:           String(p.id ?? ""),
    title:        String(p.title ?? ""),
    dateString:   String(p.dateString ?? ""),
    calendarDate: String(p.calendarDate ?? ""),
    location:     String(p.location ?? ""),
    target:       String(p.target ?? ""),
    price:        Number(p.price ?? 0),
    priceMale:    p.priceMale   != null && p.priceMale   !== "" ? Number(p.priceMale)   : undefined,
    priceFemale:  p.priceFemale != null && p.priceFemale !== "" ? Number(p.priceFemale) : undefined,
    tag:          String(p.tag ?? "주제별"),
    maleStock:    Number(p.maleStock ?? 12),
    femaleStock:  Number(p.femaleStock ?? 12),
    maleBooked:   Number(p.maleBooked ?? 0),
    femaleBooked: Number(p.femaleBooked ?? 0),
    // 콘텐츠 필드 (관리자 입력)
    description:  typeof p.description === "string" ? p.description : "",
    imageUrl:     typeof p.imageUrl    === "string" ? p.imageUrl    : "",
    heroImageUrl: typeof p.heroImageUrl === "string" ? p.heroImageUrl : "",
    locationShort: typeof p.locationShort === "string" ? p.locationShort : "",
    // 자격 제한
    minAge:       p.minAge != null && p.minAge !== "" ? Number(p.minAge) : undefined,
    maxAge:       p.maxAge != null && p.maxAge !== "" ? Number(p.maxAge) : undefined,
    allowedMaritalStatus: (ams === "싱글" || ams === "돌싱") ? ams : "all",
    // 카테고리 (화이트리스트 매칭 — 잘못된 값은 undefined로 폴백)
    targetGroup: TARGET_GROUPS.includes(p.targetGroup as TargetGroup) ? (p.targetGroup as TargetGroup) : undefined,
    theme:       THEMES.includes(p.theme as Theme)                   ? (p.theme       as Theme)       : undefined,
    locationTag: LOCATION_TAGS.includes(p.locationTag as LocationTag) ? (p.locationTag as LocationTag) : undefined,
    // 파티 종류 (없거나 잘못된 값은 matching)
    partyType:   partyTypeOf({ partyType: typeof p.partyType === "string" ? p.partyType : undefined }),
    couponDisabled: p.couponDisabled === true,
    // 솔로파티 참가 구성 — 회차·항목이 모두 있을 때만 (없으면 기존 파티와 똑같이 동작)
    ...(sessions.length > 0 && options.length > 0 ? { sessions, options } : {}),
  };
}

/** 응답 배열 → Party 목록 (id 가 없는 항목은 버린다) */
export function normalizeParties(data: unknown[]): Party[] {
  return data
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map(normalizeParty)
    .filter(p => p.id !== "");
}
