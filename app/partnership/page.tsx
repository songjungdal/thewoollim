import Header from "../components/Header";
import Footer from "../components/Footer";
import { Handshake, Mail, MessageSquare, Briefcase } from "lucide-react";
import Image from "next/image";

export default function PartnershipPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.jpg" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-3xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">협업 및 제휴문의</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-base md:text-lg">
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-7 md:mb-10 tracking-tight">어울림과 함께 성장할 파트너를 찾습니다.</h2>
              <p className="mb-10 md:mb-16 text-sm md:text-base">어울림은 다양한 브랜드, 공간 운영자, 콘텐츠 크리에이터와의 협업에 항상 열려 있습니다. 우리의 감성과 결이 맞는 파트너십(Partnership)을 통해 더 큰 시너지를 만들어내기를 기대합니다.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mb-12 md:mb-20">
                <div className="p-6 md:p-10 bg-gray-50 rounded-2xl md:rounded-[2.5rem] border border-gray-100">
                  <Briefcase className="text-brand-point mb-4 md:mb-6" size={28} />
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3">공간/장소 제휴</h3>
                  <p className="text-sm md:text-base">오프라인 매칭 파티를 위한 감각적인 라운지, 카페, 다이닝 공간을 찾고 있습니다.</p>
                </div>
                <div className="p-6 md:p-10 bg-gray-50 rounded-2xl md:rounded-[2.5rem] border border-gray-100">
                  <Handshake className="text-brand-point mb-4 md:mb-6" size={28} />
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3">브랜드 협업</h3>
                  <p className="text-sm md:text-base">어울림 회원들에게 새로운 가치를 전달할 수 있는 브랜드와의 프로모션을 환영합니다.</p>
                </div>
              </div>

              <div className="bg-gray-100 p-7 md:p-12 rounded-3xl md:rounded-[3.5rem] text-center">
                <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-3 md:mb-4">문의 창구</h3>
                <p className="text-gray-600 text-sm md:text-base mb-7 md:mb-10">제안서를 포함하여 아래 이메일이나 채널로 문의해 주시기 바랍니다.</p>

                <div className="flex flex-col items-center gap-3 md:gap-6">
                  <a href="mailto:info@thewoollim.com" className="flex items-center gap-3 bg-white w-full md:w-auto px-5 md:px-8 py-3.5 md:py-4 rounded-2xl shadow-sm border border-gray-200 justify-center hover:border-brand-point transition-colors no-underline">
                    <Mail className="text-brand-point flex-shrink-0" size={18} />
                    <span className="font-bold text-gray-900 text-sm md:text-base">info@thewoollim.com</span>
                  </a>
                  <div className="flex items-center gap-3 bg-white w-full md:w-auto px-5 md:px-8 py-3.5 md:py-4 rounded-2xl shadow-sm border border-gray-200 justify-center">
                    <MessageSquare className="text-brand-point flex-shrink-0" size={18} />
                    <span className="font-bold text-gray-900 text-sm md:text-base">카카오톡 @어울림비즈니스</span>
                  </div>
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
