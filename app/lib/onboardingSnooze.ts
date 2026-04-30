/**
 * 사용자가 [나중에 입력하기]를 선택한 경우, 같은 세션(탭)에서는
 * OnboardingGuard가 강제 redirect하지 않도록 하는 플래그.
 *
 *  - sessionStorage 사용 → 탭/창을 닫으면 자동 만료 ("오늘 다시 보지 않기" 수준의 행동 보호)
 *  - 로그아웃 / 핵심 정보 입력 완료 시 명시적 clear
 */
const KEY = "woollim_onboarding_snoozed";

export function snoozeOnboarding(): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(KEY, "1"); } catch {}
}

export function isOnboardingSnoozed(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function clearOnboardingSnooze(): void {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(KEY); } catch {}
}
