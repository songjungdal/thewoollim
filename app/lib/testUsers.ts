/**
 * 테스트 회원 식별 유틸 (프론트엔드).
 *
 * 패턴: a1@naver.com ~ a20@naver.com / b1@naver.com ~ b20@naver.com (번호 앞 0 은 인정하지 않음)
 *  - 자격검증·결제·취소 등 정상 흐름은 그대로 통과
 *  - 추가 권한: 프로필 핵심 5종(이름·성별·연락처·생년월일·혼인여부) 자유 수정
 *
 * 서버측 동일 로직: api/lib.php  isTestUser($email) — 범위를 바꿀 때는 TEST_USER_MAX 를 함께 고친다.
 */

export const TEST_USER_MAX = 20;

const TEST_EMAIL_RE = /^[ab]([1-9]\d*)@naver\.com$/;

export function isTestUser(email: string | null | undefined): boolean {
  if (!email) return false;
  const m = TEST_EMAIL_RE.exec(email.trim().toLowerCase());
  return !!m && Number(m[1]) <= TEST_USER_MAX;
}
