import type { PartySession, PartyOption } from "./partyOptions";

/** 매칭파티 참가 자격 — 혼인여부 제한 */
export type AllowedMaritalStatus = "all" | "싱글" | "돌싱";

/** 메인 페이지 카테고리 분류값 */
export const TARGET_GROUPS = ["싱글", "돌싱"] as const;
export const THEMES        = ["티타임", "와인파티", "사케파티", "쿠킹클래스"] as const;
export const LOCATION_TAGS = ["서울", "성남", "수원", "인천", "용인", "기타"] as const;
export type TargetGroup  = typeof TARGET_GROUPS[number];
export type Theme        = typeof THEMES[number];
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
export const partyTypeOf = (party: { partyType?: string | null }): PartyType =>
  (PARTY_TYPES as readonly string[]).includes(party.partyType ?? "") ? (party.partyType as PartyType) : "matching";

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
  imageUrl?: string;     // /uploads/parties/<file> 형태의 절대경로 또는 외부 URL
  description?: string;  // 파티 소개/내용 (multiline 가능)
  // 메인 페이지 필터 카테고리 (선택 — 누락 시 해당 필터에서 제외, "전체" 탭에서만 노출)
  targetGroup?: TargetGroup;   // 대상별: 싱글 / 돌싱
  theme?: Theme;               // 테마별: 티타임 / 와인파티 / 사케파티 / 쿠킹클래스
  locationTag?: LocationTag;   // 지역별: 서울 / 성남 / 수원 / 인천 / 용인 / 기타
  partyType?: PartyType;       // 파티 종류 — 없으면 매칭파티 (partyTypeOf 로 읽는다)
  // 솔로파티 참가 구성 (docs/specs/party-options-solo.md) — 있으면 남은 자리·마감은 회차 기준(partyStockStatus)
  sessions?: PartySession[];   // 회차 (maleBooked/femaleBooked = 회차별 신청 인원)
  options?: PartyOption[];     // 참가 항목 (항목 가격·포함 회차)
};

export const PARTIES: Party[] = [
  { id: "1", title: "IT 기획자 와인 밋업",         dateString: "2026. 5. 20 (토) 19:00", calendarDate: "2026-05-20", location: "강남 라운지",      target: "만 25-35세 / 남녀비율 1:1",        price: 50000,  tag: "주제별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "2", title: "주말 브런치 독서 모임",       dateString: "2026. 5. 21 (일) 11:00", calendarDate: "2026-05-21", location: "성수 플로어",      target: "만 28-38세 / 직장인",              price: 30000,  tag: "주제별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "3", title: "프라이빗 다이닝 나이트",       dateString: "2026. 5. 27 (토) 19:30", calendarDate: "2026-05-27", location: "청담 티에스",      target: "만 30-40세 / 프리미엄",             price: 100000, tag: "지역별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "4", title: "감성 루프탑 와인 파티",        dateString: "2026. 6. 7 (토) 18:30",  calendarDate: "2026-06-07", location: "이태원 루프탑",    target: "만 27-37세 / 남녀비율 1:1",         price: 65000,  tag: "지역별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "5", title: "아트 갤러리 소셜 나이트",       dateString: "2026. 6. 14 (토) 19:00", calendarDate: "2026-06-14", location: "한남동 갤러리",    target: "만 25-35세 / 문화예술인",           price: 45000,  tag: "주제별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "6", title: "주말 러닝 & 브런치 모임",       dateString: "2026. 6. 21 (토) 09:00", calendarDate: "2026-06-21", location: "여의도 한강공원",  target: "만 23-33세 / 러닝 입문자 환영",    price: 25000,  tag: "연령별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "7", title: "판교 스타트업 네트워킹",        dateString: "2026. 6. 28 (토) 18:00", calendarDate: "2026-06-28", location: "판교 카페라운지",  target: "만 28-40세 / IT·스타트업 종사자",  price: 40000,  tag: "지역별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
  { id: "8", title: "40대 프리미엄 위스키 살롱",     dateString: "2026. 7. 5 (토) 19:30",  calendarDate: "2026-07-05", location: "압구정 위스키바",  target: "만 35-45세 / 프리미엄",             price: 120000, tag: "연령별", maleStock: 12, femaleStock: 12, maleBooked: 0, femaleBooked: 0 },
];

/**
 * 회원 성별 기준 파티 참가비 — priceMale / priceFemale 우선, 미설정 시 price 폴백.
 * 사용처: 카트 합계, /checkout 결제 금액, pending.php 와 동일 규칙으로 클라/서버가 일치해야 함.
 */
export function priceForGender(party: Pick<Party, "price" | "priceMale" | "priceFemale">, gender?: string | null): number {
  if (gender === "남성" && party.priceMale && party.priceMale > 0) return party.priceMale;
  if (gender === "여성" && party.priceFemale && party.priceFemale > 0) return party.priceFemale;
  return party.price; // 폴백
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

export const CALENDAR_EVENTS = PARTIES.map(p => ({
  id: p.id,
  title: p.title,
  date: p.calendarDate,
  extendedProps: { location: p.location, target: p.target, price: p.price }
}));

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

export const FAQS = [
  {
    q: "친구와 함께 참가해도 괜찮을까요?",
    a: "네, 물론입니다. 어울림의 1:1 로테이션 시스템은 혼자 오셔도, 친구와 함께 오셔도 소외감 없이 충분히 즐거운 대화를 나누실 수 있도록 설계되어 있습니다. 다만, 대화 세션은 온전한 교감을 위해 1:1로 진행되는 점 참고 부탁드립니다."
  },
  {
    q: "주로 어떤 분들이 참가하시나요?",
    a: "어울림은 실시간 결제와 프로필 작성이 완료된 신원이 확실한 회원님들로만 구성됩니다. 진정성 있는 만남을 위해 프로필 작성이 미비할 경우 참가가 제한될 수 있으며, 이를 통해 검증된 매너와 열정을 가진 분들만이 모이는 고품격 커뮤니티를 유지하고 있습니다."
  },
  {
    q: "기존 매칭 파티와 어떤 점이 다른가요?",
    a: "소개팅 앱의 가벼움과 결혼정보회사의 과도한 비용 부담, 그 사이의 가장 합리적인 대안을 제시합니다. 4:4부터 10:10까지 정교하게 설계된 로테이션 시스템을 통해, 짧은 시간에 다수의 진중한 상대를 직접 대면하여 '결'이 맞는 인연을 찾을 수 있는 효율적인 만남의 장을 제공합니다."
  },
  {
    q: "참가 신청 후 내 예약 현황은 어디서 확인하나요?",
    a: "로그인 후 [마이페이지]에서 실시간으로 확인하실 수 있습니다.\n\n• 입금 확인 중 : 무통장 입금 후 운영팀의 확인을 대기 중인 상태\n• 결제 완료 : 결제 완료 후, 매칭을 위한 프로필 카드 작성이 필요한 상태\n• 확정 대기 : 원활한 매칭(성비 및 프로필)을 위해 운영팀에서 승인을 검토 중인 상태\n• 참가 확정 : 최종 승인이 완료되어 파티 참가가 최종 확정된 상태"
  },
  {
    q: "쿠폰은 어떻게 사용하나요?",
    a: "최종 결제 단계의 장바구니 페이지에서 보유하신 쿠폰 코드를 입력하시면 즉시 적용됩니다. 쿠폰은 파티당 1매만 사용 가능하며, 타 쿠폰과 중복 적용은 되지 않습니다."
  },
  {
    q: "브랜드 협업이나 장소 제휴를 제안하고 싶습니다.",
    a: "어울림은 공간 제휴, 브랜드 콜라보레이션, 공공기관 협업 등 다양한 제안을 환영합니다. 아래 협업 및 제휴문의 창구를 통해 내용을 남겨주시면 담당자가 검토 후 연락드리겠습니다."
  },
  {
    q: "파티 신청을 취소하고 싶습니다. 환불 규정이 어떻게 되나요?",
    a: "취소는 [마이페이지] 하단 '취소요청'을 통해 가능합니다. 원활한 성비 균형과 케이터링 준비를 위해 시기별 환불 규정을 엄격히 준수하고 있으니 확인 부탁드립니다.\n\n• 파티 5일 전까지: 100% 환불\n• 파티 4일 전: 80% 환불\n• 파티 3일 전: 50% 환불\n• 파티 2일 전 ~ 당일: 환불 불가"
  }
];
