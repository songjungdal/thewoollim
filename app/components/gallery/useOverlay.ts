"use client";

import { useEffect, useRef, type RefObject } from "react";

/*
 * 전체 화면 오버레이(전체 사진 보기 시트·라이트박스) 공통 동작. 오버레이가 화면에 있는 동안(마운트) 동작한다.
 *  - 페이지(body) 스크롤 잠금. 시트 위에 라이트박스가 겹쳐도 마지막 오버레이가 닫힐 때 풀린다.
 *  - Esc 로 닫기, Tab 포커스를 오버레이 안에서만 돌게 함. 겹쳐 있으면 맨 위 오버레이만 키에 반응한다.
 *  - 열릴 때 initialFocus 로 포커스, 닫히면 열기 직전에 포커스가 있던 곳(열었던 버튼)으로 되돌린다.
 */

const overlayStack: object[] = [];
let lockCount = 0;
let savedBody: { overflow: string; paddingRight: string } | null = null;

function lockBodyScroll() {
  if (lockCount++ > 0) return;
  const body = document.body;
  savedBody = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  // 스크롤바가 사라지며 화면이 옆으로 밀리지 않도록 그 폭만큼 오른쪽 여백을 둔다 (PC)
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function unlockBodyScroll() {
  if (--lockCount > 0 || !savedBody) return;
  document.body.style.overflow = savedBody.overflow;
  document.body.style.paddingRight = savedBody.paddingRight;
  savedBody = null;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlay(
  containerRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  onKeyDown?: (e: KeyboardEvent) => void,
) {
  // 키 처리 함수는 렌더마다 최신 값으로 — 아래 effect 는 열릴 때 한 번만 등록한다
  const handlers = useRef({ onClose, onKeyDown });
  useEffect(() => {
    handlers.current = { onClose, onKeyDown };
  });

  useEffect(() => {
    const token = {};
    overlayStack.push(token);
    lockBodyScroll();
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.current.onClose();
        return;
      }
      if (e.key === "Tab") {
        const box = containerRef.current;
        if (!box) return;
        const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !box.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !box.contains(active))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      handlers.current.onKeyDown?.(e);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      overlayStack.splice(overlayStack.indexOf(token), 1);
      unlockBodyScroll();
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [containerRef, initialFocusRef]);
}
