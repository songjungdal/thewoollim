"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useOverlay } from "./useOverlay";
import { galleryAlt, GALLERY_FOCUS_RING, type GalleryItem } from "./types";

/*
 * 현장스케치 사진 크게 보기(라이트박스).
 *  - 위: "3 / 10" + 닫기 / 가운데: 사진 / 아래: 썸네일 줄(지금 사진은 청록 테두리, 자동으로 가운데로 스크롤)
 *  - 800px 이상: 좌우 원형 화살표. 그보다 좁으면 화살표 대신 좌우로 밀어서(50px 이상) 넘긴다.
 *  - 키보드 ←/→/Esc. 사진 바깥(배경)을 누르면 닫힌다.
 */

/** 이만큼(px) 이상 가로로 밀면 다음/이전 사진 */
const SWIPE_THRESHOLD = 50;
/** 밀어서 넘긴 뒤 이 시간(ms) 안에 오는 클릭은 배경 클릭(닫기)으로 보지 않는다 */
const CLICK_AFTER_SWIPE_MS = 500;

export default function GalleryLightbox({
  items, index, onClose, onIndexChange,
}: {
  items: GalleryItem[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  // 보는 중에 사진 목록이 줄어도(관리자 삭제 반영) 범위 안의 사진을 보여준다
  const shown = index === null || items.length === 0 ? null : Math.min(index, items.length - 1);
  return (
    <AnimatePresence>
      {shown !== null && (
        <Lightbox key="gallery-lightbox" items={items} index={shown} onClose={onClose} onIndexChange={onIndexChange} />
      )}
    </AnimatePresence>
  );
}

function Lightbox({
  items, index, onClose, onIndexChange,
}: {
  items: GalleryItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const last = items.length - 1;
  const item = items[index];
  const alt = galleryAlt(item, index);

  const goPrev = () => { if (index > 0) onIndexChange(index - 1); };
  const goNext = () => { if (index < last) onIndexChange(index + 1); };

  useOverlay(rootRef, closeRef, onClose, e => {
    if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
  });

  // 지금 사진의 썸네일을 썸네일 줄 가운데로 (처음 열 때는 바로, 그다음부터는 부드럽게)
  const firstScroll = useRef(true);
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelector<HTMLElement>(`[data-thumb="${index}"]`);
    if (!strip || !thumb) return;
    strip.scrollTo({
      left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2,
      behavior: reduced || firstScroll.current ? "auto" : "smooth",
    });
    firstScroll.current = false;
  }, [index, reduced]);

  // ── 좌우 스와이프 (가로 50px 이상). 세로 움직임은 브라우저에 맡긴다(touch-action: pan-y) ──
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipedAt = useRef(0);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    swipedAt.current = performance.now();   // 밀고 난 뒤의 클릭으로 창이 닫히지 않게
    if (dx < 0) goNext();
    else goPrev();
  };

  // 사진·버튼·썸네일 줄이 아닌 배경(data-backdrop)을 누르면 닫는다
  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (performance.now() - swipedAt.current < CLICK_AFTER_SWIPE_MS) return;
    if (e.target instanceof HTMLElement && e.target.hasAttribute("data-backdrop")) onClose();
  };

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 hidden min-[800px]:flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white " +
    "transition-colors enabled:hover:bg-brand-point enabled:hover:text-black disabled:opacity-30 disabled:cursor-not-allowed " +
    "motion-reduce:transition-none " + GALLERY_FOCUS_RING;

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="현장스케치 사진 크게 보기"
      data-backdrop=""
      onClick={onBackdropClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      className="fixed inset-0 z-[110] flex flex-col bg-black text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* 위: 순서 + 닫기 */}
      <div data-backdrop="" className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
        <p className="text-sm font-bold tabular-nums text-white/60" aria-live="polite">
          <span className="text-white">{index + 1}</span> / {items.length}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className={`-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 hover:text-brand-point motion-reduce:transition-none ${GALLERY_FOCUS_RING}`}
        >
          <X size={26} />
        </button>
      </div>

      {/* 가운데: 사진 (+ 800px 이상 좌우 화살표) */}
      <div
        data-backdrop=""
        className="relative flex flex-1 min-h-0 items-center justify-center px-3 py-2 min-[800px]:px-24 touch-pan-y touch-pinch-zoom select-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null; }}
      >
        {/* next/image(fill) 대신 img — 원본 비율 그대로 화면 안에 맞추고, 요소 크기가 사진과 같아 사진 바깥 클릭을 구분할 수 있다 */}
        <motion.img
          key={`${item.id}-${index}`}
          src={item.image_path}
          alt={alt}
          draggable={false}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
        <button type="button" onClick={goPrev} disabled={index === 0} aria-label="이전 사진" className={`left-6 ${arrowClass}`}>
          <ChevronLeft size={28} strokeWidth={2.25} />
        </button>
        <button type="button" onClick={goNext} disabled={index === last} aria-label="다음 사진" className={`right-6 ${arrowClass}`}>
          <ChevronRight size={28} strokeWidth={2.25} />
        </button>
      </div>

      {/* 아래: 안내(모바일) + 썸네일 줄 */}
      <div data-backdrop="" className="shrink-0 pt-2 pb-3">
        <p data-backdrop="" className="mb-1 text-center text-xs text-white/45 min-[800px]:hidden">좌우로 밀어서 넘기기</p>
        <div ref={stripRef} className="relative overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex w-max gap-2 px-4 py-2">
            {items.map((thumb, i) => (
              <button
                key={`${thumb.id}-${i}`}
                type="button"
                data-thumb={i}
                onClick={() => onIndexChange(i)}
                aria-label={`${galleryAlt(thumb, i)} 보기`}
                aria-current={i === index ? "true" : undefined}
                className={`relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg border-2 transition motion-reduce:transition-none ${GALLERY_FOCUS_RING} ${
                  i === index ? "border-brand-point opacity-100" : "border-transparent opacity-50 hover:opacity-90"
                }`}
              >
                <Image src={thumb.image_path} alt="" fill sizes="52px" className="object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
