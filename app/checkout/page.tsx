"use client";

import { Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CreditCard, ShieldCheck, Tag, Check, FileText, ExternalLink } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth, calcCouponDiscount } from "../context/AuthContext";
import { useParties } from "../lib/useParties";
import { priceForGender, VBANK_ACCOUNT_LINE } from "../lib/data";

type PortOneRequest = {
  storeId: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: string;
  channelKey: string;
  payMethod: string;
  customer?: { name?: string; phoneNumber?: string; email?: string };
  windowType?: { pc?: string; mobile?: string };
};

type PortOneResponse = {
  code?: string;
  message?: string;
  paymentId?: string;
};

declare global {
  interface Window {
    PortOne?: {
      requestPayment: (params: PortOneRequest) => Promise<PortOneResponse>;
    };
  }
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mounted, isLoggedIn, userEmail, profile, appliedCoupon, bookings, refreshBookings } = useAuth();
  const PARTIES = useParties();

  // Toss redirect 실패 시 ?error=... 로 돌아옴 — 사용자에게 안내
  const errorMsg = searchParams.get("error") || "";

  const singleId = searchParams.get("id");
  const multiIds = searchParams.get("ids");
  const partyIds = multiIds ? multiIds.split(",").filter(Boolean) : singleId ? [singleId] : [];

  const qtyByPartyId = partyIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
  const uniquePartyIds = Object.keys(qtyByPartyId);
  const parties = uniquePartyIds
    .map(id => PARTIES.find(p => p.id === id))
    .filter(Boolean) as typeof PARTIES;

  const totalQty = partyIds.length;

  const [paying, setPaying]   = useState(false);
  // 결제 수단: 'toss'(신용카드/간편결제) | 'vbank'(무통장 입금)
  const [payMethod, setPayMethod] = useState<"toss" | "vbank">("vbank");
  // 무통장 입금 접수 완료 안내 모달
  const [vbankModal, setVbankModal] = useState<{ amount: number } | null>(null);

  // 결제 대상 파티 안에 적용된 쿠폰만 유효
  const couponApplicable = !!appliedCoupon && uniquePartyIds.includes(appliedCoupon.partyId);
  const effectiveCoupon  = couponApplicable ? appliedCoupon : null;

  const computeRowPrice = (partyId: string, originalPrice: number) =>
    effectiveCoupon?.partyId === partyId
      ? Math.max(0, originalPrice - calcCouponDiscount(effectiveCoupon, originalPrice))
      : originalPrice;

  // 회원 성별 기반 단가 — priceMale/priceFemale 우선, 미설정 시 price 폴백
  const unitPrice = (p: typeof PARTIES[number]) => priceForGender(p, profile?.gender);
  const originalTotal = parties.reduce((s, p) => s + unitPrice(p) * (qtyByPartyId[p.id] ?? 1), 0);
  const totalAmount   = parties.reduce((s, p) => s + computeRowPrice(p.id, unitPrice(p) * (qtyByPartyId[p.id] ?? 1)), 0);
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

  const handlePayment = async () => {
    console.log("[checkout] handlePayment 호출", { paying, userEmail, gender: profile?.gender, totalAmount, partyCount: partyIds.length });
    if (paying)           { console.warn("[checkout] paying=true 이미 진행 중 — 중단"); return; }
    if (!userEmail)       { console.warn("[checkout] userEmail 없음 — 중단"); alert("로그인이 필요합니다."); router.push("/login"); return; }
    if (!profile?.gender) { console.warn("[checkout] 프로필 성별 미설정 — 중단"); alert("프로필 카드에서 성별을 먼저 등록해주세요."); router.push("/profile-setup/"); return; }
    if (totalAmount <= 0) { console.error("[checkout] totalAmount=0 — 결제 금액 비정상", { partyIds, totalAmount }); alert("결제 금액이 비정상입니다. 장바구니를 다시 확인해주세요."); return; }

    // 중복 신청 차단 — 결제완료/확정 상태의 booking 이 cart 의 partyId 와 겹치면 안 됨
    const duplicateBookings = bookings.filter(b =>
      partyIds.includes(b.partyId) && b.status !== "cancelled"
    );
    if (duplicateBookings.length > 0) {
      const dupTitles = Array.from(new Set(
        duplicateBookings.map(b => parties.find(p => p.id === b.partyId)?.title || `파티 #${b.partyId}`)
      )).join(", ");
      console.warn("[checkout] 중복 신청 차단:", duplicateBookings);
      alert(`이미 신청이 완료된 파티입니다.\n마이페이지에서 예약 현황을 확인해주세요.\n\n· ${dupTitles}`);
      return;
    }

    // ── 무통장 입금: Toss SDK 대신 vbank-submit 호출 → 접수 + 안내 모달 (v7.0) ──
    //    예약은 'vbank_pending'(입금 확인 중)으로 생성되며, 인원 카운트는 미반영.
    //    (관리자 [결제확인] 시점에 +1) — 중복 차단/장바구니 정리는 서버에서 동일 처리.
    if (payMethod === "vbank") {
      setPaying(true);
      console.log("[checkout] vbank-submit 호출 시작");
      try {
        const res = await fetch("/api/payments/vbank-submit.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            partyIds,
            couponCode:    effectiveCoupon?.code ?? "",
            couponPartyId: effectiveCoupon?.partyId ?? "",
          }),
        });
        const data = await res.json();
        console.log("[checkout] vbank-submit 응답:", data);
        if (res.status === 401 || data?.error === "unauthorized") {
          alert("로그인이 만료되었습니다. 다시 로그인 후 진행해주세요.");
          const back = multiIds ? `/checkout/?ids=${multiIds}` : `/checkout/?id=${singleId}`;
          router.push(`/login?redirect=${encodeURIComponent(back)}`);
          return;
        }
        if (!data?.ok) {
          alert(data?.error || "무통장 입금 신청에 실패했습니다.");
          setPaying(false);
          return;
        }
        await refreshBookings();           // 마이페이지에 '입금 확인 중' 즉시 반영
        setVbankModal({ amount: data.amount ?? totalAmount });
      } catch {
        alert("네트워크 오류로 신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setPaying(false);
      }
      return;
    }

    setPaying(true);
    console.log("[checkout] pending.php 호출 시작");
    try {
      // 1) 백엔드에 pending order 등록 → orderId 발급
      const pendingRes = await fetch("/api/payments/pending.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 세션 쿠키(WOOLLIM_USER) 전송 — requireUser() 인증에 필요
        body: JSON.stringify({
          email:         userEmail,
          partyIds,
          couponCode:    effectiveCoupon?.code ?? "",
          couponPartyId: effectiveCoupon?.partyId ?? "",
          total:         totalAmount,
          gender:        profile.gender,
          orderName,
        }),
      });
      const pending = await pendingRes.json();
      console.log("[checkout] pending.php 응답:", pending);
      if (!pending?.ok || !pending?.orderId) {
        // 세션 만료 — 프론트(localStorage)는 로그인으로 보이나 PHP 세션이 사라진 경우.
        // 모호한 "unauthorized" 대신 재로그인으로 유도해 결제 흐름을 자가 복구.
        if (pendingRes.status === 401 || pending?.error === "unauthorized") {
          alert("로그인이 만료되었습니다. 다시 로그인 후 결제를 진행해주세요.");
          const back = multiIds ? `/checkout/?ids=${multiIds}` : `/checkout/?id=${singleId}`;
          router.push(`/login?redirect=${encodeURIComponent(back)}`);
          return;
        }
        alert(pending?.error || "주문 정보 등록에 실패했습니다.");
        setPaying(false);
        return;
      }

      // 2) PortOne V2 결제창 호출 (async/await)
      const PortOne = window.PortOne;
      if (!PortOne) {
        alert("결제 모듈이 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해주세요.");
        setPaying(false);
        return;
      }
      console.log("[checkout] PortOne.requestPayment 호출", { orderId: pending.orderId, orderName, totalAmount });
      const response = await PortOne.requestPayment({
        storeId:     "store-43be04f5-b74d-44aa-8f7d-080c3e981da4",
        paymentId:   pending.orderId,
        orderName,
        totalAmount,
        currency:    "CURRENCY_KRW",
        channelKey:  "channel-key-inicis-test",
        payMethod:   "CARD",
        customer: {
          name:        profile?.name || "구매자",
          phoneNumber: profile?.phone || "01000000000",
          email:       userEmail,
        },
        windowType: { pc: "POPUP", mobile: "POPUP" },
      });
      if (response?.code != null) {
        // 사용자 취소는 조용히 복귀
        console.warn("[checkout] PortOne 결제 실패/취소:", response.code, response.message);
        if (response.code !== "FAILURE_TYPE_PG" || response.message) {
          alert(`결제 오류: ${response.message || response.code}`);
        }
        setPaying(false);
        return;
      }
      // 결제 성공 — 백엔드 검증 + booking 생성
      console.log("[checkout] PortOne V2 결제 성공 — success.php 로 이동", response);
      window.location.href =
        `/api/payments/success.php?paymentId=${encodeURIComponent(pending.orderId)}&amount=${totalAmount}`;
    } catch (error: unknown) {
      const e = error as { message?: string };
      console.error("[checkout] 결제 요청 오류:", error);
      alert(`결제 오류: ${e?.message || "결제 요청에 실패했습니다."}`);
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1 py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          {/* 결제 진입점은 항상 마이페이지 장바구니이므로 단일 경로 — #cart 앵커로 카트 섹션 직행 */}
          <Link
            href="/mypage#cart"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-7 font-bold transition-colors text-sm md:text-base"
          >
            <ArrowLeft size={16} /> 장바구니로 돌아가기
          </Link>

          <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-8 md:mb-10">결제하기</h1>

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

            <div className="space-y-4 md:space-y-5">
              {parties.map(party => {
                const qty        = qtyByPartyId[party.id] ?? 1;
                const unit       = unitPrice(party);  // 성별 기반 단가
                const lineTotal  = unit * qty;
                const couponHere = effectiveCoupon?.partyId === party.id;
                const rowPrice   = computeRowPrice(party.id, lineTotal);
                return (
                  <div key={party.id} className="bg-gray-50/70 rounded-xl md:rounded-2xl p-4 md:p-5 border border-gray-100">
                    <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
                      <h3 className="font-black text-base md:text-lg leading-snug min-w-0">{party.title}</h3>
                      {qty > 1 && (
                        <span className="flex-shrink-0 inline-flex items-center text-[11px] md:text-xs font-black text-brand-point bg-brand-point/10 px-2 py-1 rounded-full whitespace-nowrap">
                          × {qty}
                        </span>
                      )}
                    </div>

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
                      <div className="flex justify-between gap-4 items-baseline pt-2 border-t border-gray-200/70">
                        <dt className="text-gray-400 font-medium flex-shrink-0 w-12">금액</dt>
                        <dd className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            {qty > 1 && (
                              <span className="text-[11px] md:text-xs text-gray-400 font-medium tabular-nums">
                                ₩{unit.toLocaleString()} × {qty}
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
                        <span className="font-bold text-brand-point whitespace-nowrap">
                          {effectiveCoupon!.discount_type === "percent"
                            ? `${effectiveCoupon!.amount}% 할인`
                            : `- ₩${effectiveCoupon!.amount.toLocaleString()}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!effectiveCoupon && (
              <div className="mt-4 md:mt-5 flex items-start gap-2 text-xs md:text-sm bg-brand-lightgray border border-gray-100 rounded-lg p-3 text-gray-500 font-medium leading-relaxed">
                <Tag size={13} className="text-brand-point flex-shrink-0 mt-0.5" />
                <span>
                  쿠폰은 <Link href="/mypage" className="text-brand-point underline font-bold">마이페이지 장바구니</Link>에서 파티별로 적용할 수 있습니다.
                </span>
              </div>
            )}

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

          {/* ── 결제 수단 선택 (v7.0) — 토스 결제 / 무통장 입금 ──────────────── */}
          <div className="grid grid-cols-2 gap-2.5 md:gap-3 mb-3">
            {([
              { key: "toss",  title: "신용카드/간편결제", desc: "KG이니시스로 즉시 결제" },
              { key: "vbank", title: "무통장 입금",       desc: "계좌이체 후 입금 확인" },
            ] as const).map(opt => {
              const active = payMethod === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPayMethod(opt.key)}
                  className={`text-left rounded-2xl border-2 p-4 md:p-5 transition-all ${
                    active
                      ? "border-brand-point bg-brand-point/5 shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${active ? "border-brand-point" : "border-gray-300"}`}>
                      {active && <span className="w-2 h-2 rounded-full bg-brand-point" />}
                    </span>
                    <span className="font-black text-sm md:text-base text-brand-black">{opt.title}</span>
                  </div>
                  <p className="text-[11px] md:text-xs text-gray-500 font-medium pl-6">{opt.desc}</p>
                </button>
              );
            })}
          </div>

          {/* ── 무통장 입금 안내 패널 — 무통장 선택 시 노출 ───────────────────── */}
          {payMethod === "vbank" && (
            <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 border-2 border-[#F6B26B]/60 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={18} className="text-[#FF2300]" />
                <span className="font-black text-base md:text-lg text-brand-black">무통장 입금 안내</span>
              </div>
              <div className="text-sm md:text-base font-bold text-brand-black space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-medium">입금 계좌</span>
                  <span className="font-bold text-black text-right">{VBANK_ACCOUNT_LINE}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500 font-medium">입금 금액</span>
                  <span className="font-bold text-black tabular-nums">₩{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <p className="text-xs md:text-sm text-gray-500 font-medium leading-relaxed mt-3 break-keep">
                ‘입금 신청하기’를 누르면 참가 신청이 접수되며, 위 계좌로 입금해 주시면 운영팀 확인 후 확정됩니다.
                신청 후 2시간 이내 미입금 시 자동 취소될 수 있습니다.
              </p>
            </div>
          )}

          {/* ── 어울림 자체 환불 규정 — 결제 전 명확한 정책 고지 ──────────── */}
          <Link
            href="/refund"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 w-full bg-brand-point/5 border border-brand-point/20 rounded-xl px-4 py-3 mb-3 text-sm font-bold text-gray-700 hover:bg-brand-point/10 hover:border-brand-point/40 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <FileText size={15} className="text-brand-point flex-shrink-0" />
              <span className="truncate">어울림 자체 환불 규정 확인하기</span>
            </span>
            <ExternalLink size={13} className="text-gray-400 flex-shrink-0" />
          </Link>

          {(() => {
            const amountValid   = totalAmount > 0;
            const partyIdsValid = partyIds.length > 0;
            const isVbank       = payMethod === "vbank";
            const canPay        = amountValid && partyIdsValid && !paying;

            const reason =
              !amountValid    ? "결제 금액이 비정상입니다." :
              !partyIdsValid  ? "주문 항목이 비어있습니다." :
              "";

            const payingLabel = isVbank ? "신청 처리 중..." : "결제창으로 이동 중...";
            const idleLabel   = isVbank
              ? <>₩{totalAmount.toLocaleString()} 입금 신청하기</>
              : <>₩{totalAmount.toLocaleString()} 결제하기</>;

            return (
              <>
                {!canPay && reason && (
                  <p className="text-center text-xs text-gray-500 font-medium mb-3 leading-relaxed">
                    {reason}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handlePayment}
                  disabled={!canPay}
                  className="w-full bg-brand-black text-white py-5 rounded-2xl font-black text-base md:text-xl hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 flex items-center justify-center gap-3 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <CreditCard size={22} />
                  {paying ? payingLabel : idleLabel}
                </button>
              </>
            );
          })()}

          <p className="text-center text-xs text-gray-400 font-medium mt-4 flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} /> SSL 암호화 방식으로 안전하게 처리됩니다.
          </p>

        </div>
      </main>
      <Footer />

      {/* ── 무통장 입금 접수 완료 안내 모달 (v7.0) ─────────────────────────── */}
      <AnimatePresence>
        {vbankModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-4">
                <Check size={22} className="text-brand-point" />
                <h3 className="font-black text-lg md:text-xl text-brand-black">참가 신청이 접수되었습니다</h3>
              </div>
              <p className="text-sm md:text-base text-gray-700 font-medium leading-relaxed break-keep mb-4">
                매칭파티 참가 신청이 정상적으로 접수되었습니다. 아래 안내해 드리는 계좌로 입금해 주시면 확인 후 최종 확정해 드립니다.
              </p>
              <div className="rounded-2xl border-2 border-[#F6B26B] bg-[#F6B26B]/10 p-4 md:p-5 space-y-1.5 mb-4">
                <div className="flex justify-between gap-3 text-sm md:text-base font-bold text-brand-black">
                  <span className="text-gray-500 font-medium">입금 계좌</span>
                  <span className="text-[#FF2300] text-right">{VBANK_ACCOUNT_LINE}</span>
                </div>
                <div className="flex justify-between gap-3 text-sm md:text-base font-bold text-brand-black">
                  <span className="text-gray-500 font-medium">입금 금액</span>
                  <span className="text-[#FF2300] tabular-nums">{vbankModal.amount.toLocaleString()}원</span>
                </div>
              </div>
              <ul className="text-xs md:text-sm text-gray-600 font-medium leading-relaxed break-keep space-y-2 mb-6 list-disc pl-4">
                <li>마감 임박인 파티의 경우, 입금 순으로 선착순 마감될 수 있는 점 양해 부탁드립니다.</li>
                <li>입금 확인 완료 시 마이페이지의 내 예약 현황에서 참가확정 상태를 확인하실 수 있으며, 카카오톡 또는 문자로 알림을 드립니다.</li>
                <li>원활한 파티 진행(성비 조율 및 좌석 확정)을 위해 신청 후 2시간 이내 미입금 시 신청이 자동 취소될 수 있습니다.</li>
              </ul>
              <button
                type="button"
                onClick={() => { setVbankModal(null); router.push("/mypage"); }}
                className="w-full bg-brand-black text-white py-4 rounded-2xl font-black text-base hover:bg-brand-point transition-all"
              >
                내 예약 현황 보기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
