"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * 한 줄 배치를 줄바꿈 없이 칸 폭에 맞춘다 — 내용이 칸보다 넓으면 통째로 작게(CSS zoom) 줄이고, 들어가면 원래 크기 그대로.
 * 파티 상세 정보 패널(모바일)의 할인 참가비 줄에 쓴다: 320px 폰이나 10만 원 이상 금액에서도
 * [성별 | 정가→ | 할인가 | 배지] 가 줄바꿈되거나 패널 밖으로 나가지 않게 (docs/specs/party-discount-rate.md 12장).
 * 칸이 숨겨져 폭이 0이면(md 이상) 아무것도 하지 않는다.
 */
export default function FitWidth({ children, className = "", testId }: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const fit = () => {
    const outer = outerRef.current, inner = innerRef.current;
    if (!outer || !inner) return;
    inner.style.zoom = "1";
    const natural = inner.scrollWidth;
    const avail = outer.clientWidth;
    inner.style.zoom = avail > 0 && natural > avail ? String(Math.floor((avail / natural) * 1000) / 1000) : "1";
  };

  // 내용(금액)이 바뀔 때마다 다시 맞춘다 — 그리기 전에 맞춰 깜빡임이 없게
  useLayoutEffect(fit);

  // 칸 폭이 바뀌거나(화면 회전) 글꼴을 다 받은 뒤에도 다시 맞춘다
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(outer);
    document.fonts?.ready.then(() => fit()).catch(() => {});
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={`min-w-0 ${className}`} data-testid={testId}>
      <div ref={innerRef} className="w-max">{children}</div>
    </div>
  );
}
