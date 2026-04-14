import Header from "../components/Header";
import Footer from "../components/Footer";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-brand-lightgray py-24 px-6 border-b border-gray-100">
          <div className="max-w-4xl mx-auto pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8">개인정보처리방침</h1>
            <div className="w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-lg md:text-xl">
              <p className="mb-12 text-gray-900 font-bold">여기에 내용을 입력하세요.</p>
              
              <div className="space-y-16">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">1. 개인정보의 수집 항목</h2>
                  <ul className="list-disc pl-6 space-y-4">
                    <li>수집 항목: 이름, 이메일, 연락처, 본인인증 정보 등</li>
                    <li>수집 목적: 서비스 제공, 본인 확인, 고객 상담 및 마케팅 활용</li>
                    <li>보유 기간: 서비스 탈퇴 시까지 또는 법령에 정한 기간까지</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">2. 개인정보의 제3자 제공</h2>
                  <ul className="list-disc pl-6 space-y-4">
                    <li>어울림은 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.</li>
                    <li>다만, 이용자의 사전 동의가 있거나 법령의 규정에 의거한 경우 예외로 합니다.</li>
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
