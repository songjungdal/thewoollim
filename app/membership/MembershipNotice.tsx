"use client";

import { AlertTriangle } from "lucide-react";
import type { MembershipState } from "../lib/membership";

/**
 * 멤버십 화면 상단 안내 한 줄.
 *  - 키 설정 전: "준비 중"
 *  - 테스트 모드: "테스트 결제 — 실제로 청구되지 않습니다" (TOSS_BILLING_MODE=live 가 되면 자동으로 사라진다)
 */
export default function MembershipNotice({ state, loaded }: { state: MembershipState | null; loaded: boolean }) {
  if (!loaded) return null;
  if (!state || !state.ready) {
    return (
      <div role="status" className="bg-gray-100 text-gray-700 text-xs md:text-sm font-bold text-center px-4 py-2.5 break-keep">
        멤버십 결제는 준비 중입니다. 지금은 가입할 수 없습니다.
      </div>
    );
  }
  if (state.mode === "test") {
    return (
      <div role="status" data-testid="test-mode-notice" className="bg-amber-50 text-amber-900 border-b border-amber-200 text-xs md:text-sm font-bold flex items-center justify-center gap-1.5 px-4 py-2.5 break-keep">
        <AlertTriangle size={14} className="flex-shrink-0" aria-hidden />
        테스트 결제 — 실제로 청구되지 않습니다
      </div>
    );
  }
  return null;
}
