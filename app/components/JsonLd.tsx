import { jsonLdHtml } from "../lib/seo";

/** 구조화 데이터(JSON-LD) — 서버 컴포넌트에서 정적 HTML 에 그대로 넣는다 */
export default function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
