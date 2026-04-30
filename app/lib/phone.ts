/**
 * 한국 전화번호 표시용 포맷터.
 * DB에는 숫자만 저장되어도, 하이픈 포함이어도, 또는 일부 비표준 입력이어도
 * 가능한 경우 표준 형식으로 정규화하여 반환한다.
 *
 *  휴대폰: 010-1234-5678 / 011-123-4567 (구형 10자리)
 *  서울:   02-1234-5678 / 02-123-4567
 *  기타:   031-1234-5678 / 031-123-4567
 *
 * 인식할 수 없는 길이/패턴이면 원본을 그대로 반환 (정보 손실 방지).
 */
export function formatPhoneKR(raw?: string | null): string {
  if (!raw) return "-";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "-";

  // 휴대폰 (010, 011, 016~019)
  if (/^01[016789]/.test(digits)) {
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3");
    if (digits.length === 10) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
  }
  // 서울 (02)
  if (/^02/.test(digits)) {
    if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "$1-$2-$3");
    if (digits.length === 9)  return digits.replace(/^(\d{2})(\d{3})(\d{4})$/, "$1-$2-$3");
  }
  // 그 외 지역번호 (031~064, 070, 080 등)
  if (/^0[3-9]/.test(digits)) {
    if (digits.length === 11) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3");
    if (digits.length === 10) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
  }

  return String(raw);
}
