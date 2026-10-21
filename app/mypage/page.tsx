"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, User, Trash2, CheckSquare, Square, CreditCard, Pencil, AlertTriangle, X, Ticket, TicketX, Clock, CheckCircle2, Check, KeyRound, ChevronDown } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth, calcCouponDiscount, type BookingStatus } from "../context/AuthContext";
import MembershipSection from "./MembershipSection";
import { useParties, PARTIES_NOT_LOADED } from "../lib/useParties";
import { partyStockStatus, linePriceFor, partyHasOptions, partyOptionById, dateOnly, VBANK_INFO, COUPON_DISABLED_MESSAGE } from "../lib/data";

// 관리자 페이지의 신청자 상태 배지 규격과 동일한 색상 조합 사용 (admin8888/dashboard STATUS_LABEL)
const STATUS_DISPLAY: Record<BookingStatus, { label: string; tone: string; stripe: string; icon: typeof Clock; sub?: string }> = {
  // 입금 확인 중: 무통장 입금 접수 — 운영팀 입금 확인 대기 (v7.0)
  vbank_pending: {
    label:  "입금 확인 중",
    sub:    "안내된 계좌로 입금해주시면 확인 후 확정됩니다",
    tone:   "bg-[#fce5cd] text-danger",   // v7.1 — 배경 FCE5CD(연한 살구) / 글자 FF2300 유지
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
    tone:   "bg-[#f4cccc] text-danger font-bold",   // 파스텔 붉은 배경 / 붉은 글자
    stripe: "bg-danger",
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
  // API 응답을 받은 뒤에만 삭제된 파티 예약을 숨긴다 (불러오는 중에는 전부 표시)
  const partiesLoaded = PARTIES !== PARTIES_NOT_LOADED;
  const visibleBookings = partiesLoaded ? bookings.filter(b => PARTIES.some(p => p.id === b.partyId)) : bookings;
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const closePwModal = () => {
    if (pwSubmitting) return;
    setPwModalOpen(false);
    setPwForm({ current: "", next: "", confirm: "" });
    setPwError("");
  };

  const handleChangePassword = async () => {
    if (pwSubmitting) return;
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwError("모든 항목을 입력해주세요.");
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    setPwSubmitting(true);
    setPwError("");
    try {
      const res = await fetch("/api/auth/change-password.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const d = await res.json();
      if (d?.ok) {
        setPwModalOpen(false);
        setPwForm({ current: "", next: "", confirm: "" });
        alert("비밀번호가 변경되었습니다.");
      } else {
        setPwError(d?.error || "비밀번호 변경에 실패했습니다.");
      }
    } catch {
      setPwError("서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPwSubmitting(false);
    }
  };
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

  // 쿠폰 적용 불가 파티에 걸려 있던 쿠폰은 해제 — 장바구니에서 쿠폰을 넣은 뒤 관리자가 설정을 켠 경우 (서버도 결제 때 거절)
  const couponPartyDisabled = !!appliedCoupon && !!PARTIES.find(p => p.id === appliedCoupon.partyId)?.couponDisabled;
  useEffect(() => {
    if (couponPartyDisabled) clearCoupon();
  }, [couponPartyDisabled, clearCoupon]);

  const computeRowPrice = (partyId: string, originalPrice: number) =>
    appliedCoupon?.partyId === partyId && !couponPartyDisabled
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

  const [syncedCart, setSyncedCart] = useState<typeof cart | null>(null);
  if (syncedCart !== cart) {
    setSyncedCart(cart);
    setSelectedIds(new Set(cart.map(c => c.partyId)));
  }

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
  // 회원 성별 기반 단가 — priceMale/priceFemale 우선, 미설정 시 price 폴백 (priceForGender).
  // 참가 구성 파티는 장바구니에 담긴 항목의 내 성별 가격 (항목이 없거나 바뀌었으면 0 — 결제 화면에서 막힘)
  const cartOptionOf = (partyId: string) => cart.find(c => c.partyId === partyId)?.optionId;
  const unitPrice = (p: typeof PARTIES[number]) => linePriceFor(p, profile?.gender, cartOptionOf(p.id)) ?? 0;
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
      <main className="flex-1 pt-5 pb-12 lg:pt-10 lg:pb-16">
        {/* lg↑: 왼쪽 사이드바(프로필·바로가기) + 오른쪽 콘텐츠 / lg↓: 프로필 카드 → 고정 섹션 탭 → 콘텐츠 */}
        <div className="max-w-6xl mx-auto px-4 lg:px-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:items-start">

          <aside className="space-y-4 lg:sticky lg:top-24">
            {/* 프로필 카드 */}
            <section className="bg-brand-black text-white rounded-2xl p-5 lg:p-6">
              <div className="flex items-center gap-3.5 lg:flex-col lg:items-start lg:gap-4">
                <div className="w-12 h-12 lg:w-14 lg:h-14 bg-brand-point rounded-full flex items-center justify-center flex-shrink-0">
                  <User size={24} className="text-black" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-brand-point">
                    {userRole === "admin" ? "관리자 계정" : "회원 계정"}
                  </p>
                  <h1 className="text-lg lg:text-xl font-black leading-snug break-keep">
                    {userRole === "admin"
                      ? "관리자 계정님, 안녕하세요!"
                      : `${(profile?.name?.trim() || "어울림 회원")}님, 안녕하세요!`}
                  </h1>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{userEmail}</p>
                </div>
              </div>
              {/* 버튼 — 모바일: 3칸(아이콘 위·글자 아래), lg: 한 줄씩 왼쪽 정렬. 관리자는 비밀번호 버튼이 없어 2칸 */}
              <div className={`grid ${userRole !== "admin" ? "grid-cols-3" : "grid-cols-2"} lg:grid-cols-1 gap-2 mt-5`}>
                <Link
                  href="/profile-setup/"
                  className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2.5 px-2 text-xs lg:flex-row lg:justify-start lg:gap-2 lg:px-4 lg:py-3 lg:text-sm bg-brand-point hover:brightness-110 text-black rounded-xl font-bold transition-all no-underline whitespace-nowrap"
                >
                  <Pencil size={16} /> 정보수정
                </Link>
                {userRole !== "admin" && (
                  <button
                    type="button"
                    onClick={() => { setPwError(""); setPwModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2.5 px-2 text-xs lg:flex-row lg:justify-start lg:gap-2 lg:px-4 lg:py-3 lg:text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-bold transition-all whitespace-nowrap"
                  >
                    <KeyRound size={16} /> 비밀번호 변경
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex flex-col items-center justify-center gap-1 min-h-[44px] py-2.5 px-2 text-xs lg:flex-row lg:justify-start lg:gap-2 lg:px-4 lg:py-3 lg:text-sm bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all whitespace-nowrap"
                >
                  <LogOut size={16} /> 로그아웃
                </button>
              </div>
            </section>

            {/* lg 전용 — 섹션 바로가기 */}
            <nav className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-2" aria-label="마이페이지 바로가기">
              {visibleBookings.length > 0 && (
                <a href="#bookings" className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2"><Ticket size={16} className="text-brand-point-ink" /> 내 예약 현황</span>
                  <span className="bg-brand-point text-black text-xs font-black px-2 py-0.5 rounded-full tabular-nums">{visibleBookings.length}</span>
                </a>
              )}
              <a href="#cart" className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                <span className="flex items-center gap-2"><ShoppingBag size={16} className="text-brand-point-ink" /> 장바구니</span>
                <span className="bg-brand-point text-black text-xs font-black px-2 py-0.5 rounded-full tabular-nums">{cartTotalQty}</span>
              </a>
            </nav>
          </aside>

          {/* lg 미만 — 고정 섹션 탭 (헤더 72px 바로 아래에 붙음) */}
          <div className="lg:hidden sticky top-[72px] z-20 -mx-4 px-4 py-2 mt-3 bg-brand-lightgray/95 backdrop-blur">
            <div className={`grid ${visibleBookings.length > 0 ? "grid-cols-2" : "grid-cols-1"} gap-1 bg-white rounded-xl border border-gray-200 p-1`}>
              {visibleBookings.length > 0 && (
                <a href="#bookings" className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                  내 예약 <span className="bg-brand-point text-black text-[11px] font-black px-1.5 py-0.5 rounded-full tabular-nums">{visibleBookings.length}</span>
                </a>
              )}
              <a href="#cart" className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                장바구니 <span className="bg-brand-point text-black text-[11px] font-black px-1.5 py-0.5 rounded-full tabular-nums">{cartTotalQty}</span>
              </a>
            </div>
          </div>

          {/* 오른쪽 콘텐츠 */}
          <div className="min-w-0 mt-5 lg:mt-0 space-y-10 lg:space-y-12">

            {/* 섹션 이동 여백 — 모바일: 헤더 72px + 고정 탭 70px 아래, lg: 헤더 96px 아래.
                globals.css 의 section { scroll-margin-top: 5rem } 보다 우선하도록 ! 사용 */}
            {/* 멤버십 — 멤버십 기록이 있는 회원에게만 보인다 */}
            <MembershipSection />

            {/* 내 예약 현황 — 진행 중은 카드, 지난 예약(모임종료·환불 완료·취소됨)은 아래 접기 */}
            {visibleBookings.length > 0 && (
              <section id="bookings" className="scroll-mt-[156px]! lg:scroll-mt-28!">
                <div className="flex items-baseline justify-between gap-3 mb-3 lg:mb-4">
                  <h2 className="flex items-center gap-2 text-xl lg:text-2xl font-black tracking-tight">
                    <Ticket size={20} className="text-brand-point-ink" /> 내 예약 현황
                  </h2>
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap">최근 신청순</span>
                </div>
                {(() => {
                  // 표시용 묶음만 나눈다 (정렬·필터는 기존 그대로)
                  const sortedBookings = [...visibleBookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                  const PAST_STATUSES: BookingStatus[] = ["completed", "refund_completed", "cancelled"];
                  const activeBookings = sortedBookings.filter(b => !PAST_STATUSES.includes(b.status));
                  const pastBookings   = sortedBookings.filter(b => PAST_STATUSES.includes(b.status));
                  return (
                    <>
                      {activeBookings.length > 0 && (
                        <div className="space-y-3 lg:space-y-4">
                          {activeBookings.map(b => {
                            const party = PARTIES.find(p => p.id === b.partyId);
                            const meta  = STATUS_DISPLAY[b.status] ?? STATUS_DISPLAY.paid_pending_profile;
                            const Icon  = meta.icon;
                            return (
                              <div key={b.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                {/* 상태 색 띠 */}
                                <div className={`h-1.5 ${meta.stripe}`} />
                                <div className="p-4 lg:p-6 lg:flex lg:items-end lg:justify-between lg:gap-6">
                                  <div className="flex-1 min-w-0">
                                    <span className={`inline-flex items-center gap-1.5 text-[13px] lg:text-sm font-black px-3 py-1 rounded-full ${meta.tone}`}>
                                      <Icon size={14} /> {meta.label}
                                    </span>
                                    {meta.sub && (
                                      <p className="mt-2 text-[13px] lg:text-sm text-gray-600 font-medium break-keep">{meta.sub}</p>
                                    )}
                                    <h3 className="mt-3 text-[17px] lg:text-xl font-black leading-snug text-brand-black break-keep">
                                      {party ? (
                                        <Link href={`/party/${b.partyId}`} className="hover:text-brand-point-ink hover:underline underline-offset-4 transition-colors">
                                          {party.title}
                                        </Link>
                                      ) : `파티 #${b.partyId}`}
                                    </h3>
                                    {/* 솔로파티 참가 구성 — 결제 당시 항목 이름 */}
                                    {b.optionName && (
                                      <span className="mt-1.5 inline-flex text-xs lg:text-sm font-black text-brand-point-ink bg-brand-point/10 px-2.5 py-1 rounded-full" data-testid="booking-option">
                                        {b.optionName}
                                      </span>
                                    )}
                                    {party && (
                                      <dl className="mt-3 grid gap-1.5 lg:grid-cols-2 text-sm lg:text-base">
                                        <div className="flex gap-2 min-w-0">
                                          <dt className="w-8 flex-shrink-0 pt-0.5 text-xs text-gray-500">일시</dt>
                                          <dd className="min-w-0 font-bold text-gray-800 break-keep">
                                            {/* 참가 구성 예약 — 날짜 + 내 회차 시각 (파티의 현재 회차 시각, api/bookings.php sessionTimes) */}
                                            {b.sessionTimes && b.sessionTimes.length > 0
                                ? `${dateOnly(party.dateString)} ${b.sessionTimes.join(" · ")}`
                                : party.dateString}
                                          </dd>
                                        </div>
                                        <div className="flex gap-2 min-w-0">
                                          <dt className="w-8 flex-shrink-0 pt-0.5 text-xs text-gray-500">장소</dt>
                                          <dd className="min-w-0 font-bold text-gray-800 break-keep">{party.location}</dd>
                                        </div>
                                      </dl>
                                    )}

                                    {/* 무통장 입금 안내 가이드 — '입금 확인 중' 상태일 때만 (v7.0) */}
                                    {b.status === "vbank_pending" && (
                                      <div className="mt-4 rounded-xl bg-[#FFF6EC] border border-[#F6B26B]/60 p-4">
                                        <p className="text-xs font-black text-danger">무통장 입금 안내</p>
                                        <dl className="mt-2.5 space-y-2">
                                          <div className="flex items-start justify-between gap-3">
                                            <dt className="pt-0.5 text-xs font-bold text-gray-500 flex-shrink-0">입금 계좌</dt>
                                            <dd className="min-w-0 text-right">
                                              <span className="text-sm lg:text-base font-black tabular-nums text-brand-black break-keep">{VBANK_INFO.bank} {VBANK_INFO.account}</span>
                                              <span className="block mt-0.5 text-[13px] lg:text-sm font-bold text-gray-700">예금주 {VBANK_INFO.holder}</span>
                                            </dd>
                                          </div>
                                          <div className="flex items-center justify-between gap-3">
                                            <dt className="text-xs font-bold text-gray-500 flex-shrink-0">참가 비용</dt>
                                            <dd className="text-base lg:text-lg font-black tabular-nums text-brand-black">{(b.total ?? party?.price ?? 0).toLocaleString()}원</dd>
                                          </div>
                                        </dl>
                                        <div className="mt-3 pt-3 border-t border-[#F6B26B]/40 space-y-1.5">
                                          <p className="text-xs lg:text-[13px] text-gray-600 font-medium leading-relaxed break-keep">
                                            현재 회원님의 입금 내역을 확인하고 있습니다. 운영팀에서 입금 확인을 완료하는 대로 ‘참가확정(또는 확정 대기 중)’ 상태로 변경되며, 안내 문자가 발송됩니다. 조금만 기다려 주세요!
                                          </p>
                                          <p className="text-xs lg:text-[13px] text-danger font-bold leading-relaxed break-keep">
                                            ※ 신청자명과 실제 입금자명이 다를 경우 확인이 늦어질 수 있으니, 다를 경우 고객센터나 1:1 문의로 꼭 말씀해 주세요.
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Action — 모바일: 카드 아래 꽉 찬 버튼 / lg: 오른쪽 아래 */}
                                  {b.status === "paid_pending_profile" && (
                                    <Link
                                      href="/profile-setup/"
                                      className="mt-4 lg:mt-0 w-full lg:w-auto flex-shrink-0 inline-flex items-center justify-center gap-1.5 bg-brand-black text-white px-5 py-3 rounded-xl font-black text-sm lg:text-base hover:bg-brand-point hover:text-black transition-all whitespace-nowrap text-center no-underline"
                                    >
                                      <Pencil size={14} /> 프로필 카드 작성
                                    </Link>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 지난 예약 — 기본 접힘, 한 줄 목록 */}
                      {pastBookings.length > 0 && (
                        <details className={`group bg-white rounded-2xl border border-gray-200 ${activeBookings.length > 0 ? "mt-3 lg:mt-4" : ""}`}>
                          <summary className="flex items-center justify-between gap-3 min-h-[52px] px-4 lg:px-6 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                            <span className="text-sm lg:text-base font-black text-gray-700">지난 예약 {pastBookings.length}건</span>
                            <ChevronDown size={18} className="text-gray-500 transition-transform group-open:rotate-180" />
                          </summary>
                          <ul className="border-t border-gray-100 divide-y divide-gray-100">
                            {pastBookings.map(b => {
                              const party = PARTIES.find(p => p.id === b.partyId);
                              const meta  = STATUS_DISPLAY[b.status] ?? STATUS_DISPLAY.paid_pending_profile;
                              const cd = party?.calendarDate ?? "";
                              return (
                                <li key={b.id} className="flex items-center gap-3 min-h-[48px] px-4 lg:px-6 py-2.5">
                                  <span className={`flex-shrink-0 text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${meta.tone}`}>{meta.label}</span>
                                  {party ? (
                                    <Link href={`/party/${b.partyId}`} className="flex-1 min-w-0 truncate text-sm font-bold text-gray-800 hover:text-brand-point-ink transition-colors">
                                      {party.title}
                                    </Link>
                                  ) : (
                                    <span className="flex-1 min-w-0 truncate text-sm font-bold text-gray-500">{`파티 #${b.partyId}`}</span>
                                  )}
                                  <span className="flex-shrink-0 text-xs text-gray-500 tabular-nums">{cd.length >= 10 ? `${cd.slice(5, 7)}.${cd.slice(8, 10)}` : "-"}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {/* 장바구니 */}
            <section id="cart" className="scroll-mt-[156px]! lg:scroll-mt-28!">
              <div className="flex items-center justify-between gap-3 mb-3 lg:mb-4">
                <h2 className="flex items-center gap-2 text-xl lg:text-2xl font-black tracking-tight">
                  <ShoppingBag size={20} className="text-brand-point-ink" /> 장바구니
                  <span className="bg-brand-point text-black text-xs font-black px-2 py-0.5 rounded-full tabular-nums">{cartTotalQty}</span>
                </h2>
                {cartParties.length > 0 && (
                  <button onClick={toggleAll} className="flex items-center gap-1.5 min-h-[44px] px-1 -mr-1 text-sm font-bold text-gray-600 hover:text-brand-point-ink transition-colors whitespace-nowrap">
                    {allSelected
                      ? <CheckSquare size={20} className="text-brand-point-ink" />
                      : <Square size={20} />
                    }
                    전체선택 ({selectedIds.size}/{cartParties.length})
                  </button>
                )}
              </div>

              {cartParties.length === 0 ? (
                <div className="bg-white rounded-2xl md:rounded-3xl p-10 text-center border border-gray-100">
                  <ShoppingBag size={44} className="text-gray-200 mx-auto mb-5" />
                  <p className="text-gray-500 font-bold mb-6 text-sm md:text-base">장바구니가 비어있습니다.</p>
                  <Link
                    href="/#apply"
                    className="inline-block bg-brand-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-brand-point hover:text-black transition-colors text-sm md:text-base"
                  >
                    파티 보러가기
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 lg:space-y-4">
                  {cartParties.map(party => {
                    const isSelected      = selectedIds.has(party.id);
                    const couponOff       = !!party.couponDisabled; // 쿠폰 적용 불가 파티 — 쿠폰 입력칸 대신 안내 박스
                    const couponHere      = !couponOff && appliedCoupon?.partyId === party.id;
                    const couponElsewhere = !couponOff && !!appliedCoupon && appliedCoupon.partyId !== party.id;
                    const rowPrice        = computeRowPrice(party.id, party.price);
                    return (
                      <motion.div
                        key={party.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-white rounded-2xl p-4 lg:p-6 border-2 transition-colors ${
                          couponHere ? "border-brand-point/40" : isSelected ? "border-brand-point/20" : "border-gray-100"
                        }`}
                      >
                        {/* 윗부분: 체크 · 본문(상세 이동) · 삭제 */}
                        <div className="flex items-start gap-3">
                          <button onClick={() => toggleOne(party.id)} className="flex-shrink-0 p-[11px] -m-[11px]" aria-label="선택">
                            {isSelected
                              ? <CheckSquare size={22} className="text-brand-point-ink" />
                              : <Square size={22} className="text-gray-500" />
                            }
                          </button>
                          <Link href={`/party/${party.id}`} className="block group flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center text-[11px] font-black text-brand-point-ink bg-brand-point/10 px-2 py-0.5 rounded-full">모집중</span>
                              {/* 솔로파티 참가 구성 — 담은 항목 이름 */}
                              {partyHasOptions(party) && partyOptionById(party, cartOptionOf(party.id)) && (
                                <span className="inline-flex text-[11px] font-black text-brand-point-ink bg-brand-point/10 px-2 py-0.5 rounded-full" data-testid="cart-option">
                                  {partyOptionById(party, cartOptionOf(party.id))?.name}
                                </span>
                              )}
                              {/* 쿠폰 적용 불가 파티 */}
                              {couponOff && (
                                <span className="inline-flex text-[11px] font-black text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">쿠폰 불가</span>
                              )}
                            </div>
                            <h3 className="mt-1.5 text-[17px] lg:text-xl font-black leading-snug group-hover:text-brand-point-ink transition-colors break-keep">
                              {party.title}
                            </h3>
                            {/* 항목이 없거나 바뀌었으면 다시 고르도록 안내 */}
                            {partyHasOptions(party) && !partyOptionById(party, cartOptionOf(party.id)) && (
                              <span className="block mt-1 text-xs lg:text-sm font-bold text-danger break-keep">참가 항목을 다시 선택해주세요 (상세에서 항목을 골라 담기)</span>
                            )}
                            <dl className="mt-2.5 grid gap-1 lg:grid-cols-2 text-sm lg:text-base">
                              <div className="flex gap-2 min-w-0">
                                <dt className="w-8 flex-shrink-0 pt-0.5 text-xs text-gray-500">일시</dt>
                                <dd className="min-w-0 font-medium text-gray-700 break-keep">{party.dateString}</dd>
                              </div>
                              <div className="flex gap-2 min-w-0">
                                <dt className="w-8 flex-shrink-0 pt-0.5 text-xs text-gray-500">장소</dt>
                                <dd className="min-w-0 font-medium text-gray-700 break-keep">{party.location}</dd>
                              </div>
                            </dl>
                          </Link>
                          <button
                            onClick={() => removeFromCart(party.id)}
                            className="relative p-2 -mt-1 -mr-1 rounded-lg text-gray-500 hover:bg-red-50 hover:text-danger transition-all flex-shrink-0 before:absolute before:-inset-1.5"
                            aria-label="삭제"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>

                        {/* 아랫부분: 금액 · 쿠폰 — 모바일 금액 → 쿠폰, lg 쿠폰(왼쪽) | 금액(오른쪽) */}
                        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3 lg:flex-row-reverse lg:items-center lg:justify-between lg:pl-[34px]">

                          {/* 금액 — 회원 성별 기반 단가 (priceMale/Female 우선) */}
                          {(() => {
                            const lineTotal = unitPrice(party); // quantity 항상 1
                            const lineFinal = computeRowPrice(party.id, lineTotal);
                            return (
                              <div className="flex items-baseline justify-between gap-3 lg:block lg:flex-shrink-0">
                                <span className="lg:hidden text-xs font-bold text-gray-500">결제 금액</span>
                                <div className="flex flex-col items-end leading-tight gap-0.5">
                                  {couponHere ? (
                                    <>
                                      <s className="text-gray-500 text-xs lg:text-sm font-medium tabular-nums">₩{lineTotal.toLocaleString()}</s>
                                      <span className="font-black text-xl lg:text-2xl text-brand-point-ink whitespace-nowrap tabular-nums">₩{lineFinal.toLocaleString()}</span>
                                    </>
                                  ) : (
                                    <span className="font-black text-xl lg:text-2xl text-brand-black whitespace-nowrap tabular-nums">₩{lineTotal.toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 쿠폰 */}
                          <div className="min-w-0 lg:w-[340px]">
                            {couponHere ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-brand-point bg-brand-point/5">
                                  <Check size={16} className="text-brand-point-ink flex-shrink-0" strokeWidth={3} />
                                  <span className="font-black text-sm md:text-base text-brand-point-ink truncate">{appliedCoupon!.code}</span>
                                  <span className="ml-auto text-xs md:text-sm font-black text-brand-point-ink whitespace-nowrap">{couponLabel()}</span>
                                </div>
                                <button
                                  onClick={handleRemoveCoupon}
                                  className="block ml-auto text-xs md:text-sm text-gray-500 hover:text-danger font-bold underline underline-offset-2 py-3.5 -my-2.5"
                                >
                                  쿠폰 해제
                                </button>
                              </div>
                            ) : couponOff ? (
                              // 쿠폰 적용 불가 — 입력창·적용 버튼 없이 안내 박스만 (점선 테두리 + 아이콘 + 문구).
                              // 최소 높이 48px로 기본 입력행과 높이를 맞추고, 문구가 길면 줄바꿈(잘림 없음). 문구 앞 "※"는 아이콘이 대신한다.
                              <div role="note" className="flex items-center gap-3 min-h-12 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50">
                                <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  <TicketX size={15} className="text-gray-600" strokeWidth={2.25} />
                                </span>
                                <p className="text-sm font-bold text-gray-700 leading-snug break-keep">
                                  {COUPON_DISABLED_MESSAGE.replace(/^※\s*/, "")}
                                </p>
                              </div>
                            ) : couponElsewhere ? (
                              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 bg-gray-50">
                                <p className="text-xs md:text-sm text-gray-500 font-bold leading-snug min-w-0 truncate">
                                  다른 파티에 쿠폰 적용 중
                                </p>
                                <button onClick={handleRemoveCoupon} className="text-xs md:text-sm text-brand-point-ink underline font-black whitespace-nowrap flex-shrink-0">변경</button>
                              </div>
                            ) : (
                              <div className="flex flex-row gap-2">
                                {/* 가로 한 줄 정렬 (모든 화면) — 입력창 75% / 버튼 25%, 높이 h-12 (48px) */}
                                <input
                                  type="text"
                                  value={couponInputs[party.id] || ""}
                                  onChange={e => setCouponInputs(p => ({ ...p, [party.id]: e.target.value.toUpperCase() }))}
                                  placeholder="쿠폰 코드 입력"
                                  inputMode="text"
                                  autoCapitalize="characters"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  className="flex-[3] min-w-0 h-12 px-4 rounded-xl border-2 border-gray-300 bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none font-bold text-base uppercase tracking-wide placeholder:text-gray-400 placeholder:tracking-normal placeholder:font-medium"
                                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(party.id); } }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleApplyCoupon(party.id)}
                                  disabled={couponLoadingId === party.id || !(couponInputs[party.id] || "").trim()}
                                  className="flex-[1] h-12 px-3 sm:px-5 bg-brand-black text-white rounded-xl font-black text-sm whitespace-nowrap hover:bg-brand-point hover:text-black transition-all disabled:bg-gray-200 disabled:text-gray-400"
                                >
                                  {couponLoadingId === party.id ? "확인 중..." : "적용"}
                                </button>
                              </div>
                            )}
                            {couponMsg[party.id] && !couponHere && !couponOff && (
                              <p className={`text-xs md:text-sm mt-2 ml-1 font-bold ${couponMsg[party.id]!.startsWith("✓") ? "text-brand-point-ink" : "text-red-500"}`}>
                                {couponMsg[party.id]}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* 결제 요약 — 영수증 형태 */}
                  <div className="bg-white rounded-2xl p-5 lg:p-6 border border-gray-200">
                    {selectedDiscount > 0 && (
                      <dl className="space-y-1.5 text-sm lg:text-base">
                        <div className="flex justify-between items-center gap-3 text-gray-500 font-medium">
                          <dt>상품 금액</dt>
                          <dd className="tabular-nums">₩{selectedOriginalTotal.toLocaleString()}</dd>
                        </div>
                        <div className="flex justify-between items-center gap-3 text-brand-point-ink font-bold">
                          <dt>쿠폰 할인 ({appliedCoupon?.code})</dt>
                          <dd className="tabular-nums">- ₩{selectedDiscount.toLocaleString()}</dd>
                        </div>
                      </dl>
                    )}
                    <div className={`flex justify-between items-center gap-3 mb-5 ${selectedDiscount > 0 ? "mt-3 pt-3 border-t border-dashed border-gray-300" : ""}`}>
                      <span className="font-black text-base lg:text-lg break-keep">
                        {allSelected ? "전체 결제금액" : "선택 결제금액"}{" "}
                        <span className="text-brand-point-ink">({selectedParties.length}건)</span>
                      </span>
                      <span className="font-black text-2xl lg:text-3xl text-brand-point-ink tabular-nums whitespace-nowrap">
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
                            className="flex items-center justify-center gap-2 w-full bg-brand-black text-white py-4 rounded-xl font-black text-base md:text-lg hover:bg-brand-point hover:text-black transition-all text-center mb-3"
                          >
                            <CreditCard size={20} />
                            전체 결제하기 ({cartTotalQty}건) · ₩{cartTotal.toLocaleString()}
                          </Link>

                          {/* Secondary: Pay selected (only if partial selection) */}
                          {!allSelected && selectedParties.length > 0 && (
                            <Link
                              href={`/checkout/?ids=${selectedIdsStr}`}
                              className="flex items-center justify-center gap-2 w-full bg-white border-2 border-brand-black text-brand-black py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-black hover:border-brand-point transition-all text-center"
                            >
                              선택 항목만 결제하기 ({selectedParties.reduce((s, p) => s + qtyOf(p.id), 0)}건)
                            </Link>
                          )}
                        </>
                      );
                    })()}
                    {selectedParties.length === 0 && (
                      <p className="text-center text-xs text-gray-500 font-medium">
                        일부 항목만 결제하려면 체크박스로 선택해주세요.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* 취소요청 + 회원탈퇴 — 콘텐츠 맨 아래 (모바일 가운데, lg 오른쪽) */}
            <div className="flex justify-center lg:justify-end items-center gap-5">
              <Link
                href="/mypage/cancel/"
                className="text-xs md:text-sm text-gray-500 hover:text-danger underline underline-offset-4 px-1 -mx-1 py-3.5 -my-1.5 transition-colors no-underline-link"
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
                      "잠시만요! 아직 진행 중인 파티가 남아있어요.\n" +
                      "현재 진행 대기 중인 파티가 있습니다.\n" +
                      "탈퇴 버튼 바로 옆에 있는 [취소요청] 버튼을 눌러 먼저 정리를 마쳐주세요.\n" +
                      "모든 신청 내역이 취소된 후에 회원 탈퇴가 가능합니다."
                    );
                    return;
                  }
                  setShowWithdrawModal(true);
                }}
                className="!bg-transparent hover:!bg-transparent focus:!bg-transparent !border-0 !outline-none !shadow-none text-xs md:text-sm text-gray-500 hover:!text-danger underline underline-offset-4 cursor-pointer py-3.5 -my-1.5 px-1 -mx-1 transition-colors duration-200 ease-out"
              >
                회원탈퇴
              </button>
            </div>
          </div>
        </div>
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
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative max-h-[90vh] overflow-y-auto md:max-h-none md:overflow-visible"
            >
              <button
                onClick={() => !withdrawing && setShowWithdrawModal(false)}
                disabled={withdrawing}
                className="absolute top-4 right-4 -m-[11px] p-[11px] text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30"
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
                    className="flex-1 bg-danger text-white py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-red-700 transition-all shadow-lg order-1 sm:order-2 disabled:bg-red-300 disabled:cursor-not-allowed"
                  >
                    {withdrawing ? "처리 중..." : "탈퇴하기"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change password modal */}
      <AnimatePresence>
        {pwModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closePwModal}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-6 md:p-9 relative max-h-[90vh] overflow-y-auto"
            >
              <button
                type="button"
                onClick={closePwModal}
                disabled={pwSubmitting}
                className="absolute top-4 right-4 -m-[11px] p-[11px] text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-30"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <KeyRound size={26} className="text-gray-700 md:hidden" />
                  <KeyRound size={30} className="text-gray-700 hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-black mb-1.5">비밀번호 변경</h3>
                <p className="text-[13px] md:text-sm text-gray-500 font-medium">현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.</p>
              </div>

              <div className="space-y-3.5 text-left">
                {([
                  ["current", "현재 비밀번호", "current-password"],
                  ["next", "새 비밀번호 (8자 이상)", "new-password"],
                  ["confirm", "새 비밀번호 확인", "new-password"],
                ] as const).map(([key, label, autoComplete]) => (
                  <div key={key}>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">{label}</label>
                    <input
                      type="password"
                      autoComplete={autoComplete}
                      value={pwForm[key]}
                      onChange={e => { const v = e.target.value; setPwForm(f => ({ ...f, [key]: v })); setPwError(""); }}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base font-medium bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point outline-none"
                    />
                  </div>
                ))}
              </div>

              {pwError && <p className="text-xs md:text-sm font-bold text-red-600 mt-4">{pwError}</p>}

              <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
                <button
                  type="button"
                  onClick={closePwModal}
                  disabled={pwSubmitting}
                  className="flex-1 bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-bold text-sm md:text-base hover:border-brand-black hover:text-brand-black transition-all order-2 sm:order-1 disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={pwSubmitting}
                  className="flex-1 bg-gray-800 text-white py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-gray-700 transition-all shadow-lg order-1 sm:order-2 disabled:opacity-50"
                >
                  {pwSubmitting ? "처리 중..." : "변경하기"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
