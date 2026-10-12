"use client";

/**
 * 메인 히어로 롤링 슬라이더 — 1번 브랜드(고정) + 모집중 파티 최대 3장.
 *  - 6초마다 크로스페이드(1.2s), 활성 이미지 Ken Burns(1 → 1.06, 7s)
 *  - 탭이 숨겨지면 일시정지, prefers-reduced-motion 이면 자동 전환·확대 끄고 1번 고정
 *  - 모바일 좌우 스와이프(50px), 10px 넘게 끌면 클릭(상세 이동)으로 보지 않음
 *  - 슬라이드 1장뿐이면 롤링·인디케이터 숨김
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import HeroSlide, { HeroIndicators, heroSlideKey } from "./HeroSlide";
import { DEFAULT_BRAND_SLIDE, HERO_INTERVAL_MS, normalizeHeroSlides, type HeroSlideData } from "../lib/hero";

export default function HeroSlider() {
  // 처음엔 기본 브랜드 1장을 바로 그리고, /api/hero.php 응답이 오면 교체 (실패하면 기본 1장 유지)
  const [slides, setSlides] = useState<HeroSlideData[]>([DEFAULT_BRAND_SLIDE]);
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [cycle, setCycle] = useState(0);              // 타이머·진행 바 다시 시작
  const reduced = useReducedMotion() ?? false;
  const [firstEntry, setFirstEntry] = useState(true); // 첫 진입 글자 애니메이션(fadeInUp) — 넘기면 false
  const movedRef = useRef(false);

  const count = reduced ? 1 : slides.length;          // 동작 줄이기 설정이면 1번 고정
  const rolling = count > 1;
  const cur = slides[index % count] ?? slides[0];

  const go = useCallback((i: number) => {
    setIndex(((i % count) + count) % count);
    setCycle(c => c + 1);
    setFirstEntry(false);
  }, [count]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hero.php", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const next = normalizeHeroSlides(d);
        if (!cancelled && next) setSlides(next);
      })
      .catch(() => { /* 기본 브랜드 1장 유지 */ });
    return () => { cancelled = true; };
  }, []);

  // 탭 숨김 → 일시정지, 다시 보이면 타이머 새로 시작
  useEffect(() => {
    const onVis = () => {
      setHidden(document.hidden);
      if (!document.hidden) setCycle(c => c + 1);
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // 6초 자동 전환 — 인디케이터·스와이프로 이동하면 cycle 이 바뀌어 타이머가 다시 시작된다
  useEffect(() => {
    if (!rolling || hidden) return;
    const t = window.setTimeout(() => { setIndex(i => (i + 1) % count); setFirstEntry(false); }, HERO_INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [index, cycle, rolling, hidden, count]);

  // 다음 슬라이드 이미지 미리 받기 (크로스페이드 때 빈 화면 방지) — 화면 폭에 맞는 한 장만
  useEffect(() => {
    if (!rolling) return;
    const next = slides[(index + 1) % count];
    if (!next) return;
    const pc = window.matchMedia("(min-width: 768px)").matches;
    const src = next.imagePc || next.imageMo
      ? (pc ? next.imagePc ?? next.imageMo : next.imageMo ?? next.imagePc)
      : next.type === "party" ? next.fallbackImage : null;
    if (src) new window.Image().src = src;
  }, [index, rolling, slides, count]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="메인 슬라이드"
      className="relative w-full overflow-hidden bg-brand-black aspect-[4/5] min-h-[460px] max-h-[80svh] md:aspect-auto md:h-[88vh] md:min-h-[700px] md:max-h-none"
    >
      <motion.div
        className="absolute inset-0"
        drag={rolling ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragStart={() => { movedRef.current = false; }}
        onDrag={(_, info) => { if (Math.abs(info.offset.x) > 10) movedRef.current = true; }}
        onDragEnd={(_, info) => {
          if (info.offset.x <= -50) go(index + 1);
          else if (info.offset.x >= 50) go(index - 1);
        }}
        onClickCapture={e => {
          // 스와이프(10px 초과)로 끝난 손동작은 상세 이동으로 처리하지 않는다
          if (movedRef.current) { e.preventDefault(); e.stopPropagation(); movedRef.current = false; }
        }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={heroSlideKey(cur)}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            <HeroSlide
              slide={cur}
              mode="responsive"
              active
              reducedMotion={reduced}
              priority={cur === slides[0]}
              firstEntry={firstEntry}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      {rolling && (
        <HeroIndicators
          count={count}
          index={index % count}
          onSelect={go}
          tonePc={cur.type === "party" && !(cur.imagePc || cur.imageMo) ? "dark" : cur.tonePc}
          mode="responsive"
          running={!hidden}
          cycleKey={cycle}
        />
      )}
    </section>
  );
}
