/**
 * 어울림 공통 시간 포맷터.
 *
 * 입력 가능 형식:
 *  - "2026-05-01 18:16:34"           (KST, offset 없음 — DB DATE_FORMAT, PHP date('Y-m-d H:i:s'))
 *  - "2026-05-01T18:16:34+09:00"     (ISO with offset — PHP date('c'))
 *  - "2026-05-01T09:16:34Z"          (UTC ISO)
 *  - "2026-05-01 09:16:34"           (legacy UTC, offset 없음 — admin_activity.json 마이그레이션 전 기록)
 *
 * 동작:
 *  - offset 명시된 경우: 그대로 파싱
 *  - offset 없는 경우: KST 로 가정 (서버 측 db.php 가 SET time_zone='+09:00' 적용 후로는 KST 보장)
 *  - sv-SE 로케일 + timeZone:'Asia/Seoul' → 'YYYY-MM-DD HH:mm:ss' 형식 안정적 출력
 *  - 잘못된 입력 → 원본 문자열 그대로 반환 (UI 깨짐 방지)
 */
export function formatKST(input: string | null | undefined): string {
  if (!input) return "-";
  const s = input.trim();
  if (s === "") return "-";

  const hasOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(s);
  const isoish = hasOffset
    ? s
    : s.replace(" ", "T") + "+09:00"; // offset 없는 입력은 KST 로 해석

  const d = new Date(isoish);
  if (isNaN(d.getTime())) return input;

  // sv-SE 로케일은 'YYYY-MM-DD HH:mm:ss' 형식을 보장 (ISO 8601 친화)
  // timeZone: 'Asia/Seoul' 로 브라우저 환경 무관 일관 출력
  return d.toLocaleString("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

/**
 * formatKST 의 짧은 버전 (날짜만, YYYY-MM-DD).
 * 회원 가입일 등 시각 불필요한 곳에서 사용.
 */
export function formatKSTDate(input: string | null | undefined): string {
  const full = formatKST(input);
  if (full === "-" || full === input) return full;
  return full.slice(0, 10);
}
