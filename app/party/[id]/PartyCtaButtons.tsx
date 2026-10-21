"use client";

import { ShoppingBag } from "lucide-react";

/**
 * 참가하기·장바구니 버튼 상태 — PartyClientView 가 기존 조건 그대로 한 번 계산해서 넘긴다.
 * 버튼 쪽에서는 조건을 다시 만들지 않는다 (하단 고정 바의 모바일형·PC형이 같은 상태·핸들러를 쓴다).
 */
export type PartyCtaState = {
  ended: boolean;          // 행사일 경과(모집종료) — 두 버튼 모두 비활성, "모집 마감"
  hardDisabled: boolean;   // 정원·자격 사유 — 누를 수 없음
  grayedOut: boolean;      // 회색 표시 (이미 신청한 파티는 회색이지만 누를 수 있음 — 마이페이지 안내)
  clickableGray: boolean;  // 회색이지만 누를 수 있음 (이미 신청한 파티)
  label: string;           // 참가하기 / 이미 신청된 파티 / 모집 마감 / 남성 마감 / 여성 마감 / 참가 대상 아님
};

/**
 * 하단 고정 바의 [장바구니 담기] [참가하기] (docs/specs/party-detail-relayout.md C-7).
 *  - 모바일(~767px): 장바구니는 48px 아이콘 버튼, 참가하기는 글자 버튼
 *  - 태블릿(768~1023px): "장바구니 담기"(테두리) + "참가하기"(검정), 좁으면 최소 130/140px 까지 줄어듦
 *  - PC(1024px~): 150px + 180px, 높이 52px
 */
export default function PartyCtaButtons({ state, onCheckout, onAddToCart }: {
  state: PartyCtaState;
  onCheckout: () => void;
  onAddToCart: () => void;
}) {
  const disabled = state.ended || state.hardDisabled;
  const gray = state.ended || state.grayedOut;
  const grayCls = `bg-gray-200 text-gray-500 ${!state.ended && state.clickableGray ? "cursor-pointer hover:bg-gray-300" : "cursor-not-allowed"}`;
  return (
    <div className="flex flex-shrink-0 items-center gap-2 md:min-w-0 md:flex-shrink md:gap-2.5">
      <button
        type="button"
        onClick={onAddToCart}
        disabled={disabled}
        aria-label="장바구니 담기"
        className={`inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-[15px] font-bold transition-colors md:w-[150px] md:min-w-[130px] md:flex-shrink lg:h-[52px] lg:flex-shrink-0 ${
          gray ? grayCls : "border border-gray-300 bg-white text-brand-black hover:border-brand-black"
        }`}
      >
        <ShoppingBag className="size-5 md:hidden" aria-hidden />
        <span className="hidden whitespace-nowrap md:inline">장바구니 담기</span>
      </button>
      <button
        type="button"
        onClick={onCheckout}
        disabled={disabled}
        className={`h-12 whitespace-nowrap rounded-xl px-5 text-[15px] font-bold transition-colors max-[359px]:px-3.5 max-[359px]:text-[14px] md:w-[180px] md:min-w-[140px] md:flex-shrink md:px-3 lg:h-[52px] lg:flex-shrink-0 ${
          gray ? grayCls : "bg-brand-black text-white hover:bg-brand-point hover:text-black"
        }`}
      >
        {state.ended ? "모집 마감" : state.label}
      </button>
    </div>
  );
}
