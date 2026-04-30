"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, isCoreProfileComplete } from "../context/AuthContext";
import { isOnboardingSnoozed, clearOnboardingSnooze } from "../lib/onboardingSnooze";

/**
 * 로그인했지만 필수 회원정보(이름/성별/생년월일/연락처/혼인여부)가
 * 아직 입력되지 않은 사용자를 /onboarding 으로 강제 redirect.
 *
 * 예외 경로 (redirect 대상 아님):
 *  - /onboarding 자체
 *  - /login (로그인 흐름)
 *  - /admin8888 계열 (관리자 영역)
 *  - /api 직접 호출 (있을 수 없지만 안전장치)
 *
 * 스누즈: 사용자가 /onboarding의 [나중에 입력하기]를 누르면 sessionStorage
 *        플래그가 설정되어 같은 세션 내 redirect는 일시 정지. 핵심 정보가
 *        실제로 채워지면 자동 해제.
 */
const ALLOW = (path: string): boolean =>
  path === "/onboarding"
  || path.startsWith("/onboarding/")
  || path === "/login"
  || path.startsWith("/login/")
  || path.startsWith("/admin8888")
  || path.startsWith("/api/");

export default function OnboardingGuard() {
  const { mounted, isLoggedIn, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    if (ALLOW(pathname)) return;

    // 핵심 정보가 채워지면 스누즈도 의미 없어지므로 정리
    if (isCoreProfileComplete(profile)) {
      clearOnboardingSnooze();
      return;
    }

    // 사용자가 명시적으로 "나중에" 선택한 세션이면 redirect 보류
    if (isOnboardingSnoozed()) return;

    // 미완 + 스누즈 X → 강제 이동
    router.replace("/onboarding");
  }, [mounted, isLoggedIn, profile, pathname, router]);

  return null;
}
