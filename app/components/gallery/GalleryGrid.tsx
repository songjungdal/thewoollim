"use client";

import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import Image from "next/image";
import { animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from "framer-motion";
import { ChevronLeft, ChevronRight, LayoutGrid, ZoomIn } from "lucide-react";
import { galleryAlt, GALLERY_FOCUS_RING, GALLERY_PHOTO_FOCUS, type GalleryItem } from "./types";

/*
 * 메인 현장스케치(#gallery) 사진 그리드 — 한 페이지 6장 (PC 3열 x 2줄 / 모바일 2열 x 3줄).
 *  - 페이지는 가로로 이어 붙이고, 화살표·점·스와이프(터치)·마우스 드래그로 넘긴다.
 *  - 사진 아래 컨트롤 바: [전체 사진 보기 N장] · 점 + "1 / 2" · 이전/다음 화살표.
 */

/** 한 페이지 사진 수 */
const PAGE_SIZE = 6;
/** 페이지 넘김 애니메이션 (화살표·점·스와이프 공통) */
const PAGE_TRANSITION = { type: "tween", duration: 0.55, ease: [0.22, 1, 0.36, 1] } as const;
/** 가로로 이만큼(px) 움직이면 드래그로 본다 — 그보다 적게 움직이면 사진 누르기 */
const DRAG_START = 6;
/** 손을 뗐을 때 이만큼(px) 이상 끌었으면 다음/이전 페이지, 아니면 제자리 */
const SWIPE_THRESHOLD = 40;
/** 첫·마지막 페이지에서 바깥쪽으로 끌 때 따라가는 비율 (끝에 닿은 느낌) */
const EDGE_RESISTANCE = 0.3;
/** 드래그를 끝낸 뒤 이 시간(ms) 안에 오는 클릭은 사진 열기로 보지 않는다 */
const CLICK_AFTER_DRAG_MS = 500;
/** 페이지가 이보다 많으면 점을 숨기고 숫자만 보여준다 */
const MAX_DOTS = 8;

const ARROW_CLASS =
  "flex h-11 w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-full border border-white/30 text-white " +
  "transition-colors enabled:hover:border-brand-point enabled:hover:text-brand-point " +
  "disabled:opacity-30 disabled:cursor-not-allowed motion-reduce:transition-none " + GALLERY_FOCUS_RING;

type Drag = { id: number; startX: number; startY: number; dx: number; active: boolean };

export default function GalleryGrid({
  items, page, setPage, onOpen, onOpenAll,
}: {
  items: GalleryItem[];
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  onOpen: (index: number) => void;
  onOpenAll: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const lastPage = totalPages - 1;
  const reduced = useReducedMotion() ?? false;

  // 슬라이드 폭(px)과 페이지 사이 간격 — 사진 사이 간격과 같게 (모바일 8px / PC 16px)
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);
  const [gap, setGap] = useState(8);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setViewportW(el.offsetWidth);
      setGap(mq.matches ? 16 : 8);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    mq.addEventListener("change", update);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  const stride = viewportW + gap;

  const x = useMotionValue(0);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const slideTo = (target: number, instant: boolean) => {
    anim.current?.stop();
    if (instant) x.set(target);
    else anim.current = animate(x, target, PAGE_TRANSITION);
  };

  // 페이지가 바뀌면 그 페이지로 이동. 화면 폭이 바뀐 경우(회전·창 크기)는 애니메이션 없이 바로 맞춘다.
  const drag = useRef<Drag | null>(null);
  const lastStride = useRef(stride);
  useEffect(() => {
    if (drag.current?.active) return;
    const resized = lastStride.current !== stride;
    lastStride.current = stride;
    anim.current?.stop();
    if (reduced || resized) x.set(-current * stride);
    else anim.current = animate(x, -current * stride, PAGE_TRANSITION);
  }, [current, stride, reduced, x]);

  // ── 스와이프·드래그 ──
  // 세로로 움직이면 브라우저 스크롤에 맡기고(touch-action: pan-y), 가로로 6px 넘게 움직이면 그리드가 손가락을 따라온다.
  const dragEndedAt = useRef(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (totalPages < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, dx: 0, active: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;   // 세로 스크롤
        return;
      }
      if (Math.abs(dx) < DRAG_START) return;
      d.active = true;
      anim.current?.stop();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}   // 그리드 밖으로 나가도 계속 따라오게
      setDragging(true);
    }
    d.dx = dx;
    const outward = (current === 0 && dx > 0) || (current === lastPage && dx < 0);
    x.set(-current * stride + (outward ? dx * EDGE_RESISTANCE : dx));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    setDragging(false);
    dragEndedAt.current = performance.now();   // 드래그를 끝낸 손가락·마우스로 사진이 열리지 않게
    let next = current;
    if (!cancelled && d.dx <= -SWIPE_THRESHOLD && current < lastPage) next = current + 1;
    if (!cancelled && d.dx >= SWIPE_THRESHOLD && current > 0) next = current - 1;
    if (next !== current) setPage(next);
    else slideTo(-current * stride, reduced);   // 제자리로 복귀
  };

  const pages = Array.from({ length: totalPages }, (_, i) => i);

  return (
    <div>
      <div
        ref={viewportRef}
        className={`overflow-hidden touch-pan-y touch-pinch-zoom select-none ${dragging ? "cursor-grabbing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={e => endDrag(e, false)}
        onPointerCancel={e => endDrag(e, true)}
        onClickCapture={e => {
          if (performance.now() - dragEndedAt.current > CLICK_AFTER_DRAG_MS) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragStart={e => e.preventDefault()}
      >
        <motion.div className="flex" style={{ x, gap }}>
          {pages.map(pageIdx => {
            const start = pageIdx * PAGE_SIZE;
            const pageItems = items.slice(start, start + PAGE_SIZE);
            return (
              <div
                key={pageIdx}
                inert={pageIdx !== current}
                className="w-full flex-shrink-0 grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4"
              >
                {pageItems.map((item, i) => {
                  const index = start + i;
                  const alt = galleryAlt(item, index);
                  return (
                    <button
                      key={`${item.id}-${index}`}
                      type="button"
                      onClick={() => onOpen(index)}
                      aria-label={`${alt} 크게 보기`}
                      className={`group relative aspect-square overflow-hidden rounded-2xl md:rounded-[22px] bg-gray-800 border border-white/5 cursor-pointer ${GALLERY_PHOTO_FOCUS}`}
                    >
                      <span className="absolute inset-0 transition duration-500 ease-out group-hover:scale-105 group-hover:brightness-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                        <Image
                          src={item.image_path}
                          alt={alt}
                          fill
                          sizes="(min-width: 1280px) 416px, (min-width: 768px) 33vw, 50vw"
                          className="object-cover"
                          draggable={false}
                        />
                      </span>
                      {/* 확대 배지 — 마우스를 올렸을 때(hover 가능한 기기)와 키보드 포커스 때만 */}
                      <span
                        aria-hidden="true"
                        className="absolute right-2 bottom-2 md:right-3 md:bottom-3 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                      >
                        <ZoomIn size={16} strokeWidth={2.25} />
                      </span>
                    </button>
                  );
                })}
                {/* 마지막 페이지가 6장보다 적어도 줄 수(높이)가 같도록 빈 칸 */}
                {Array.from({ length: PAGE_SIZE - pageItems.length }, (_, i) => (
                  <div key={`empty-${i}`} aria-hidden="true" className="aspect-square" />
                ))}
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* 컨트롤 바 — 모바일: [←] 점·숫자 [→] / 아래 줄 [전체 사진 보기]. PC: [전체 사진 보기] …… 점·숫자 [←] [→]
          (요소 순서는 PC 기준이고, 모바일은 order 로 자리만 바꾼다) */}
      <div className="mt-5 md:mt-8 flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <button
          type="button"
          onClick={onOpenAll}
          aria-haspopup="dialog"
          className={`order-2 md:order-none inline-flex h-12 w-full md:w-auto items-center justify-center gap-2 rounded-full border border-white/30 px-6 text-sm md:text-base font-bold text-white transition-colors hover:border-brand-point hover:text-brand-point motion-reduce:transition-none ${GALLERY_FOCUS_RING}`}
        >
          <LayoutGrid size={18} aria-hidden="true" />
          전체 사진 보기
          <span className="font-medium text-white/60">{items.length}장</span>
        </button>

        {totalPages > 1 && (
          <div className="order-1 md:order-none flex items-center justify-between gap-3 md:ml-auto md:justify-end">
            <div className="order-2 md:order-none flex items-center gap-4 md:mr-1">
              {totalPages <= MAX_DOTS && (
                <div className="flex items-center gap-4">
                  {pages.map(i => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      aria-label={`현장스케치 ${i + 1}페이지`}
                      aria-current={i === current ? "true" : undefined}
                      className={`relative h-2 rounded-full transition-all duration-300 motion-reduce:transition-none before:absolute before:-inset-x-2 before:-inset-y-[18px] ${GALLERY_FOCUS_RING} ${
                        i === current ? "w-6 bg-brand-point" : "w-2 bg-white/30 hover:bg-white/60"
                      }`}
                    />
                  ))}
                </div>
              )}
              <p className="text-sm tabular-nums text-white/50" aria-live="polite">
                <span className="font-bold text-white">{current + 1}</span> / {totalPages}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, Math.min(p, lastPage) - 1))}
              disabled={current === 0}
              aria-label="현장스케치 이전 페이지"
              className={`order-1 md:order-none ${ARROW_CLASS}`}
            >
              <ChevronLeft size={22} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(lastPage, p + 1))}
              disabled={current === lastPage}
              aria-label="현장스케치 다음 페이지"
              className={`order-3 md:order-none ${ARROW_CLASS}`}
            >
              <ChevronRight size={22} strokeWidth={2.25} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
