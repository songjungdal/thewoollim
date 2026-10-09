#!/usr/bin/env bash
# [서버에서 실행] 서버 임시 경로(staging)에 올라온 배포 패키지를 운영 웹 경로에 반영한다.
#
# 사용법: remote-apply.sh <frontend|api> <staging폴더> <웹루트> <프론트엔드_삭제_허용:true|false> [소유자:그룹]
#   - frontend: staging/out/  → 웹루트/      (frontend.rsync-filter 적용)
#   - api     : staging/api/  → 웹루트/api/  (api.rsync-filter 적용, --delete 절대 사용 안 함)
#   - 반영 전후로 비밀 설정 파일 존재 여부를 비교해, 하나라도 사라지면 실패로 끝낸다.
set -euo pipefail

TARGET="${1:?frontend 또는 api}"
STAGING="${2:?staging 폴더}"
WEB_ROOT="${3:?웹 루트}"
FRONTEND_DELETE="${4:-false}"
CHOWN="${5:-}"

[ -f "$STAGING/MANIFEST.txt" ] || { echo "배포 패키지가 없습니다: $STAGING" >&2; exit 1; }
[ -d "$WEB_ROOT/api" ]         || { echo "웹 루트 확인 실패: $WEB_ROOT/api 없음" >&2; exit 1; }

SECRET_FILES=(
  api/db-config.php
  api/auth/sms-config.php
  api/auth/oauth-config.php
  api/auth/portone-config.php
  api/payments/toss-config.php
)
secret_state() {
  for f in "${SECRET_FILES[@]}"; do
    if sudo -n test -e "$WEB_ROOT/$f"; then echo "$f:있음"; else echo "$f:없음"; fi
  done
}
data_state() {
  for d in api/data uploads api/auth/sessions api/admin/sessions; do
    if sudo -n test -d "$WEB_ROOT/$d"; then echo "$d:있음"; else echo "$d:없음"; fi
  done
}
BEFORE="$(secret_state; data_state)"

RSYNC_OPTS=(-rlt --checksum --itemize-changes)
[ -n "$CHOWN" ] && RSYNC_OPTS+=(--chown="$CHOWN")

case "$TARGET" in
  frontend)
    [ "$FRONTEND_DELETE" = "true" ] && RSYNC_OPTS+=(--delete)
    sudo -n rsync "${RSYNC_OPTS[@]}" \
      --filter="merge $STAGING/frontend.rsync-filter" \
      "$STAGING/out/" "$WEB_ROOT/"
    ;;
  api)
    # PHP API 는 삭제 없이 추가·변경 파일만 반영
    sudo -n rsync "${RSYNC_OPTS[@]}" \
      --filter="merge $STAGING/api.rsync-filter" \
      "$STAGING/api/" "$WEB_ROOT/api/"
    ;;
  *) echo "알 수 없는 대상: $TARGET" >&2; exit 1 ;;
esac

AFTER="$(secret_state; data_state)"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "::error::비밀 설정 또는 운영 데이터 폴더 상태가 배포 전후로 달라졌습니다." >&2
  diff <(echo "$BEFORE") <(echo "$AFTER") >&2 || true
  exit 1
fi
echo "보호 대상 확인: 배포 전후 동일"
