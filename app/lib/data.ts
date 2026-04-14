export const PARTIES = [
  { id: "1", title: "IT 기획자 와인 밋업", dateString: "2026. 5. 20 (토) 19:00", calendarDate: "2026-05-20", location: "강남 라운지", target: "만 25-35세 / 남녀비율 1:1", price: 50000, tag: "주제별" },
  { id: "2", title: "주말 브런치 독서 모임", dateString: "2026. 5. 21 (일) 11:00", calendarDate: "2026-05-21", location: "성수 플로어", target: "만 28-38세 / 직장인", price: 30000, tag: "주제별" },
  { id: "3", title: "프라이빗 다이닝 나이트", dateString: "2026. 5. 27 (토) 19:30", calendarDate: "2026-05-27", location: "청담 티에스", target: "만 30-40세 / 프리미엄", price: 100000, tag: "지역별" },
];

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
