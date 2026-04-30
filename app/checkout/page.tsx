"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CreditCard, ShieldCheck, Tag, Check } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { useParties } from "../lib/useParties";

declare global {
  interface Window { TossPayments?: (clientKey: string) => any; }
}

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mounted, isLoggedIn, userEmail, profile, appliedCoupon } = useAuth();
  const PARTIES = useParties();

  // Toss redirect 실패 시 ?error=... 로 돌아옴 — 사용자에게 안내
  const errorMsg = searchParams.get("error") || "";

  const singleId = searchParams.get("id");
  const multiIds = searchParams.get("ids");
  // 중복 가능 — 동일 partyId가 N번 나오면 수량 N으로 해석
  const partyIds = multiIds ? multiIds.split(",").filter(Boolean) : singleId ? [singleId] : [];

  // 그룹핑: 화면에는 파티별 1행 + 수량 뱃지로 표시
  const qtyByPartyId = partyIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  const uniquePartyIds = Object.keys(qtyByPartyId);
  const parties = uniquePartyIds
    .map(id => PARTIES.find(p => p.id === id))
    .filter(Boolean) as typeof PARTIES;

  const totalQty = partyIds.length;

  const [agreed, setAgreed] = useState(false);

  // 결제 대상 파티 안에 적용된 쿠폰만 유효
  const couponApplicable = !!appliedCoupon && uniquePartyIds.includes(appliedCoupon.partyId);
  const effectiveCoupon  = couponApplicable ? appliedCoupon : null;

  // 행 단위(=파티별) 단가 × 수량에서 쿠폰 적용 (정액 1회 차감)
  const computeRowPrice = (partyId: string, originalPrice: number) =>
    effectiveCoupon?.partyId === partyId
      ? Math.max(0, originalPrice - effectiveCoupon.amount)
      : originalPrice;

  const originalTotal = parties.reduce((s, p) => s + p.price * (qtyByPartyId[p.id] ?? 1), 0);
  const totalAmount   = parties.reduce((s, p) => s + computeRowPrice(p.id, p.price * (qtyByPartyId[p.id] ?? 1)), 0);
  const totalDiscount = originalTotal - totalAmount;

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      const currentUrl = multiIds ? `/checkout/?ids=${multiIds}` : `/checkout/?id=${singleId}`;
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
    }
  }, [mounted, isLoggedIn, router, singleId, multiIds]);

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <div className="font-bold text-lg">Loading...</div>
      </div>
    );
  }

  if (parties.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-xl font-bold mb-4">파티를 찾을 수 없습니다.</p>
            <Link href="/#apply" className="text-brand-point underline font-bold">목록으로 돌아가기</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const orderName = totalQty === 1
    ? parties[0].title
    : `${parties[0].title} 외 ${totalQty - 1}건`;

  const [paying, setPaying] = useState(false);

  const handlePayment = async () => {
    if (paying) return;
    if (!agreed) { alert("결제 진행 동의 체크 후 결제하실 수 있습니다."); return; }
    if (!userEmail) { alert("로그인이 필요합니다."); router.push("/login"); return; }
    if (!profile?.gender) {
      alert("프로필 카드에서 성별을 먼저 등록해주세요.");
      router.push("/profile-setup/");
      return;
    }
    if (!window.TossPayments) {
      alert("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (!TOSS_CLIENT_KEY) {
      alert("결제 시스템이 설정되지 않았습니다. 운영자에게 문의해주세요.");
      return;
    }
    setPaying(true);
    try {
      // 1) 백엔드에 pending order 등록 → orderId 발급
      const pendingRes = await fetch("/api/payments/pending.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:         userEmail,
          partyIds,                                              // 중복 포함 → 수량 반영
          couponCode:    effectiveCoupon?.code ?? "",
          couponPartyId: effectiveCoupon?.partyId ?? "",
          total:         totalAmount,                            // 쿠폰 차감된 최종 금액
          gender:        profile.gender,
          orderName,
        }),
      });
      const pending = await pendingRes.json();
      if (!pending?.ok || !pending?.orderId) {
        alert(pending?.error || "주문 정보 등록에 실패했습니다.");
        setPaying(false);
        return;
      }

      // 2) Toss SDK로 결제창 호출 → Toss가 successUrl/failUrl로 redirect
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      const origin = window.location.origin;
      await tossPayments.requestPayment("카드", {
        amount:        totalAmount,
        orderId:       pending.orderId,
        orderName,
        customerEmail: userEmail,
        successUrl:    `${origin}/api/payments/success.php`,
        failUrl:       `${origin}/api/payments/fail.php`,
      });
      // requestPayment는 redirect를 유발하므로 여기 도달하지 않음.
    } catch (error: any) {
      // 사용자가 Toss 창을 닫거나 SDK 에러
      const msg = error?.message || "결제가 취소되었습니다.";
      // SDK가 던지는 표준 코드: USER_CANCEL — 무시 (조용히 복귀)
      if (error?.code !== "USER_CANCEL") alert(msg);
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1 py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          <Link
            href={parties.length === 1 ? `/party/${parties[0].id}` : "/mypage"}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-7 font-bold transition-colors text-sm md:text-base"
          >
            <ArrowLeft size={16} /> {parties.length === 1 ? "파티 상세로 돌아가기" : "장바구니로 돌아가기"}
          </Link>

          <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-8 md:mb-10">결제하기</h1>

          {/* Toss redirect 실패 시 에러 배너 */}
          {errorMsg && (
            <div className="mb-5 bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm md:text-base text-red-700 font-bold">
              결제 실패: {errorMsg}
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 border border-gray-100 mb-5">
            <div className="flex items-baseline justify-between mb-5 md:mb-6">
              <h2 className="font-black text-lg md:text-xl">주문 요약</h2>
              {totalQty > 1 && (
                <span className="text-xs md:text-sm font-black text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full">
                  {totalQty}건
                </span>
              )}
            </div>

            {/* 파티별 카드 */}
            <div className="space-y-4 md:space-y-5">
              {parties.map(party => {
                const qty        = qtyByPartyId[party.id] ?? 1;
                const lineTotal  = party.price * qty;
                const couponHere = effectiveCoupon?.partyId === party.id;
                const rowPrice   = computeRowPrice(party.id, lineTotal);
                return (
                  <div key={party.id} className="bg-gray-50/70 rounded-xl md:rounded-2xl p-4 md:p-5 border border-gray-100">
                    {/* 파티명 + 수량 뱃지 */}
                    <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
                      <h3 className="font-black text-base md:text-lg leading-snug min-w-0">{party.title}</h3>
                      {qty > 1 && (
                        <span className="flex-shrink-0 inline-flex items-center text-[11px] md:text-xs font-black text-brand-point bg-brand-point/10 px-2 py-1 rounded-full whitespace-nowrap">
                          × {qty}
                        </span>
                      )}
                    </div>

                    {/* 메타 정보 */}
                    <dl className="space-y-2 md:space-y-2.5 text-sm md:text-base">
                      {[
                        { label: "일시", value: party.dateString },
                        { label: "장소", value: party.location },
                        { label: "대상", value: party.target },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between gap-4">
                          <dt className="text-gray-400 font-medium flex-shrink-0 w-12">{row.label}</dt>
                          <dd className="font-bold text-right text-gray-800">{row.value}</dd>
                        </div>
                      ))}
                      {/* 금액 */}
                      <div className="flex justify-between gap-4 items-baseline pt-2 border-t border-gray-200/70">
                        <dt className="text-gray-400 font-medium flex-shrink-0 w-12">금액</dt>
                        <dd className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            {qty > 1 && (
                              <span className="text-[11px] md:text-xs text-gray-400 font-medium tabular-nums">
                                ₩{party.price.toLocaleString()} × {qty}
                              </span>
                            )}
                            {couponHere ? (
                              <>
                                <s className="text-gray-400 font-medium text-xs md:text-sm tabular-nums">₩{lineTotal.toLocaleString()}</s>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[10px] md:text-xs font-black text-brand-point bg-brand-point/10 px-1.5 py-0.5 rounded">할인 적용</span>
                                  <span className="font-black text-base md:text-lg text-brand-point tabular-nums">₩{rowPrice.toLocaleString()}</span>
                                </div>
                              </>
                            ) : (
                              <span className="font-black text-base md:text-lg tabular-nums">₩{lineTotal.toLocaleString()}</span>
                            )}
                          </div>
                        </dd>
                      </div>
                    </dl>

                    {couponHere && (
                      <div className="mt-3 md:mt-3.5 flex items-center gap-2 bg-brand-point/10 border border-brand-point/30 rounded-lg px-3 py-2 text-xs md:text-sm">
                        <Check size={14} className="text-brand-point flex-shrink-0" />
                        <span className="font-black truncate">{effectiveCoupon!.code}</span>
                        <span className="font-bold text-brand-point whitespace-nowrap">- ₩{effectiveCoupon!.amount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 쿠폰 안내 (적용 위치를 마이페이지로 이전) */}
            {!effectiveCoupon && (
              <div className="mt-4 md:mt-5 flex items-start gap-2 text-xs md:text-sm bg-brand-lightgray border border-gray-100 rounded-lg p-3 text-gray-500 font-medium leading-relaxed">
                <Tag size={13} className="text-brand-point flex-shrink-0 mt-0.5" />
                <span>
                  쿠폰은 <Link href="/mypage" className="text-brand-point underline font-bold">마이페이지 장바구니</Link>에서 파티별로 적용할 수 있습니다.
                </span>
              </div>
            )}

            {/* 합계 */}
            <div className="mt-6 md:mt-7 pt-5 md:pt-6 border-t-2 border-gray-100 space-y-2.5 md:space-y-3">
              <div className="flex justify-between items-center gap-4 text-sm md:text-base">
                <span className="text-gray-500 font-medium">상품 금액</span>
                <span className="font-bold tabular-nums">₩{originalTotal.toLocaleString()}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between items-center gap-4 text-sm md:text-base">
                  <span className="text-brand-point font-bold">쿠폰 할인 ({effectiveCoupon?.code})</span>
                  <span className="text-brand-point font-black tabular-nums">- ₩{totalDiscount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-4 pt-3 mt-1 border-t border-gray-100">
                <span className="font-black text-base md:text-lg">최종 결제금액</span>
                <span className="font-black text-2xl md:text-3xl text-brand-point tabular-nums">₩{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Agreement */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-gray-100 mb-6 md:mb-8">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-5 h-5 rounded accent-brand-point cursor-pointer flex-shrink-0"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
              />
              <span className="text-sm text-gray-600 font-medium leading-relaxed">
                위 주문 내용을 확인하였으며, 결제 진행에 동의합니다.{" "}
                <Link href="/refund" className="text-brand-point underline" target="_blank">환불규정</Link>을 확인했습니다.
              </span>
            </label>
          </div>

          <button
            onClick={handlePayment}
            disabled={paying || !agreed}
            className="w-full bg-brand-black text-white py-5 rounded-2xl font-black text-base md:text-xl hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 flex items-center justify-center gap-3 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <CreditCard size={22} />
            {paying ? "결제창으로 이동 중..." : <>₩{totalAmount.toLocaleString()} 결제하기</>}
          </button>

          <p className="text-center text-xs text-gray-400 font-medium mt-4 flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} /> SSL 암호화 방식으로 안전하게 처리됩니다.
          </p>

        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <div className="font-bold text-lg">Loading...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
