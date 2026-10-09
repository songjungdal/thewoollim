import PartyClientView from "./PartyClientView";

// NextJS Static Routes generation (output: "export")
// 관리자가 신규 파티 생성 시에도 정적 라우트가 존재하도록 ID 1~500 사전 생성.
// 라이브 데이터는 PartyClientView가 fetch로 보강.
export async function generateStaticParams() {
  return Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1) }));
}

// 정적 내보내기에서는 미리 만든 경로만 제공한다 (Next 문서: static export 는 dynamicParams: true 미지원)
export const dynamicParams = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = await params;
  return <PartyClientView id={unwrappedParams.id} />;
}
