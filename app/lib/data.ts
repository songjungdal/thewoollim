/** 매칭파티 참가 자격 — 혼인여부 제한 */
export type AllowedMaritalStatus = "all" | "싱글" | "돌싱";

/** 메인 페이지 카테고리 분류값 */
export const TARGET_GROUPS = ["싱글", "돌싱"] as const;
export const THEMES        = ["티타임", "와인파티", "사케파티", "쿠킹클래스"] as const;
export const LOCATION_TAGS = ["서울", "성남", "수원", "인천", "용인", "기타"] as const;
export type TargetGroup  = typeof TARGET_GROUPS[number];
export type Theme        = typeof THEMES[number];
export type LocationTag  = typeof LOCATION_TAGS[number];

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

/** 파티 재고 상태 계산 (UI·검증 공통 사용) */
/**
 * 회원 성별 기준 파티 참가비 — priceMale / priceFemale 우선, 미설정 시 price 폴백.
 * 사용처: 카트 합계, /checkout 결제 금액, pending.php 와 동일 규칙으로 클라/서버가 일치해야 함.
 */
export function priceForGender(party: Pick<Party, "price" | "priceMale" | "priceFemale">, gender?: string | null): number {
  if (gender === "남성" && party.priceMale && party.priceMale > 0) return party.priceMale;
  if (gender === "여성" && party.priceFemale && party.priceFemale > 0) return party.priceFemale;
  return party.price; // 폴백
}

export function partyStockStatus(party: Party) {
  const maleRemaining   = Math.max(0, party.maleStock   - party.maleBooked);
  const femaleRemaining = Math.max(0, party.femaleStock - party.femaleBooked);
  return {
    maleRemaining,
    femaleRemaining,
    maleFull:   maleRemaining   <= 0,
    femaleFull: femaleRemaining <= 0,
    allFull:    maleRemaining   <= 0 && femaleRemaining <= 0,
  };
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
  { q: "참여 신청은 어떻게 하나요?", a: "원하시는 일정의 달력 혹은 카드를 클릭한 후 '상세페이지'에서 결제를 진행하시면 됩니다." },
  { q: "남녀 성비는 어떻게 맞추나요?", a: "최소 1:1에서 1:1.2 비율을 철저하게 관리하며, 한쪽 성별이 과도하게 모집될 경우 접수를 조기 마감합니다." },
  { q: "환불 규정이 궁금합니다.", a: "파티 개최 5일 전까지는 100% 환불이 가능하며, 이후로는 참석 확정 리스트가 픽스되어 환불이 불가합니다." }
];
