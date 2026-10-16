"use client";

import { Check } from "lucide-react";
import type { PartyStock, OptionStock } from "../../lib/data";

/**
 * 솔로파티 "참가 항목 선택" (명세 docs/specs/party-options-solo.md 8-1).
 * 마감 판단은 partyStockStatus 결과(OptionStock.maleClosed/femaleClosed)만 쓴다 (명세 8-3).
 *  - 로그인한 회원: 내 성별 가격, 내 성별 기준으로 포함 회차 중 하나라도 차 있으면 "마감"이고 고를 수 없다.
 *  - 성별을 모르면(비로그인 등): 남/여 가격을 함께 보여주고, 남녀 모두 마감인 항목만 막는다.
 */
export function optionClosedFor(o: OptionStock, gender: string | null | undefined): boolean {
  if (gender === "남성") return o.maleClosed;
  if (gender === "여성") return o.femaleClosed;
  return o.maleClosed && o.femaleClosed;
}

export default function PartyOptionPicker({ stock, gender, selectedId, onSelect }: {
  stock: PartyStock;
  gender: string | null | undefined;
  selectedId: string | null;
  onSelect: (optionId: string) => void;
}) {
  const knownGender = gender === "남성" || gender === "여성";
  return (
    <div className="mb-4" data-testid="option-picker">
      <p className="text-xs md:text-sm font-black mb-2">참가 항목 선택 <span className="text-danger">*</span></p>
      <div role="radiogroup" aria-label="참가 항목 선택" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {stock.options.map(o => {
          const closed = optionClosedFor(o, gender);
          const selected = !closed && selectedId === o.id;
          const price = gender === "여성" ? o.priceFemale : o.priceMale;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={closed}
              disabled={closed}
              onClick={() => onSelect(o.id)}
              data-testid="option-card"
              data-option-id={o.id}
              className={`relative flex flex-col justify-start text-left rounded-xl border-2 px-3.5 py-3 transition-colors ${
                closed
                  ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
                  : selected
                    ? "bg-brand-point/10 border-brand-point"
                    : "bg-white border-gray-200 hover:border-brand-point/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {selected && <Check size={15} className="text-brand-point-ink flex-shrink-0" strokeWidth={3} />}
                  <span className={`font-black text-sm md:text-base break-keep ${closed ? "line-through" : ""}`}>{o.name}</span>
                </span>
                {closed ? (
                  <span className="flex-shrink-0 text-xs font-black px-2 py-0.5 rounded-full bg-gray-300 text-black">마감</span>
                ) : knownGender ? (
                  <span className="flex-shrink-0 font-black text-sm md:text-base tabular-nums">₩{price.toLocaleString()}</span>
                ) : (
                  <span className="flex-shrink-0 text-right text-xs md:text-sm font-black tabular-nums leading-snug">
                    <span className="block"><span className="text-gray-500 font-bold">남</span> ₩{o.priceMale.toLocaleString()}</span>
                    <span className="block"><span className="text-gray-500 font-bold">여</span> ₩{o.priceFemale.toLocaleString()}</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs md:text-sm text-gray-600 font-bold break-keep">
                {o.sessions.map(s => `${s.name} ${s.startTime}`).join(" · ")}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 font-medium break-keep" data-testid="option-remaining">
                남은 자리 {o.sessions.map(s => knownGender
                  ? `${s.name} ${gender === "여성" ? s.femaleRemaining : s.maleRemaining}석`
                  : `${s.name} 남${s.maleRemaining}·여${s.femaleRemaining}`).join(" · ")}
              </p>
              {!knownGender && !closed && (o.maleClosed || o.femaleClosed) && (
                <p className="mt-1 text-xs font-black text-danger">{o.maleClosed ? "남성 마감" : "여성 마감"}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
