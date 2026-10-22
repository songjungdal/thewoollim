import type { Metadata } from "next";
import PartyClientView from "./PartyClientView";
import JsonLd from "../../components/JsonLd";
import { getBuildTimeParties } from "../../lib/buildParties";
import { pageMetadata } from "../../lib/seo";
import { partyTitle, partyDescription, partyEventJsonLd } from "../../lib/partySeo";

// NextJS Static Routes generation (output: "export")
// 관리자가 신규 파티 생성 시에도 정적 라우트가 존재하도록 ID 1~500 사전 생성.
// 빌드 시점 실제 파티 id 가 그 범위 밖이면 함께 만든다. 라이브 데이터는 PartyClientView가 fetch로 보강.
export async function generateStaticParams() {
  const ids = new Set(Array.from({ length: 500 }, (_, i) => String(i + 1)));
  for (const p of (await getBuildTimeParties()) ?? []) {
    if (/^\d+$/.test(p.id)) ids.add(p.id);
  }
  return [...ids].map(id => ({ id }));
}

// 정적 내보내기에서는 미리 만든 경로만 제공한다 (Next 문서: static export 는 dynamicParams: true 미지원)
export const dynamicParams = false;

async function findParty(id: string) {
  return (await getBuildTimeParties())?.find(p => p.id === id);
}

/**
 * 빌드 시점 데이터에 있는 파티: "파티이름 | 날짜 장소 | 어울림 매칭파티/솔로파티" 제목·설명·canonical.
 * 없는 id(빈 번호·빌드 뒤 새로 만든 파티): 검색 결과에 넣지 않음(noindex).
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const party = await findParty(id);
  if (!party) {
    return pageMetadata({
      title: "매칭파티 상세 | 어울림",
      description: "어울림 매칭파티·솔로파티 상세 정보입니다.",
      path: `/party/${id}/`,
      noindex: true,
    });
  }
  // 공유 썸네일 — 상단이미지(16:9, 상세페이지 맨 위) 우선, 없으면 대표이미지(파티 카드), 둘 다 없으면 사이트 기본 이미지 (2026-10-22)
  const shareImage = party.heroImageUrl || party.imageUrl;
  return pageMetadata({
    title: partyTitle(party),
    description: partyDescription(party),
    path: `/party/${id}/`,
    image: shareImage ? { url: shareImage, alt: party.title } : undefined,
  });
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const party = await findParty(id);
  return (
    <>
      {party && <JsonLd data={partyEventJsonLd(party)} />}
      {/* 빌드 데이터에 이 파티가 있을 때만 넘긴다 — 없으면 화면이 열린 뒤 실시간 데이터로 찾는다 (불러오는 중 → 표시) */}
      <PartyClientView id={id} initialParties={party ? [party] : undefined} />
    </>
  );
}
