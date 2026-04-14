import Header from "../components/Header";
import Footer from "../components/Footer";
import { Mail, MessageCircle, Phone } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-brand-lightgray py-24 px-6 border-b border-gray-100">
          <div className="max-w-4xl mx-auto pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-8">고객센터 / 문의하기</h1>
            <div className="w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-24 px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-600 leading-relaxed font-medium text-lg md:text-xl">
              <p className="mb-16 text-gray-900 font-bold">궁금한 점이 있으신가요? 어울림 고객센터가 도와드리겠습니다.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
                <div className="p-8 rounded-3xl bg-gray-50 border border-gray-100 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                    <MessageCircle className="text-brand-point" size={28} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-3">카카오톡 채널</h3>
                  <p className="mb-6 font-semibold">@어울림</p>
                  <a href="#" className="bg-brand-black text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-brand-point transition-colors">상담 시작하기</a>
                </div>

                <div className="p-8 rounded-3xl bg-gray-50 border border-gray-100 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                    <Mail className="text-brand-point" size={28} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-3">이메일 문의</h3>
                  <p className="mb-6 font-semibold">support@thewoollim.com</p>
                  <a href="mailto:support@thewoollim.com" className="bg-brand-black text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-brand-point transition-colors">메일 보내기</a>
                </div>
              </div>

              <div>
                <h2 className="text-3xl font-black text-gray-900 mb-10 tracking-tight">여기에 내용을 입력하세요 (자주 묻는 질문)</h2>
                <ul className="space-y-6">
                  <li className="p-6 border-b border-gray-100">
                    <strong className="block text-gray-900 mb-2 font-black">Q. 매칭파티 참여는 어떻게 하나요?</strong>
                    <p>A. 홈페이지의 참여하기 섹션에서 원하는 파티를 선택하여 신청하실 수 있습니다.</p>
                  </li>
                  <li className="p-6 border-b border-gray-100">
                    <strong className="block text-gray-900 mb-2 font-black">Q. 환불 규정이 어떻게 되나요?</strong>
                    <p>A. 파티 진행일 기준 5일 전까지는 100% 환불이 가능합니다.</p>
                  </li>
                  <li className="p-6">
                    <strong className="block text-gray-900 mb-2 font-black">Q. 본인인증이 안 됩니다.</strong>
                    <p>A. 고객센터 카카오톡 채널로 문의주시면 빠르게 해결해 드리겠습니다.</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
