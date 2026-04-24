"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Star, Heart, Clock, CheckCircle, ShoppingBag, X, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { PARTIES } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";

export default function PartyClientView({ id }: { id: string }) {
  const detailItem = PARTIES.find(p => p.id === id);
  const router = useRouter();
  const { isLoggedIn, addToCart } = useAuth();
  const [showCartModal, setShowCartModal] = useState(false);

  if (!detailItem) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">파티를 찾을 수 없습니다.</h1>
            <Link href="/#apply" className="text-brand-point underline">목록으로 돌아가기</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const handleCheckout = () => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/checkout/?id=${id}`)}`);
      return;
    }
    router.push(`/checkout/?id=${id}`);
  };

  const handleAddToCart = () => {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    addToCart(id);
    setShowCartModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen text-brand-black selection:bg-brand-point selection:text-white pb-0">
      <Header />

      <main className="flex-1 bg-brand-lightgray">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-24 min-h-[85vh]"
        >
          <Link href="/#apply" className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-7 md:mb-12 font-bold transition-colors text-sm md:text-base">
            <ArrowLeft size={18} /> 목록으로 돌아가기
          </Link>

          {/* TOP SECTION: MAIN INFO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 md:gap-16 mb-10 md:mb-24">
            {/* Left: Emotional Image Placeholder */}
            <div className="aspect-[5/3] md:aspect-[10/11] bg-neutral-900 rounded-2xl md:rounded-[2rem] flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-neutral-800 flex items-center justify-center opacity-40">
                <Star size={48} className="text-gray-400" />
              </div>
              <div className="absolute top-4 left-4 md:top-6 md:left-6 bg-brand-point text-white font-bold px-4 py-1.5 md:px-5 md:py-2 rounded-full text-xs md:text-sm shadow-xl z-10">모집중</div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            {/* Right: Info & Checkout */}
            <div className="flex flex-col justify-between min-h-0">
              <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3 md:mb-4 leading-snug">{detailItem.title}</h1>
                <p className="text-sm md:text-lg text-gray-500 mb-5 md:mb-8 font-medium leading-relaxed">
                  단순한 만남을 넘어 감성을 향유하는 시간.<br />
                  어울림이 큐레이션한 프리미엄 네트워킹에 초대합니다.
                </p>

                {/* Info rows */}
                <div className="space-y-0 mb-5 md:mb-8">
                  {[
                    { label: "일시 (Date)", value: detailItem.dateString },
                    { label: "장소 (Location)", value: detailItem.location },
                    { label: "대상 (Target)", value: detailItem.target },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col md:flex-row md:justify-between md:items-center py-3 md:py-3.5 border-b border-gray-200 gap-0.5 md:gap-0">
                      <span className="text-xs md:text-base text-gray-400 md:text-gray-500 font-medium md:w-36">{row.label}</span>
                      <span className="font-bold text-sm md:text-base md:text-right">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center py-3 md:py-3.5 border-b border-gray-200 gap-0.5 md:gap-0">
                    <span className="text-xs md:text-base text-gray-400 md:text-gray-500 font-medium md:w-36">참가비 (Price)</span>
                    <span className="font-black text-xl md:text-2xl text-brand-point">₩{detailItem.price.toLocaleString()}</span>
                  </div>
                </div>

                {/* Notice */}
                <div className="bg-white p-4 md:p-5 rounded-xl md:rounded-2xl border border-gray-200 mb-5 md:mb-6">
                  <h4 className="font-bold mb-1.5 flex items-center gap-2 text-sm md:text-base">
                    <Heart size={15} className="text-brand-point" /> 꼭 확인해주세요.
                  </h4>
                  <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
                    어울림은 진정성 있는 네트워크 유지를 위해 철저한 사전 승인제로 운영됩니다.<br />
                    결제 완료 시 참여 확정 및 안내 문자가 순차적으로 발송됩니다.
                  </p>
                </div>
              </div>

              {/* CTA Buttons — pinned to bottom */}
              <div className="flex gap-3 md:gap-4 mt-auto">
                <button
                  onClick={handleCheckout}
                  className="flex-[2] bg-brand-black text-white px-5 md:px-8 py-4 md:py-5 rounded-xl md:rounded-2xl text-base md:text-xl font-bold hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30"
                >
                  참가신청
                </button>
                <button
                  onClick={handleAddToCart}
                  className="flex-1 bg-brand-black text-white px-5 md:px-8 py-4 md:py-5 rounded-xl md:rounded-2xl text-base md:text-xl font-bold hover:bg-brand-point transition-all shadow-xl"
                >
                  장바구니
                </button>
              </div>
            </div>
          </div>

          {/* INTRO — Party-specific OUR EXPERIENCE style */}
          <div className="mb-10 md:mb-24">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="space-y-6 md:space-y-10"
              >
                <div className="text-center space-y-3 md:space-y-5">
                  <p className="text-xs md:text-sm font-black tracking-[0.25em] text-brand-point uppercase">Private Matching Party</p>
                  <h2 className="text-2xl md:text-5xl font-black tracking-tighter leading-tight">
                    프라이빗 매칭 파티<br className="md:hidden" />
                    <span className="hidden md:inline"> : </span>
                    <span className="md:hidden">: </span>
                    <span className="text-brand-point">{detailItem.title}</span>
                  </h2>
                  <p className="text-sm md:text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                    어울림<span className="text-brand-point font-bold">(THEWOOLLIM)</span>이 제안하는 엄선된 만남.<br />
                    같은 취향과 가치관을 가진 분들과의 특별한 시간을 경험해 보세요.
                  </p>
                </div>

                <div className="relative group overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl aspect-[16/9] md:aspect-[21/9]">
                  <img
                    src="/images/party_vibe_1.png"
                    alt={`${detailItem.title} — 프라이빗 매칭 파티 분위기`}
                    className="w-full h-full object-cover transform transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent group-hover:from-black/30 transition-colors" />
                </div>
              </motion.div>
            </div>
          </div>

          {/* HOW TO JOIN — Timeline-styled Application Guide */}
          <div className="mb-10 md:mb-24">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 md:gap-4 mb-7 md:mb-12">
                  <ClipboardList size={26} className="text-brand-point md:hidden" />
                  <ClipboardList size={32} className="text-brand-point hidden md:block" />
                  <h3 className="text-xl md:text-3xl font-bold tracking-tight">참가 신청 방법</h3>
                </div>

                <div className="space-y-7 md:space-y-12 relative before:absolute before:left-3.5 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                  {[
                    {
                      title: "결제하기",
                      desc: "매칭파티 카드의 일시, 장소, 연령대를 확인하고 결제해주세요.",
                      note: null,
                    },
                    {
                      title: "프로필카드 작성하기",
                      desc: "매칭파티 프로필카드를 작성해주세요.",
                      note: "프로필카드가 작성되면 확인 후 참가승인 확정문자를 보내드립니다.",
                    },
                    {
                      title: "참가승인 확정 후 방문하기",
                      desc: "참가승인 확정문자 확인 후 해당 장소로 방문하여 파티에 참여해주세요.",
                      note: "성비가 맞지 않거나 주최측의 사정으로 파티가 취소될 경우 100% 환불이나 쿠폰 적립 후 다음 모임 선확정 중 선택하실 수 있습니다.",
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="relative pl-12 md:pl-14">
                      <div className="absolute left-0 top-0 w-7 h-7 md:w-8 md:h-8 bg-brand-point text-white rounded-full border-4 border-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                        {idx + 1}
                      </div>
                      <div className="text-brand-point font-black text-xs md:text-sm tracking-[0.15em] mb-1 md:mb-1.5">STEP {idx + 1}</div>
                      <div className="font-bold text-base md:text-xl mb-1.5 md:mb-2 text-brand-black leading-snug">{item.title}</div>
                      <div className="text-gray-600 font-medium text-sm md:text-base leading-relaxed">{item.desc}</div>
                      {item.note && (
                        <div className="mt-2.5 md:mt-3 bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 md:pl-4 py-2 md:py-2.5 rounded-r-lg">
                          <p className="text-xs md:text-sm text-gray-600 leading-relaxed">{item.note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: DETAIL NARRATIVE */}
          <div className="border-t border-gray-200 pt-10 md:pt-24">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1 }}
                className="space-y-10 md:space-y-24"
              >
                {/* Introduction Article */}
                <div className="text-center space-y-4 md:space-y-6">
                  <h2 className="text-2xl md:text-5xl font-black tracking-tighter">OUR EXPERIENCE</h2>
                  <p className="text-sm md:text-lg text-gray-600 leading-relaxed">
                    어울림의 파티는 단지 사람을 모으는 것에서 그치지 않습니다.<br />
                    공간의 향기, 흐르는 음악, 정교하게 준비된 다과와 와인까지.<br />
                    당신의 오감을 자극하는 모든 디테일이 하나의 연결을 완성합니다.
                  </p>
                </div>

                {/* Emotional Image 1 */}
                <div className="relative group overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl">
                  <img
                    src="/images/party_vibe_1.png"
                    alt="Premium networking vibe"
                    className="w-full h-auto object-cover transform transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>

                {/* Timeline / Schedule Section */}
                <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 md:gap-4 mb-7 md:mb-12">
                    <Clock size={26} className="text-brand-point md:hidden" />
                    <Clock size={32} className="text-brand-point hidden md:block" />
                    <h3 className="text-xl md:text-3xl font-bold tracking-tight">Party Timeline</h3>
                  </div>

                  <div className="space-y-7 md:space-y-12 relative before:absolute before:left-2.5 md:before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                    {[
                      { time: "19:00", event: "게스트 입장 및 등록", desc: "웰컴 드링크와 함께 어울림의 분위기를 만끽하세요." },
                      { time: "19:30", event: "아이스브레이킹 톡", desc: "가벼운 질문과 함께 서로를 알아가는 부드러운 시작." },
                      { time: "20:30", event: "프리 네트워킹", desc: "주제별 테이블에서 깊이 있는 대화와 취향을 공유합니다." },
                      { time: "21:30", event: "럭키 드로우 & 랩업", desc: "어울림이 준비한 작은 선물과 인사를 나눕니다." }
                    ].map((item, idx) => (
                      <div key={idx} className="relative pl-9 md:pl-12">
                        <div className="absolute left-0 top-2 w-5 h-5 md:w-6 md:h-6 bg-brand-point rounded-full border-4 border-white shadow-md" />
                        <div className="text-brand-point font-black text-sm md:text-lg mb-0.5 md:mb-1">{item.time}</div>
                        <div className="font-bold text-base md:text-xl mb-1 md:mb-2">{item.event}</div>
                        <div className="text-gray-500 font-medium text-sm md:text-base">{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emotional Image 2 */}
                <div className="relative group overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl">
                  <img
                    src="/images/party_vibe_2.png"
                    alt="Luxury lounge interior"
                    className="w-full h-auto object-cover transform transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>

                {/* Final CTA */}
                <div className="text-center py-12 md:py-20 bg-neutral-900 text-white rounded-2xl md:rounded-[3rem] shadow-2xl px-5 md:px-8">
                  <div className="flex justify-center mb-5 md:mb-8">
                    <CheckCircle size={40} className="text-brand-point md:hidden" />
                    <CheckCircle size={48} className="text-brand-point hidden md:block" />
                  </div>
                  <h3 className="text-xl md:text-3xl font-bold mb-4 md:mb-6 italic tracking-tight">"Where connections resonate deeply."</h3>
                  <p className="text-gray-400 text-xs md:text-base max-w-2xl mx-auto leading-relaxed">
                    우리는 숫자로 설명할 수 없는 가치를 믿습니다.<br />
                    어울림이 엄선한 멤버들과 함께하는 특별한 만남에 당신을 초대합니다.
                  </p>
                </div>

              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />

      {/* Cart confirmation modal */}
      <AnimatePresence>
        {showCartModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCartModal(false)}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative"
            >
              <button
                onClick={() => setShowCartModal(false)}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point/10 rounded-full flex items-center justify-center mb-5">
                  <ShoppingBag size={32} className="text-brand-point md:hidden" />
                  <ShoppingBag size={38} className="text-brand-point hidden md:block" />
                </div>

                <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight">
                  장바구니에 담겼습니다
                </h3>
                <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-8 leading-relaxed">
                  {detailItem.title}
                </p>

                <div className="flex flex-col w-full gap-2.5">
                  <button
                    onClick={() => router.push("/mypage")}
                    className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all shadow-lg hover:shadow-brand-point/30 flex items-center justify-center gap-2"
                  >
                    <ShoppingBag size={17} /> 장바구니로 가기
                  </button>
                  <button
                    onClick={() => setShowCartModal(false)}
                    className="w-full bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-xl font-bold text-sm md:text-base hover:border-brand-black hover:text-brand-black transition-all"
                  >
                    목록 계속보기
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
