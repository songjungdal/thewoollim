import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import JsonLd from "./components/JsonLd";
import { getBuildTimeParties } from "./lib/buildParties";
import { partyVisibility } from "./lib/data";
import { pageMetadata, absoluteUrl, SITE_ORIGIN, SITE_NAME } from "./lib/seo";

/*
 * 메인 페이지 (서버 컴포넌트 — next build 때 한 번 실행돼 정적 HTML 을 만든다).
 *  - 빌드 시점 실제 파티를 HomeClient 에 넘겨 정적 HTML 에 실제 파티 카드가 들어가게 한다.
 *    조회에 실패하면 넘기지 않고, 파티 영역은 "불러오는 중"으로 만들어진다 (예시 파티는 넣지 않음).
 *  - 화면이 열린 뒤에는 HomeClient(useParties)가 실시간 데이터로 바꾼다.
 */

// 메인 제목·설명 — 다른 문구 안은 PR 설명에 정리 (선택 시 이 두 줄만 바꾸면 된다)
const HOME_TITLE = "어울림 | 로테이션 소개팅 매칭파티·솔로파티";
const HOME_DESCRIPTION =
  "어울림은 본인인증을 마친 회원끼리 1:1로 대화하는 로테이션 소개팅 매칭파티와 솔로파티를 엽니다. 짧은 시간에 여러 분을 직접 만나 보세요. 파티 일정 확인과 신청은 어울림에서.";

export const metadata: Metadata = pageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
});

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: "THEWOOLLIM",
  url: absoluteUrl("/"),
  logo: `${SITE_ORIGIN}/images/logo_black.png`,
  description: HOME_DESCRIPTION,
  sameAs: [
    "https://www.instagram.com/thewoollim_official/",
    "https://pf.kakao.com/_racXX",
  ],
};

export default async function Page() {
  const parties = await getBuildTimeParties();
  // 종료 후 오래 지나 메인에서 빠지는 파티는 정적 HTML 에도 넣지 않는다 (화면이 열린 뒤 규칙과 같음)
  const now = new Date();
  const initialParties = parties ? parties.filter(p => partyVisibility(p, now) !== "expired") : undefined;
  return (
    <>
      <JsonLd data={ORGANIZATION_JSON_LD} />
      <HomeClient initialParties={initialParties} />
    </>
  );
}
