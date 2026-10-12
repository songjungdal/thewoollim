"use client";

/**
 * 메인 히어로 슬라이드 1장 + 인디케이터.
 *  - 메인(HeroSlider)은 mode="responsive" (모바일 클래스 + md: PC 클래스)
 *  - 관리자 메인이미지 탭 미리보기는 mode="pc"(1440×810 을 축소) / "mo"(375 폭 4:5) 로 고정해 같은 화면을 그린다.
 *  - 글자 톤 스타일은 ./heroTone.ts 한 곳에서 관리.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { HeroSlideData, HeroTone } from "../lib/hero";
import { HERO_INTERVAL_MS } from "../lib/hero";
import { HERO_TONE, HERO_BADGE, HERO_TONE_TRANSITION, toneClass, type HeroViewMode } from "./heroTone";

/** 화면 모드별 클래스 — [모바일, PC 고정, 반응형(모바일 + md:)] */
const pick = (mode: HeroViewMode, mo: string, pc: string, resp: string) =>
  mode === "mo" ? mo : mode === "pc" ? pc : resp;

/** 슬라이드 식별자 — 같은 슬라이드면 다시 그리지 않도록 (기본 브랜드 → 저장된 브랜드 교체 시에만 크로스페이드) */
export const heroSlideKey = (s: HeroSlideData) =>
  s.type === "brand" ? `brand:${s.imagePc}|${s.imageMo}` : `party:${s.partyId}`;

type SlideProps = {
  slide: HeroSlideData;
  mode: HeroViewMode;
  active?: boolean;          // Ken Burns 확대 진행
  reducedMotion?: boolean;
  priority?: boolean;        // 첫 슬라이드 이미지만 eager + fetchPriority high
  firstEntry?: boolean;      // 페이지 첫 진입 — 기존 fadeInUp(y 40, 0.8s), 이후 전환은 y 20
  interactive?: boolean;     // false = 관리자 미리보기(링크·스크롤 없음)
};

export default function HeroSlide({ slide, mode, active = true, reducedMotion = false, priority = false, firstEntry = false, interactive = true }: SlideProps) {
  const isParty = slide.type === "party";
  const ownImage = !!(slide.imagePc || slide.imageMo);
  // 전용 이미지가 없는 파티 슬라이드는 대표 이미지를 흐린 배경 + 원본 비율로 보여주고 흰 글자 고정
  const toneMo: HeroTone = isParty && !ownImage ? "dark" : slide.toneMo;
  const tonePc: HeroTone = isParty && !ownImage ? "dark" : slide.tonePc;
  const t = (part: Parameters<typeof toneClass>[0]) => `${toneClass(part, toneMo, tonePc, mode)} ${HERO_TONE_TRANSITION}`;

  // ── 배경 이미지 ──
  const loading = priority ? "eager" : "lazy";
  const fetchPriority = priority ? "high" : "auto";
  const focusStyle = { "--fm": slide.focusMo, "--fp": slide.focusPc } as CSSProperties;
  const objPos = pick(mode, "object-[var(--fm)]", "object-[var(--fp)]", "object-[var(--fm)] md:object-[var(--fp)]");
  const imgCls = `absolute inset-0 w-full h-full object-cover ${objPos} select-none`;
  const pcSrc = slide.imagePc ?? slide.imageMo ?? "";
  const moSrc = slide.imageMo ?? slide.imagePc ?? "";

  let image: ReactNode;
  if (ownImage) {
    image = mode === "responsive" ? (
      <picture>
        <source media="(min-width: 768px)" srcSet={pcSrc} />
        <img src={moSrc} alt={slide.alt} loading={loading} fetchPriority={fetchPriority} draggable={false} style={focusStyle} className={imgCls} />
      </picture>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={mode === "pc" ? pcSrc : moSrc} alt={slide.alt} loading={loading} draggable={false} style={focusStyle} className={imgCls} />
    );
  } else {
    const src = isParty ? (slide.fallbackImage ?? "") : "";
    image = (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" aria-hidden="true" loading={loading} draggable={false} className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 brightness-50 select-none" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={slide.alt} loading={loading} fetchPriority={fetchPriority} draggable={false} className="absolute inset-0 w-full h-full object-contain select-none" />
      </>
    );
  }

  const background = (
    <>
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1 }}
        animate={{ scale: active && !reducedMotion ? 1.06 : 1 }}
        transition={{ duration: active && !reducedMotion ? 7 : 0, ease: "linear" }}
      >
        {image}
      </motion.div>
      {/* 오버레이 — 모바일: 하단 60% 세로 그라디언트 / PC: 왼쪽에서 오른쪽 */}
      {mode !== "pc" && (
        <div className={`absolute inset-x-0 bottom-0 h-[60%] pointer-events-none ${HERO_TONE[toneMo].overlayMo} ${mode === "responsive" ? "md:hidden" : ""}`} />
      )}
      {mode !== "mo" && (
        <div className={`absolute pointer-events-none ${HERO_TONE[tonePc].overlayPc} ${mode === "responsive" ? "hidden md:block" : ""}`} />
      )}
    </>
  );

  // ── 글자 블록 ──
  const layer = pick(mode,
    "absolute inset-x-0 bottom-0 z-10 px-5 pb-6 pointer-events-none",
    "absolute inset-0 z-10 flex items-center pointer-events-none",
    "absolute inset-x-0 bottom-0 z-10 px-5 pb-6 pointer-events-none md:inset-0 md:flex md:items-center md:px-0 md:pb-0");
  const inner = pick(mode, "w-full", "max-w-7xl mx-auto w-full px-10", "w-full md:max-w-7xl md:mx-auto md:px-10");
  const block = pick(mode, "w-full pointer-events-auto", "max-w-[560px] pointer-events-auto", "w-full md:max-w-[560px] pointer-events-auto");
  const btnSize = pick(mode, "w-full h-12 text-[15px]", "px-10 py-5 text-lg", "w-full h-12 text-[15px] md:w-auto md:h-auto md:px-10 md:py-5 md:text-lg");
  const btnCls = `inline-flex items-center justify-center gap-2 rounded-full font-bold shadow-xl ${btnSize} ${t("button")}`;
  const metaCls = `${pick(mode, "text-[13px]", "text-xl", "text-[13px] md:text-lg lg:text-xl")} font-semibold`;

  const textAnim = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
    : firstEntry
      ? { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: "easeOut" as const } }
      : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: "easeOut" as const } };

  let content: ReactNode;
  if (slide.type === "brand") {
    content = (
      <div className={`${block} ${t("shadow")}`}>
        <h1 className={`font-black tracking-tighter break-keep ${pick(mode,
          "text-[1.75rem] leading-[1.25] mb-2",
          "text-7xl leading-[1.15] mb-8",
          "text-[1.75rem] leading-[1.25] mb-2 md:text-6xl lg:text-7xl md:leading-[1.15] md:mb-8")} ${t("title")}`}>
          세상을 울리는<br />
          새로운 연결, <span className={t("accent")}>어울림</span>
        </h1>
        <p className={`font-semibold break-keep ${pick(mode,
          "text-[13px] leading-relaxed mb-4",
          "text-xl leading-relaxed mb-10",
          "text-[13px] leading-relaxed mb-4 md:text-lg lg:text-xl md:mb-10")} ${t("body")}`}>
          숫자와 스펙으로 재단되는 관계를 넘어,<br />
          모든 인연과 깊게 마주하는 로테이션 매칭파티를 경험하세요.
        </p>
        <button
          type="button"
          onClick={interactive ? () => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" }) : undefined}
          tabIndex={interactive ? undefined : -1}
          className={`${btnCls} cursor-pointer`}
        >
          어울림 매칭파티 신청하기 <ArrowRight size={18} />
        </button>
      </div>
    );
  } else {
    const badge = slide.almostFull ? { text: "마감임박", cls: HERO_BADGE.almost } : { text: "모집중", cls: HERO_BADGE.open };
    const meta = [slide.dateString, slide.location].filter(Boolean).join(" · ");
    const inside = (
      <>
        <span className={`inline-block rounded-full font-black ${pick(mode, "px-2.5 py-1 text-xs mb-2", "px-3 py-1 text-sm mb-5", "px-2.5 py-1 text-xs mb-2 md:px-3 md:text-sm md:mb-5")} ${badge.cls}`}>
          {badge.text}
        </span>
        <h2 className={`font-black tracking-tight break-keep line-clamp-2 ${pick(mode,
          "text-[1.6rem] leading-[1.25] mb-2",
          "text-6xl leading-[1.15] mb-6",
          "text-[1.6rem] leading-[1.25] mb-2 md:text-5xl lg:text-6xl md:leading-[1.15] md:mb-6")} ${t("title")}`}>
          {slide.title}
        </h2>
        {meta && <p className={`${metaCls} ${t("body")}`}>{meta}</p>}
        <p className={`${metaCls} font-black ${pick(mode, "mt-0.5 mb-4", "mt-2 mb-10", "mt-0.5 mb-4 md:mt-2 md:mb-10")} ${t("accent")}`}>
          남 {slide.maleLeft}석 · 여 {slide.femaleLeft}석 남음
        </p>
        <span className={btnCls}>이 파티 신청하기 <ArrowRight size={18} /></span>
      </>
    );
    content = interactive ? (
      <Link href={slide.href} draggable={false} className={`${block} block ${t("shadow")}`}>{inside}</Link>
    ) : (
      <div className={`${block} ${t("shadow")}`}>{inside}</div>
    );
  }

  return (
    <div className="absolute inset-0">
      {/* 파티 슬라이드는 이미지 전체가 상세 링크 (키보드 이동은 글자 블록 링크 하나로) */}
      {isParty && interactive ? (
        <Link href={slide.href} aria-label={`${slide.title} 상세 보기`} tabIndex={-1} draggable={false} className="absolute inset-0 block cursor-pointer">
          {background}
        </Link>
      ) : (
        <div className="absolute inset-0">{background}</div>
      )}
      <div className={layer}>
        <div className={inner}>
          <motion.div key={heroSlideKey(slide)} {...textAnim}>{content}</motion.div>
        </div>
      </div>
    </div>
  );
}

type IndicatorProps = {
  count: number;
  index: number;
  onSelect?: (i: number) => void;
  tonePc: HeroTone;
  mode: HeroViewMode;
  running?: boolean;   // 활성 바가 6초 동안 채워짐 (일시정지면 가득 찬 채)
  cycleKey?: string | number;
};

/** 인디케이터 — 모바일: 오른쪽 위 반투명 캡슐(이미지 밝기와 무관하게 보임) / PC: 오른쪽 아래, 톤별 색 */
export function HeroIndicators({ count, index, onSelect, tonePc, mode, running = true, cycleKey }: IndicatorProps) {
  if (count <= 1) return null;
  const pcColors = HERO_TONE[tonePc].indicatorPc;
  const bars = (variant: "mo" | "pc") => Array.from({ length: count }, (_, i) => {
    const activeBar = i === index;
    const track = variant === "mo" ? "w-6 bg-white/40" : `w-10 ${pcColors.track}`;
    const fill = variant === "mo" ? "bg-white" : pcColors.fill;
    return (
      <button
        key={i}
        type="button"
        onClick={onSelect ? () => onSelect(i) : undefined}
        tabIndex={onSelect ? undefined : -1}
        aria-label={`${i + 1}번째 슬라이드 보기`}
        aria-current={activeBar ? "true" : undefined}
        className={`${variant === "mo" ? "py-1.5 -my-1.5 px-0.5" : "py-3 -my-3 px-0.5"} cursor-pointer`}
      >
        <span className={`relative block h-[3px] rounded-full overflow-hidden ${track} ${HERO_TONE_TRANSITION}`}>
          {activeBar && (
            <motion.span
              key={`${cycleKey ?? ""}-${index}`}
              className={`absolute inset-y-0 left-0 rounded-full ${fill} ${HERO_TONE_TRANSITION}`}
              initial={{ width: running ? "0%" : "100%" }}
              animate={{ width: "100%" }}
              transition={{ duration: running ? HERO_INTERVAL_MS / 1000 : 0, ease: "linear" }}
            />
          )}
        </span>
      </button>
    );
  });
  return (
    <>
      {mode !== "pc" && (
        <div className={`absolute top-4 right-4 z-20 flex items-center gap-1 bg-black/25 backdrop-blur-sm px-2 py-1.5 rounded-full ${mode === "responsive" ? "md:hidden" : ""}`}>
          {bars("mo")}
        </div>
      )}
      {mode !== "mo" && (
        <div className={`absolute bottom-8 right-10 z-20 items-center gap-2 ${mode === "responsive" ? "hidden md:flex" : "flex"}`}>
          {bars("pc")}
        </div>
      )}
    </>
  );
}
