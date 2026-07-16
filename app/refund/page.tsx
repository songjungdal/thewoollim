import Header from "../components/Header";
import Footer from "../components/Footer";
import { AlertCircle, CreditCard, RefreshCw, Info, ScrollText, Ban, Clock } from "lucide-react";
import Image from "next/image";

export default function RefundPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.webp" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">이용안내 및 환불규정</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-14 md:py-28 px-4 md:px-6">
          <div className="max-w-3xl mx-auto">

            {/* 상단 알림 */}
            <div className="bg-red-50 border border-red-100 p-6 md:p-8 rounded-2xl md:rounded-3xl mb-12 md:mb-20 flex items-start gap-3 md:gap-4">
              <AlertCircle className="text-red-500 mt-0.5 flex-shrink-0" size={22} />
              <div className="space-y-1.5">
                <h3 className="text-red-900 font-black text-base md:text-lg leading-snug">꼭 확인해주세요!</h3>
                <p className="text-red-800 text-sm md:text-base leading-relaxed">파티 매칭 확정 이후에는 스케줄 조율 및 노쇼 방지를 위해 환불이 제한될 수 있습니다.</p>
              </div>
            </div>

            {/* 섹션들 — 우선순위 순 + 충분한 간격 */}
            <div className="space-y-16 md:space-y-24">

              {/* ⓪ 환불 규정 및 유효기간 안내 — 서비스 제공기간/예약 소멸 기준 고지 */}
              <section>
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                  <Clock className="text-brand-point flex-shrink-0" size={24} />
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">환불 규정 및 유효기간 안내</h2>
                </div>
                <ul className="bg-gray-50 border border-gray-100 rounded-2xl md:rounded-3xl p-6 md:p-9 space-y-4 md:space-y-5 text-sm md:text-base text-gray-700 leading-relaxed">
                  <li className="flex gap-3">
                    <span className="text-brand-point font-black flex-shrink-0">·</span>
                    <span>
                      <span className="font-bold text-gray-900">서비스 제공 기간(유효기간)</span> : 본 파티 예약 서비스의 제공 기간은 결제일(구매일)로부터 3개월(90일)까지입니다.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-brand-point font-black flex-shrink-0">·</span>
                    <span>
                      <span className="font-bold text-gray-900">예약 소멸 기준</span> : 결제 후 3개월 이내에 파티 참가 예약을 완료하지 않거나 참가하지 않은 이용권은 기간 만료로 소멸되며, 이후에는 환불 및 서비스 제공이 불가합니다.
                    </span>
                  </li>
                </ul>
              </section>

              {/* ① 시기별 환불 안내 — 메인 강조 카드 (전폭, 컬러 tier 표) */}
              <section>
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                  <RefreshCw className="text-brand-point flex-shrink-0" size={24} />
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">취소 시기별 환불 안내</h2>
                </div>
                <p className="text-sm md:text-base text-gray-500 font-medium leading-relaxed mb-6 md:mb-8">
                  파티 행사일 기준 자정(00:00)으로 계산되며, 마이페이지에서 취소 시 자동 적용됩니다.
                </p>
                <div className="rounded-2xl md:rounded-3xl border-2 border-brand-point/20 overflow-hidden">
                  {[
                    { when: "파티 5일 전 이상",  rate: "100% 환불", tone: "bg-emerald-50",  label: "text-emerald-700",  badge: "bg-emerald-100 text-emerald-800" },
                    { when: "파티 4일 전",       rate: "80% 환불",   tone: "bg-amber-50/60",  label: "text-amber-700",    badge: "bg-amber-100 text-amber-800" },
                    { when: "파티 3일 전",       rate: "50% 환불",   tone: "bg-amber-50/60",  label: "text-amber-700",    badge: "bg-amber-100 text-amber-800" },
                    { when: "파티 2일 전 ~ 당일", rate: "환불 불가",  tone: "bg-red-50/60",     label: "text-red-700",      badge: "bg-red-100 text-red-700" },
                  ].map((row, i, arr) => (
                    <div
                      key={row.when}
                      className={`flex items-center justify-between gap-4 px-6 md:px-8 py-5 md:py-7 ${row.tone} ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}
                    >
                      <span className={`text-sm md:text-lg font-bold ${row.label}`}>{row.when}</span>
                      <span className={`text-xs md:text-sm font-black px-3.5 py-1.5 rounded-full whitespace-nowrap ${row.badge}`}>
                        {row.rate}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ② 취소 방법 + 환불 방법 (How-to 묶음) */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-brand-point/30 transition-colors">
                  <div className="flex items-center gap-3 mb-4 md:mb-5">
                    <Info className="text-brand-point flex-shrink-0" size={22} />
                    <h2 className="text-lg md:text-xl font-black">취소 안내</h2>
                  </div>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                    취소 신청은 <span className="font-black text-brand-point">마이페이지</span>를 통해 가능하며,
                    취소 완료 시 결제 수단으로 자동 환불됩니다.
                  </p>
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:border-brand-point/30 transition-colors">
                  <div className="flex items-center gap-3 mb-4 md:mb-5">
                    <CreditCard className="text-brand-point flex-shrink-0" size={22} />
                    <h2 className="text-lg md:text-xl font-black">환불 방법</h2>
                  </div>
                  <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                    신용카드 결제 시 카드사에 따라 <span className="font-bold text-gray-900">영업일 기준 3~5일</span>,
                    무통장 입금은 신청 계좌로 <span className="font-bold text-gray-900">2일 이내</span>에 송금됩니다.
                  </p>
                </div>
              </section>

              {/* ③ 환불 불가 사유 — 경고 (강조) */}
              <section>
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                  <Ban className="text-red-500 flex-shrink-0" size={24} />
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">환불 불가 사유</h2>
                </div>
                <div className="bg-red-50 border-2 border-red-100 rounded-2xl md:rounded-3xl p-6 md:p-9 space-y-5 md:space-y-6">
                  <p className="text-sm md:text-base text-red-900 font-bold leading-relaxed">
                    아래 항목에 해당할 경우 <span className="underline">환불 및 이월, 타인 양도 모두 불가</span>합니다.
                  </p>
                  <ol className="list-decimal pl-5 md:pl-7 space-y-4 md:space-y-5 text-sm md:text-base text-red-900 leading-relaxed marker:font-black marker:text-red-700">
                    <li className="pl-1 md:pl-2">참가자가 프로필 카드 정보를 허위로 기재하거나 고의성이 있는 위반사항이 있는 경우</li>
                    <li className="pl-1 md:pl-2">
                      매칭파티 신청 이후 당일취소, 노쇼, 불참, 지각, 연락두절 등의 이유가 있는 경우
                      <p className="mt-3 md:mt-4 text-xs md:text-sm text-red-700/85 font-medium leading-relaxed pl-3.5 md:pl-4 border-l-2 border-red-200">
                        단, 불가항력적 개인사정으로 참석이 불가능한 경우에는 응급실 내원 확인서, 경찰 출석 요구서, 사고 사실 확인원 등
                        <span className="font-bold"> 공적 서류가 확인되어야만</span> 환불이 가능합니다.
                      </p>
                    </li>
                  </ol>
                </div>
              </section>

              {/* ④ 환불 예외 규정 — 긍정 케이스 */}
              <section>
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                  <ScrollText className="text-brand-point flex-shrink-0" size={24} />
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight">환불 예외 규정</h2>
                </div>
                <ul className="bg-gray-50 border border-gray-100 rounded-2xl md:rounded-3xl p-6 md:p-9 space-y-4 md:space-y-5 text-sm md:text-base text-gray-700 leading-relaxed">
                  <li className="flex gap-3">
                    <span className="text-brand-point font-black flex-shrink-0">·</span>
                    <span>주최측의 사정으로 파티가 취소될 경우 <span className="font-bold text-gray-900">100% 환불</span>해 드립니다.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-brand-point font-black flex-shrink-0">·</span>
                    <span>천재지변 등으로 행사가 정상 진행되지 못할 경우 <span className="font-bold text-gray-900">전액 환불</span> 대상입니다.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-brand-point font-black flex-shrink-0">·</span>
                    <span>매칭 파트너의 노쇼로 인해 파티 구성이 현저히 깨진 경우 <span className="font-bold text-gray-900">부분 환불 또는 차후 파티 초대권</span>을 제공합니다.</span>
                  </li>
                </ul>
              </section>

              {/* ⑤ 환불 기본 규정 — 법적 컨텍스트 (가장 약하게) */}
              <section>
                <div className="flex items-center gap-3 mb-5 md:mb-6 text-gray-500">
                  <Info className="flex-shrink-0" size={18} />
                  <h2 className="text-base md:text-lg font-bold">환불 기본 규정</h2>
                </div>
                <div className="text-xs md:text-sm text-gray-500 leading-relaxed space-y-3 pl-1">
                  <p>
                    저희 <span className="font-bold text-gray-700">&ldquo;어울림&rdquo;</span>은
                    시간과 날짜가 정해진 오프라인 매칭파티 행사로
                    <span className="font-bold text-gray-700"> 전자상거래 제17조 제2항 제3호</span>에 따라
                    청약 철회가 제한되는 서비스입니다.
                  </p>
                  <p>
                    결제 이후 시기별 환불 금액이 다르며, 환불 규정은 매칭파티 행사일 기준으로 계산됩니다.
                  </p>
                </div>
              </section>

            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
