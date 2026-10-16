/**
 * 메인 히어로 "글자 톤" 스타일 — 한 곳에서 관리.
 *
 *  - "dark"  = 어두운 이미지 → 흰 글자 (검은 그라디언트 오버레이, 글자 그림자)
 *  - "light" = 밝은 이미지 → 어두운 글자 (흰 그라디언트 오버레이, 그림자 없음)
 *
 * 모바일 톤(toneMo)과 PC 톤(tonePc)이 다를 수 있어서 항목마다
 *   mo  = 모바일용 클래스, pc = PC용 클래스(관리자 미리보기처럼 PC로 고정해 그릴 때), md = 반응형 화면의 md: 접두 클래스
 * 를 모두 문자 그대로 적는다 (Tailwind 는 소스에 그대로 적힌 클래스만 만든다).
 * 배지는 톤과 무관하게 불투명 배경 — HERO_BADGE.
 */
import type { HeroTone } from "../lib/hero";

type Part = { mo: string; pc: string; md: string };
export type HeroToneStyle = {
  overlayMo: string;   // 모바일 오버레이 (하단 60%)
  overlayPc: string;   // PC 오버레이
  title: Part;
  body: Part;
  accent: Part;        // "어울림", 잔여석 강조
  shadow: Part;
  button: Part;
  indicatorPc: { track: string; fill: string };
  /**
   * 가독성 검사용 — 오버레이 색과 위치별 불투명도 (관리자 미리보기 경고, app/admin8888/dashboard/heroAnalyze.ts)
   *  stopsPc: [가로 위치(0=왼쪽 끝, 1=오른쪽 끝), 불투명도] / stopsMo: [세로 위치(0=위, 1=아래), 불투명도] — 위 그라디언트 클래스와 같은 값
   */
  overlay: { rgb: [number, number, number]; stopsPc: [number, number][]; stopsMo: [number, number][] };
  textRgb: [number, number, number];
};

export const HERO_TONE: Record<HeroTone, HeroToneStyle> = {
  dark: {
    overlayMo: "bg-gradient-to-t from-black/85 via-black/45 to-transparent",
    overlayPc: "inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent",
    title:  { mo: "text-white",    pc: "text-white",    md: "md:text-white" },
    body:   { mo: "text-white/85", pc: "text-white/85", md: "md:text-white/85" },
    accent: { mo: "text-brand-point", pc: "text-brand-point", md: "md:text-brand-point" },
    shadow: {
      mo: "drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
      pc: "drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
      md: "md:drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
    },
    button: {
      mo: "bg-brand-black text-white border border-white/20 hover:bg-brand-point hover:text-black",
      pc: "bg-brand-black text-white border border-white/20 hover:bg-brand-point hover:text-black",
      md: "md:bg-brand-black md:text-white md:border-white/20 md:hover:bg-brand-point md:hover:text-black",
    },
    indicatorPc: { track: "bg-white/30", fill: "bg-brand-point" },
    overlay: { rgb: [0, 0, 0], stopsPc: [[0, 0.75], [0.5, 0.35], [1, 0]], stopsMo: [[0, 0], [0.4, 0], [0.7, 0.45], [1, 0.85]] },
    textRgb: [255, 255, 255],
  },
  light: {
    overlayMo: "bg-gradient-to-t from-white/85 via-white/50 to-transparent",
    overlayPc: "inset-y-0 left-0 w-[55%] bg-gradient-to-r from-white/90 via-white/55 to-transparent",
    title:  { mo: "text-brand-black", pc: "text-brand-black", md: "md:text-brand-black" },
    body:   { mo: "text-neutral-700", pc: "text-neutral-700", md: "md:text-neutral-700" },
    accent: { mo: "text-brand-point-ink", pc: "text-brand-point-ink", md: "md:text-brand-point-ink" },
    shadow: { mo: "drop-shadow-none", pc: "drop-shadow-none", md: "md:drop-shadow-none" },
    button: {
      mo: "bg-brand-black text-white border border-transparent hover:bg-brand-point-ink hover:text-white",
      pc: "bg-brand-black text-white border border-transparent hover:bg-brand-point-ink hover:text-white",
      md: "md:bg-brand-black md:text-white md:border-transparent md:hover:bg-brand-point-ink md:hover:text-white",
    },
    indicatorPc: { track: "bg-black/15", fill: "bg-brand-point-ink" },
    overlay: { rgb: [255, 255, 255], stopsPc: [[0, 0.9], [0.275, 0.55], [0.55, 0], [1, 0]], stopsMo: [[0, 0], [0.4, 0], [0.7, 0.5], [1, 0.85]] },
    textRgb: [0, 0, 0],
  },
};

/** 화면 모드 — "responsive" = 실제 메인(모바일 클래스 + md: PC 클래스), "pc"/"mo" = 관리자 미리보기(한쪽으로 고정) */
export type HeroViewMode = "responsive" | "pc" | "mo";

/** 항목 하나의 클래스 — 모바일 톤과 PC 톤을 화면 모드에 맞게 조합 */
export function toneClass(part: keyof Pick<HeroToneStyle, "title" | "body" | "accent" | "shadow" | "button">,
  toneMo: HeroTone, tonePc: HeroTone, mode: HeroViewMode): string {
  if (mode === "pc") return HERO_TONE[tonePc][part].pc;
  if (mode === "mo") return HERO_TONE[toneMo][part].mo;
  return `${HERO_TONE[toneMo][part].mo} ${HERO_TONE[tonePc][part].md}`;
}

/** 배지 — 톤과 무관하게 불투명 배경 */
export const HERO_BADGE = {
  open:   "bg-brand-point text-black",
  almost: "bg-red-600 text-white",
} as const;

/** 톤이 바뀔 때 글자색·배경색 전환 */
export const HERO_TONE_TRANSITION = "transition-colors duration-[600ms]";
