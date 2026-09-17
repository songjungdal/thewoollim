"use client";

import { useEffect, useState } from "react";
import { PARTIES as DEFAULT_PARTIES, TARGET_GROUPS, THEMES, LOCATION_TAGS, type Party, type TargetGroup, type Theme, type LocationTag } from "./data";

const CHANNEL_NAME = "woollim_parties";
const STORAGE_KEY  = "woollim_parties_updated_at";

// 파티 라이브 데이터의 "최초 1회 fetch 시도"가 끝났는지(성공/실패 무관) 여부.
// useParties() 는 빌드 시점 디폴트(샘플 8건)로 먼저 렌더된 뒤 실제 데이터로 교체되는데,
// 이 최초 fetch 가 끝나기 전엔 실제로 존재하는 파티도 디폴트 목록에 없어 "찾을 수 없음"으로
// 오판될 수 있다. useParties() 자체의 시그니처/동작은 전혀 바꾸지 않는 순수 추가 기능.
let partiesFirstLoadSettled = false;
const partiesFirstLoadListeners = new Set<() => void>();
function notifyPartiesFirstLoadSettled() {
  if (partiesFirstLoadSettled) return;
  partiesFirstLoadSettled = true;
  partiesFirstLoadListeners.forEach(fn => fn());
}
export function usePartiesLoaded(): boolean {
  const [loaded, setLoaded] = useState(partiesFirstLoadSettled);
  useEffect(() => {
    if (partiesFirstLoadSettled) { setLoaded(true); return; }
    const listener = () => setLoaded(true);
    partiesFirstLoadListeners.add(listener);
    return () => { partiesFirstLoadListeners.delete(listener); };
  }, []);
  return loaded;
}

/**
 * 같은 브라우저 내 다른 탭에서 즉시 갱신 트리거.
 * 두 가지 메커니즘을 함께 사용해 신뢰성 확보:
 *   1) BroadcastChannel (현대 브라우저, 동일 origin 다른 탭에 즉시 push)
 *   2) localStorage write (storage 이벤트 — BroadcastChannel 미지원 환경 fallback)
 */
export function broadcastPartiesUpdated() {
  const now = String(Date.now());
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: "updated", at: now });
    ch.close();
  } catch {}
  try {
    localStorage.setItem(STORAGE_KEY, now);
  } catch {}
}

/**
 * 파티 데이터 라이브 fetch.
 *  - 관리자 변경 → BroadcastChannel로 같은 브라우저 즉시 갱신
 *  - 다른 기기/브라우저는 10초 폴링 + focus / visibility / pageshow 이벤트로 갱신
 *  - 네트워크 실패 시 빌드 시점 디폴트로 폴백
 */
export function useParties(): Party[] {
  const [parties, setParties] = useState<Party[]>(DEFAULT_PARTIES);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/parties.php", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then((data) => {
          if (cancelled || !Array.isArray(data) || data.length === 0) return;
          const normalized: Party[] = data.map((p: any) => {
            const ams = p.allowedMaritalStatus;
            return {
              id:           String(p.id ?? ""),
              title:        String(p.title ?? ""),
              dateString:   String(p.dateString ?? ""),
              calendarDate: String(p.calendarDate ?? ""),
              location:     String(p.location ?? ""),
              target:       String(p.target ?? ""),
              price:        Number(p.price ?? 0),
              priceMale:    p.priceMale   != null && p.priceMale   !== "" ? Number(p.priceMale)   : undefined,
              priceFemale:  p.priceFemale != null && p.priceFemale !== "" ? Number(p.priceFemale) : undefined,
              tag:          String(p.tag ?? "주제별"),
              maleStock:    Number(p.maleStock ?? 12),
              femaleStock:  Number(p.femaleStock ?? 12),
              maleBooked:   Number(p.maleBooked ?? 0),
              femaleBooked: Number(p.femaleBooked ?? 0),
              // 콘텐츠 필드 (관리자 입력)
              description:  typeof p.description === "string" ? p.description : "",
              imageUrl:     typeof p.imageUrl    === "string" ? p.imageUrl    : "",
              // 자격 제한
              minAge:       p.minAge != null && p.minAge !== "" ? Number(p.minAge) : undefined,
              maxAge:       p.maxAge != null && p.maxAge !== "" ? Number(p.maxAge) : undefined,
              allowedMaritalStatus: (ams === "싱글" || ams === "돌싱") ? ams : "all",
              // 카테고리 (화이트리스트 매칭 — 잘못된 값은 undefined로 폴백)
              targetGroup: TARGET_GROUPS.includes(p.targetGroup as TargetGroup) ? (p.targetGroup as TargetGroup) : undefined,
              theme:       THEMES.includes(p.theme as Theme)                   ? (p.theme       as Theme)       : undefined,
              locationTag: LOCATION_TAGS.includes(p.locationTag as LocationTag) ? (p.locationTag as LocationTag) : undefined,
            };
          });
          setParties(normalized);
        })
        .catch(() => {})
        .finally(() => notifyPartiesFirstLoadSettled());
    };

    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", onVis);

    // 관리자 저장 즉시 알림 수신 (1) BroadcastChannel
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener("message", load);
    } catch {}

    // (2) localStorage storage 이벤트 — BroadcastChannel 미지원 / 사파리 일부 버전 fallback
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) load(); };
    window.addEventListener("storage", onStorage);

    const interval = setInterval(load, 10000); // 10초 폴링 (다기기 fallback)

    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
      try { channel?.removeEventListener("message", load); channel?.close(); } catch {}
      clearInterval(interval);
    };
  }, []);

  return parties;
}
