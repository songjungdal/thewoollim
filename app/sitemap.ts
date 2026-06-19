import type { MetadataRoute } from "next";
import { partyVisibility, type Party } from "./lib/data";

/**
 * 어울림 sitemap.xml
 *
 * 정적 익스포트(output: "export") 환경이므로 이 파일은 `next build` 시점에 1회 실행되어
 * out/sitemap.xml 로 정적 생성된다. (런타임 동적 생성 아님)
 *
 *  - 공개 정적 경로: 메인/회사소개/환불규정 등 색인 대상만 포함
 *  - 파티 상세(/party/[id]): 빌드 시점에 운영 API(/api/parties.php)를 조회하여
 *    "활성(active)" 상태인 파티 경로만 자동 포함 (행사 종료/만료분 제외)
 *  - 보안 경로(/admin8888, /matching/results, /matching/results/admin8888)는 절대 포함하지 않음
 *
 * trailingSlash: true 설정에 맞춰 모든 loc 는 슬래시(/)로 끝낸다.
 */

// 정적 익스포트(output: "export")에서는 sitemap 라우트가 정적이어야 한다.
// 빌드 시점에 1회 조회 후 out/sitemap.xml 로 고정 생성한다.
export const dynamic = "force-static";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://thewoollim.com").replace(/\/+$/, "");

// 색인 허용할 공개 정적 경로 (관리자/결제/마이페이지/투표 등 비공개·트랜잭션 경로는 제외)
const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/",            priority: 1.0, changeFrequency: "daily" },
  { path: "/about",       priority: 0.8, changeFrequency: "monthly" },
  { path: "/refund",      priority: 0.5, changeFrequency: "yearly" },
  { path: "/terms",       priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy",     priority: 0.5, changeFrequency: "yearly" },
  { path: "/partnership", priority: 0.6, changeFrequency: "monthly" },
  { path: "/report",      priority: 0.4, changeFrequency: "yearly" },
  { path: "/support",     priority: 0.5, changeFrequency: "monthly" },
];

/** 빌드 시점에 활성 파티 id 목록을 운영 API 에서 가져온다. 실패해도 빌드가 깨지지 않도록 best-effort. */
async function fetchActivePartyIds(): Promise<string[]> {
  try {
    const res = await fetch(`${SITE_URL}/api/parties.php`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((p): p is Party =>
        !!p && typeof p === "object" &&
        partyVisibility(p as Pick<Party, "calendarDate" | "dateString">) === "active"
      )
      .map((p) => String((p as { id: unknown }).id ?? ""))
      .filter((id) => id !== "");
  } catch {
    // 네트워크/파싱 실패 시 파티 경로는 생략하고 정적 경로만으로 sitemap 생성
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((s) => ({
    url: `${SITE_URL}${s.path === "/" ? "/" : `${s.path}/`}`,
    lastModified: now,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }));

  const partyIds = await fetchActivePartyIds();
  const partyEntries: MetadataRoute.Sitemap = partyIds.map((id) => ({
    url: `${SITE_URL}/party/${id}/`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticEntries, ...partyEntries];
}
