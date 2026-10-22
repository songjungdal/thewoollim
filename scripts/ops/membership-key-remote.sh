#!/usr/bin/env bash
# [서버에서 실행 — .github/workflows/ops-membership-key.yml 이 ssh 로 넘겨 실행] 1회용
# 멤버십 자동결제 설정 파일(api/payments/toss-billing-config.php) 만들기
#
# 사용: bash <이 파일> install <웹 루트>
#   표준입력 1줄째 = 클라이언트 키(test_ck_…), 2줄째 = 시크릿 키(test_sk_…). 명령줄 인자로 받지 않는다(프로세스 목록에 남지 않게).
#   - 소유자는 기존 toss-config.php 와 같게, 권한 640, TOSS_BILLING_MODE 는 test
#   - TOSS_BILLING_ENC_KEY: 파일이 없을 때만 openssl rand -base64 32 로 만든다.
#     파일이 이미 있으면 그 안의 암호화 키를 그대로 쓰고, 읽을 수 없거나 형식이 틀리면 아무것도 고치지 않고 멈춘다.
#   - 일반 결제 키(toss-config.php)와 같은 값이면 멈춘다.
#
# 로그에는 키 값·암호화 키를 찍지 않는다.
set -uo pipefail

STEP="${1:?step}"
WEB_ROOT="${2:?web root}"
S() { sudo -n "$@"; }
fail() { echo "::error::$*"; exit 1; }
valid_enc() { [[ "$1" =~ ^[A-Za-z0-9+/]{43}=$ ]] && [ "$(printf '%s' "$1" | base64 -d 2>/dev/null | wc -c)" = "32" ]; }

[ "$STEP" = "install" ] || fail "알 수 없는 단계: $STEP"

IFS= read -r CK || true
IFS= read -r SK || true
exec </dev/null
CK="${CK//[[:space:]]/}"
SK="${SK//[[:space:]]/}"
[[ "$CK" =~ ^test_ck_[A-Za-z0-9_-]+$ ]] || fail "클라이언트 키가 test_ck_… 형식이 아닙니다 (값은 출력하지 않음)"
[[ "$SK" =~ ^test_sk_[A-Za-z0-9_-]+$ ]] || fail "시크릿 키가 test_sk_… 형식이 아닙니다 (값은 출력하지 않음)"

DIR="$WEB_ROOT/api/payments"
GEN="$DIR/toss-config.php"
DST="$DIR/toss-billing-config.php"
S test -d "$DIR" || fail "결제 폴더(api/payments)가 없습니다"
S test -f "$GEN" || fail "기존 toss-config.php 가 없어 소유자 기준을 정할 수 없습니다 — 아무것도 고치지 않았습니다"

echo "기준 파일 toss-config.php: $(S stat -c '소유자 %U:%G, 권한 %a' "$GEN")"
[ "$(S stat -c '%a' "$GEN")" = "640" ] || echo "::warning::toss-config.php 권한이 640 이 아닙니다. 새 파일은 요청대로 640 으로 만듭니다."

# 일반 결제 키와 같은 값이면 멈춘다 (멤버십 화면이 "준비 중"으로 막히는 경우)
SAME="$(printf '%s\n%s\n' "$CK" "$SK" | S php -r '$g = require $argv[1]; $ck = trim((string)fgets(STDIN)); $sk = trim((string)fgets(STDIN)); echo (is_array($g) && (($g["client_key"] ?? "") === $ck || ($g["secret_key"] ?? "") === $sk)) ? "same" : "diff";' "$GEN" 2>/dev/null)"
[ "$SAME" = "diff" ] || fail "등록한 키가 일반 결제 키와 같거나 비교하지 못했습니다 — 아무것도 고치지 않았습니다"

if S test -e "$DST"; then
  EXISTED=yes
  ENC="$(S php -r '$c = require $argv[1]; echo is_array($c) ? (string)($c["TOSS_BILLING_ENC_KEY"] ?? "") : "";' "$DST" 2>/dev/null)"
  ENC="${ENC//[[:space:]]/}"
  valid_enc "$ENC" || fail "이미 있는 설정 파일의 암호화 키가 비었거나 형식이 맞지 않습니다. 암호화 키를 바꾸지 않기 위해 아무것도 고치지 않고 멈춥니다"
  echo "설정 파일이 이미 있습니다 — 암호화 키는 그대로 둡니다 (값은 출력하지 않음)"
else
  EXISTED=no
  ENC="$(openssl rand -base64 32 | tr -d '[:space:]')"
  valid_enc "$ENC" || fail "암호화 키를 만들지 못했습니다"
  echo "설정 파일이 없어 암호화 키를 새로 만들었습니다 (값은 출력하지 않음)"
  STORE="$(dirname "$WEB_ROOT")/$(basename "$WEB_ROOT")-data/membership"
  n="$(S sh -c "ls -1 '$STORE'/memberships-*.json 2>/dev/null | wc -l")"
  [ "${n:-0}" = "0" ] || echo "::warning::예전 멤버십 저장 파일이 ${n}개 있습니다. 새 암호화 키로는 그 파일을 읽지 않습니다(파일은 그대로 둠)."
fi

# 같은 폴더에 임시 파일(.php — 열려도 실행만 되고 내용이 보이지 않음)로 쓴 뒤 한 번에 바꾼다
TMP="$(S mktemp --suffix=.php "$DIR/.tbc-XXXXXXXX")" || fail "임시 파일을 만들지 못했습니다"
trap '[ -n "${TMP:-}" ] && S rm -f "$TMP"' EXIT
S tee "$TMP" >/dev/null <<EOF
<?php
/**
 * 어울림 멤버십 자동결제(빌링) 설정 — 서버 전용, 저장소에 올리지 않는다.
 * 만든 방법: .github/workflows/ops-membership-key.yml (1회용). 항목 설명은 toss-billing-config.example.php
 * TOSS_BILLING_ENC_KEY 는 바꾸지 않는다. 바꾸면 이미 저장된 빌링키를 풀 수 없다.
 */
return [
    'TOSS_BILLING_CLIENT_KEY' => '$CK',
    'TOSS_BILLING_SECRET_KEY' => '$SK',
    'TOSS_BILLING_MODE'       => 'test',
    'TOSS_BILLING_ENC_KEY'    => '$ENC',
];
EOF
S php -l "$TMP" >/dev/null 2>&1 || fail "만든 설정 파일의 PHP 문법 검사 실패 — 반영하지 않았습니다"

if [ "$EXISTED" = "yes" ] && S cmp -s "$TMP" "$DST"; then
  echo "기존 파일과 내용이 같아 바꾸지 않았습니다"
else
  S chown --reference="$GEN" "$TMP" || fail "소유자 설정 실패 — 반영하지 않았습니다"
  S chmod 640 "$TMP" || fail "권한 설정 실패 — 반영하지 않았습니다"
  S mv -f "$TMP" "$DST" || fail "파일 반영 실패"
  TMP=""
  [ "$EXISTED" = "yes" ] && echo "클라이언트·시크릿 키를 갱신했습니다 (암호화 키 유지)" || echo "설정 파일을 만들었습니다"
fi

# 확인 (값은 출력하지 않음)
echo "toss-billing-config.php: $(S stat -c '소유자 %U:%G, 권한 %a' "$DST")"
AFTER="$(S php -r '$c = require $argv[1]; echo is_array($c) ? (string)($c["TOSS_BILLING_ENC_KEY"] ?? "") : "";' "$DST" 2>/dev/null)"
[ "$AFTER" = "$ENC" ] || fail "반영된 파일의 암호화 키가 예상과 다릅니다"
echo "암호화 키: 반영 전후 같음"

WEB_USER="$(ps -o user= -C apache2 2>/dev/null | grep -vx root | head -1)"
WEB_USER="${WEB_USER:-www-data}"
if S -u "$WEB_USER" test -r "$DST"; then echo "웹 서버 계정($WEB_USER)이 읽을 수 있음"; else fail "웹 서버 계정($WEB_USER)이 설정 파일을 읽지 못합니다"; fi
RESULT="$(S -u "$WEB_USER" php -r 'require $argv[1]; $c = membershipConfig(); echo $c["ready"] ? "ready (mode=" . $c["mode"] . ")" : "not ready (" . $c["reason"] . ")";' "$WEB_ROOT/api/membership/_lib.php" 2>/dev/null)"
echo "서버 안에서 멤버십 설정 판정: ${RESULT:-확인 실패}"
[[ "$RESULT" == ready* ]] || fail "서버 안 판정이 ready 가 아닙니다"
