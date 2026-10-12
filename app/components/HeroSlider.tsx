"use client";

/**
 * 메인 히어로 롤링 슬라이더 — 1번 브랜드(고정) + 모집중 파티 최대 3장.
 *  - 6초마다 크로스페이드(1.2s), 활성 이미지 Ken Burns(1 → 1.06, 7s)
 *  - 탭이 숨겨지면 일시정지, prefers-reduced-motion 이면 자동 전환·확대 끄고 1번 고정
 *  - 모바일 좌우 스와이프(50px), 10px 넘게 끌면 클릭(상세 이동)으로 보지 않음
 *  - 슬라이드 1장뿐이면 롤링·인디케이터 숨김
 *  - 서버 응답(/api/hero.php) 전에는 이미지를 그리지 않는다 — 관리자가 바꾼 이미지 대신 기본 이미지가
 *    잠깐 보였다가 바뀌지 않도록. 지난 응답은 브라우저에 저장해 두었다가 다음 방문 때 바로 쓰고,
 *    응답이 실패하거나 5초 안에 오지 않을 때만 기본 브랜드 1장을 쓴다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import HeroSlide, { HeroIndicators, heroSlideKey } from "./HeroSlide";
import { DEFAULT_BRAND_SLIDE, HERO_INTERVAL_MS, normalizeHeroSlides, type HeroSlideData } from "../lib/hero";

const FALLBACK_SLIDES: HeroSlideData[] = [DEFAULT_BRAND_SLIDE];
const HERO_CACHE_KEY = "woollim_hero_slides";
const HERO_FETCH_TIMEOUT_MS = 5000;
const noSubscribe = () => () => {};
const readCache = () => { try { return localStorage.getItem(HERO_CACHE_KEY); } catch { return null; } };

export default function HeroSlider() {
  // 슬라이드 = 서버 응답 → (없으면) 지난 방문 때 저장한 응답 → (실패·시간 초과면) 기본 브랜드 1장.
  // 셋 다 없으면 null — 검은 화면만(크기는 같게). 저장값은 서버 HTML 과 어긋나지 않게 useSyncExternalStore 로 읽는다.
  const cachedRaw = useSyncExternalStore(noSubscribe, readCache, () => null);
  const cached = useMemo(() => {
    try { return normalizeHeroSlides(JSON.parse(cachedRaw ?? "null")); } catch { return null; }
  }, [cachedRaw]);
  const [fetched, setFetched] = useState<HeroSlideData[] | null>(null);
  const [failed, setFailed] = useState(false);
  const slides = fetched ?? cached ?? (failed ? FALLBACK_SLIDES : null);
  const ready = slides !== null;
  const list = slides ?? FALLBACK_SLIDES;
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [cycle, setCycle] = useState(0);              // 타이머·진행 바 다시 시작
  const reduced = useReducedMotion() ?? false;
  const [firstEntry, setFirstEntry] = useState(true); // 첫 진입 글자 애니메이션(fadeInUp) — 넘기면 false
  const movedRef = useRef(false);

  const count = reduced ? 1 : list.length;            // 동작 줄이기 설정이면 1번 고정
  const rolling = ready && count > 1;
  const cur = list[index % count] ?? list[0];

  const go = useCallback((i: number) => {
    setIndex(((i % count) + count) % count);
    setCycle(c => c + 1);
    setFirstEntry(false);
  }, [count]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), HERO_FETCH_TIMEOUT_MS);
    // 실패·시간 초과 — 저장값도 없을 때만 기본 브랜드 1장이 보인다 (slides 계산 참고)
    const fail = () => { if (!cancelled) setFailed(true); };
    fetch("/api/hero.php", { cache: "no-store", signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const next = normalizeHeroSlides(d);
        if (!next) return fail();
        if (cancelled) return;
        setFetched(next);
        try { localStorage.setItem(HERO_CACHE_KEY, JSON.stringify({ slides: next })); } catch { /* 저장 실패는 무시 */ }
      })
      .catch(fail)
      .finally(() => window.clearTimeout(timer));
    return () => { cancelled = true; ctrl.abort(); window.clearTimeout(timer); };
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
    const next = list[(index + 1) % count];
    if (!next) return;
    const pc = window.matchMedia("(min-width: 768px)").matches;
    const src = next.imagePc || next.imageMo
      ? (pc ? next.imagePc ?? next.imageMo : next.imageMo ?? next.imagePc)
      : next.type === "party" ? next.fallbackImage : null;
    if (src) new window.Image().src = src;
  }, [index, rolling, list, count]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="메인 슬라이드"
      className="relative w-full overflow-hidden bg-brand-black aspect-[4/5] min-h-[460px] max-h-[80svh] md:aspect-auto md:h-[88vh] md:min-h-[700px] md:max-h-none"
    >
      {/* 응답 전 — 검은 화면(같은 크기). 검색엔진·화면낭독기용 제목만 숨겨서 둔다 */}
      {!ready && <h1 className="sr-only">세상을 울리는 새로운 연결, 어울림</h1>}
      {ready && (
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
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
              priority={cur === list[0]}
              firstEntry={firstEntry}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      )}
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
