/**
 * 메인 히어로(롤링 슬라이드) 데이터 — 타입·기본값·검증, 관리자 미리보기용 슬라이드 계산.
 *
 *  - 1번 = 브랜드 슬라이드(고정), 2~4번 = 모집중 파티 슬라이드(최대 3개).
 *  - 서버 계산: api/_hero.php heroBuildSlides() → GET /api/hero.php
 *  - 관리자 미리보기: 아래 buildHeroSlides() — 위 서버 함수와 같은 규칙(저장 전 설정으로 계산하기 위해 화면에서도 계산)
 *  - 글자 톤: "dark" = 어두운 이미지라 흰 글자, "light" = 밝은 이미지라 어두운 글자 (스타일은 app/components/heroTone.ts)
 */

export type HeroTone = "light" | "dark";
export type HeroToneMode = "auto" | HeroTone;

export type HeroImageSet = {
  imagePc: string | null;
  imageMo: string | null;
  focusPc: string;   // CSS object-position, 예: "50% 30%"
  focusMo: string;
  tonePc: HeroTone;
  toneMo: HeroTone;
};

export type HeroBrandSlide = HeroImageSet & { type: "brand"; alt: string };
export type HeroPartySlide = HeroImageSet & {
  type: "party";
  alt: string;
  partyId: string;
  title: string;
  dateString: string;
  location: string;
  maleLeft: number;
  femaleLeft: number;
  almostFull: boolean;
  href: string;
  fallbackImage: string | null; // 전용 이미지가 없을 때 쓰는 파티 대표이미지(imageUrl) (흐린 배경 + 원본 비율 앞장)
};
export type HeroSlideData = HeroBrandSlide | HeroPartySlide;

export const HERO_DEFAULT_IMAGE = "/images/hero-bg.webp";
export const HERO_FALLBACK_PARTY_IMAGE = "/images/party_card_default_banner.jpg";
export const HERO_MAX_PARTIES = 3;
export const HERO_INTERVAL_MS = 6000;

export const DEFAULT_BRAND_SLIDE: HeroBrandSlide = {
  type: "brand",
  imagePc: HERO_DEFAULT_IMAGE,
  imageMo: HERO_DEFAULT_IMAGE,
  focusPc: "50% 30%",
  focusMo: "50% 0%",
  tonePc: "dark",
  toneMo: "dark",
  alt: "어울림 매칭파티",
};

/** 초점 위치 3×3 그리드 (관리자 버튼) — 왼쪽 위부터 */
export const HERO_FOCUS_GRID = [
  "0% 0%", "50% 0%", "100% 0%",
  "0% 50%", "50% 50%", "100% 50%",
  "0% 100%", "50% 100%", "100% 100%",
] as const;

const FOCUS_RE = /^(\d{1,3})% (\d{1,3})%$/;
const isTone = (v: unknown): v is HeroTone => v === "light" || v === "dark";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const focus = (v: unknown, fallback: string) => {
  const m = typeof v === "string" ? FOCUS_RE.exec(v) : null;
  return m && Number(m[1]) <= 100 && Number(m[2]) <= 100 ? (v as string) : fallback;
};
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

/** /api/hero.php 응답 검증 — 형식이 틀리면 null(기본 브랜드 1장 유지). 1번은 항상 브랜드 슬라이드. */
export function normalizeHeroSlides(data: unknown): HeroSlideData[] | null {
  const list = (data && typeof data === "object" && Array.isArray((data as { slides?: unknown }).slides))
    ? (data as { slides: unknown[] }).slides
    : null;
  if (!list || list.length === 0) return null;
  const out: HeroSlideData[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const base: HeroImageSet = {
      imagePc: str(r.imagePc),
      imageMo: str(r.imageMo),
      focusPc: focus(r.focusPc, DEFAULT_BRAND_SLIDE.focusPc),
      focusMo: focus(r.focusMo, DEFAULT_BRAND_SLIDE.focusMo),
      tonePc: isTone(r.tonePc) ? r.tonePc : "dark",
      toneMo: isTone(r.toneMo) ? r.toneMo : "dark",
    };
    if (r.type === "brand" && out.length === 0) {
      out.push({ ...base, type: "brand", alt: DEFAULT_BRAND_SLIDE.alt,
        imagePc: base.imagePc ?? base.imageMo ?? HERO_DEFAULT_IMAGE, imageMo: base.imageMo ?? base.imagePc ?? HERO_DEFAULT_IMAGE });
    } else if (r.type === "party" && out.length > 0 && out.length <= HERO_MAX_PARTIES) {
      const partyId = str(r.partyId);
      const title = str(r.title);
      if (!partyId || !title) continue;
      out.push({
        ...base, type: "party", alt: title, partyId, title,
        dateString: str(r.dateString) ?? "", location: str(r.location) ?? "",
        maleLeft: num(r.maleLeft), femaleLeft: num(r.femaleLeft), almostFull: r.almostFull === true,
        href: `/party/${encodeURIComponent(partyId)}/`,
        fallbackImage: str(r.fallbackImage),
      });
    }
  }
  return out.length > 0 && out[0].type === "brand" ? out : null;
}

// ─── 관리자 설정 (api/data/hero.json) ─────────────────────────────────────
export type HeroImageConfig = {
  imagePc: string | null;
  imageMo: string | null;
  focusPc: string;
  focusMo: string;
  tonePc: HeroTone;
  toneMo: HeroTone;
  toneModePc: HeroToneMode; // 관리자 화면의 [자동 | 어두운 글자 | 흰 글자] 선택 — 자동이면 tone 에 분석값이 들어간다
  toneModeMo: HeroToneMode;
};
export type HeroPartyConfig = Partial<HeroImageConfig> & { partyId: string };
export type HeroConfig = { brand: HeroImageConfig; parties: HeroPartyConfig[]; autoFill: boolean };

/** 관리자 GET 이 주는 파티별 모집 상태 (서버 heroPartyInfos 와 같은 계산) */
export type HeroPartyInfo = {
  partyId: string;
  title: string;
  dateString: string;
  calendarDate: string;
  location: string;
  imageUrl: string | null;
  maleLeft: number;
  femaleLeft: number;
  open: boolean;        // 모집중 = 행사 전 && (남 잔여 > 0 || 여 잔여 > 0)
  almostFull: boolean;  // 모집중이면서 남·여 잔여 합계 3 이하
  ended: boolean;       // 행사 일시 지남
};

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  brand: {
    imagePc: HERO_DEFAULT_IMAGE, imageMo: HERO_DEFAULT_IMAGE,
    focusPc: DEFAULT_BRAND_SLIDE.focusPc, focusMo: DEFAULT_BRAND_SLIDE.focusMo,
    tonePc: "dark", toneMo: "dark", toneModePc: "dark", toneModeMo: "dark",
  },
  parties: [],
  autoFill: true,
};

/**
 * 최종 슬라이드 계산 — api/_hero.php heroBuildSlides() 와 같은 규칙.
 *  1) 브랜드 1장
 *  2) 관리자가 고른 파티 중 모집중인 것만 순서대로
 *  3) 3개 미만이고 autoFill 이면 날짜가 가까운 모집중 파티로 채움(중복 제외)
 *  전용 이미지가 없으면 imagePc/imageMo = null, fallbackImage = 파티 대표이미지(imageUrl), 톤은 "dark" 고정.
 */
export function buildHeroSlides(config: HeroConfig, infos: HeroPartyInfo[]): HeroSlideData[] {
  const b = config.brand;
  const slides: HeroSlideData[] = [{
    type: "brand", alt: DEFAULT_BRAND_SLIDE.alt,
    imagePc: b.imagePc ?? b.imageMo ?? HERO_DEFAULT_IMAGE, imageMo: b.imageMo ?? b.imagePc ?? HERO_DEFAULT_IMAGE,
    focusPc: b.focusPc, focusMo: b.focusMo, tonePc: b.tonePc, toneMo: b.toneMo,
  }];
  const byId = new Map(infos.map(i => [i.partyId, i]));
  const picked: { info: HeroPartyInfo; cfg: HeroPartyConfig | null }[] = [];
  for (const cfg of config.parties) {
    const info = byId.get(cfg.partyId);
    if (info?.open && !picked.some(p => p.info.partyId === info.partyId)) picked.push({ info, cfg });
    if (picked.length >= HERO_MAX_PARTIES) break;
  }
  if (config.autoFill && picked.length < HERO_MAX_PARTIES) {
    const open = infos.filter(i => i.open && !picked.some(p => p.info.partyId === i.partyId))
      .sort((a, z) => a.calendarDate.localeCompare(z.calendarDate) || a.dateString.localeCompare(z.dateString));
    for (const info of open) {
      if (picked.length >= HERO_MAX_PARTIES) break;
      picked.push({ info, cfg: null });
    }
  }
  for (const { info, cfg } of picked) {
    const own = !!(cfg?.imagePc || cfg?.imageMo);
    slides.push({
      type: "party", alt: info.title, partyId: info.partyId, title: info.title,
      dateString: info.dateString, location: info.location,
      maleLeft: info.maleLeft, femaleLeft: info.femaleLeft, almostFull: info.almostFull,
      href: `/party/${encodeURIComponent(info.partyId)}/`,
      imagePc: own ? (cfg?.imagePc ?? cfg?.imageMo ?? null) : null,
      imageMo: own ? (cfg?.imageMo ?? cfg?.imagePc ?? null) : null,
      focusPc: cfg?.focusPc ?? "50% 50%", focusMo: cfg?.focusMo ?? "50% 0%",
      tonePc: own ? (cfg?.tonePc ?? "dark") : "dark",
      toneMo: own ? (cfg?.toneMo ?? "dark") : "dark",
      fallbackImage: info.imageUrl || HERO_FALLBACK_PARTY_IMAGE,
    });
  }
  return slides;
}
