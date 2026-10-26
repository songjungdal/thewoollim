/**
 * 할인율 배지 "20%할인" (docs/specs/party-discount-rate.md 4장) — DiscountArrow·할인가 뒤에 붙인다.
 * 숫자는 font-black, "할인"은 font-bold, 둘 사이 1px. 그림자 없음.
 */
export default function DiscountBadge({ rate, className = "" }: { rate: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-px whitespace-nowrap rounded-full bg-discount px-[5px] py-[3px] leading-none text-white md:px-[6px] ${className}`}
      data-testid="discount-badge"
    >
      <span className="text-[10px] font-black md:text-[11px]">{rate}%</span>
      <span className="text-[9px] font-bold md:text-[10px]">할인</span>
    </span>
  );
}
