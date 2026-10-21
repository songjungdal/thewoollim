import type { Metadata } from "next";
import { pageMetadata } from "../lib/seo";
import MembershipIntro from "./MembershipIntro";

// 심사용 상품 페이지 — 메인·메뉴·파티 화면에서 연결하지 않고, 검색엔진 색인·사이트맵에서도 뺀다.
export const metadata: Metadata = pageMetadata({
  title: "어울림 멤버십 | 어울림",
  description: "월 99,000원으로 조건에 맞는 매칭파티·솔로파티를 추가 참가비 없이 신청하는 어울림 멤버십입니다.",
  path: "/membership/",
  noindex: true,
});

export default function MembershipPage() {
  return <MembershipIntro />;
}
