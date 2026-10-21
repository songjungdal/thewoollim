"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { XCircle } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { failMessageFor } from "../../lib/membership";

/** 카드 등록 창 닫기·인증 실패(토스 failUrl) 또는 첫 결제 실패 안내 (?code=&message=) */
export default function FailClient() {
  const sp = useSearchParams();
  const code = sp.get("code") ?? "";
  const message = failMessageFor(code, sp.get("message"));

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1">
        <div className="max-w-xl mx-auto px-4 py-10 md:py-16">
          <div className="bg-white rounded-2xl p-6 md:p-8 text-center" data-testid="membership-fail">
            <XCircle size={48} className="text-danger mx-auto mb-3" aria-hidden />
            <h1 className="text-2xl font-black mb-2 break-keep">멤버십 가입을 완료하지 못했습니다</h1>
            <p className="text-sm md:text-base text-gray-700 mb-1 break-keep" data-testid="fail-message">{message}</p>
            {code && <p className="text-xs text-gray-400 mb-6">오류 코드: {code}</p>}
            <p className="text-xs text-gray-500 mb-6 break-keep">결제가 이루어지지 않았다면 청구되지 않습니다.</p>
            <Link href="/membership/join/" className="block w-full bg-brand-black text-white font-black py-3.5 rounded-xl mb-3" data-testid="retry">다시 시도</Link>
            <Link href="/membership/" className="block w-full text-sm text-gray-600 underline py-2">멤버십 안내로 돌아가기</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
