"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Star, Heart, Clock, CheckCircle } from "lucide-react";
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
    alert("장바구니에 담겼습니다! 마이페이지에서 확인하세요.");
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
            <div className="aspect-[3/2] md:aspect-[4/5] bg-neutral-900 rounded-2xl md:rounded-[2rem] flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-neutral-800 flex items-center justify-center opacity-40">
                <Star size={48} className="text-gray-400" />
              </div>
              <div className="absolute top-4 left-4 md:top-6 md:left-6 bg-brand-point text-white font-bold px-4 py-1.5 md:px-5 md:py-2 rounded-full text-xs md:text-sm shadow-xl z-10">모집중</div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            {/* Right: Info & Checkout */}
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3 md:mb-4 leading-snug">{detailItem.title}</h1>
              <p className="text-sm md:text-xl text-gray-500 mb-7 md:mb-12 font-medium leading-relaxed">
                단순한 만남을 넘어 감성을 향유하는 시간.<br />
                어울림이 큐레이션한 프리미엄 네트워킹에 초대합니다.
              </p>

              {/* Info rows */}
              <div className="space-y-0 mb-7 md:mb-12 flex-1">
                {[
                  { label: "일시 (Date)", value: detailItem.dateString },
                  { label: "장소 (Location)", value: detailItem.location },
                  { label: "대상 (Target)", value: detailItem.target },
                ].map((row) => (
                  <div key={row.label} className="flex flex-col md:flex-row md:justify-between md:items-center py-3.5 md:py-4 border-b border-gray-200 gap-0.5 md:gap-0">
                    <span className="text-xs md:text-base text-gray-400 md:text-gray-500 font-medium md:w-36">{row.label}</span>
                    <span className="font-bold text-sm md:text-base md:text-right">{row.value}</span>
                  </div>
                ))}
                <div className="flex flex-col md:flex-row md:justify-between md:items-center py-3.5 md:py-4 border-b border-gray-200 gap-0.5 md:gap-0">
                  <span className="text-xs md:text-base text-gray-400 md:text-gray-500 font-medium md:w-36">참가비 (Price)</span>
                  <span className="font-black text-xl md:text-2xl text-brand-point">₩{detailItem.price.toLocaleString()}</span>
                </div>
              </div>

              {/* Notice */}
              <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-gray-200 mb-5 md:mb-8">
                <h4 className="font-bold mb-1.5 flex items-center gap-2 text-sm md:text-base">
                  <Heart size={15} className="text-brand-point" /> 꼭 확인해주세요.
                </h4>
                <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
                  어울림은 진정성 있는 네트워크 유지를 위해 철저한 사전 승인제로 운영됩니다.<br />
                  결제 완료 시 참여 확정 및 안내 문자가 순차적으로 발송됩니다.
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex gap-3 md:gap-4">
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
    </div>
  );
}
