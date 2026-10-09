#!/usr/bin/env bash
# 배포 후 운영 사이트 상태 확인 (읽기 전용 HTTP 요청만 보냄, 서버 접속 없음)
#
# 사용법: healthcheck.sh <사이트주소>
set -euo pipefail

SITE="${1:?사이트 주소}"; SITE="${SITE%/}"
fails=0
check() { # 이름 URL 기대코드 [본문에_있어야_할_문자열]
  local name="$1" url="$2" want="$3" must="${4:-}" body code
  body="$(mktemp)"
  code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 20 -H 'Cache-Control: no-cache' "$url" || echo 000)"
  if [ "$code" != "$want" ]; then
    echo "실패  $name ($url) → HTTP $code (기대 $want)"; fails=$((fails + 1))
  elif [ -n "$must" ] && ! grep -q -- "$must" "$body"; then
    echo "실패  $name ($url) → 응답에 '$must' 없음"; fails=$((fails + 1))
  else
    echo "정상  $name → HTTP $code"
  fi
  rm -f "$body"
}

check "메인 페이지"      "$SITE/"            200 "<title>"
check "파티 상세(1번)"   "$SITE/party/1/"    200 "<title>"
check "환불규정"         "$SITE/refund/"     200 "<title>"
check "404 페이지"       "$SITE/__healthcheck_missing__/" 404
check "파티 목록 API"    "$SITE/api/parties.php" 200 "["
check "회사정보 API"     "$SITE/api/admin/company.php" 200 "company"

# 메인 HTML 이 참조하는 JS 파일 하나가 실제로 내려오는지 (구버전 청크 문제 확인)
asset="$(curl -sS --max-time 20 "$SITE/" | grep -oE '/_next/static/[^"]+\.js' | head -n1 || true)"
if [ -n "$asset" ]; then check "정적 JS 파일" "$SITE$asset" 200; else echo "실패  메인 HTML 에서 JS 경로를 찾지 못함"; fails=$((fails + 1)); fi

if [ "$fails" -gt 0 ]; then
  echo "::error::상태 확인 실패 ${fails}건"
  exit 1
fi
echo "상태 확인 통과"
