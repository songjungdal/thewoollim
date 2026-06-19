import Header from "../components/Header";
import Footer from "../components/Footer";
import Image from "next/image";

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-14 md:py-24 px-4 md:px-6 border-b border-gray-100">
          <Image src="/images/sub-hero-bg.webp" alt="" fill className="object-cover object-center" />
          <div className="absolute inset-0 bg-white/75" />
          <div className="relative z-10 max-w-4xl mx-auto pt-6 md:pt-10">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-5 md:mb-8">이용약관</h1>
            <div className="w-20 md:w-24 h-1.5 bg-brand-point rounded-full"></div>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-12 md:py-24 px-4 md:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-gray-900 leading-relaxed font-medium text-sm md:text-base space-y-10 md:space-y-16">
              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제1조 목적</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>본 이용약관은 &ldquo;어울림&rdquo;(이하 &ldquo;사이트&rdquo;)이 제공하는 서비스의 이용조건과 운영에 관한 제반 사항 규정을 목적으로 합니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제2조 용어의 정의</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>본 약관에서 사용되는 주요한 용어의 정의는 다음과 같습니다.</p>
                  <ul className="list-disc pl-5 md:pl-6 space-y-3 md:space-y-4">
                    <li><span className="font-bold">회원:</span> 사이트의 약관에 동의하고 개인정보를 제공하여 회원등록을 한 자로서, 사이트와의 이용계약을 체결하고 서비스를 이용하는 이용자를 말합니다.</li>
                    <li><span className="font-bold">이용계약:</span> 사이트 이용과 관련하여 사이트와 회원 간에 체결하는 계약을 말합니다.</li>
                    <li><span className="font-bold">회원 아이디(이하 &ldquo;ID&rdquo;):</span> 회원의 식별과 서비스 이용을 위하여 회원별로 부여하는 고유한 문자와 숫자의 조합을 말합니다.</li>
                    <li><span className="font-bold">비밀번호:</span> 회원이 부여받은 ID와 일치된 회원임을 확인하고 회원의 권익 보호를 위하여 회원이 선정한 문자와 숫자의 조합을 말합니다.</li>
                    <li><span className="font-bold">운영자:</span> 서비스 웹사이트를 개설하여 운영하는 주체를 말합니다.</li>
                    <li><span className="font-bold">해지:</span> 회원이 이용계약을 해약하는 것을 말합니다.</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제3조 약관 외 준칙</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>운영자는 필요한 경우 별도로 운영정책을 공지 및 안내할 수 있으며, 본 약관과 운영정책이 중첩될 경우 운영정책이 우선 적용됩니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제4조 이용계약 체결</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>이용계약은 회원으로 등록하여 사이트를 이용하려는 자의 본 약관 내용에 대한 동의와 가입신청에 대하여 운영자의 이용승낙으로 성립합니다.</p>
                  <p>회원으로 등록하여 서비스를 이용하려는 자는 사이트 가입신청 시 본 약관을 읽고 &ldquo;동의합니다&rdquo;를 선택하는 것으로 의사 표시를 대신합니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제5조 서비스 이용 신청</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원으로 등록하여 사이트를 이용하려는 이용자는 사이트에서 요청하는 제반정보(이용자ID, 비밀번호, 닉네임 등)를 제공해야 합니다.</p>
                  <p>타인의 정보를 도용하거나 허위의 정보를 등록하는 등 본인의 진정한 정보를 등록하지 않은 회원은 사이트 이용과 관련하여 아무런 권리를 주장할 수 없으며, 관계 법령에 따라 처벌받을 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제6조 개인정보처리방침</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>사이트 및 운영자는 회원의 비밀번호를 직접 보유하지 않으며, 개인정보와 관련된 사항은 사이트의 개인정보처리방침을 따릅니다.</p>
                  <p>운영자는 관계 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위하여 노력합니다.</p>
                  <p>단, 회원의 귀책 사유로 인해 노출된 정보에 대해 운영자는 일체의 책임을 지지 않습니다.</p>
                  <p>운영자는 회원이 위법한 게시물을 등록·배포할 경우 관련 기관의 요청이 있을 시 관련 자료를 제출할 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제7조 운영자의 의무</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>운영자는 이용회원의 의견이나 불만이 정당하다고 인정될 경우 신속히 처리하여야 합니다.</p>
                  <p>운영자는 계속적이고 안정적인 서비스 제공을 위하여 설비 장애 시 지체 없이 수리 또는 복구할 수 있도록 최선을 다합니다. 단, 천재지변이나 부득이한 사유가 있는 경우 서비스 운영을 일시 정지할 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제8조 회원의 의무</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원은 약관, 운영정책, 공지사항 및 관계 법령을 준수하여야 하며, 사이트의 명예를 손상하거나 업무에 방해가 되는 행위를 해서는 안 됩니다.</p>
                  <p>회원은 이용 권한 및 계약상 지위를 타인에게 양도, 증여하거나 담보로 제공할 수 없습니다.</p>
                  <p>회원은 아이디 및 비밀번호 관리에 상당한 주의를 기울여야 하며, 제3자에게 아이디를 제공하여 이용하게 할 수 없습니다.</p>
                  <p>회원은 운영자 및 제3자의 지적 재산권을 침해해서는 안 됩니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제9조 서비스 이용 시간 및 중단</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>서비스는 1일 24시간 운영을 원칙으로 하나, 시스템 점검 및 교체 등을 위해 서비스를 일시 중단할 수 있습니다. 이 경우 사전에 공지합니다.</p>
                  <p>국가비상사태, 정전, 천재지변, 서비스 이용 폭주 등 불가항력적인 사유가 발생한 경우 사전 예고 없이 서비스를 중단할 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제10조 서비스 이용 해지 및 제한</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원이 이용계약을 해지하고자 할 때는 본인이 온라인을 통해 직접 등록해지 신청을 해야 합니다.</p>
                  <p>다음 각호의 행위를 한 경우 운영자는 서비스 이용을 제한하거나 계약을 해지할 수 있습니다.</p>
                  <ul className="list-disc pl-5 md:pl-6 space-y-3 md:space-y-4">
                    <li>타인의 정보를 도용하거나 허위 내용을 등록한 경우</li>
                    <li>사이트 운영진 및 관계자를 사칭하는 행위</li>
                    <li>제3자의 지적재산권을 침해하거나 업무를 방해하는 행위</li>
                    <li>범죄와 결부된다고 판단되는 행위 및 기타 관련 법령 위반 시</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제11조 게시물의 관리 및 저작권</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회원이 게시한 게시물의 저작권은 게시자 본인에게 귀속됩니다.</p>
                  <p>운영자는 상업적 목적이 아닌 경우 회원의 게시물을 서비스 내에 게재할 권리를 갖습니다.</p>
                  <p>타인의 명예훼손, 음란물 유포, 저작권 침해 등 불량 게시물에 대해서 운영자는 사전 통보 없이 삭제하거나 이동할 수 있습니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제12조 손해배상 및 면책</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>사이트 내에서 발생하는 민·형사상 책임은 1차적으로 회원 본인에게 있습니다.</p>
                  <p>운영자는 천재지변, 통신 장애, 회원의 귀책 사유로 인한 서비스 이용 장애에 대해서는 책임을 지지 않습니다.</p>
                  <p>운영자는 회원 간 혹은 회원과 제3자 간의 서비스 매개 물품 거래 및 분쟁에 대하여 개입하지 않으며 책임을 지지 않습니다.</p>
                  <p>제3자의 공격이나 컴퓨터 바이러스 등 운영자가 통제할 수 없는 불가항력적 사유로 인한 손해에 대해서는 면책됩니다.</p>
                </div>
              </section>

              <section>
                <h2 className="text-xl md:text-2xl font-black text-black mb-4 md:mb-6">제13조 쿠폰 및 포인트</h2>
                <div className="space-y-3 md:space-y-4 text-gray-800">
                  <p>회사는 이벤트, 구매 후기 작성 등에 따라 쿠폰 및 포인트를 발급할 수 있습니다.</p>
                  <p>쿠폰과 포인트는 명시된 유효기간 내에만 사용 가능하며, 회원 탈퇴 시 자동으로 소멸됩니다.</p>
                  <p>회사는 혜택 부여 및 만료 안내를 위해 SMS, 알림톡 등의 수단으로 통지할 수 있습니다.</p>
                </div>
              </section>

              <section className="bg-gray-50 p-5 md:p-8 rounded-xl md:rounded-2xl border border-gray-100">
                <h2 className="text-lg md:text-xl font-bold text-black mb-3 md:mb-4">부칙</h2>
                <p className="text-gray-700">이 약관은 사이트 개설일부터 시행합니다.</p>
              </section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
