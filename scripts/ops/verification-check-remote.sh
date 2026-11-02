#!/usr/bin/env bash
# [서버에서 실행 — .github/workflows/ops-verification-check.yml 이 ssh 로 넘겨 실행] 1회용, 읽기만
# 사진 심사·직업 인증 준비 상태 점검 (docs/specs/photo-job-verification.md 8장 1·2번)
#   - 웹 서버(Apache) PHP 의 이미지 처리 기능(GD·Imagick)·EXIF·fileinfo 사용 여부, 업로드 크기 제한
#   - 웹 루트 밖 데이터 폴더(privateDataDir)가 조건(실제 폴더·웹 서버 계정이 쓸 수 있음·parties.json 있음)을 만족하는지
# 사용: bash <이 파일> <웹 루트>
# 아무것도 바꾸지 않는다. 파일 내용·개인정보·키 값은 출력하지 않는다.
set -uo pipefail
WEB_ROOT="${1:?web root}"
S() { sudo -n "$@"; }
hr() { echo; echo "===== $* ====="; }

hr "PHP (웹 서버용 설정)"
APACHE_PHP_DIRS="$(ls -d /etc/php/*/apache2 2>/dev/null)"
[ -n "$APACHE_PHP_DIRS" ] || echo "  /etc/php/*/apache2 없음 (mod_php 가 아닐 수 있음)"
for d in $APACHE_PHP_DIRS; do
  echo "  [$d]"
  mods="$(ls "$d/conf.d" 2>/dev/null | sed -E 's/^[0-9]+-//; s/\.ini$//' | tr '\n' ' ')"
  for m in gd imagick exif fileinfo curl; do
    if echo " $mods " | grep -q " $m "; then echo "    $m: 켜짐"; else echo "    $m: 없음"; fi
  done
  for k in upload_max_filesize post_max_size max_file_uploads memory_limit; do
    v="$(grep -hE "^\s*$k\s*=" "$d/php.ini" 2>/dev/null | tail -1 | sed -E 's/.*=\s*//')"
    echo "    $k = ${v:-(기본값)}"
  done
done
PHPMODS=""; for f in /etc/apache2/mods-enabled/php*.load; do [ -e "$f" ] && PHPMODS="$PHPMODS $(basename "$f" .load)"; done
echo "  Apache 에 켜진 PHP 모듈:${PHPMODS:- 없음}"
WEB_USER="$(ps -o user= -C apache2 2>/dev/null | grep -vx root | head -1)"; WEB_USER="${WEB_USER:-www-data}"
echo "  웹 서버 계정으로 PHP(CLI) 확인: $(S -u "$WEB_USER" php -r 'echo "GD=", function_exists("imagecreatefromjpeg") ? "있음" : "없음", " WEBP=", function_exists("imagecreatefromwebp") ? "있음" : "없음", " Imagick=", class_exists("Imagick") ? "있음" : "없음", " EXIF=", function_exists("exif_read_data") ? "있음" : "없음", " PHP ", PHP_VERSION;' 2>/dev/null || echo '확인 실패')"

hr "웹 루트 밖 데이터 폴더"
DATA="$(dirname "$WEB_ROOT")/$(basename "$WEB_ROOT")-data"
echo "  위치: $DATA"
if S test -d "$DATA"; then
  echo "  폴더: 있음 ($(S stat -c '소유자 %U:%G, 권한 %a' "$DATA"))"
  S -u "$WEB_USER" test -w "$DATA" && echo "  웹 서버 계정($WEB_USER) 쓰기: 가능" || echo "  웹 서버 계정($WEB_USER) 쓰기: 불가"
  S test -f "$DATA/parties.json" && echo "  parties.json: 있음" || echo "  parties.json: 없음"
  S test -d "$DATA/verification" && echo "  verification/: 이미 있음 ($(S stat -c '권한 %a' "$DATA/verification"))" || echo "  verification/: 아직 없음 (첫 업로드 때 생성)"
  echo "  남은 디스크: $(df -h "$DATA" | awk 'NR==2{print $4 " / " $2}')"
else
  echo "  폴더: 없음"
fi
