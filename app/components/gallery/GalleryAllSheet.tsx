"use client";

import { useId, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useOverlay } from "./useOverlay";
import { galleryAlt, GALLERY_FOCUS_RING, GALLERY_PHOTO_FOCUS, type GalleryItem } from "./types";

/*
 * 현장스케치 "전체 사진 보기" 시트 — 화면 전체를 덮고 모든 사진을 작은 칸으로 보여준다.
 * 사진을 누르면 그 사진부터 라이트박스가 시트 위에 열린다(onSelect). Esc·닫기 버튼으로 닫는다.
 */
export default function GalleryAllSheet({
  open, items, onClose, onSelect,
}: {
  open: boolean;
  items: GalleryItem[];
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  return (
    <AnimatePresence>
      {open && <Sheet key="gallery-all" items={items} onClose={onClose} onSelect={onSelect} />}
    </AnimatePresence>
  );
}

function Sheet({ items, onClose, onSelect }: { items: GalleryItem[]; onClose: () => void; onSelect: (index: number) => void }) {
  const reduced = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useOverlay(rootRef, closeRef, onClose);

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : 24 }}
      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex flex-col bg-[#0b0c0d] text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 md:px-8">
        <h2 id={titleId} className="text-lg md:text-xl font-bold tracking-tight">
          현장스케치 <span className="font-medium text-white/60">{items.length}장</span>
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="전체 사진 닫기"
          className={`-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 hover:text-brand-point motion-reduce:transition-none ${GALLERY_FOCUS_RING}`}
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <ul className="mx-auto grid max-w-7xl grid-cols-3 gap-1.5 p-1.5 md:grid-cols-5 md:gap-3 md:p-8">
          {items.map((item, i) => {
            const alt = galleryAlt(item, i);
            return (
              <li key={`${item.id}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-label={`${alt} 크게 보기`}
                  className={`group relative block aspect-square w-full overflow-hidden rounded-lg md:rounded-xl bg-gray-800 ${GALLERY_PHOTO_FOCUS}`}
                >
                  <Image
                    src={item.image_path}
                    alt={alt}
                    fill
                    sizes="(min-width: 1280px) 250px, (min-width: 768px) 20vw, 33vw"
                    className="object-cover transition duration-300 group-hover:brightness-110 motion-reduce:transition-none"
                    draggable={false}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}
