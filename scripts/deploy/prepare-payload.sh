#!/usr/bin/env bash
# 배포 패키지를 만들고 안전 검사를 한다. (GitHub Actions 빌드 작업에서 실행, 서버 접속 없음)
#
# 사용법: scripts/deploy/prepare-payload.sh <출력 폴더>
#   - out/ (npm run build 결과) 와 Git 이 추적하는 api/ 파일만 담는다.
#   - 비밀 설정·운영 데이터·세션이 패키지에 섞이면 실패(exit 1)한다.
#   - 실패하면 이후 배포 작업은 실행되지 않는다.
set -euo pipefail

DEST="${1:?출력 폴더를 지정하세요}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

fail() { echo "::error::$*"; exit 1; }

# 1) 빌드 결과 확인
[ -f out/index.html ]  || fail "out/index.html 이 없습니다. npm run build 가 정상 완료되지 않았습니다."
[ -f out/404.html ]    || fail "out/404.html 이 없습니다."
[ -d out/_next ]       || fail "out/_next 폴더가 없습니다."
[ -f out/party/1/index.html ] || fail "파티 상세 정적 페이지(out/party/1/)가 없습니다."
if find out -name '*.php' | grep -q .; then
  fail "out/ 안에 PHP 파일이 있습니다. 프론트엔드 패키지에는 PHP 가 들어가면 안 됩니다."
fi

# 2) 패키지 구성 — api/ 는 Git 추적 파일만 (서버 전용 파일은 원천적으로 포함 불가)
rm -rf "$DEST"
mkdir -p "$DEST/api"
cp -a out "$DEST/out"
git ls-files -z api | while IFS= read -r -d '' f; do
  mkdir -p "$DEST/$(dirname "$f")"
  cp -a "$f" "$DEST/$f"
done
cp scripts/deploy/frontend.rsync-filter scripts/deploy/api.rsync-filter "$DEST/"
cp scripts/deploy/remote-backup.sh scripts/deploy/remote-apply.sh scripts/deploy/remote-rollback.sh "$DEST/"

# 3) 금지 파일 검사 (2차 안전장치)
FORBIDDEN_REGEX='(^|/)(db-config|sms-config|oauth-config|portone-config|toss-config)\.php$|(^|/)api/data/|(^|/)sessions/|\.pem$|(^|/)\.env'
if (cd "$DEST" && find . -type f | sed 's#^\./##' | grep -E "$FORBIDDEN_REGEX"); then
  fail "배포 패키지에 비밀 설정·운영 데이터·세션·키 파일이 포함되어 있습니다(위 목록)."
fi

# 4) PHP 문법 검사
php_count=0
while IFS= read -r -d '' f; do
  php -l "$f" >/dev/null || fail "PHP 문법 오류: ${f#"$DEST"/}"
  php_count=$((php_count + 1))
done < <(find "$DEST/api" -name '*.php' -print0)

# 5) 배포 정보 기록
{
  echo "commit=$(git rev-parse HEAD)"
  echo "built_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "out_files=$(find "$DEST/out" -type f | wc -l)"
  echo "api_files=$(find "$DEST/api" -type f | wc -l)"
  echo "php_checked=$php_count"
} > "$DEST/MANIFEST.txt"

echo "배포 패키지 준비 완료:"
cat "$DEST/MANIFEST.txt"
