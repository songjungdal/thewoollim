import { normalizeParties } from "./partyNormalize";
import type { Party } from "./data";

/**
 * 빌드 시점(next build) 실제 파티 목록 — 서버 컴포넌트·generateMetadata·generateStaticParams 전용.
 *
 *  - sitemap.ts 와 같은 운영 API(/api/parties.php)를 읽는다 (읽기 전용 GET).
 *    PARTIES_API_URL 이 있으면 그 주소를 쓴다 (빌드 검증용).
 *  - 실패하면 null — 호출하는 쪽은 예시 파티 대신 "불러오는 중"(빈 목록)으로 정적 HTML 을 만든다.
 *  - 페이지가 수백 개라 같은 빌드 프로세스 안에서는 한 번만 요청한다.
 *  - 화면이 열린 뒤에는 useParties 가 실시간 데이터로 다시 바꾼다.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://thewoollim.com").replace(/\/+$/, "");
const PARTIES_API_URL = process.env.PARTIES_API_URL || `${SITE_URL}/api/parties.php`;

let cached: Promise<Party[] | null> | null = null;

export function getBuildTimeParties(): Promise<Party[] | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(PARTIES_API_URL, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) {
          console.warn(`[build-parties] HTTP ${res.status} — 파티 없이(불러오는 중) 정적 HTML 생성`);
          return null;
        }
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          console.warn("[build-parties] 응답이 배열이 아님 — 파티 없이(불러오는 중) 정적 HTML 생성");
          return null;
        }
        const parties = normalizeParties(data);
        console.log(`[build-parties] 실제 파티 ${parties.length}건으로 정적 HTML 생성`);
        return parties;
      } catch (e) {
        console.warn(`[build-parties] 조회 실패(${e instanceof Error ? e.message : String(e)}) — 파티 없이(불러오는 중) 정적 HTML 생성`);
        return null;
      }
    })();
  }
  return cached;
}
