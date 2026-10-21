import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "../../lib/seo";
import FailClient from "./FailClient";

export const metadata: Metadata = pageMetadata({
  title: "멤버십 가입 실패 | 어울림",
  description: "어울림 멤버십 카드 등록 또는 결제를 완료하지 못했습니다.",
  path: "/membership/fail/",
  noindex: true,
});

export default function MembershipFailPage() {
  return (
    <Suspense fallback={null}>
      <FailClient />
    </Suspense>
  );
}
