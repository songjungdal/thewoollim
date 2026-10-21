import type { Metadata } from "next";
import { pageMetadata } from "../../lib/seo";
import JoinClient from "./JoinClient";

export const metadata: Metadata = pageMetadata({
  title: "멤버십 가입 | 어울림",
  description: "어울림 멤버십 카드 등록과 첫 결제를 진행합니다.",
  path: "/membership/join/",
  noindex: true,
});

export default function MembershipJoinPage() {
  return <JoinClient />;
}
