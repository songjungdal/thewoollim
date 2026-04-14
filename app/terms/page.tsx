import Header from "../components/Header";
import Footer from "../components/Footer";

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-brand-lightgray py-24 px-6 border-b border-gray-100">
          <div className="max-w-4xl mx-auto pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8">이용약관</h1>
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
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">제 1조 (목적)</h2>
                  <ul className="list-disc pl-6 space-y-4">
                    <li>본 약관은 어울림 서비스의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</li>
                    <li>서비스 이용자는 본 약관에 동의함으로써 서비스를 이용할 수 있습니다.</li>
                    <li>약관의 상세 내용은 추후 업데이트될 예정입니다.</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">제 2조 (서비스의 제공)</h2>
                  <ul className="list-disc pl-6 space-y-4">
                    <li>어울림은 오프라인 네트워킹 및 매칭 파티 서비스를 제공합니다.</li>
                    <li>회원은 정해진 절차에 따라 파티 참여를 신청할 수 있습니다.</li>
                    <li>모든 서비스는 운영 정책에 따라 변경될 수 있습니다.</li>
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
