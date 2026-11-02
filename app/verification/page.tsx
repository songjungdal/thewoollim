import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "../lib/seo";
import VerificationClient from "./VerificationClient";

// 로그인 필요, 검색 노출 안 함, 사이트맵 제외(app/sitemap.ts 는 허용 목록 방식) — docs/specs/photo-job-verification.md 2-2
export const metadata: Metadata = pageMetadata({
  title: "사진 심사 · 직업 인증 | 어울림",
  description: "파티 신청 전 사진 심사와 선택 직업 인증을 신청합니다.",
  path: "/verification/",
  noindex: true,
});

export default function VerificationPage() {
  return (
    <Suspense fallback={null}>
      <VerificationClient />
    </Suspense>
  );
}
