/**
 * 할인 파티의 정가 + 빨간 화살표 (docs/specs/party-discount-rate.md 4장).
 * 정가 글자 가운데를 빨간 선이 지나 오른쪽 여백 끝의 화살촉까지 이어진다 — 취소선(line-through)은 쓰지 않는다.
 * 바로 뒤에 할인가·DiscountBadge 를 붙여 쓴다.
 *   size "panel": 상세 정보 패널·장바구니(쿠폰 없음) / "small": 장바구니(쿠폰 적용)·관리자 미리보기 / "bar": PC 하단 바
 */
type DiscountArrowSize = "panel" | "small" | "bar";

const TEXT_CLS: Record<DiscountArrowSize, string> = {
  panel: "text-[13px] pr-[24px] md:text-[14px] md:pr-[26px]",
  small: "text-[12px] pr-[20px] md:text-[13px] md:pr-[22px]",
  bar:   "text-[12px] pr-[18px]",
};

export default function DiscountArrow({ price, size = "panel", won = true }: {
  price: number;            // 정가 (할인 전)
  size?: DiscountArrowSize;
  won?: boolean;            // 앞에 ₩ 표시 — md 미만에서는 늘 생략(360px 에서 할인가·배지까지 한 줄에 넣기 위해). 하단 바는 false
}) {
  return (
    <span className="relative inline-flex items-center" data-testid="discount-arrow">
      <span className={`whitespace-nowrap font-semibold tabular-nums text-[#9ca3af] ${TEXT_CLS[size]}`}>
        <span className="sr-only">정가 </span>{won && <span className="max-md:hidden">₩</span>}{price.toLocaleString()}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-[-2px] right-[1px] top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-discount-light to-discount"
      />
      <svg
        aria-hidden
        width="9" height="12" viewBox="0 0 9 12" fill="none"
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-discount"
      >
        <path d="M2 1l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
