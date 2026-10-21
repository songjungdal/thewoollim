"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { formatYmd, won, type MembershipView } from "../../lib/membership";

type Phase =
  | { kind: "loading" }
  | { kind: "done"; membership: MembershipView }
  | { kind: "retry"; message: string }
  | { kind: "login" };

/**
 * 카드 등록 뒤 토스가 돌려보내는 화면 (?customerKey=&authKey=).
 * 서버(api/membership/confirm.php)가 customerKey 검증 → 빌링키 발급 → 첫 결제를 한 번에 처리한다.
 * 새로고침·중복 호출해도 서버가 이미 처리된 결과만 돌려주므로 중복 결제가 생기지 않는다.
 */
export default function SuccessClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const customerKey = sp.get("customerKey") ?? "";
  const authKey = sp.get("authKey") ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const startedRef = useRef(false);

  const confirm = useCallback(async () => {
    const goFail = (code: string, message: string) =>
      router.replace(`/membership/fail/?code=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`);
    if (!customerKey || !authKey) { goFail("INVALID_REQUEST", "카드 등록 정보가 없습니다."); return; }
    try {
      const r = await fetch("/api/membership/confirm.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerKey, authKey }),
      });
      if (r.status === 401) { setPhase({ kind: "login" }); return; }
      const d = await r.json().catch(() => null);
      if (d?.ok && d.membership) { setPhase({ kind: "done", membership: d.membership as MembershipView }); return; }
      if (d?.retryable) { setPhase({ kind: "retry", message: String(d.message || "") }); return; }
      goFail(String(d?.code || "UNKNOWN_ERROR"), String(d?.message || ""));
    } catch {
      setPhase({ kind: "retry", message: "결제 결과를 확인하지 못했습니다. 잠시 후 다시 확인해주세요." });
    }
  }, [customerKey, authKey, router]);

  useEffect(() => {
    // 화면이 그려진 뒤 한 번만 호출 (개발 모드의 effect 두 번 실행에도 한 번)
    const t = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      confirm();
    }, 0);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1">
        <div className="max-w-xl mx-auto px-4 py-10 md:py-16">
          {phase.kind === "loading" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center" aria-busy="true">
              <Loader2 className="animate-spin text-brand-point-ink" size={40} aria-hidden />
              <p className="font-bold">카드 등록과 첫 결제를 처리하고 있습니다.</p>
              <p className="text-sm text-gray-500">화면을 닫지 말고 잠시만 기다려주세요.</p>
            </div>
          )}

          {phase.kind === "retry" && (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="font-black mb-2">결제 결과를 아직 확인하지 못했습니다</p>
              <p className="text-sm text-gray-600 mb-5 break-keep">{phase.message}</p>
              <button type="button" onClick={() => { setPhase({ kind: "loading" }); confirm(); }} className="w-full bg-brand-black text-white font-black py-3.5 rounded-xl">다시 확인하기</button>
            </div>
          )}

          {phase.kind === "login" && (
            <div className="bg-white rounded-2xl p-6 text-center">
              <p className="font-black mb-2">로그인이 필요합니다</p>
              <p className="text-sm text-gray-600 mb-5">로그인한 뒤 멤버십 가입을 다시 진행해주세요.</p>
              <Link href="/login/?redirect=/membership/join/" className="block w-full bg-brand-black text-white font-black py-3.5 rounded-xl">로그인하기</Link>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="bg-white rounded-2xl p-6 md:p-8" data-testid="membership-success">
              <div className="flex flex-col items-center text-center mb-6">
                <CheckCircle2 size={48} className="text-brand-point-ink mb-3" aria-hidden />
                <h1 className="text-2xl font-black mb-1 break-keep">멤버십이 시작되었습니다</h1>
                {phase.membership.isTest && <p className="text-xs font-bold text-amber-700">테스트 결제 — 실제로 청구되지 않았습니다</p>}
              </div>
              <dl className="divide-y divide-gray-100 text-sm md:text-base mb-6">
                <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">결제 금액</dt><dd className="font-black" data-testid="paid-amount">{won(phase.membership.payments.at(-1)?.amount ?? phase.membership.price)}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">카드</dt><dd className="font-bold" data-testid="paid-card">{phase.membership.cardCompany ?? "-"} {phase.membership.cardLast4 ? `(끝 ${phase.membership.cardLast4})` : ""}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">이용 기간</dt><dd className="font-bold text-right">{formatYmd(phase.membership.periodStart)} ~ {formatYmd(phase.membership.periodEnd)}</dd></div>
                <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">다음 결제일</dt><dd className="font-bold" data-testid="next-billing">{phase.membership.nextBillingAt ? formatYmd(phase.membership.nextBillingAt) : "해지 예약됨"}</dd></div>
              </dl>
              <Link href="/mypage/" className="block w-full text-center bg-brand-black text-white font-black py-3.5 rounded-xl">마이페이지에서 확인하기</Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
