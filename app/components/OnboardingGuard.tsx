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
  || path.startsWith("/matching")   // 독립 매칭 투표/결과 흐름 — 세션 격리, 메인으로 튕기지 않음
  || path.startsWith("/api/");

export default function OnboardingGuard() {
  const { mounted, isLoggedIn, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!mounted || !isLoggedIn) return;
    if (ALLOW(pathname)) return;

    // ⚠️ profile === null 은 두 가지 의미:
    //   (a) 아직 서버 fetch 가 끝나지 않은 로딩 상태
    //   (b) 회원가입 직후 한 번도 저장된 적이 없는 신규 회원
    // 새로고침 시 (a) 케이스에서 잘못 redirect 되어 메인으로 튕기는 버그 방지를 위해
    // profile 이 null 인 동안에는 redirect 보류. AuthContext 가 localStorage hydration
    // 으로 거의 즉시 profile 을 채우므로, 정상 회원에게 onboarding 으로 보내져야 할
    // 시점에는 profile 이 null 이 아닐 가능성이 매우 높음.
    if (profile === null) return;

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
