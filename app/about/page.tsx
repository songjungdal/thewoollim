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
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-8 md:mb-10 tracking-tight leading-tight">세상을 울리는 새로운 <span className="text-brand-point">연결</span>,<br />어울림(The Woollim)입니다.</h2>
              <p className="mb-12 md:mb-20 text-gray-700 leading-relaxed">
                어울림은 서로 다른 사람들이 자연스럽게 만나 특별한 인연이 되는
                <span className="font-bold text-gray-900"> 매칭 파티 플랫폼</span>입니다.
                우리는 숫자와 효율이 지배하는 세상에서 잃어버린
                <span className="font-bold text-gray-900"> '진짜 연결'</span>의 가치를 회복하고자 합니다.
              </p>

              {/* Logo Identity Section */}
              <div className="mb-14 md:mb-24">
                <div className="flex items-center gap-3 mb-6 md:mb-8">
                  <div className="w-1 h-5 md:h-6 bg-brand-point rounded-full"></div>
                  <h3 className="text-xs md:text-sm font-black tracking-[0.2em] text-brand-point uppercase">Brand Identity</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-10 items-stretch">
                  {/* Logo Box */}
                  <div className="md:col-span-2 bg-brand-lightgray border border-gray-100 rounded-3xl p-10 md:p-14 flex items-center justify-center aspect-[4/3] md:aspect-auto">
                    <Image
                      src="/images/logo_black.png"
                      alt="어울림 로고"
                      width={220}
                      height={72}
                      className="object-contain w-full max-w-[220px] h-auto"
                    />
                  </div>

                  {/* Description Box */}
                  <div className="md:col-span-3 bg-white border border-gray-100 rounded-3xl p-7 md:p-10 flex flex-col justify-center">
                    <h4 className="text-lg md:text-2xl font-black text-gray-900 mb-4 md:mb-5 leading-snug">
                      기분 좋은 <span className="text-brand-point">울림</span>을 시각화한 로고
                    </h4>
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed mb-5 md:mb-6">
                      사람과 사람 사이의 유연한
                      <span className="font-bold text-brand-point"> 연결</span>과 만남에서 시작되는
                      기분 좋은 <span className="font-bold text-brand-point">'울림'</span>을 시각화했습니다.
                      포인트 요소는 연결의 시작점과
                      <span className="font-bold text-brand-point"> 설렘</span>을 상징합니다.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "연결", desc: "사람과 사람 사이" },
                        { label: "울림", desc: "기분 좋은 여운" },
                        { label: "설렘", desc: "새로운 시작" },
                      ].map(k => (
                        <div key={k.label} className="flex items-center gap-1.5 bg-brand-point/10 border border-brand-point/20 px-3 py-1.5 rounded-full">
                          <span className="text-xs md:text-sm font-black text-brand-point">#{k.label}</span>
                          <span className="hidden md:inline text-xs text-gray-500 font-medium">· {k.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

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
