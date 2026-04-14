import Header from "../components/Header";
import Footer from "../components/Footer";
import { ShieldAlert, UserCheck, Lock } from "lucide-react";

export default function ReportPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-brand-lightgray py-24 px-6 border-b border-gray-100">
          <div className="max-w-4xl mx-auto pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8">신고센터</h1>
            <div className="w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-lg md:text-xl">
              <h2 className="text-3xl font-black text-gray-900 mb-6 tracking-tight">안전하고 정직한 네트워킹을 지향합니다.</h2>
              <p className="mb-16">여기에 내용을 입력하세요. 어울림은 모든 회원의 매너 있는 활동을 권장하며, 부적절한 언행이나 허위 정보 기재 등에 대해 단호하게 대응합니다. 신고 내용은 철저히 익명으로 처리됩니다.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100">
                  <Lock className="text-brand-point mb-6" size={32} />
                  <h3 className="text-xl font-bold text-gray-900 mb-4">완벽한 익명성</h3>
                  <p className="text-base">신고자의 신원은 어떠한 경우에도 피신고자에게 공개되지 않습니다.</p>
                </div>
                <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100">
                  <UserCheck className="text-brand-point mb-6" size={32} />
                  <h3 className="text-xl font-bold text-gray-900 mb-4">철저한 사실 확인</h3>
                  <p className="text-base">운영팀에서 양측의 의견을 종합적으로 검토하여 공정하게 판단합니다.</p>
                </div>
                <div className="p-8 bg-gray-50 rounded-3xl border border-gray-100">
                  <ShieldAlert className="text-brand-point mb-6" size={32} />
                  <h3 className="text-xl font-bold text-gray-900 mb-4">엄격한 패널티</h3>
                  <p className="text-base">사실로 확인될 경우 경고, 이용 정지, 영구 제명 등의 조치가 취해집니다.</p>
                </div>
              </div>

              <div className="bg-brand-black text-white p-12 rounded-[3rem]">
                <h3 className="text-2xl font-black mb-6">신고 프로세스</h3>
                <ol className="space-y-6 list-decimal pl-6 text-gray-300">
                  <li><strong>상담 및 접수:</strong> 고객센터 카카오 채널을 통해 사건을 접수합니다.</li>
                  <li><strong>운영팀 확인:</strong> 접수된 내용을 바탕으로 사실 관계를 파악합니다.</li>
                  <li><strong>소명 기회 제공:</strong> 필요 시 피신고자에게 소명 기회를 부여합니다.</li>
                  <li><strong>최종 결정:</strong> 운영 원칙에 따라 최종 징계 여부를 결정합니다.</li>
                </ol>
                <button className="mt-12 w-full md:w-auto bg-brand-point text-white px-10 py-4 rounded-xl font-bold hover:brightness-110 transition-all">
                  신고 접수하기 (카카오톡 연동)
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
