import Header from "../components/Header";
import Footer from "../components/Footer";
import { AlertCircle, CreditCard, RefreshCw } from "lucide-react";
import Image from "next/image";

export default function RefundPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.jpg" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">환불규정</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-base md:text-lg">
              <div className="bg-red-50 border border-red-100 p-5 md:p-8 rounded-2xl md:rounded-3xl mb-10 md:mb-16 flex items-start gap-3 md:gap-4">
                <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={20} />
                <div>
                  <h3 className="text-red-900 font-bold mb-1.5 text-sm md:text-base">꼭 확인해주세요!</h3>
                  <p className="text-red-800 text-sm md:text-base">파티 매칭 확정 이후에는 스케줄 조율 및 노쇼 방지를 위해 환불이 제한될 수 있습니다.</p>
                </div>
              </div>

              <div className="space-y-12 md:space-y-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="space-y-5 md:space-y-6">
                    <div className="flex items-center gap-3 text-gray-900">
                      <RefreshCw className="text-brand-point flex-shrink-0" size={22} />
                      <h2 className="text-xl md:text-2xl font-bold">취소 시기별 환불 안내</h2>
                    </div>
                    <ul className="space-y-3 md:space-y-4 text-sm md:text-base">
                      <li className="flex justify-between border-b pb-2"><span>파티 7일 전</span> <span className="font-bold text-gray-900">100% 환불</span></li>
                      <li className="flex justify-between border-b pb-2"><span>파티 5일 전</span> <span className="font-bold text-gray-900">70% 환불</span></li>
                      <li className="flex justify-between border-b pb-2"><span>파티 3일 전</span> <span className="font-bold text-gray-900">30% 환불</span></li>
                      <li className="flex justify-between border-b pb-2"><span>파티 1일 전 ~ 당일</span> <span className="font-bold text-red-500">환불 불가</span></li>
                    </ul>
                  </div>

                  <div className="space-y-5 md:space-y-6">
                    <div className="flex items-center gap-3 text-gray-900">
                      <CreditCard className="text-brand-point flex-shrink-0" size={22} />
                      <h2 className="text-xl md:text-2xl font-bold">환불 방법</h2>
                    </div>
                    <p className="text-sm md:text-base text-gray-700">여기에 내용을 입력하세요. 신용카드 결제 시 카드사에 따라 영업일 기준 3~5일이 소요될 수 있습니다. 무통장 입금의 경우 신청하신 계좌로 영업일 기준 2일 이내에 송금됩니다.</p>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 md:p-10 rounded-2xl md:rounded-[2.5rem] border border-gray-100">
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-5 md:mb-6">환불 예외 규정</h2>
                  <ul className="list-disc pl-5 md:pl-6 space-y-3 md:space-y-4 text-sm md:text-base">
                    <li>주최측의 사정으로 파티가 취소될 경우 100% 환불해 드립니다.</li>
                    <li>천재지변 등으로 행사가 정상 진행되지 못할 경우 전액 환불 대상입니다.</li>
                    <li>매칭 파트너의 노쇼로 인해 파티 구성이 현저히 깨진 경우 부분 환불 또는 차후 파티 초대권을 제공합니다.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
