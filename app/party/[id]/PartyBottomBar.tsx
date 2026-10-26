"use client";

import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import DiscountArrow from "../../components/DiscountArrow";
import { discountedPrice } from "../../lib/data";

/**
 * PC 하단 바 가운데 참가비 — 남/여 분리 / 단일 가격 / 참가 구성 파티(가장 낮은 가격부터).
 * split·single 의 가격은 정가. discountRate 가 1 이상이면 정가 화살표 + 할인가 (docs/specs/party-discount-rate.md 6장)
 */
export type BarFee =
  | { kind: "split"; male: number; female: number; discountRate?: number }
  | { kind: "single"; price: number; discountRate?: number }
  | { kind: "from"; price: number };

const won = (n: number) => `₩${n.toLocaleString()}`;

/**
 * 파티 상세 하단 고정 바 (docs/specs/party-detail-relayout.md C-7).
 * 페이지 처음부터 끝까지 항상 화면 아래에 붙어 있다(숨김 전환 없음). 잔여석은 넣지 않는다.
 * 높이: 모바일 68px / 태블릿 76px / PC 88px + 아이폰 홈 표시줄(safe-area) — PartyClientView 가 같은 값만큼 본문 아래 여백을 둔다.
 * z-index 40: 헤더(50)·장바구니 모달(100)보다 아래.
 */
export default function PartyBottomBar({ title, when, place, fee, children }: {
  title: string;
  when: string;          // "10월 17일(토) 15:00"
  place: string;         // 짧은 장소명 → 지역 태그 → "" (생략)
  fee: BarFee;
  children: ReactNode;   // PartyCtaButtons
}) {
  const rate = fee.kind === "from" ? 0 : (fee.discountRate ?? 0);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      data-testid="party-cta-bar"
    >
      <div className="mx-auto flex h-[68px] items-center gap-2.5 px-4 max-[359px]:gap-2 md:h-[76px] md:max-w-[768px] md:gap-3 md:px-6 lg:h-[88px] lg:max-w-[908px] lg:gap-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-brand-black max-[359px]:text-[13px] md:text-[16px] lg:text-[17px]">{title}</p>
          {/* 모바일 — "일시 · 장소" 한 줄 */}
          <p className="mt-0.5 truncate text-[12px] text-gray-500 max-[359px]:text-[11px] md:hidden">
            {[when, place].filter(Boolean).join(" · ")}
          </p>
          {/* 태블릿·PC — 달력 아이콘 + 일시 │ 핀 아이콘 + 장소 */}
          <p className="mt-1 hidden min-w-0 items-center gap-1.5 text-[13px] text-gray-600 md:flex lg:text-[14px]">
            <CalendarDays className="size-3.5 flex-shrink-0 text-brand-point-ink" aria-hidden />
            <span className="truncate">{when}</span>
            {place && (
              <>
                <span className="flex-shrink-0 text-gray-300" aria-hidden>│</span>
                <MapPin className="size-3.5 flex-shrink-0 text-brand-point-ink" aria-hidden />
                <span className="truncate">{place}</span>
              </>
            )}
          </p>
        </div>
        {/* PC — 가운데 참가비 (양옆 1px 구분선) */}
        <div className="hidden h-[52px] flex-shrink-0 flex-col justify-center border-x border-gray-200 px-5 lg:flex">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500">
            참가비
            {rate > 0 && (
              <span className="inline-flex items-baseline gap-[3px] whitespace-nowrap rounded-full bg-discount px-1.5 py-0.5 leading-none text-white" data-testid="bar-discount-badge">
                <span className="text-[11px] font-black">{rate}%</span>
                <span className="text-[10px] font-bold">할인</span>
              </span>
            )}
          </span>
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            {rate > 0 && fee.kind !== "from" ? (
              // 할인 — 남 [69,000→] ₩55,000 · 여 [49,000→] ₩39,000 / 단일 [69,000→] ₩55,000
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {(fee.kind === "split"
                  ? [["남", "text-male", fee.male], ["여", "text-female", fee.female]] as const
                  : [["", "", fee.price]] as const
                ).map(([g, cls, amt], i) => (
                  <span key={g || "single"} className="contents">
                    {i > 0 && <span className="text-gray-300">·</span>}
                    {g && <span className={`text-[12px] font-bold ${cls}`}>{g}</span>}
                    <DiscountArrow price={amt} size="bar" won={false} />
                    <span className="text-[20px] font-black tracking-[-0.3px] tabular-nums text-discount">{won(discountedPrice(amt, rate))}</span>
                  </span>
                ))}
              </span>
            ) : fee.kind === "split" ? (
              <>
                <span className="text-[12px] font-bold text-male">남</span>
                <span className="text-[20px] font-black tracking-[-0.3px] tabular-nums">{won(fee.male)}</span>
                <span className="text-gray-300">·</span>
                <span className="text-[12px] font-bold text-female">여</span>
                <span className="text-[20px] font-black tracking-[-0.3px] tabular-nums">{won(fee.female)}</span>
              </>
            ) : (
              <span className="text-[20px] font-black tracking-[-0.3px] tabular-nums">
                {won(fee.price)}{fee.kind === "from" && <span className="ml-0.5 text-[13px] font-bold text-gray-600">부터</span>}
              </span>
            )}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
