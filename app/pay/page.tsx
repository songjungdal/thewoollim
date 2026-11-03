import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "../lib/seo";
import PayClient from "./PayClient";

// 대관료 결제 링크 — 메뉴·사이트맵에 넣지 않고 검색에도 노출하지 않는다(robots.txt Disallow: /pay/). docs/specs/paylink.md 3장
export const metadata: Metadata = {
  ...pageMetadata({
    title: "결제 요청 | 어울림",
    description: "어울림 결제 요청 페이지입니다.",
    path: "/pay/",
    noindex: true,
  }),
  robots: { index: false, follow: false },
};

export default function PayPage() {
  return (
    <Suspense fallback={null}>
      <PayClient />
    </Suspense>
  );
}
