import Header from "../components/Header";
import Footer from "../components/Footer";
import Image from "next/image";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.jpg" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-3xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">개인정보처리방침</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-900 leading-relaxed font-medium text-sm md:text-base space-y-10 md:space-y-16">
              <section>
                <p>&ldquo;어울림&rdquo;(이하 &lsquo;사이트&rsquo;)은 회원의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다. 사이트는 개인정보처리방침을 통하여 회원이 제공하는 개인정보가 어떠한 용도와 방식으로 이용되고 있으며, 개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.</p>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">1. 수집하는 개인정보 항목</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>사이트는 회원가입 및 원활한 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.</p>
                  <p className="font-bold underline decoration-brand-point/30">수집항목: 이름, 로그인ID, 비밀번호, 휴대전화번호, 이메일, 닉네임, 서비스 이용 기록, 접속 로그, 쿠키, 접속 IP 정보 등</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">2. 개인정보의 수집 및 이용목적</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>사이트는 수집한 개인정보를 다음의 목적을 위해 활용합니다.</p>
                  <ul className="list-disc pl-5 md:pl-6 space-y-3 md:space-y-4">
                    <li><span className="font-bold">서비스 제공:</span> 매칭파티 예약, 콘텐츠 제공, 본인 인증 등</li>
                    <li><span className="font-bold">회원 관리:</span> 회원제 서비스 이용에 따른 본인확인, 불량회원의 부정 이용 방지와 비인가 사용 방지, 가입 의사 확인, 불만 처리 등 민원 처리</li>
                    <li><span className="font-bold">마케팅 및 광고에 활용:</span> 신규 서비스 개발 및 맞춤 서비스 제공, 이벤트 및 광고성 정보 전달 및 참여 기회 제공</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">3. 개인정보의 보유 및 이용기간</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원의 개인정보는 원칙적으로 개인정보의 수집 및 이용목적이 달성되면 지체 없이 파기합니다. 단, 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 아래와 같이 일정 기간 보관합니다.</p>
                  <ul className="list-disc pl-5 md:pl-6 space-y-3 md:space-y-4">
                    <li><span className="font-bold">계약 또는 청약철회 등에 관한 기록:</span> 5년</li>
                    <li><span className="font-bold">소비자의 불만 또는 분쟁처리에 관한 기록:</span> 3년</li>
                    <li><span className="font-bold">방문에 관한 기록:</span> 3개월</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">4. 개인정보의 파기절차 및 방법</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p><span className="font-bold">파기절차:</span> 이용자가 회원가입 등을 위해 입력한 정보는 목적이 달성된 후 별도의 DB로 옮겨져 내부 방침 및 기타 관련 법령에 의한 정보보호 사유에 따라 일정 기간 저장된 후 파기됩니다.</p>
                  <p><span className="font-bold">파기방법:</span> 전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">5. 이용자 및 법정대리인의 권리와 그 행사방법</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며 가입해지(동의철회)를 요청할 수도 있습니다. 개인정보 관리책임자에게 서면, 전화 또는 이메일로 연락하시면 지체 없이 조치하겠습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">6. 개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>사이트는 이용자의 정보를 수시로 저장하고 찾아내는 &lsquo;쿠키(cookie)&rsquo; 등을 운용합니다. 이용자는 쿠키 설치에 대한 선택권을 가지고 있으며, 웹브라우저 설정을 통해 모든 쿠키를 허용하거나, 거부할 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">7. 개인정보 보호책임자</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여 아래와 같이 관련 부서 및 개인정보 보호책임자를 지정하고 있습니다.</p>
                  <p className="font-bold">개인정보 보호책임자: 어울림 운영자</p>
                  <p>문의처: 사이트 내 협업 및 제휴문의</p>
                </div>
              </section>

              <section className="bg-gray-50 p-5 md:p-8 rounded-xl md:rounded-2xl border border-gray-100">
                <h2 className="text-lg md:text-xl font-bold text-black mb-3 md:mb-4">부칙</h2>
                <p className="text-gray-700">본 방침은 사이트 개설일부터 시행합니다.</p>
              </section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
