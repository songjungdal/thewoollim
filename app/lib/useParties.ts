"use client";

import { useEffect, useState } from "react";
import { normalizeParties } from "./partyNormalize";
import type { Party } from "./data";

const CHANNEL_NAME = "woollim_parties";
const STORAGE_KEY  = "woollim_parties_updated_at";

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
 * 아직 파티 데이터를 하나도 받지 못했다는 표시 (참조 비교용 빈 배열).
 * 정적 HTML·첫 화면에 예시 파티를 넣지 않기 위해 시드 데이터 대신 이 값으로 시작한다.
 * `parties === PARTIES_NOT_LOADED` 이면 "불러오는 중"으로 처리한다.
 */
export const PARTIES_NOT_LOADED: Party[] = [];

/**
 * 파티 데이터 라이브 fetch.
 *  - initial: 빌드 시점에 받은 실제 파티(서버 컴포넌트가 넘김). 없으면 PARTIES_NOT_LOADED 로 시작
 *  - 관리자 변경 → BroadcastChannel로 같은 브라우저 즉시 갱신
 *  - 다른 기기/브라우저는 10초 폴링 + focus / visibility / pageshow 이벤트로 갱신
 *  - 네트워크 실패 시 지금 값(빌드 시점 데이터 또는 불러오는 중)을 유지
 */
export function useParties(initial?: Party[]): Party[] {
  const [parties, setParties] = useState<Party[]>(initial ?? PARTIES_NOT_LOADED);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/parties.php", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then((data) => {
          if (cancelled || !Array.isArray(data)) return;
          const normalized = normalizeParties(data);
          // 빈 응답은 "불러오는 중"을 끝낼 때만 반영 — 이미 받은 목록이 일시적인 빈 응답으로 사라지지 않도록
          setParties(prev => (normalized.length === 0 && prev.length > 0 ? prev : normalized));
        })
        .catch(() => {});
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
