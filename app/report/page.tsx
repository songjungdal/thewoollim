import Header from "../components/Header";
import Footer from "../components/Footer";
import { ShieldAlert, UserCheck, Lock, Phone, Mail, MessageCircle } from "lucide-react";
import Image from "next/image";

export default function ReportPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.webp" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">문의 / 민원접수</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-base md:text-lg">
              <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-5 md:mb-6 tracking-tight">더 안전하고 원활한 소통을 함께 만들어갑니다.</h2>
              <p className="mb-10 md:mb-16 text-sm md:text-base">어울림은 회원의 편의와 신뢰를 최우선으로 생각합니다. 서비스 이용 중 궁금하신 점이나 불편한 사항, 또는 부적절한 언행 및 허위 정보에 대한 제보까지 언제든 편하게 상담해 주세요.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-12 md:mb-20">
                <div className="p-6 md:p-8 bg-gray-50 rounded-2xl md:rounded-3xl border border-gray-100">
                  <UserCheck className="text-brand-point mb-4 md:mb-6" size={28} />
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3">빠르고 정확한 안내</h3>
                  <p className="text-sm md:text-base">접수된 문의 및 민원 사항은 전담 운영팀에서 신속하고 공정하게 확인 후 답변을 드립니다.</p>
                </div>
                <div className="p-6 md:p-8 bg-gray-50 rounded-2xl md:rounded-3xl border border-gray-100">
                  <Lock className="text-brand-point mb-4 md:mb-6" size={28} />
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3">철저한 비밀 및 익명 보장</h3>
                  <p className="text-sm md:text-base">매너 위반 제보 및 민원 신고의 경우에는 상대방에게 공개되지 않으며 철저히 익명으로 처리됩니다.</p>
                </div>
                <div className="p-6 md:p-8 bg-gray-50 rounded-2xl md:rounded-3xl border border-gray-100">
                  <ShieldAlert className="text-brand-point mb-4 md:mb-6" size={28} />
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-3">신속한 문제 해결</h3>
                  <p className="text-sm md:text-base">서비스 불편 사항 개선부터 이용 규칙 위반에 대한 제재 조치까지 올바른 이용 환경 조성을 위해 엄격하게 대응합니다.</p>
                </div>
              </div>

              <div className="bg-brand-black text-white p-7 md:p-12 rounded-2xl md:rounded-[3rem]">
                <h3 className="text-xl md:text-2xl font-black mb-3 md:mb-4">문의 및 접수 채널</h3>
                <p className="text-gray-300 text-sm md:text-base mb-6 md:mb-8">궁금하신 점이나 불편 사항은 아래의 편하신 채널을 통해 문의해 주시기 바랍니다.</p>
                <ul className="space-y-3 md:space-y-4 text-sm md:text-base border-t border-white/10 pt-6 md:pt-8">
                  <li className="flex justify-between items-center gap-3">
                    <span className="flex items-center gap-2 text-gray-400"><Phone size={16} className="text-brand-point flex-shrink-0" />전화 문의</span>
                    <span className="font-bold text-right">031-602-9144</span>
                  </li>
                  <li className="flex justify-between items-center gap-3">
                    <span className="flex items-center gap-2 text-gray-400"><Mail size={16} className="text-brand-point flex-shrink-0" />이메일 문의</span>
                    <span className="font-bold text-right break-all">info@thewoollim.com</span>
                  </li>
                  <li className="flex justify-between items-center gap-3">
                    <span className="flex items-center gap-2 text-gray-400"><MessageCircle size={16} className="text-brand-point flex-shrink-0" />카카오톡 문의</span>
                    <span className="font-bold text-right">@어울림톡</span>
                  </li>
                </ul>
                <a href="https://pf.kakao.com/_racXX" target="_blank" rel="noopener noreferrer" className="inline-block mt-8 md:mt-12 w-full md:w-auto text-center bg-brand-point text-white px-8 md:px-10 py-4 rounded-xl font-bold hover:brightness-110 transition-all">
                  카카오톡으로 문의하기
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
