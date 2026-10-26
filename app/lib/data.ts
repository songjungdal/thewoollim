import type { PartySession, PartyOption } from "./partyOptions";
import COUPON_MESSAGES from "../../api/coupon-messages.json";

/** 매칭파티 참가 자격 — 혼인여부 제한 */
export type AllowedMaritalStatus = "all" | "싱글" | "돌싱";

/** 메인 페이지 카테고리 분류값 */
export const TARGET_GROUPS = ["싱글", "돌싱"] as const;
/** 테마 — 관리자 폼에서 고를 수 있는 값 (docs/specs/party-request-tabs.md, 서버 api/admin/parties.php 와 같은 목록) */
export const THEMES        = ["로테이션소개팅", "와인파티", "솔로파티"] as const;
/** 예전 테마 값 — 새로 고를 수는 없지만, 이미 저장된 파티의 값은 지우지 않고 그대로 읽는다 */
export const LEGACY_THEMES = ["티타임", "사케파티", "쿠킹클래스"] as const;
export const LOCATION_TAGS = ["서울", "성남", "수원", "인천", "용인", "기타"] as const;
export type TargetGroup  = typeof TARGET_GROUPS[number];
export type Theme        = typeof THEMES[number] | typeof LEGACY_THEMES[number];
export type LocationTag  = typeof LOCATION_TAGS[number];

/**
 * 카테고리 화면 표시용 라벨 매핑. DB/필터에 쓰이는 value(예: "쿠킹클래스")는 그대로 두고
 * 사용자에게 보이는 텍스트만 교체한다. 매핑에 없는 값은 원문 그대로 노출.
 * (v6.7 — '쿠킹클래스' value 유지, 라벨만 '세션'으로 표기)
 */
export const CATEGORY_LABELS: Record<string, string> = { "쿠킹클래스": "세션" };
export const categoryLabel = (value: string): string => CATEGORY_LABELS[value] ?? value;

/**
 * 파티 종류 — 저장값은 영문 코드, 화면에는 라벨. 값이 없거나 허용 목록 밖이면 matching.
 * (서버 쪽 같은 정의: api/lib.php partyTypeOf / partyTypeLabel)
 */
export const PARTY_TYPES = ["matching", "solo"] as const;
export type PartyType = typeof PARTY_TYPES[number];
export const PARTY_TYPE_LABELS: Record<PartyType, string> = { matching: "매칭파티", solo: "솔로파티" };
/** 관리자 화면(파티 목록 필터·배지, 예약 현황 배지, 파티 등록·수정 창)에서 쓰는 종류 이름 — 저장값은 그대로 (docs/specs/party-request-tabs.md D·E) */
export const PARTY_TYPE_ADMIN_LABELS: Record<PartyType, string> = { matching: "로테이션소개팅", solo: "파티" };
export const partyTypeOf = (party: { partyType?: string | null }): PartyType =>
  (PARTY_TYPES as readonly string[]).includes(party.partyType ?? "") ? (party.partyType as PartyType) : "matching";

/**
 * 쿠폰 적용 불가 파티 안내 문구 — 서버와 같은 문구를 쓰도록 api/coupon-messages.json 한 곳에서 읽는다
 * (서버: api/lib.php couponDisabledMessage). 장바구니 쿠폰 칸의 안내 박스(앞의 "※"는 빼고 표시)·서버 거절 응답에 쓰인다.
 */
export const COUPON_DISABLED_MESSAGE: string = COUPON_MESSAGES.couponDisabled;

/** 무통장 입금 계좌 — 결제 페이지 모달 / 마이페이지 안내 가이드 공용 (v7.0) */
export const VBANK_INFO = { bank: "신협", account: "132-137-790923", holder: "라지성" } as const;
export const VBANK_ACCOUNT_LINE = `${VBANK_INFO.bank} ${VBANK_INFO.account} ${VBANK_INFO.holder}`;

export type Party = {
  id: string;
  title: string;
  dateString: string;
  calendarDate: string;
  location: string;
  target: string;
  price: number;             // 레거시 / 폴백 (priceMale·priceFemale 미설정 시 사용)
  priceMale?: number;        // 남성 참가비 (KRW). 0 또는 미설정 시 price 폴백
  priceFemale?: number;      // 여성 참가비 (KRW). 0 또는 미설정 시 price 폴백
  tag: string;
  maleStock: number;     // 남성 모집 정원 (기본 12)
  femaleStock: number;   // 여성 모집 정원 (기본 12)
  maleBooked: number;    // 현재 남성 신청 인원
  femaleBooked: number;  // 현재 여성 신청 인원
  // 참가 자격 제한 (선택) — 누락 시 모든 회원 신청 가능
  minAge?: number;                            // 최소 나이 (만 나이)
  maxAge?: number;                            // 최대 나이 (만 나이)
  allowedMaritalStatus?: AllowedMaritalStatus; // "all" | "싱글" | "돌싱"
  // 콘텐츠 (관리자가 등록 폼에서 입력) — 누락 시 placeholder
  imageUrl?: string;     // 대표이미지 — 파티신청(메인페이지)·파티 목록 카드. /uploads/parties/<file> 형태의 절대경로 또는 외부 URL
  heroImageUrl?: string; // 상단이미지 — 상세페이지 맨 위 16:9 (관리자가 16:9로 잘라 올림). 없으면 상세는 대표이미지를 원본 비율로
  description?: string;  // 파티 소개/내용 (multiline 가능)
  locationShort?: string; // 짧은 장소명(최대 10자) — 상세페이지 하단 바. 없으면 locationTag
  // 분류 (선택) — 메인 "파티 일정" 섹션 태그·대상별 안내에 쓴다. 메인 "파티 신청"은 종류(partyType) 탭으로만 나눈다
  targetGroup?: TargetGroup;   // 대상별: 싱글 / 돌싱 (없음 = 관리자 화면의 "누구나")
  theme?: Theme;               // 테마별: 로테이션소개팅 / 와인파티 / 솔로파티 (+ 예전 값 LEGACY_THEMES)
  locationTag?: LocationTag;   // 지역별: 서울 / 성남 / 수원 / 인천 / 용인 / 기타
  partyType?: PartyType;       // 파티 종류 — 없으면 매칭파티 (partyTypeOf 로 읽는다)
  couponDisabled?: boolean;    // 쿠폰 적용 불가 (매칭·솔로 공통) — 없으면 쿠폰 사용 가능
  discountRate?: number;       // 할인율 0~90 (없거나 0 = 할인 없음). 참가 구성 파티에는 쓰지 않는다 (docs/specs/party-discount-rate.md)
  // 솔로파티 참가 구성 (docs/specs/party-options-solo.md) — 있으면 남은 자리·마감은 회차 기준(partyStockStatus)
  sessions?: PartySession[];   // 회차 (maleBooked/femaleBooked = 회차별 신청 인원)
  options?: PartyOption[];     // 참가 항목 (항목 가격·포함 회차)
};

// 예시 파티 목록(PARTIES)은 정적 HTML·화면에 가짜 파티가 비치지 않도록 삭제했다.
// 파티 데이터는 빌드 시점(lib/buildParties.ts)과 화면이 열린 뒤(lib/useParties.ts) 모두 /api/parties.php 에서 받는다.

/**
 * 할인가 — 천원 미만 내림 (69,000원 20% → 55,000원). 할인율이 1~90 정수가 아니면 가격 그대로.
 * 서버 api/lib.php discountedPrice 와 같은 규칙.
 */
export function discountedPrice(price: number, rate?: number): number {
  if (!isDiscountRate(rate)) return price;
  return Math.floor(price * (100 - rate) / 100000) * 1000;
}

/** 할인율로 쓸 수 있는 값인지 (1~90 정수) */
function isDiscountRate(rate?: number): rate is number {
  return rate !== undefined && Number.isInteger(rate) && rate >= 1 && rate <= 90;
}

/**
 * 할인 적용 전 성별 참가비 (정가) — priceMale / priceFemale 우선, 미설정 시 price 폴백.
 * 화면 표시(정가 + 화살표) 전용. 결제 금액 계산에는 priceForGender 를 쓴다.
 */
export function basePriceForGender(party: Pick<Party, "price" | "priceMale" | "priceFemale">, gender?: string | null): number {
  if (gender === "남성" && party.priceMale && party.priceMale > 0) return party.priceMale;
  if (gender === "여성" && party.priceFemale && party.priceFemale > 0) return party.priceFemale;
  return party.price; // 폴백
}

/**
 * 회원 성별 기준 파티 참가비 — 정가(basePriceForGender)에 할인율을 적용한 금액.
 * 사용처: 카트 합계, /checkout 결제 금액, pending.php 와 동일 규칙으로 클라/서버가 일치해야 함 (서버 api/lib.php priceForGender).
 * 참가 구성 파티는 linePriceFor 가 항목 가격을 쓰므로 여기로 오지 않는다.
 */
export function priceForGender(party: Pick<Party, "price" | "priceMale" | "priceFemale" | "discountRate">, gender?: string | null): number {
  return discountedPrice(basePriceForGender(party, gender), party.discountRate);
}

/** 할인 표시를 할 파티인지 — 할인율 1 이상이고 참가 구성 파티가 아닐 때 */
export function partyHasDiscount(party: Pick<Party, "discountRate" | "sessions" | "options">): boolean {
  return isDiscountRate(party.discountRate) && !partyHasOptions(party);
}

/** 참가 구성이 있는 파티인지 (회차·항목이 모두 있어야 함) */
export function partyHasOptions(party: Pick<Party, "sessions" | "options">): boolean {
  return (party.options?.length ?? 0) > 0 && (party.sessions?.length ?? 0) > 0;
}

/** 파티의 참가 항목 하나 (없으면 null) */
export function partyOptionById(party: Pick<Party, "options">, optionId?: string | null): PartyOption | null {
  if (!optionId) return null;
  return party.options?.find(o => o.id === optionId) ?? null;
}

/**
 * 장바구니·결제 한 줄 금액 — 참가 구성 파티는 고른 항목의 내 성별 가격(서버 api/lib.php priceForGender 와 같은 규칙),
 * 그 밖의 파티는 priceForGender. 참가 구성 파티인데 항목을 못 찾으면 null(결제 불가).
 */
export function linePriceFor(party: Party, gender: string | null | undefined, optionId?: string | null): number | null {
  if (!partyHasOptions(party)) return priceForGender(party, gender);
  const o = partyOptionById(party, optionId);
  if (!o) return null;
  return gender === "여성" ? o.priceFemale : o.priceMale;
}

/** 실시간 신청 인원 (api/party-counts.php 한 파티 값) */
export type LivePartyCount = { male: number; female: number; sessions?: Record<string, { male: number; female: number }> };

/**
 * 실시간 신청 인원을 파티에 입힌다 — 카운트가 없으면 0 (시드/테스트 데이터 무시, 기존 규칙과 같음).
 * 참가 구성 파티는 회차별 인원도 함께 입힌다. 메인 카드·일정 섹션·상세가 같은 방식으로 쓴다.
 */
export function withLiveCounts(party: Party, live?: LivePartyCount | null): Party {
  return {
    ...party,
    maleBooked:   live?.male   ?? 0,
    femaleBooked: live?.female ?? 0,
    ...(party.sessions ? {
      sessions: party.sessions.map(s => ({
        ...s,
        maleBooked:   live?.sessions?.[s.id]?.male   ?? 0,
        femaleBooked: live?.sessions?.[s.id]?.female ?? 0,
      })),
    } : {}),
  };
}

/** 회차 하나의 남은 자리 */
export type SessionStock = PartySession & {
  maleRemaining: number;
  femaleRemaining: number;
  maleFull: boolean;
  femaleFull: boolean;
};

/** 참가 항목 하나의 마감 여부 — 포함 회차 중 하나라도 그 성별 정원이 차면 마감 */
export type OptionStock = PartyOption & {
  sessions: SessionStock[];   // 포함 회차 (회차 순서)
  maleClosed: boolean;
  femaleClosed: boolean;
};

export type PartyStock = {
  /**
   * 그 성별이 아직 신청할 수 있는 인원.
   *  - 참가 구성 없음: 정원 - 신청 인원 (기존 식)
   *  - 참가 구성 있음: 고를 수 있는 항목마다 "포함 회차 남은 자리 중 최솟값"을 구해 그중 최댓값 (마감이면 0)
   */
  maleRemaining: number;
  femaleRemaining: number;
  maleFull: boolean;      // 성별 마감 (참가 구성: 그 성별로 고를 수 있는 항목이 없음)
  femaleFull: boolean;
  allFull: boolean;       // 모집 마감 (남녀 모두 마감)
  nearlyFull: boolean;    // 마감 임박 — 마감이 아니고 남은 자리(남+여)가 1~3석 (참가 구성: 어느 회차든)
  hasOptions: boolean;
  sessions: SessionStock[];   // 참가 구성 없으면 []
  options: OptionStock[];     // 참가 구성 없으면 []
  /** 남은 자리 문구 — "남 3 · 여 2" / 참가 구성: "1부 남3·여2 · 2부 남5·여4" */
  remainingLabel: string;
};

/**
 * 파티 남은 자리·마감 계산 (UI·검증 공통). 메인 카드, 일정 섹션, 상세 신청 차단이 모두 이 결과를 쓴다.
 * 참가 구성 파티는 파티 단위 maleBooked/maleStock 을 쓰지 않고 회차 기준으로 계산한다 (명세 8-3).
 * 신청 인원은 호출 전에 withLiveCounts 로 입혀 둔다.
 */
export function partyStockStatus(party: Party): PartyStock {
  if (partyHasOptions(party)) {
    const sessions: SessionStock[] = (party.sessions ?? []).map(s => {
      const maleRemaining   = Math.max(0, s.maleStock   - (s.maleBooked   ?? 0));
      const femaleRemaining = Math.max(0, s.femaleStock - (s.femaleBooked ?? 0));
      return { ...s, maleRemaining, femaleRemaining, maleFull: maleRemaining <= 0, femaleFull: femaleRemaining <= 0 };
    });
    const byId = new Map(sessions.map(s => [s.id, s]));
    const options: OptionStock[] = (party.options ?? []).map(o => {
      const inc = sessions.filter(s => o.sessionIds.includes(s.id));
      const missing = o.sessionIds.some(id => !byId.has(id)) || inc.length === 0;
      return {
        ...o,
        sessions: inc,
        maleClosed:   missing || inc.some(s => s.maleFull),
        femaleClosed: missing || inc.some(s => s.femaleFull),
      };
    });
    const remainingOf = (g: "male" | "female") => Math.max(0, ...options
      .filter(o => !(g === "male" ? o.maleClosed : o.femaleClosed))
      .map(o => Math.min(...o.sessions.map(s => g === "male" ? s.maleRemaining : s.femaleRemaining))));
    const maleRemaining   = remainingOf("male");
    const femaleRemaining = remainingOf("female");
    const maleFull   = options.every(o => o.maleClosed);
    const femaleFull = options.every(o => o.femaleClosed);
    const allFull = maleFull && femaleFull;
    const nearlyFull = !allFull && sessions.some(s => {
      const left = s.maleRemaining + s.femaleRemaining;
      return left >= 1 && left <= 3;
    });
    return {
      maleRemaining, femaleRemaining, maleFull, femaleFull, allFull, nearlyFull,
      hasOptions: true, sessions, options,
      remainingLabel: sessions.map(s => `${s.name} 남${s.maleRemaining}·여${s.femaleRemaining}`).join(" · "),
    };
  }
  const maleRemaining   = Math.max(0, party.maleStock   - party.maleBooked);
  const femaleRemaining = Math.max(0, party.femaleStock - party.femaleBooked);
  const left = maleRemaining + femaleRemaining;
  const allFull = maleRemaining <= 0 && femaleRemaining <= 0;
  return {
    maleRemaining,
    femaleRemaining,
    maleFull:   maleRemaining   <= 0,
    femaleFull: femaleRemaining <= 0,
    allFull,
    nearlyFull: !allFull && left >= 1 && left <= 3,
    hasOptions: false, sessions: [], options: [],
    remainingLabel: `남 ${maleRemaining} · 여 ${femaleRemaining}`,
  };
}

/** "2026. 8. 1 (토) 19:00" → "2026. 8. 1 (토)" (시각 앞까지) */
export function dateOnly(dateString: string): string {
  return (dateString || "").replace(/\s*\d{1,2}:\d{2}.*$/, "").trim();
}

/** 메인 노출 종료 기준 — 행사 일시 경과 후 X일이 지나면 카드 리스트에서 자동 제외 */
export const PARTY_HIDE_AFTER_DAYS = 21;

/**
 * 파티 행사 일시 → Date 객체.
 *   - calendarDate (YYYY-MM-DD) + dateString 내부 "HH:MM" 부분을 결합 (로컬 시간대)
 *   - dateString 에서 시간 추출 실패 시 해당 날짜의 23:59:59 로 폴백 → 당일 자정 직전까지는 "진행 중"
 */
export function partyEventDate(party: Pick<Party, "calendarDate" | "dateString">): Date {
  const m = (party.dateString || "").match(/(\d{1,2}):(\d{2})/);
  if (party.calendarDate && m) {
    return new Date(`${party.calendarDate}T${m[1].padStart(2, "0")}:${m[2]}:00`);
  }
  if (party.calendarDate) return new Date(`${party.calendarDate}T23:59:59`);
  return new Date(0);
}

export type PartyVisibility = "active" | "ended" | "expired";

/**
 * 메인 페이지 노출 상태:
 *   - active : 아직 행사가 시작/종료되지 않음
 *   - ended  : 행사 일시는 지났지만 PARTY_HIDE_AFTER_DAYS 일 이내 (모집 종료 카드로 노출)
 *   - expired: 종료 후 PARTY_HIDE_AFTER_DAYS 일 초과 (메인 리스트에서 제외)
 */
export function partyVisibility(
  party: Pick<Party, "calendarDate" | "dateString">,
  now: Date = new Date()
): PartyVisibility {
  const event = partyEventDate(party).getTime();
  if (event > now.getTime()) return "active";
  const cutoffMs = PARTY_HIDE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - event <= cutoffMs ? "ended" : "expired";
}

export const PARTICIPANTS = [
  { id: 1, job: "Product Manager", age: "30대 초반", keywords: ["ENFJ", "와인", "전시회"], gender: "male" },
  { id: 2, job: "소프트웨어 엔지니어", age: "20대 후반", keywords: ["INTJ", "독서", "러닝"], gender: "male" },
  { id: 3, job: "브랜드 마케터", age: "30대 중반", keywords: ["ENTP", "미식", "골프"], gender: "female" },
  { id: 4, job: "스타트업 CEO", age: "30대 초반", keywords: ["ENTJ", "테니스", "와인"], gender: "male" },
  { id: 5, job: "초등교사", age: "20대 후반", keywords: ["ISFJ", "필라테스", "베이킹"], gender: "female" },
  { id: 6, job: "마케팅 매니저", age: "30대 초반", keywords: ["ENFP", "여행", "사진"], gender: "female" },
  { id: 7, job: "변리사", age: "30대 중반", keywords: ["ISTP", "등산", "위스키"], gender: "male" },
  { id: 8, job: "프리랜서 작가", age: "20대 후반", keywords: ["INFP", "영화", "글쓰기"], gender: "female" },
  { id: 9, job: "외국계 기업 회사원", age: "30대 초반", keywords: ["ESTJ", "크로스핏", "재테크"], gender: "male" },
];

// 메인 FAQ(app/page.tsx #faq) — lead(굵은 한 줄 요약) → body(설명) → 항목별 추가 블록(steps·refund·chips·link) 순서로 보여준다.
export type FaqItem = {
  id: string;
  q: string;
  lead: string;
  body: string;                                        // 빈 문자열이면 표시하지 않음. "\n" 줄바꿈은 그대로 보인다
  steps?: { label: string; desc: string }[];           // 단계 카드 (마지막 단계 강조)
  refund?: { when: string; pct: string; value: number }[]; // 환불 비율 막대 (value = 막대 너비 %)
  chips?: string[];                                    // 체크 칩
  link?: { label: string; href: string };              // 바로가기 버튼
};

export const FAQS: FaqItem[] = [
  {
    id: "friend",
    q: "친구와 함께 참가해도 괜찮을까요?",
    lead: "네, 친구와 함께 참가하실 수 있어요.",
    body: "어울림의 1:1 로테이션 시스템은 혼자 오셔도, 친구와 함께 오셔도 소외감 없이 충분히 즐거운 대화를 나누실 수 있도록 설계되어 있습니다. 다만, 대화 세션은 온전한 교감을 위해 1:1로 진행되는 점 참고 부탁드립니다.",
  },
  {
    id: "members",
    q: "주로 어떤 분들이 참가하시나요?",
    lead: "결제와 프로필 작성을 마친, 신원이 확실한 회원님들만 참가해요.",
    body: "진정성 있는 만남을 위해 프로필 작성이 미비할 경우 참가가 제한될 수 있으며, 이를 통해 검증된 매너와 열정을 가진 분들만이 모이는 고품격 커뮤니티를 유지하고 있습니다.",
  },
  {
    id: "difference",
    q: "기존 매칭 파티와 어떤 점이 다른가요?",
    lead: "4:4부터 10:10까지 로테이션으로, 짧은 시간에 여러 분을 직접 만나요.",
    body: "소개팅 앱의 가벼움과 결혼정보회사의 과도한 비용 부담, 그 사이의 가장 합리적인 대안을 제시합니다.",
  },
  {
    id: "reservation",
    q: "참가 신청 후 내 예약 현황은 어디서 확인하나요?",
    lead: "로그인 후 [마이페이지]에서 실시간으로 확인할 수 있어요.",
    body: "",
    steps: [
      { label: "입금 확인 중", desc: "무통장 입금 후 운영팀의 확인을 대기 중인 상태" },
      { label: "결제 완료", desc: "결제 완료 후, 매칭을 위한 프로필 카드 작성이 필요한 상태" },
      { label: "확정 대기", desc: "원활한 매칭(성비 및 프로필)을 위해 운영팀에서 승인을 검토 중인 상태" },
      { label: "참가 확정", desc: "최종 승인이 완료되어 파티 참가가 최종 확정된 상태" },
    ],
  },
  {
    id: "coupon",
    q: "쿠폰은 어떻게 사용하나요?",
    lead: "장바구니 페이지에서 쿠폰 코드를 입력하면 바로 적용돼요.",
    body: "",
    chips: ["파티당 1매 사용", "다른 쿠폰과 중복 적용 불가"],
  },
  {
    id: "rematch",
    q: "이전 파티에서 만난 참가자와 겹치지 않게 조율해 주나요?",
    lead: "네, 걱정하지 않으셔도 됩니다.",
    body: "어울림은 참가자분들의 편안하고 설레는 만남을 위해 ‘재회 방지 사전 안내 시스템’을 운영하고 있습니다.\n\n신청하신 파티에 기존에 마주쳤던 참가자가 포함되어 있을 경우, 파티 확정 전 개별적으로 미리 안내해 드립니다. 원치 않으실 경우 다른 일정으로의 변경 또는 100% 전액 취소를 도와드리고 있으니 부담 없이 안심하고 신청해 주셔도 좋습니다.",
  },
  {
    id: "partnership",
    q: "브랜드 협업이나 장소 제휴를 제안하고 싶습니다.",
    lead: "공간 제휴, 브랜드 콜라보레이션, 공공기관 협업 모두 환영해요.",
    body: "협업 및 제휴문의 페이지에 내용을 남겨주시면 담당자가 검토 후 연락드리겠습니다.",
    link: { label: "협업 및 제휴문의 바로가기", href: "/partnership" },
  },
  {
    id: "refund",
    q: "파티 신청을 취소하고 싶습니다. 환불 규정이 어떻게 되나요?",
    lead: "[마이페이지] 하단 '취소요청'으로 신청할 수 있어요.",
    body: "원활한 성비 균형과 케이터링 준비를 위해 시기별 환불 규정을 엄격히 준수하고 있으니 확인 부탁드립니다.",
    refund: [
      { when: "파티 5일 전까지", pct: "100%", value: 100 },
      { when: "파티 4일 전", pct: "80%", value: 80 },
      { when: "파티 3일 전", pct: "50%", value: 50 },
      { when: "파티 2일 전 ~ 당일", pct: "환불 불가", value: 0 },
    ],
  },
];
