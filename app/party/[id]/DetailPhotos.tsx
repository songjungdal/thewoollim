"use client";

import { useState, type UIEvent } from "react";
import type { PartyDetailImage } from "../../lib/partyDetailTemplates";

/**
 * 관리자 사진(사진 칸 ①~⑤, 소개 묶음 사진) 표시 (docs/specs/party-detail-relayout.md D-5).
 *  - 0장: 그리지 않음
 *  - 1장: 컨테이너 전체 폭, 원본 비율 그대로
 *  - 2장 이상: 모바일은 옆으로 넘겨 보기(한 장 폭 85% — 다음 사진이 살짝 보임, 아래 "1 / n"),
 *             태블릿·PC(768px~)는 2열 그리드(3장 이상이면 다음 줄).
 *             사진은 자르지 않고 원본 비율 그대로 — 명세의 4:3 자르기 대신 (글자가 든 세로 안내 이미지가 잘리지 않게, 2026-10-21 사용자 결정)
 * alt 는 관리자 대체 텍스트. 모두 lazy 로딩(대표이미지는 이 컴포넌트를 쓰지 않음).
 */
export default function DetailPhotos({ images, className = "" }: { images: PartyDetailImage[]; className?: string }) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) return null;

  if (images.length === 1) {
    const img = images[0];
    return (
      <div className={className} data-testid="detail-photos">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.alt} loading="lazy" className="block h-auto w-full max-w-full rounded-2xl" />
      </div>
    );
  }

  // 지금 보이는 사진 번호 — 맨 끝까지 넘기면 마지막 사진 (마지막 사진은 왼쪽 끝에 붙지 못하므로)
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const step = first.offsetWidth + 12;   // gap-3
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setCurrent(atEnd ? images.length - 1 : Math.min(images.length - 1, Math.round(el.scrollLeft / step)));
  };

  return (
    <div className={className} data-testid="detail-photos">
      <div
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0"
      >
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${img.url}-${i}`}
            src={img.url}
            alt={img.alt}
            loading="lazy"
            className="block h-auto w-[85%] flex-shrink-0 snap-start rounded-2xl md:w-full"
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-bold text-gray-500 tabular-nums md:hidden" aria-hidden>
        {current + 1} / {images.length}
      </p>
    </div>
  );
}
