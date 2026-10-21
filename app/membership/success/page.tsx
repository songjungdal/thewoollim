import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "../../lib/seo";
import SuccessClient from "./SuccessClient";

export const metadata: Metadata = pageMetadata({
  title: "멤버십 가입 완료 | 어울림",
  description: "어울림 멤버십 카드 등록과 첫 결제 결과입니다.",
  path: "/membership/success/",
  noindex: true,
});

export default function MembershipSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessClient />
    </Suspense>
  );
}
