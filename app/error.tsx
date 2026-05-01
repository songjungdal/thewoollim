"use client";

/**
 * 라우트 세그먼트 ErrorBoundary.
 *  - layout 아래에서 발생한 예외를 캐치 (page / loading / nested 모두 포함)
 *  - layout 자체 / template 의 에러는 app/global-error.tsx 가 처리
 *
 * Next.js 16 API: { error, unstable_retry } — 'reset' 아님.
 */

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // 콘솔에 노출 — 사용자 신고 시 진단용
    // eslint-disable-next-line no-console
    console.error("[woollim] route error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-lightgray px-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 md:p-10 text-center">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-3">
          페이지를 표시하는 중 문제가 발생했습니다.
        </h1>
        <p className="text-sm md:text-base text-gray-500 font-medium mb-6 leading-relaxed">
          잠시 후 다시 시도해 주세요. 문제가 지속되면 새로고침하거나
          홈으로 이동해 주세요.
        </p>
        {error?.digest && (
          <p className="text-[11px] text-gray-400 font-mono mb-5">
            digest: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="flex-1 bg-brand-black text-white py-3.5 rounded-xl font-bold hover:bg-brand-point transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="flex-1 bg-white border-2 border-gray-200 text-gray-700 py-3.5 rounded-xl font-bold hover:border-brand-black hover:text-brand-black transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
