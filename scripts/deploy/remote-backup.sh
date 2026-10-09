#!/usr/bin/env bash
# [서버에서 실행] 배포 직전 현재 운영 파일을 백업한다.
#
# 사용법: remote-backup.sh <frontend|api> <웹루트> <백업폴더> <백업이름> [보관개수]
#   - frontend: 웹 루트 전체에서 api/, uploads/ 를 뺀 정적 파일을 백업
#   - api     : api/ 에서 비밀 설정·운영 데이터·세션·로그를 뺀 코드 파일만 백업
#   - 비밀 설정과 운영 데이터는 배포가 건드리지 않으므로 백업 대상이 아니다.
#   - 백업 파일은 root 전용(600)으로 저장하고, 대상별로 최근 [보관개수]개만 남긴다.
set -euo pipefail

TARGET="${1:?frontend 또는 api}"
WEB_ROOT="${2:?웹 루트 경로}"
BACKUP_DIR="${3:?백업 폴더}"
LABEL="${4:?백업 이름}"
KEEP="${5:-10}"

[ -d "$WEB_ROOT" ]     || { echo "웹 루트가 없습니다: $WEB_ROOT" >&2; exit 1; }
[ -d "$WEB_ROOT/api" ] || { echo "웹 루트에 api/ 가 없습니다. 경로를 확인하세요: $WEB_ROOT" >&2; exit 1; }

sudo -n mkdir -p "$BACKUP_DIR"
sudo -n chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/${LABEL}.${TARGET}.tar.gz"

case "$TARGET" in
  frontend)
    sudo -n tar -czf "$FILE" -C "$WEB_ROOT" \
      --exclude=./api --exclude=./uploads .
    ;;
  api)
    sudo -n tar -czf "$FILE" -C "$WEB_ROOT" \
      --exclude=./api/data --exclude=./api/uploads \
      --exclude='*/sessions' --exclude='*-config.php' --exclude='*.log' \
      ./api
    ;;
  *) echo "알 수 없는 대상: $TARGET" >&2; exit 1 ;;
esac
sudo -n chmod 600 "$FILE"

# 오래된 백업 정리 (대상별 최근 KEEP 개 유지)
sudo -n find "$BACKUP_DIR" -maxdepth 1 -name "*.${TARGET}.tar.gz" -printf '%T@ %p\n' \
  | sort -rn | tail -n +$((KEEP + 1)) | cut -d' ' -f2- \
  | while IFS= read -r old; do sudo -n rm -f -- "$old"; done

echo "BACKUP_FILE=$FILE"
echo "BACKUP_SIZE=$(sudo -n du -h "$FILE" | cut -f1)"
