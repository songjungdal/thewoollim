import PartyClientView from "./PartyClientView";

// NextJS Static Routes generation
// 관리자가 신규 파티 생성 시에도 정적 라우트가 존재하도록 ID 1~100 사전 생성.
// 라이브 데이터는 PartyClientView가 fetch로 보강.
export async function generateStaticParams() {
  return Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1) }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = await params;
  return <PartyClientView id={unwrappedParams.id} />;
}
