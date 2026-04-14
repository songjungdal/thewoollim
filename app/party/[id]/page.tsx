import PartyClientView from "./PartyClientView";

// NextJS Static Routes generation
export async function generateStaticParams() {
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' },
  ];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = await params;
  return <PartyClientView id={unwrappedParams.id} />;
}
