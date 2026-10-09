#!/usr/bin/env bash
# [서버에서 실행] 배포 전에 만든 백업으로 되돌린다.
#
# 사용법:
#   remote-rollback.sh list <백업폴더>
#   remote-rollback.sh restore <백업폴더> <웹루트> <백업파일이름>
#
# 주의
#   - 백업 시점의 파일을 다시 덮어쓰는 방식이다. 문제 배포로 "새로 추가된" 파일은 지우지 않는다.
#   - 비밀 설정·운영 데이터·세션·업로드는 백업에 없으므로 롤백으로도 바뀌지 않는다.
set -euo pipefail

ACTION="${1:?list 또는 restore}"
BACKUP_DIR="${2:?백업 폴더}"

case "$ACTION" in
  list)
    sudo -n find "$BACKUP_DIR" -maxdepth 1 -name '*.tar.gz' -printf '%TY-%Tm-%Td %TH:%TM  %f\n' 2>/dev/null \
      | sort -r || echo "백업이 없습니다."
    ;;
  restore)
    WEB_ROOT="${3:?웹 루트}"
    NAME="${4:?백업 파일 이름}"
    case "$NAME" in */*|*..*) echo "백업 파일 이름에 경로를 넣을 수 없습니다." >&2; exit 1 ;; esac
    FILE="$BACKUP_DIR/$NAME"
    sudo -n test -f "$FILE" || { echo "백업 파일이 없습니다: $NAME" >&2; exit 1; }
    [ -d "$WEB_ROOT/api" ]  || { echo "웹 루트 확인 실패: $WEB_ROOT" >&2; exit 1; }
    # 백업에 비밀 설정·데이터가 들어 있지 않은지 복원 전에 확인
    if sudo -n tar -tzf "$FILE" | grep -E '(-config\.php$|/data/|/sessions/)'; then
      echo "백업에 보호 대상 파일이 들어 있어 복원을 중단합니다." >&2; exit 1
    fi
    sudo -n tar -xzf "$FILE" -C "$WEB_ROOT"
    echo "복원 완료: $NAME"
    ;;
  *) echo "알 수 없는 동작: $ACTION" >&2; exit 1 ;;
esac
