import { dateOnly, partyHasOptions, partyStockStatus, partyTypeOf, PARTY_TYPE_LABELS, type Party } from "./data";
import { optionsMinPrice } from "./partyOptions";
import { absoluteUrl, SITE_ORIGIN, SITE_NAME } from "./seo";

/*
 * 파티 상세(/party/[id]/) 검색엔진용 제목·설명·구조화 데이터(Event).
 * 빌드 시점 데이터로 만들기 때문에 신청 상태·가격은 마지막 빌드 기준이다 (화면은 열린 뒤 실시간 값으로 바뀜).
 */

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 화면 상세와 같은 기준의 참가비 문구 — "남성 50,000원 · 여성 40,000원" / 참가 구성 파티는 "30,000원부터" */
export function partyPriceText(p: Party): string {
  if (partyHasOptions(p) && p.options) return `${won(optionsMinPrice(p.options))}부터`;
  const male = p.priceMale && p.priceMale > 0 ? p.priceMale : p.price;
  const female = p.priceFemale && p.priceFemale > 0 ? p.priceFemale : p.price;
  return male === female ? won(male) : `남성 ${won(male)} · 여성 ${won(female)}`;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 제목·설명용 짧은 날짜 — "10월 17일(토)" (연도 없음). calendarDate 가 없으면 dateString 의 날짜 부분 */
export function partyShortDate(p: Party): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.calendarDate);
  if (!m) return dateOnly(p.dateString);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${mo}월 ${d}일(${weekday})`;
}

/** 제목·설명용 지역 — 메인 분류 지역(성남·수원·서울 등). 없거나 "기타"면 장소(location) 그대로 */
export function partyPlaceLabel(p: Party): string {
  return p.locationTag && p.locationTag !== "기타" ? p.locationTag : p.location;
}

/** "[3545] 티타임 소개팅 | 10월 17일(토) 성남 | 어울림 매칭파티" — 본문·Event 의 장소는 전체 주소 그대로 */
export function partyTitle(p: Party): string {
  const where = [partyShortDate(p), partyPlaceLabel(p)].filter(Boolean).join(" ");
  return [p.title, where, `어울림 ${PARTY_TYPE_LABELS[partyTypeOf(p)]}`].filter(Boolean).join(" | ");
}

/** 검색 결과 설명 — 일시·지역·대상·참가비 + 관리자 소개글 앞부분 (최대 약 160자) */
export function partyDescription(p: Party): string {
  const type = PARTY_TYPE_LABELS[partyTypeOf(p)];
  const time = (p.dateString || "").match(/\d{1,2}:\d{2}/)?.[0] ?? "";
  const head = `${[partyShortDate(p), time, partyPlaceLabel(p)].filter(Boolean).join(" ")}에서 열리는 어울림 ${type} '${p.title}'.`;
  const facts = [p.target && `대상 ${p.target}`, `참가비 ${partyPriceText(p)}`].filter(Boolean).join(", ");
  const intro = (p.description || "").replace(/\s+/g, " ").trim();
  const text = [head, facts ? `${facts}.` : "", intro].filter(Boolean).join(" ");
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

/** 시작 시각(한국 시간) — "2026-08-01T19:00:00+09:00". 시각이 없으면 날짜만 */
export function partyStartIso(p: Party): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.calendarDate)) return null;
  const m = (p.dateString || "").match(/(\d{1,2}):(\d{2})/)
    ?? (p.sessions?.map(s => s.startTime).sort()[0] ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${p.calendarDate}T${m[1].padStart(2, "0")}:${m[2]}:00+09:00` : p.calendarDate;
}

const AVAIL = {
  open: "https://schema.org/InStock",
  full: "https://schema.org/SoldOut",
  ended: "https://schema.org/Discontinued",
} as const;

/**
 * 행사 시작 시각(한국 시간)이 now 보다 앞인지 — 빌드 시점 "종료" 판단용.
 * 빌드 서버의 시간대와 상관없이 한국 시간으로 계산한다. 시각이 없으면 그날 23:59:59 기준 (partyEventDate 와 같은 규칙).
 */
export function partyStartedBy(p: Party, now: Date): boolean {
  const start = partyStartIso(p);
  if (!start) return false;
  return Date.parse(start.length === 10 ? `${start}T23:59:59+09:00` : start) < now.getTime();
}

/** 구조화 데이터 Event — 이름·시작 시각·장소(전체 주소)·가격·신청 상태 */
export function partyEventJsonLd(p: Party, now: Date = new Date()) {
  const url = absoluteUrl(`/party/${p.id}/`);
  const start = partyStartIso(p);
  const ended = partyStartedBy(p, now);
  const stock = partyStockStatus(p);
  const availability = (closed: boolean) => (ended ? AVAIL.ended : closed ? AVAIL.full : AVAIL.open);

  const offers = stock.hasOptions
    ? stock.options.flatMap(o => [
        { name: `${o.name} (남성)`, price: o.priceMale, availability: availability(o.maleClosed) },
        { name: `${o.name} (여성)`, price: o.priceFemale, availability: availability(o.femaleClosed) },
      ])
    : [
        { name: "남성 참가", price: p.priceMale && p.priceMale > 0 ? p.priceMale : p.price, availability: availability(stock.maleFull) },
        { name: "여성 참가", price: p.priceFemale && p.priceFemale > 0 ? p.priceFemale : p.price, availability: availability(stock.femaleFull) },
      ];

  const image = p.imageUrl
    ? (/^https?:\/\//.test(p.imageUrl) ? p.imageUrl : `${SITE_ORIGIN}${p.imageUrl.startsWith("/") ? "" : "/"}${p.imageUrl}`)
    : `${SITE_ORIGIN}/images/party_card_default_banner.jpg`;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: p.title,
    description: partyDescription(p),
    ...(start ? { startDate: start } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: p.location, address: p.location },
    image: [image],
    url,
    organizer: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    offers: offers.map(o => ({
      "@type": "Offer",
      name: o.name,
      price: o.price,
      priceCurrency: "KRW",
      availability: o.availability,
      url,
    })),
  };
}
