"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ArrowRight, X, Sparkles } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { useAuth, isProfileComplete } from "../../context/AuthContext";
import { useParties } from "../../lib/useParties";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mounted, isLoggedIn, profile, userEmail, refreshBookings } = useAuth();
  const PARTIES = useParties();
  const [checkingProfile, setCheckingProfile] = useState(false);

  // 결제 직후 booking이 backend에서 'pending_approval' 자동 전환되었을 가능성 →
  // 진입 시점에 1회 강제 동기화하여 마이페이지 상태가 즉시 정확하게 보이도록 보장.
  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    refreshBookings();
  }, [mounted, isLoggedIn, refreshBookings]);

  const ids   = (searchParams.get("ids") || "").split(",").filter(Boolean);
  const total = Number(searchParams.get("total") || 0);
  const isTest = searchParams.get("test") === "1";
  const parties = ids.map(id => PARTIES.find(p => p.id === id)).filter(Boolean) as typeof PARTIES;

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const profileDone = isProfileComplete(profile);

  // 1) Browser-level beforeunload (탭 닫기/새로고침/외부이동)
  useEffect(() => {
    if (profileDone) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [profileDone]);

  // 2) SPA 내부 링크 가로채기 — 사이트 내 다른 페이지로 이동 시 모달
  useEffect(() => {
    if (profileDone) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;
      // /profile-setup 으로의 이동은 허용
      if (href.startsWith("/profile-setup/")) return;
      e.preventDefault();
      pendingHrefRef.current = href;
      setShowLeaveModal(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [profileDone]);

  const confirmLeave = () => {
    const href = pendingHrefRef.current ?? "/";
    setShowLeaveModal(false);
    router.push(href);
  };

  /**
   * [프로필 작성하기] 클릭 핸들러.
   * 클릭 시점에 서버에서 최신 프로필을 재확인 (다른 탭/세션에서 이미 작성했을 수 있음).
   * - 프로필이 이미 완성되어 있으면: alert 후 마이페이지로 리다이렉트 (중복 작성 방지)
   * - 프로필이 없거나 미완성이면: /profile-setup/ 으로 이동
   */
  const handleStartProfile = async () => {
    if (checkingProfile) return;
    if (!userEmail) { router.push("/profile-setup/"); return; }
    setCheckingProfile(true);
    try {
      const res = await fetch(`/api/profile.php?email=${encodeURIComponent(userEmail)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && isProfileComplete(data)) {
          alert("이미 등록된 프로필 카드가 있습니다.\n마이페이지에서 수정하실 수 있습니다.");
          router.push("/mypage");
          return;
        }
      }
      router.push("/profile-setup/");
    } catch {
      // 네트워크 오류 시 작성 페이지로 이동 (UX 우선)
      router.push("/profile-setup/");
    } finally {
      setCheckingProfile(false);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <p className="font-bold text-lg">Loading...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    router.push("/login");
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1 py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          {/* Success header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-center mb-7 md:mb-10"
          >
            <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point/10 rounded-full flex items-center justify-center mx-auto mb-5 md:mb-6">
              <CheckCircle2 size={36} className="text-brand-point md:hidden" />
              <CheckCircle2 size={42} className="text-brand-point hidden md:block" />
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-2 md:mb-3">
              결제가 완료되었습니다!
            </h1>
            {total > 0 && (
              <p className="text-gray-500 font-medium text-sm md:text-base">
                ₩{total.toLocaleString()}{isTest && <span className="ml-2 text-xs text-gray-400">(테스트 결제)</span>}
              </p>
            )}
          </motion.div>

          {/* Order summary */}
          {parties.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100 mb-5 md:mb-6"
            >
              <p className="text-xs md:text-sm font-bold text-gray-400 mb-3 tracking-wider">결제 내역</p>
              <div className="space-y-2.5">
                {parties.map(p => (
                  <div key={p.id} className="flex justify-between items-center gap-4">
                    <span className="font-bold text-sm md:text-base truncate">{p.title}</span>
                    <span className="font-black text-sm md:text-base text-brand-point whitespace-nowrap">₩{p.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Profile-required warning OR completion notice */}
          {!profileDone ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-brand-point/10 to-brand-point/5 border-2 border-brand-point/40 rounded-2xl md:rounded-3xl p-5 md:p-7 mb-5 md:mb-6"
            >
              <div className="flex items-start gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-point rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-white md:hidden" />
                  <AlertTriangle size={24} className="text-white hidden md:block" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-base md:text-lg mb-1.5 text-brand-black leading-snug">
                    잠시만요!
                  </h3>
                  <p className="text-sm md:text-base text-gray-700 font-medium leading-relaxed mb-1">
                    <span className="text-brand-point font-black">프로필 카드 작성</span>을 완료해야
                    매칭파티 <span className="font-black">참가 확정</span>을 받을 수 있습니다.
                  </p>
                  <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
                    프로필이 미완성이면 매칭이 어려워 참가가 자동 취소될 수 있어요.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-5 md:p-7 mb-5 md:mb-6"
            >
              <div className="flex items-start gap-3 md:gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-point/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles size={20} className="text-brand-point md:hidden" />
                  <Sparkles size={24} className="text-brand-point hidden md:block" />
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-base md:text-lg mb-1.5">이미 프로필 카드 정보가 저장되어 있습니다</h3>
                  <p className="text-sm md:text-base text-gray-600 font-medium leading-relaxed">
                    별도 추가작성 없이 기존 프로필 정보의 수정사항이 없는지 확인 후 전송해주시면
                    어울림 운영팀이 확인하여 <span className="font-black text-brand-point">참가확정</span> 안내 문자를 보내드립니다.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Primary CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            {!profileDone ? (
              <button
                type="button"
                onClick={handleStartProfile}
                disabled={checkingProfile}
                className="w-full bg-brand-black text-white py-4 md:py-5 rounded-2xl font-black text-base md:text-lg hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 flex items-center justify-center gap-2.5 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {checkingProfile ? "프로필 확인 중..." : (
                  <>지금 바로 프로필 카드 작성하기 <ArrowRight size={20} /></>
                )}
              </button>
            ) : (
              <Link
                href="/mypage"
                className="w-full bg-brand-black text-white py-4 md:py-5 rounded-2xl font-black text-base md:text-lg hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 flex items-center justify-center gap-2.5"
              >
                마이페이지로 이동
                <ArrowRight size={20} />
              </Link>
            )}
            <Link
              href="/mypage"
              className="block w-full text-center py-3.5 text-sm md:text-base font-bold text-gray-500 hover:text-brand-black transition-colors"
            >
              주문 내역 확인하기
            </Link>
          </motion.div>

        </div>
      </main>
      <Footer />

      {/* Leave-without-profile confirmation modal */}
      <AnimatePresence>
        {showLeaveModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLeaveModal(false)}
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
                onClick={() => setShowLeaveModal(false)}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-amber-50 rounded-full flex items-center justify-center mb-5">
                  <AlertTriangle size={26} className="text-amber-500 md:hidden" />
                  <AlertTriangle size={30} className="text-amber-500 hidden md:block" />
                </div>
                <h3 className="text-lg md:text-xl font-black mb-3 leading-snug">
                  프로필 작성을 완료하지 않으면<br />파티 참여가 취소되거나<br />제한될 수 있습니다.
                </h3>
                <p className="text-sm md:text-base text-gray-500 font-medium leading-relaxed mb-2">
                  계속하시겠습니까?
                </p>
                <p className="text-xs md:text-sm text-gray-400 font-medium leading-relaxed mb-7 md:mb-8">
                  프로필 카드는 마이페이지에서 등록 및 수정할 수 있습니다.
                </p>

                <div className="flex flex-col sm:flex-row w-full gap-2.5">
                  <button
                    type="button"
                    onClick={confirmLeave}
                    className="flex-1 bg-white border-2 border-gray-200 text-gray-600 py-3.5 rounded-xl font-bold text-sm md:text-base hover:border-gray-400 hover:text-gray-800 transition-all order-2 sm:order-1"
                  >
                    계속 이동
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLeaveModal(false);
                      handleStartProfile();
                    }}
                    disabled={checkingProfile}
                    className="flex-1 bg-brand-black text-white py-3.5 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all shadow-lg order-1 sm:order-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {checkingProfile ? "확인 중..." : "프로필 작성하기"}
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

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <p className="font-bold text-lg">Loading...</p>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
