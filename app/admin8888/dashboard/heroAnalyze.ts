/**
 * 메인이미지(히어로) 이미지 분석 — 브라우저 canvas.
 *  - 글자 톤 자동 판정: 글자가 올라갈 영역의 평균 상대휘도 > 0.5 → "light"(어두운 글자), 아니면 "dark"(흰 글자)
 *      PC: 왼쪽 0~50%, 세로 20~85% / 모바일: 하단 45%
 *  - 모바일 비율 검사: 4:5 와 5% 이상 다르면 안내
 *  - 가독성 검사: 글자 영역을 띠 8개로 나눠 띠마다 오버레이(그 위치의 불투명도)를 덮은 평균색과 글자색의
 *    WCAG 대비비를 구하고, 가장 낮은 값이 4.5 미만이면 경고 (그라디언트가 옅어지는 쪽 글자까지 확인)
 * 다른 사이트 이미지처럼 픽셀을 읽을 수 없으면(canvas 보안 제한) null — 판정·경고를 건너뛴다.
 */
import type { HeroTone } from "../../lib/hero";
import { HERO_TONE } from "../../components/heroTone";

type Region = { x0: number; x1: number; y0: number; y1: number };
export const HERO_TEXT_REGION_PC: Region = { x0: 0, x1: 0.5, y0: 0.2, y1: 0.85 };
export const HERO_TEXT_REGION_MO: Region = { x0: 0, x1: 1, y0: 0.55, y1: 1 };
export const HERO_MO_RATIO = 4 / 5;

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
export const relLuminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrastRatio = (a: [number, number, number], b: [number, number, number]) => {
  const la = relLuminance(a), lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

type RGB = [number, number, number];
/** lum = 영역 평균 상대휘도(픽셀별 평균), strips = 띠별 [중심 위치(이미지 기준 0~1), 평균색] — PC 는 세로 띠(가로 위치), 모바일은 가로 띠(세로 위치) */
type RegionStats = { lum: number; strips: [number, RGB][] };
const STRIPS = 8;

/** 영역의 평균 상대휘도와 띠별 평균색 — 긴 변 200px 로 줄여 계산 */
function regionStats(img: HTMLImageElement, region: Region, axis: "x" | "y"): RegionStats | null {
  const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const x = Math.floor(region.x0 * w), y = Math.floor(region.y0 * h);
  const rw = Math.max(1, Math.round((region.x1 - region.x0) * w)), rh = Math.max(1, Math.round((region.y1 - region.y0) * h));
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x, y, rw, rh).data;
  } catch {
    return null; // 다른 출처 이미지 — 픽셀을 읽을 수 없음
  }
  let lum = 0, n = 0;
  const sums = Array.from({ length: STRIPS }, () => [0, 0, 0, 0]); // r, g, b, count
  for (let py = 0; py < rh; py++) {
    for (let px = 0; px < rw; px++) {
      const i = (py * rw + px) * 4;
      const c: RGB = [data[i], data[i + 1], data[i + 2]];
      lum += relLuminance(c); n++;
      const k = Math.min(STRIPS - 1, Math.floor((axis === "x" ? px / rw : py / rh) * STRIPS));
      sums[k][0] += c[0]; sums[k][1] += c[1]; sums[k][2] += c[2]; sums[k][3]++;
    }
  }
  if (!n) return null;
  const [lo, hi] = axis === "x" ? [region.x0, region.x1] : [region.y0, region.y1];
  const strips = sums.flatMap((sm, k): [number, RGB][] =>
    sm[3] ? [[lo + (hi - lo) * (k + 0.5) / STRIPS, [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]]]] : []);
  return { lum: lum / n, strips };
}

/** 그라디언트 정지점 사이 선형 보간 */
function alphaAt(stops: [number, number][], pos: number): number {
  if (pos <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p0, a0] = stops[i - 1], [p1, a1] = stops[i];
    if (pos <= p1) return p1 === p0 ? a1 : a0 + (a1 - a0) * (pos - p0) / (p1 - p0);
  }
  return stops[stops.length - 1][1];
}

export type HeroImageAnalysis = {
  tonePc: HeroTone | null;
  toneMo: HeroTone | null;
  ratio: number;            // 가로/세로
  moRatioWarning: boolean;  // 4:5 와 5% 이상 차이
  pc: RegionStats | null;
  mo: RegionStats | null;
};

export async function analyzeHeroImage(src: string): Promise<HeroImageAnalysis> {
  const img = await loadImage(src);
  const pc = regionStats(img, HERO_TEXT_REGION_PC, "x");
  const mo = regionStats(img, HERO_TEXT_REGION_MO, "y");
  const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
  return {
    tonePc: pc ? (pc.lum > 0.5 ? "light" : "dark") : null,
    toneMo: mo ? (mo.lum > 0.5 ? "light" : "dark") : null,
    ratio,
    moRatioWarning: Math.abs(ratio - HERO_MO_RATIO) / HERO_MO_RATIO >= 0.05,
    pc, mo,
  };
}

/**
 * 글자 영역의 가장 낮은 대비비 — 띠마다 그 위치의 오버레이 불투명도(heroTone.ts overlay.stops)로 덮은 평균색 vs 글자색.
 *  - 이미지 위치를 화면 위치로 그대로 본다(초점·잘림 차이는 무시한 근사값)
 *  - 전용 이미지가 없는 파티 슬라이드는 배경이 brightness-50 이라 색을 절반으로 본다
 */
export function heroContrast(stats: RegionStats | null, tone: HeroTone, view: "pc" | "mo", dimmed = false): number | null {
  if (!stats || stats.strips.length === 0) return null;
  const t = HERO_TONE[tone];
  const stops = view === "pc" ? t.overlay.stopsPc : t.overlay.stopsMo;
  let min = Infinity;
  for (const [pos, rgb] of stats.strips) {
    const a = alphaAt(stops, pos);
    const bg = rgb.map((c, i) => t.overlay.rgb[i] * a + (dimmed ? c * 0.5 : c) * (1 - a)) as RGB;
    min = Math.min(min, contrastRatio(bg, t.textRgb));
  }
  return min;
}

export const HERO_MIN_CONTRAST = 4.5;
