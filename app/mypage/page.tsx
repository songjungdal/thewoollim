"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, User, Trash2, Calendar, MapPin, CheckSquare, Square, CreditCard, Pencil, AlertTriangle, X, Ticket, Clock, CheckCircle2, Check } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth, calcCouponDiscount, type BookingStatus } from "../context/AuthContext";
import { useParties } from "../lib/useParties";
import { partyStockStatus, priceForGender, VBANK_ACCOUNT_LINE } from "../lib/data";

// 관리자 페이지의 신청자 상태 배지 규격과 동일한 색상 조합 사용 (admin8888/dashboard STATUS_LABEL)
const STATUS_DISPLAY: Record<BookingStatus, { label: string; tone: string; stripe: string; icon: typeof Clock; sub?: string }> = {
  // 입금 확인 중: 무통장 입금 접수 — 운영팀 입금 확인 대기 (v7.0)
  vbank_pending: {
    label:  "입금 확인 중",
    sub:    "안내된 계좌로 입금해주시면 확인 후 확정됩니다",
    tone:   "bg-[#fce5cd] text-[#FF2300]",   // v7.1 — 배경 FCE5CD(연한 살구) / 글자 FF2300 유지
    stripe: "bg-[#F6B26B]",
    icon:   Clock,
  },
  // 결제완료: 결제됨 + 프로필 미완성
  paid_pending_profile: {
    label:  "결제완료",
    sub:    "참가확정을 위해 프로필 카드 작성을 완료해주세요",
    tone:   "bg-amber-100 text-amber-800",
    stripe: "bg-amber-400",
    icon:   AlertTriangle,
  },
  // 확정 대기 중: 결제 + 프로필 작성 완료, 관리자 승인 대기
  pending_approval: {
    label:  "확정 대기 중",
    sub:    "운영팀 승인을 기다리고 있어요",
    tone:   "bg-[#F5F5DC] text-[#5D4037]",   // 파스텔 베이지 + 진한 갈색
    stripe: "bg-[#8D6E63]",                   // 보색 갈색 (좌측 stripe)
    icon:   Clock,
  },
  // 참가확정: 관리자 최종 승인
  confirmed: {
    label:  "참가확정",
    sub:    "일시와 장소를 확인하여 늦지 않게 현장으로 도착해주세요.",
    tone:   "bg-emerald-100 text-emerald-800",
    stripe: "bg-emerald-500",
    icon:   CheckCircle2,
  },
  // 모임종료 — 투표 종료 시 confirmed 에서 자동 전환
  completed: {
    label:  "모임종료",
    sub:    "이 모임은 종료되었습니다",
    tone:   "bg-gray-200 text-black font-bold",
    stripe: "bg-gray-400",
    icon:   CheckCircle2,
  },
  // 취소 요청 중: 승인제 — 운영팀 환불 처리 대기 (v7.0)
  cancel_requested: {
    label:  "취소 요청 중",
    sub:    "운영팀에서 환불 요청을 확인 중입니다",
    tone:   "bg-[#f4cccc] text-[#CC0000] font-bold",   // 파스텔 붉은 배경 / 붉은 글자
    stripe: "bg-[#CC0000]",
    icon:   Clock,
  },
  // 환불 완료: 운영팀 환불 처리 완료 (v7.0)
  refund_completed: {
    label:  "환불 완료",
    sub:    "환불이 완료되었습니다",
    tone:   "bg-gray-200 text-gray-600",
    stripe: "bg-gray-300",
    icon:   CheckCircle2,
  },
  cancelled: {
    label:  "취소됨",
    tone:   "bg-gray-200 text-gray-600",
    stripe: "bg-gray-300",
    icon:   X,
  },
};

export default function MyPage() {
  const { mounted, isLoggedIn, userEmail, userRole, logout, verifySession, cart, removeFromCart, profile, deleteAccount, bookings, appliedCoupon, applyCoupon, clearCoupon, partyCounts, refreshCart, refreshBookings } = useAuth();
  const PARTIES = useParties();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // 파티별 쿠폰 입력값 / 메시지 / 로딩 상태
  const [couponInputs, setCouponInputs] = useState<Record<string, string>>({});
  const [couponMsg,    setCouponMsg]    = useState<Record<string, string | null>>({});
  const [couponLoadingId, setCouponLoadingId] = useState<string | null>(null);

  const handleApplyCoupon = async (partyId: string) => {
    const code = (couponInputs[partyId] || "").trim();
    if (!code) {
      setCouponMsg(m => ({ ...m, [partyId]: "쿠폰 코드를 입력해주세요." }));
      return;
    }
    setCouponLoadingId(partyId);
    setCouponMsg(m => ({ ...m, [partyId]: null }));
    const result = await applyCoupon(partyId, code);
    setCouponLoadingId(null);
    if (result.ok) {
      setCouponMsg(m => ({ ...m, [partyId]: "✓ 쿠폰이 적용되었습니다." }));
      setCouponInputs(p => ({ ...p, [partyId]: "" }));
    } else {
      setCouponMsg(m => ({ ...m, [partyId]: result.error || "쿠폰 적용 실패" }));
    }
  };

  const handleRemoveCoupon = () => {
    clearCoupon();
    setCouponMsg({});
  };

  const computeRowPrice = (partyId: string, originalPrice: number) =>
    appliedCoupon?.partyId === partyId
      ? Math.max(0, originalPrice - calcCouponDiscount(appliedCoupon, originalPrice))
      : originalPrice;

  // 쿠폰 표시 문구 — 정액: "5,000원 할인 적용됨" / 정률: "10% 할인 적용됨"
  const couponLabel = (): string => {
    if (!appliedCoupon) return "";
    return appliedCoupon.discount_type === "percent"
      ? `${appliedCoupon.amount}% 할인 적용됨`
      : `${appliedCoupon.amount.toLocaleString()}원 할인 적용됨`;
  };

  const cartParties = cart
    .map(item => PARTIES.find(p => p.id === item.partyId))
    .filter(Boolean) as typeof PARTIES;

  /** 수량 개념 제거 — 한 사용자는 같은 파티에 1회만 신청 → 항상 1 반환 (legacy 호출부 호환) */
  const qtyOf = (_partyId: string) => 1;

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.push("/login?redirect=/mypage");
    }
  }, [mounted, isLoggedIn, router]);

  // 세션 만료 방어 (v5.1) — localStorage 로 로그인 상태로 보여도 실제 서버 세션(me.php)이
  // 만료됐으면 알림 후 로그아웃 + 로그인 페이지로. 진입 시 1회만 검사.
  const sessionCheckedRef = useRef(false);
  useEffect(() => {
    if (!mounted || !isLoggedIn || sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;
    (async () => {
      const ok = await verifySession();
      if (!ok) {
        alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        logout();
        router.push("/login?redirect=/mypage");
      }
    })();
  }, [mounted, isLoggedIn, verifySession, logout, router]);

  useEffect(() => {
    setSelectedIds(new Set(cart.map(c => c.partyId)));
  }, [cart]);

  // 마이페이지 진입/포커스 복귀 시 카트 + 예약 강제 동기화 — 관리자 status 변경 즉시 반영.
  // 다중 트리거 (PC/모바일 모두 신뢰성 확보):
  //   1) mount 직후 1회 (모든 환경)
  //   2) focus      — 다른 탭/앱 → 마이페이지 복귀 시 (PC 주력)
  //   3) visibility — 백그라운드 → 포그라운드 (모바일 Safari/Chrome 주력)
  //   4) pageshow   — bfcache 복원 시 (모바일 뒤로가기 후 진입 — focus 안 뜸)
  //   5) 30s 폴링   — 다른 기기에서 관리자 status 변경 시 자동 반영 (PC/모바일 백그라운드)
  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    const refresh = () => { refreshCart(); refreshBookings(); };
    refresh();
    const onFocus      = () => refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    const onPageShow   = () => refresh();   // bfcache 복원 (모바일)
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(refresh, 30_000); // 30s 폴링
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [mounted, isLoggedIn, refreshCart, refreshBookings]);

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-white font-bold text-lg">Loading...</div>
      </div>
    );
  }

  const allSelected = cartParties.length > 0 && selectedIds.size === cartParties.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cartParties.map(p => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedParties = cartParties.filter(p => selectedIds.has(p.id));
  // 회원 성별 기반 단가 — priceMale/priceFemale 우선, 미설정 시 price 폴백 (priceForGender)
  const unitPrice = (p: typeof PARTIES[number]) => priceForGender(p, profile?.gender);
  const cartTotalQty          = cartParties.reduce((sum, p) => sum + qtyOf(p.id), 0);
  const selectedOriginalTotal = selectedParties.reduce((sum, p) => sum + unitPrice(p) * qtyOf(p.id), 0);
  const selectedTotal         = selectedParties.reduce((sum, p) => sum + computeRowPrice(p.id, unitPrice(p) * qtyOf(p.id)), 0);
  const selectedDiscount      = selectedOriginalTotal - selectedTotal;
  const cartOriginalTotal     = cartParties.reduce((sum, p) => sum + unitPrice(p) * qtyOf(p.id), 0);
  const cartTotal             = cartParties.reduce((sum, p) => sum + computeRowPrice(p.id, unitPrice(p) * qtyOf(p.id)), 0);

  const handleLogout = () => {
    // logout() 내부가 풀 페이지 리로드(window.location.replace("/"))를 처리.
    // 별도 router.push 불필요 — 오히려 mypage의 !isLoggedIn 가드 useEffect와 경쟁해 /login으로 빠질 수 있음.
    logout();
  };

  const handleWithdraw = async () => {
    if (withdrawing) return;
    setWithdrawing(true);
    const success = await deleteAccount();
    setWithdrawing(false);
    if (success) {
      alert("회원 탈퇴가 완료되었습니다. 이용해주셔서 감사합니다.");
      router.push("/");
    } else {
      alert("탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setShowWithdrawModal(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1">

        {/* Profile Banner */}
        <section className="bg-brand-black text-white py-12 md:py-20 px-4 md:px-6">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point rounded-full flex items-center justify-center flex-shrink-0">
                <User size={30} className="text-white md:hidden" />
                <User size={38} className="text-white hidden md:block" />
              </div>
              <div>
                <p className="text-gray-400 text-xs md:text-sm font-medium mb-1">
                  {userRole === "admin" ? "관리자 계정" : "회원 계정"}
                </p>
                <h1 className="text-xl md:text-3xl font-black">
                  {userRole === "admin"
                    ? "관리자 계정님, 안녕하세요!"
                    : `${(profile?.name?.trim() || "어울림 회원")}님, 안녕하세요!`}
                </h1>
                <p className="text-gray-400 text-sm mt-1">{userEmail}</p>
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <Link
                href="/profile-setup/"
                className="inline-flex items-center gap-2 bg-brand-point hover:brightness-110 text-white px-4 md:px-5 py-3 rounded-xl font-bold transition-all text-sm w-fit no-underline"
              >
                <Pencil size={14} /> 정보수정
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 md:px-5 py-3 rounded-xl font-bold transition-all text-sm w-fit"
              >
                <LogOut size={15} /> 로그아웃
              </button>
            </div>
          </div>
        </section>

        {/* My Bookings Section — emphasized */}
        {bookings.length > 0 && (
          <section className="py-10 md:py-16 px-4 md:px-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-3 mb-7 md:mb-10">
                <Ticket size={22} className="text-brand-point" />
                <h2 className="text-2xl md:text-3xl font-black tracking-tight">내 예약 현황</h2>
                <span className="bg-brand-point text-white text-xs font-black px-2.5 py-1 rounded-full">{bookings.length}</span>
              </div>
              <div className="space-y-4 md:space-y-5">
                {[...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(b => {
                  const party = PARTIES.find(p => p.id === b.partyId);
                  const meta  = STATUS_DISPLAY[b.status] ?? STATUS_DISPLAY.paid_pending_profile;
                  const Icon  = meta.icon;
                  return (
                    <div
                      key={b.id}
                      className="relative bg-gradient-to-br from-brand-point/[0.04] to-white rounded-2xl md:rounded-3xl p-5 md:p-7 border-2 border-brand-point/20 hover:border-brand-point/50 transition-colors flex flex-col md:flex-row md:items-stretch gap-4 md:gap-6 shadow-sm"
                    >
                      {/* Left accent stripe (desktop) — 상태별 색상 매칭 */}
                      <div className={`hidden md:block w-1 ${meta.stripe} rounded-full flex-shrink-0`} />

                      <div className="flex-1 min-w-0 space-y-2.5 md:space-y-3">
                        {/* Status row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 text-sm md:text-base font-black px-3.5 py-1.5 rounded-full ${meta.tone}`}>
                            <Icon size={14} /> {meta.label}
                          </span>
                          {meta.sub && (
                            <span className="text-xs md:text-sm text-gray-500 font-medium">{meta.sub}</span>
                          )}
                        </div>

                        {/* Party title */}
                        <h3 className="font-black text-lg md:text-2xl leading-snug text-brand-black">
                          {party?.title ?? `파티 #${b.partyId}`}
                        </h3>

                        {/* Meta info */}
                        {party && (
                          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-x-5 sm:gap-y-1.5 text-sm md:text-base text-gray-700 font-bold">
                            <span className="flex items-center gap-2">
                              <Calendar size={15} className="text-brand-point flex-shrink-0" />
                              {party.dateString}
                            </span>
                            <span className="flex items-center gap-2">
                              <MapPin size={15} className="text-brand-point flex-shrink-0" />
                              {party.location}
                            </span>
                          </div>
                        )}

                        {/* 무통장 입금 안내 가이드 — '입금 확인 중' 상태일 때만 (v7.0) */}
                        {b.status === "vbank_pending" && (
                          <div className="mt-3 rounded-xl border-2 border-[#F6B26B] bg-[#F6B26B]/10 p-4 md:p-5 space-y-2.5">
                            <div className="text-[#FF2300] font-black text-sm md:text-base">[ 상태: 입금 확인 중 ]</div>
                            <div className="font-black text-brand-black text-sm md:text-base">무통장 입금 안내</div>
                            <div className="text-sm md:text-base font-bold text-brand-black space-y-1">
                              <div>입금 계좌: <span className="font-bold text-black">{VBANK_ACCOUNT_LINE}</span></div>
                              <div>참가 비용: <span className="font-bold text-black tabular-nums">{(b.total ?? party?.price ?? 0).toLocaleString()}원</span></div>
                            </div>
                            <p className="text-xs md:text-sm text-gray-600 font-medium leading-relaxed break-keep">
                              현재 회원님의 입금 내역을 확인하고 있습니다. 운영팀에서 입금 확인을 완료하는 대로 ‘참가확정(또는 확정 대기 중)’ 상태로 변경되며, 안내 문자가 발송됩니다. 조금만 기다려 주세요!
                            </p>
                            <p className="text-[11px] md:text-xs text-[#FF2300] font-bold leading-relaxed break-keep">
                              ※ 신청자명과 실제 입금자명이 다를 경우 확인이 늦어질 수 있으니, 다를 경우 고객센터나 1:1 문의로 꼭 말씀해 주세요.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      {b.status === "paid_pending_profile" && (
                        <div className="flex md:items-center">
                          <Link
                            href="/profile-setup/"
                            className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 bg-brand-black text-white px-5 py-3 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all whitespace-nowrap text-center no-underline"
                          >
                            <Pencil size={14} /> 프로필 카드 작성
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Cart Section */}
        <section id="cart" className="py-10 md:py-16 px-4 md:px-6 scroll-mt-20">
          <div className="max-w-4xl mx-auto">

            <div className="flex items-center gap-3 mb-7 md:mb-10">
              <ShoppingBag size={22} className="text-brand-point" />
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">장바구니</h2>
              <span className="bg-brand-point text-white text-xs font-black px-2.5 py-1 rounded-full">{cartTotalQty}</span>
            </div>

            {cartParties.length === 0 ? (
              <div className="bg-white rounded-2xl md:rounded-3xl p-10 md:p-16 text-center border border-gray-100">
                <ShoppingBag size={44} className="text-gray-200 mx-auto mb-5" />
                <p className="text-gray-400 font-bold mb-6 text-sm md:text-base">장바구니가 비어있습니다.</p>
                <Link
                  href="/#apply"
                  className="inline-block bg-brand-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-brand-point transition-colors text-sm md:text-base"
                >
                  매칭파티 보러가기
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Select All */}
                <div className="flex items-center gap-3 px-2">
                  <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-brand-point transition-colors">
                    {allSelected
                      ? <CheckSquare size={20} className="text-brand-point" />
                      : <Square size={20} />
                    }
                    전체선택 ({selectedIds.size}/{cartParties.length})
                  </button>
                </div>

                {cartParties.map(party => {
                  const isSelected      = selectedIds.has(party.id);
                  const couponHere      = appliedCoupon?.partyId === party.id;
                  const couponElsewhere = !!appliedCoupon && appliedCoupon.partyId !== party.id;
                  const rowPrice        = computeRowPrice(party.id, party.price);
                  return (
                    <motion.div
                      key={party.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border-2 transition-colors ${
                        couponHere ? "border-brand-point/40" : isSelected ? "border-brand-point/20" : "border-gray-100"
                      }`}
                    >
                      {/* 헤더: 체크 + 모집중 / 삭제 */}
                      <div className="flex items-center justify-between mb-4 md:mb-5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button onClick={() => toggleOne(party.id)} className="flex-shrink-0" aria-label="선택">
                            {isSelected
                              ? <CheckSquare size={22} className="text-brand-point" />
                              : <Square size={22} className="text-gray-300" />
                            }
                          </button>
                          <span className="inline-flex items-center text-[11px] md:text-xs font-black text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full">모집중</span>
                        </div>
                        <button
                          onClick={() => removeFromCart(party.id)}
                          className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all flex-shrink-0"
                          aria-label="삭제"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>

                      {/* 본문: 제목 + 일시/장소 (전체 클릭 가능) */}
                      <Link href={`/party/${party.id}`} className="block group">
                        <h3 className="font-black text-lg md:text-2xl mb-3 md:mb-4 leading-snug group-hover:text-brand-point transition-colors break-keep">
                          {party.title}
                        </h3>
                        <div className="flex flex-col gap-2 md:gap-2.5 text-sm md:text-base text-gray-600 font-medium">
                          <span className="flex items-center gap-2"><Calendar size={15} className="text-brand-point flex-shrink-0" /> {party.dateString}</span>
                          <span className="flex items-center gap-2"><MapPin size={15} className="text-brand-point flex-shrink-0" /> {party.location}</span>
                        </div>
                      </Link>

                      {/* 금액 / 쿠폰 영역 — 수량 UI 제거, 1건 단가 그대로 노출 */}
                      <div className="mt-6 md:mt-7 pt-5 md:pt-6 border-t border-gray-100 space-y-5 md:space-y-6">

                        {/* 금액 행 — 회원 성별 기반 단가 (priceMale/Female 우선) */}
                        {(() => {
                          const lineTotal = unitPrice(party); // quantity 항상 1
                          const lineFinal = computeRowPrice(party.id, lineTotal);
                          return (
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider">결제 금액</span>
                              <div className="flex flex-col items-end leading-tight gap-0.5">
                                {couponHere ? (
                                  <>
                                    <s className="text-gray-400 text-xs md:text-sm font-medium tabular-nums">₩{lineTotal.toLocaleString()}</s>
                                    <span className="font-black text-2xl md:text-3xl text-brand-point whitespace-nowrap tabular-nums">₩{lineFinal.toLocaleString()}</span>
                                  </>
                                ) : (
                                  <span className="font-black text-2xl md:text-3xl text-brand-black whitespace-nowrap tabular-nums">₩{lineTotal.toLocaleString()}</span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* 쿠폰 박스 — 우측 정렬, max-w-sm */}
                        <div className="md:ml-auto md:max-w-sm">
                          {couponHere ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-brand-point bg-brand-point/5">
                                <Check size={16} className="text-brand-point flex-shrink-0" strokeWidth={3} />
                                <span className="font-black text-sm md:text-base text-brand-point truncate">{appliedCoupon!.code}</span>
                                <span className="ml-auto text-xs md:text-sm font-black text-brand-point whitespace-nowrap">{couponLabel()}</span>
                              </div>
                              <button
                                onClick={handleRemoveCoupon}
                                className="block ml-auto text-xs md:text-sm text-gray-400 hover:text-red-500 font-bold underline underline-offset-2 py-1"
                              >
                                쿠폰 해제
                              </button>
                            </div>
                          ) : couponElsewhere ? (
                            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50">
                              <p className="text-xs md:text-sm text-gray-500 font-bold leading-snug min-w-0 truncate">
                                다른 파티에 쿠폰 적용 중
                              </p>
                              <button onClick={handleRemoveCoupon} className="text-xs md:text-sm text-brand-point underline font-black whitespace-nowrap flex-shrink-0">변경</button>
                            </div>
                          ) : (
                            <div className="flex flex-row gap-2">
                              {/* 가로 한 줄 정렬 (모든 화면) — 입력창 75% / 버튼 25%, 높이 h-14 (56px) */}
                              <input
                                type="text"
                                value={couponInputs[party.id] || ""}
                                onChange={e => setCouponInputs(p => ({ ...p, [party.id]: e.target.value.toUpperCase() }))}
                                placeholder="쿠폰 코드 입력"
                                inputMode="text"
                                autoCapitalize="characters"
                                autoCorrect="off"
                                spellCheck={false}
                                className="flex-[3] min-w-0 h-14 px-4 rounded-xl border-2 border-brand-black bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none font-bold text-base uppercase tracking-wide placeholder:text-gray-400 placeholder:tracking-normal placeholder:font-medium"
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(party.id); } }}
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyCoupon(party.id)}
                                disabled={couponLoadingId === party.id || !(couponInputs[party.id] || "").trim()}
                                className="flex-[1] h-14 px-3 sm:px-5 bg-brand-black text-white rounded-xl font-black text-sm whitespace-nowrap hover:bg-brand-point transition-all disabled:bg-gray-200 disabled:text-gray-400"
                              >
                                {couponLoadingId === party.id ? "확인 중..." : "적용"}
                              </button>
                            </div>
                          )}
                          {couponMsg[party.id] && !couponHere && (
                            <p className={`text-xs md:text-sm mt-2 ml-1 font-bold ${couponMsg[party.id]!.startsWith("✓") ? "text-brand-point" : "text-red-500"}`}>
                              {couponMsg[party.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Total + Checkout for selected */}
                <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100">
                  {selectedDiscount > 0 && (
                    <div className="space-y-1.5 mb-3 pb-3 border-b border-gray-100 text-sm md:text-base">
                      <div className="flex justify-between items-center text-gray-500 font-medium">
                        <span>상품 금액</span>
                        <span className="tabular-nums">₩{selectedOriginalTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-brand-point font-bold">
                        <span>쿠폰 할인 ({appliedCoupon?.code})</span>
                        <span className="tabular-nums">- ₩{selectedDiscount.toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-5">
                    <span className="font-black text-base md:text-lg">
                      {allSelected ? "전체 결제금액" : "선택 결제금액"}{" "}
                      <span className="text-brand-point">({selectedParties.length}건)</span>
                    </span>
                    <span className="font-black text-xl md:text-3xl text-brand-point tabular-nums">
                      ₩{selectedTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* 수량을 반영해 partyId를 N번 반복하여 ids에 직렬화 */}
                  {(() => {
                    const expandIds = (parties: typeof cartParties) =>
                      parties.flatMap(p => Array(qtyOf(p.id)).fill(p.id)).join(",");
                    const allIds      = expandIds(cartParties);
                    const selectedIdsStr = expandIds(selectedParties);
                    return (
                      <>
                        {/* Primary: Pay all */}
                        <Link
                          href={`/checkout/?ids=${allIds}`}
                          className="flex items-center justify-center gap-2 w-full bg-brand-black text-white py-4 rounded-xl font-black text-base md:text-lg hover:bg-brand-point transition-all text-center mb-3"
                        >
                          <CreditCard size={20} />
                          전체 결제하기 ({cartTotalQty}건) · ₩{cartTotal.toLocaleString()}
                        </Link>

                        {/* Secondary: Pay selected (only if partial selection) */}
                        {!allSelected && selectedParties.length > 0 && (
                          <Link
                            href={`/checkout/?ids=${selectedIdsStr}`}
                            className="flex items-center justify-center gap-2 w-full bg-white border-2 border-brand-black text-brand-black py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-white hover:border-brand-point transition-all text-center"
                          >
                            선택 항목만 결제하기 ({selectedParties.reduce((s, p) => s + qtyOf(p.id), 0)}건)
                          </Link>
                        )}
                      </>
                    );
                  })()}
                  {selectedParties.length === 0 && (
                    <p className="text-center text-xs text-gray-400 font-medium">
                      일부 항목만 결제하려면 체크박스로 선택해주세요.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 취소요청 + 회원탈퇴 — low-key, bottom of content */}
        <section className="px-4 md:px-6 pb-10 md:pb-16">
          <div className="max-w-4xl mx-auto flex justify-center md:justify-end items-center gap-5">
            <Link
              href="/mypage/cancel/"
              className="text-xs md:text-sm text-gray-400 hover:text-gray-600 underline underline-offset-4 py-2 transition-colors no-underline-link"
            >
              취소요청
            </Link>
            <span className="text-gray-200" aria-hidden>|</span>
            <button
              type="button"
              onClick={() => {
                // 취소 요청 중 차단 (v6.3) — 결제수단 무관, 'cancel_requested' 1건이라도 있으면 탈퇴 불가.
                if (bookings.some(b => b.status === "cancel_requested")) {
                  alert(
                    "잠시만요! 현재 진행 중인 취소 요청 건이 있습니다. " +
                    "운영팀에서 내역 확인 및 취소/환불 처리가 최종 완료된 이후에 회원 탈퇴가 가능합니다. " +
                    "원활한 정산을 위해 조금만 기다려 주시기 바랍니다."
                  );
                  return;
                }
                // 진행 중인 매칭 파티 차단 (v6.2 정밀 보정) — status ∈ {paid_pending_profile,
                // pending_approval, confirmed} AND 행사일(calendarDate)이 아직 안 지난 경우만 차단.
                // cancelled/completed, 과거 파티, 삭제된 파티는 '정리 완료'로 간주해 제외.
                const today = (() => {
                  const d = new Date(); const z = (n: number) => String(n).padStart(2, "0");
                  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
                })();
                const blocking = bookings.some(b => {
                  if (!(b.status === "paid_pending_profile" || b.status === "pending_approval" || b.status === "confirmed")) return false;
                  const party = PARTIES.find(p => p.id === b.partyId);
                  if (!party || !party.calendarDate) return false; // 삭제/날짜없음 → 차단 안 함
                  return party.calendarDate >= today;              // 오늘 이상(진행 중)만 차단
                });
                if (blocking) {
                  alert(
                    "잠시만요! 아직 진행 중인 매칭 파티가 남아있어요.\n" +
                    "현재 진행 대기 중인 매칭 파티가 있습니다.\n" +
                    "탈퇴 버튼 바로 옆에 있는 [취소요청] 버튼을 눌러 먼저 정리를 마쳐주세요.\n" +
                    "모든 신청 내역이 취소된 후에 회원 탈퇴가 가능합니다."
                  );
                  return;
                }
                setShowWithdrawModal(true);
              }}
              className="!bg-transparent hover:!bg-transparent focus:!bg-transparent !border-0 !outline-none !shadow-none text-xs md:text-sm text-gray-400 hover:!text-gray-600 underline underline-offset-4 cursor-pointer py-2 px-0 transition-colors duration-200 ease-out"
            >
              회원탈퇴
            </button>
          </div>
        </section>

      </main>
      <Footer />

      {/* Withdraw confirmation modal */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !withdrawing && setShowWithdrawModal(false)}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative"
            >
              <button
                onClick={() => !withdrawing && setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 transition-colors disabled:opacity-30"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-red-50 rounded-full flex items-center justify-center mb-5">
                  <AlertTriangle size={28} className="text-red-500 md:hidden" />
                  <AlertTriangle size={32} className="text-red-500 hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-black mb-3 leading-snug">
                  정말로 탈퇴하시겠습니까?
                </h3>
                <p className="text-sm md:text-base text-gray-500 font-medium leading-relaxed mb-7 md:mb-8">
                  모든 활동 기록 및 SNS 연동 정보가<br />
                  즉시 삭제되며 복구할 수 없습니다.
                </p>

                <div className="flex flex-col sm:flex-row w-full gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowWithdrawModal(false)}
                    disabled={withdrawing}
                    className="flex-1 bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-bold text-sm md:text-base hover:border-brand-black hover:text-brand-black transition-all order-2 sm:order-1 disabled:opacity-40"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className="flex-1 bg-red-500 text-white py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-red-600 transition-all shadow-lg order-1 sm:order-2 disabled:bg-red-300 disabled:cursor-not-allowed"
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
