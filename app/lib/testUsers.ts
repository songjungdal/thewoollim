/**
 * 테스트 회원 식별 유틸 (프론트엔드).
 *
 * 패턴: a1@naver.com ~ a10@naver.com / b1@naver.com ~ b10@naver.com
 *  - 자격검증·결제·취소 등 정상 흐름은 그대로 통과
 *  - 추가 권한: 프로필 핵심 5종(이름·성별·연락처·생년월일·혼인여부) 자유 수정
 *
 * 서버측 동일 로직: api/lib.php  isTestUser($email)
 */

const TEST_EMAIL_RE = /^(a|b)([1-9]|10)@naver\.com$/i;

export function isTestUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_EMAIL_RE.test(email.trim().toLowerCase());
}
