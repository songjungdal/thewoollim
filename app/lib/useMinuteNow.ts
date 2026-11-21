"use client";

import { useEffect, useState } from "react";

/**
 * 지금 시각 — 마운트 전(정적 HTML·첫 렌더)은 null, 마운트 뒤 1분마다 다시 읽는다.
 * 모집 마감(시작 30분 전 자동 마감 등)을 페이지를 열어 둔 채로도 1분 안에 반영하기 위해 쓴다
 * (docs/specs/party-recruit-close-cancel.md 3장). 메인(HomeClient)은 같은 방식의 now 를 따로 갖고 있다.
 */
export function useMinuteNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  return now;
}
