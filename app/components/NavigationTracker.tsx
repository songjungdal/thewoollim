"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { noteNavigation } from "../lib/navHistory";

/**
 * 주소가 바뀔 때마다 사이트 안 이동을 기록한다 (app/lib/navHistory.ts).
 * useLayoutEffect 라서 새 화면의 일반 effect(useEffect)보다 먼저 기록된다 — 메인 화면이 "뒤로 돌아왔는지"를 바로 알 수 있게.
 */
export default function NavigationTracker() {
  const pathname = usePathname();
  useLayoutEffect(() => { noteNavigation(pathname); }, [pathname]);
  return null;
}
