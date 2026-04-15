import Header from "../components/Header";
import Footer from "../components/Footer";
import { Star, Users, Zap } from "lucide-react";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.jpg" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">회사소개</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-base md:text-lg">
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-8 md:mb-10 tracking-tight leading-tight">세상을 울리는 새로운 연결,<br />어울림(The Woollim)입니다.</h2>
              <p className="mb-12 md:mb-20 text-gray-700">여기에 내용을 입력하세요. 어울림의 비전과 가치에 대한 설명을 입력하는 공간입니다. 우리는 숫자와 효율이 지배하는 세상에서 잃어버린 '진짜 연결'의 가치를 회복하고자 합니다.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14 md:mb-24">
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-brand-point/10 rounded-2xl flex items-center justify-center text-brand-point">
                    <Star size={24} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">감성적 연결</h3>
                  <p className="text-sm md:text-base">단순한 매칭을 넘어 서로의 색깔이 어우러지는 시간을 디자인합니다.</p>
                </div>
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-brand-point/10 rounded-2xl flex items-center justify-center text-brand-point">
                    <Users size={24} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">검증된 커뮤니티</h3>
                  <p className="text-sm md:text-base">신뢰할 수 있는 사람들이 모여 건강한 네트워킹 문화를 만들어갑니다.</p>
                </div>
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-brand-point/10 rounded-2xl flex items-center justify-center text-brand-point">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900">새로운 경험</h3>
                  <p className="text-sm md:text-base">일상의 지루함을 깨는 특별한 오프라인 이벤트를 제공합니다.</p>
                </div>
              </div>

              <div className="bg-brand-black text-white p-8 md:p-16 rounded-3xl md:rounded-[3rem]">
                <h3 className="text-xl md:text-3xl font-black mb-5 md:mb-8 leading-tight">어울림과 함께<br />당신의 세상을 넓혀보세요.</h3>
                <p className="text-gray-400 text-sm md:text-base mb-7 md:mb-10">우리는 더 많은 사람들이 진정성 있는 관계 속에서 행복을 찾기를 바랍니다.</p>
                <div className="w-full h-px bg-white/10 mb-7 md:mb-10"></div>
                <p className="text-xs md:text-sm font-bold tracking-widest text-brand-point">CORE VALUES: AUTHENTICITY, CONNECTION, EMOTION</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
