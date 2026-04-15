"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CreditCard, User, Phone, Mail, ShieldCheck } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import { PARTIES } from "../lib/data";

declare global {
  interface Window { PortOne?: any; }
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { mounted, isLoggedIn, userEmail } = useAuth();

  const partyId = searchParams.get("id");
  const party = PARTIES.find(p => p.id === partyId);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (mounted && !isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/checkout/?id=${partyId}`)}`);
    }
  }, [mounted, isLoggedIn, router, partyId]);

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <div className="font-bold text-lg">Loading...</div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-xl font-bold mb-4">파티를 찾을 수 없습니다.</p>
            <Link href="/#apply" className="text-brand-point underline font-bold">목록으로 돌아가기</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const handlePayment = async () => {
    if (!name.trim() || !phone.trim()) {
      alert("이름과 연락처를 입력해주세요.");
      return;
    }
    if (!agreed) {
      alert("결제 진행 동의 체크 후 결제하실 수 있습니다.");
      return;
    }
    if (!window.PortOne) {
      alert("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    try {
      const paymentId = `payment-${crypto.randomUUID()}`;
      const response = await window.PortOne.requestPayment({
        storeId: "store-49a37ad9-6f17-4952-b8ec-fbdc3ed0a6d0",
        channelKey: "channel-key-mock",
        paymentId,
        orderName: party.title,
        totalAmount: party.price,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          fullName: name,
          phoneNumber: phone,
          email: userEmail || "",
        },
      });
      if (response.code != null) {
        alert(`결제 실패: ${response.message}`);
      } else {
        alert("결제가 완료되었습니다!\n참여 확정 안내 문자가 순차적으로 발송됩니다.");
        router.push("/mypage");
      }
    } catch (error: any) {
      alert("테스트 결제 요청이 전송되었습니다. (" + error.message + ")");
    }
  };

  const inputClass = "w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point transition-all outline-none font-medium text-sm md:text-base";

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1 py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          <Link
            href={`/party/${party.id}`}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-7 font-bold transition-colors text-sm md:text-base"
          >
            <ArrowLeft size={16} /> 파티 상세로 돌아가기
          </Link>

          <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-8 md:mb-10">결제하기</h1>

          {/* Order Summary */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-gray-100 mb-5">
            <h2 className="font-black text-base md:text-lg mb-5">주문 요약</h2>
            <div className="space-y-3 text-sm md:text-base">
              {[
                { label: "파티명", value: party.title },
                { label: "일시", value: party.dateString },
                { label: "장소", value: party.location },
                { label: "대상", value: party.target },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-4">
                  <span className="text-gray-500 font-medium flex-shrink-0">{row.label}</span>
                  <span className="font-bold text-right">{row.value}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-3 mt-1 flex justify-between items-center gap-4">
                <span className="font-black text-base md:text-lg">최종 결제금액</span>
                <span className="font-black text-xl md:text-2xl text-brand-point">₩{party.price.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Applicant Info */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-gray-100 mb-5">
            <h2 className="font-black text-base md:text-lg mb-5 md:mb-6">신청자 정보</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">이름</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="text" placeholder="실명을 입력해주세요" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">연락처</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="tel" placeholder="010-0000-0000" className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">이메일</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input type="email" className={inputClass + " bg-gray-100 cursor-not-allowed"} value={userEmail || ""} readOnly />
                </div>
              </div>
            </div>
          </div>

          {/* Agreement */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 border border-gray-100 mb-6 md:mb-8">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 w-5 h-5 rounded accent-brand-point cursor-pointer flex-shrink-0"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
              />
              <span className="text-sm text-gray-600 font-medium leading-relaxed">
                위 주문 내용을 확인하였으며, 결제 진행에 동의합니다.{" "}
                <Link href="/refund" className="text-brand-point underline" target="_blank">환불규정</Link>을 확인했습니다.
              </span>
            </label>
          </div>

          <button
            onClick={handlePayment}
            className="w-full bg-brand-black text-white py-5 rounded-2xl font-black text-base md:text-xl hover:bg-brand-point transition-all shadow-xl hover:shadow-brand-point/30 flex items-center justify-center gap-3"
          >
            <CreditCard size={22} />
            ₩{party.price.toLocaleString()} 결제하기
          </button>

          <p className="text-center text-xs text-gray-400 font-medium mt-4 flex items-center justify-center gap-1.5">
            <ShieldCheck size={13} /> SSL 암호화 방식으로 안전하게 처리됩니다.
          </p>

        </div>
      </main>
      <Footer />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <div className="font-bold text-lg">Loading...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  );
}
