"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, User, Trash2, Calendar, MapPin, CheckSquare, Square, CreditCard, Pencil, AlertTriangle, X, Ticket, Clock, CheckCircle2 } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth, type BookingStatus } from "../context/AuthContext";
import { PARTIES } from "../lib/data";

const STATUS_DISPLAY: Record<BookingStatus, { label: string; tone: string; icon: typeof Clock; sub?: string }> = {
  // 결제완료: 결제됨 + 프로필 미완성
  paid_pending_profile: {
    label: "결제완료",
    sub:   "프로필 작성을 완료해주세요",
    tone:  "bg-amber-50 text-amber-700 border-amber-200",
    icon:  AlertTriangle,
  },
  // 확정 대기 중: 결제 + 프로필 작성 완료, 관리자 승인 대기
  pending_approval: {
    label: "확정 대기 중",
    sub:   "운영팀 승인을 기다리고 있어요",
    tone:  "bg-brand-point/10 text-brand-point border-brand-point/30",
    icon:  Clock,
  },
  // 참가 확정 완료: 관리자 최종 승인
  confirmed: {
    label: "참가 확정 완료",
    sub:   "현장에서 만나요",
    tone:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon:  CheckCircle2,
  },
  cancelled: {
    label: "취소됨",
    tone:  "bg-gray-100 text-gray-500 border-gray-200",
    icon:  X,
  },
};

export default function MyPage() {
  const { mounted, isLoggedIn, userEmail, logout, cart, removeFromCart, profile, deleteAccount, bookings } = useAuth();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const cartParties = cart
    .map(item => PARTIES.find(p => p.id === item.partyId))
    .filter(Boolean) as typeof PARTIES;

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.push("/login?redirect=/mypage");
    }
  }, [mounted, isLoggedIn, router]);

  useEffect(() => {
    setSelectedIds(new Set(cart.map(c => c.partyId)));
  }, [cart]);

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
  const selectedTotal = selectedParties.reduce((sum, p) => sum + p.price, 0);

  const handleLogout = () => {
    logout();
    router.push("/");
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
                <p className="text-gray-400 text-xs md:text-sm font-medium mb-1">관리자 계정</p>
                <h1 className="text-xl md:text-3xl font-black">안녕하세요!</h1>
                <p className="text-gray-400 text-sm mt-1">{userEmail}</p>
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <Link
                href="/profile-setup/?edit=true"
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
                      {/* Left accent stripe (desktop) */}
                      <div className="hidden md:block w-1 bg-brand-point rounded-full flex-shrink-0" />

                      <div className="flex-1 min-w-0 space-y-2.5 md:space-y-3">
                        {/* Status row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs md:text-sm font-black px-3 py-1.5 rounded-full border ${meta.tone}`}>
                            <Icon size={13} /> {meta.label}
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
                      </div>

                      {/* Action */}
                      {b.status === "paid_pending_profile" && (
                        <div className="flex md:items-center">
                          <Link
                            href="/profile-setup/"
                            className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 bg-brand-black text-white px-5 py-3 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all whitespace-nowrap text-center no-underline"
                          >
                            <Pencil size={14} /> 프로필 작성
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
        <section className="py-10 md:py-16 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">

            <div className="flex items-center gap-3 mb-7 md:mb-10">
              <ShoppingBag size={22} className="text-brand-point" />
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">장바구니</h2>
              <span className="bg-brand-point text-white text-xs font-black px-2.5 py-1 rounded-full">{cart.length}</span>
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
                  const isSelected = selectedIds.has(party.id);
                  return (
                    <motion.div
                      key={party.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border-2 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 transition-colors ${isSelected ? "border-brand-point/30" : "border-gray-100"}`}
                    >
                      <button onClick={() => toggleOne(party.id)} className="flex-shrink-0 self-start md:self-center">
                        {isSelected
                          ? <CheckSquare size={22} className="text-brand-point" />
                          : <Square size={22} className="text-gray-300" />
                        }
                      </button>
                      <Link href={`/party/${party.id}`} className="flex-1 min-w-0 group cursor-pointer">
                        <span className="inline-block text-xs font-bold text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full mb-2">모집중</span>
                        <h3 className="font-black text-base md:text-xl mb-2 leading-snug group-hover:text-brand-point transition-colors">{party.title}</h3>
                        <div className="flex flex-col gap-1 text-xs md:text-sm text-gray-500 font-medium">
                          <span className="flex items-center gap-1.5"><Calendar size={13} /> {party.dateString}</span>
                          <span className="flex items-center gap-1.5"><MapPin size={13} /> {party.location}</span>
                        </div>
                      </Link>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-lg md:text-2xl text-brand-point whitespace-nowrap">₩{party.price.toLocaleString()}</span>
                        <button
                          onClick={() => removeFromCart(party.id)}
                          className="p-2.5 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-400 transition-all flex-shrink-0"
                          aria-label="삭제"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Total + Checkout for selected */}
                <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100">
                  <div className="flex justify-between items-center mb-5">
                    <span className="font-black text-base md:text-lg">
                      {allSelected ? "전체 결제금액" : "선택 결제금액"}{" "}
                      <span className="text-brand-point">({selectedParties.length}건)</span>
                    </span>
                    <span className="font-black text-xl md:text-3xl text-brand-point">
                      ₩{selectedTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Primary: Pay all */}
                  <Link
                    href={`/checkout/?ids=${cartParties.map(p => p.id).join(",")}`}
                    className="flex items-center justify-center gap-2 w-full bg-brand-black text-white py-4 rounded-xl font-black text-base md:text-lg hover:bg-brand-point transition-all text-center mb-3"
                  >
                    <CreditCard size={20} />
                    전체 결제하기 ({cartParties.length}건) · ₩{cartParties.reduce((s, p) => s + p.price, 0).toLocaleString()}
                  </Link>

                  {/* Secondary: Pay selected (only if partial selection) */}
                  {!allSelected && selectedParties.length > 0 && (
                    <Link
                      href={`/checkout/?ids=${selectedParties.map(p => p.id).join(",")}`}
                      className="flex items-center justify-center gap-2 w-full bg-white border-2 border-brand-black text-brand-black py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-white hover:border-brand-point transition-all text-center"
                    >
                      선택 항목만 결제하기 ({selectedParties.length}건)
                    </Link>
                  )}
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

        {/* Withdraw link — low-key, bottom of content */}
        <section className="px-4 md:px-6 pb-10 md:pb-16">
          <div className="max-w-4xl mx-auto flex justify-center md:justify-end">
            <button
              type="button"
              onClick={() => setShowWithdrawModal(true)}
              style={{ background: "transparent", border: "none", padding: 0, transition: "color 0.2s ease" }}
              className="!bg-transparent hover:!bg-transparent focus:!bg-transparent !border-0 !outline-none !shadow-none text-xs md:text-sm text-gray-400 hover:!text-gray-600 underline underline-offset-4 cursor-pointer py-2"
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
