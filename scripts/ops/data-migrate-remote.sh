#!/usr/bin/env bash
# [서버에서 실행 — .github/workflows/ops-data-migrate.yml 이 ssh 로 넘겨 실행] 1회용
# 운영 데이터 폴더(웹 루트/api/data)를 웹 루트 밖(<웹 루트>-data)으로 옮긴다. 절차: docs/DEPLOYMENT.md 6-1
#
# 사용: bash -s -- <check|migrate|finalize> <WEB_ROOT> <SITE_URL> <BACKUP_DIR>
#   check    : 읽기만 한다 (웹서버·PHP 계정·권한·디스크·외부 접근·캐시·접근 로그 요약)
#   migrate  : 백업(tar.gz) → 복사 → 권한 맞추기 → 새 폴더로 전환 → 재동기화 → PHP 가 새 폴더를 쓰는지 확인
#              전환되지 않으면 새 폴더를 <이름>-failed-<시각> 으로 비켜 두고(나중에 옛 복사본으로 잘못 전환되는 것 방지) 실패로 끝난다
#   finalize : PHP 가 새 폴더를 쓰는지 다시 확인 → 마지막 재동기화 → 옛 api/data 를 웹 루트 밖 <이름>-data-old-<날짜> 로 이동 → 상태 코드 확인
#
# 로그(Actions 화면)에는 이메일·전화번호 같은 파일 내용, 개별 IP, 회원별 파일 이름(해시)을 찍지 않는다.
# 서버의 다른 파일·설정은 바꾸지 않는다 (sudo 는 읽기, 위 폴더 작업, 백업 파일 쓰기에만 쓴다).
set -uo pipefail

STEP="${1:?step}"; W="${2:?WEB_ROOT}"; SITE="${3:?SITE_URL}"; BK="${4:?BACKUP_DIR}"
W="${W%/}"
OLD="$W/api/data"
NEW="${W}-data"
TS="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%Y%m%d)"

S() { sudo -n "$@"; }
hr() { echo; echo "===== $* ====="; }
fail() { echo "::error::$*"; exit 1; }

php_user() {
  ps -eo user=,comm= | awk '($2 ~ /^(apache2|httpd)$/ || $2 ~ /^php-fpm/) && $1 != "root" {print $1}' \
    | sort | uniq -c | sort -rn | head -1 | awk '{print $2}'
}
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$1"; }

# PHP(웹)가 지금 어느 폴더를 데이터 폴더로 쓰는지 — 결제 실패 주소로 표시 한 줄을 남기고 어느 쪽 로그에 생겼는지 본다
#   (fail.php: 해당 주문의 결제 대기 파일이 없으면 _toss_fail.log 에 한 줄만 쓴다)
probe_data_dir() {
  local mark="migration_check_${TS}_$1"
  curl -s -o /dev/null -m 20 "$SITE/api/payments/fail.php?orderId=${mark}&code=MIGRATION_CHECK&message=check"
  sleep 1
  local in_new=0 in_old=0
  S test -f "$NEW/_toss_fail.log" && in_new=$(S grep -c "$mark" "$NEW/_toss_fail.log" || true)
  S test -f "$OLD/_toss_fail.log" && in_old=$(S grep -c "$mark" "$OLD/_toss_fail.log" || true)
  echo "표시 기록 위치: 새 폴더=${in_new:-0}건, 옛 폴더=${in_old:-0}건" >&2
  if [ "${in_new:-0}" -gt 0 ]; then echo new; elif [ "${in_old:-0}" -gt 0 ]; then echo old; else echo unknown; fi
}

diagnose() {
  local pu; pu="$(php_user)"
  hr "전환 실패 원인 점검"
  echo "PHP 실행 계정: ${pu:-알 수 없음}"
  S stat -c '%n  소유 %U:%G  권한 %a' "$NEW" "$OLD" 2>/dev/null
  [ -n "$pu" ] && { S -u "$pu" test -w "$NEW" && echo "PHP 계정 쓰기 가능: 예" || echo "PHP 계정 쓰기 가능: 아니오 (권한 문제)"; }
  S test -f "$NEW/parties.json" && echo "새 폴더 parties.json: 있음" || echo "새 폴더 parties.json: 없음"
  echo "open_basedir 설정(있으면 웹 루트 밖 접근이 막힐 수 있음):"
  S grep -rhs -E '^\s*(php_admin_value\[open_basedir\]|open_basedir|php_admin_value\s+open_basedir)' \
    /etc/php/*/apache2/php.ini /etc/php/*/fpm/php.ini /etc/php/*/fpm/pool.d/ /etc/apache2/ /etc/nginx/ 2>/dev/null \
    | grep -v '^\s*;' || echo "  (설정 없음)"
}

case "$STEP" in
# ─────────────────────────────────────────────────────────────────────
check)
  hr "웹서버"
  ps -eo comm= | grep -E '^(apache2|httpd|nginx|php-fpm.*)$' | sort | uniq -c || echo "(해당 프로세스 없음)"
  for svc in apache2 httpd nginx; do
    st="$(systemctl is-active "$svc" 2>/dev/null || true)"; [ -n "$st" ] && [ "$st" != "inactive" ] && [ "$st" != "unknown" ] && echo "$svc: $st"
  done
  (S apache2 -v 2>/dev/null || S /usr/sbin/apache2 -v 2>/dev/null) | head -1
  (S nginx -v 2>&1 | head -1) 2>/dev/null | grep -i nginx || true
  echo "PHP 실행 계정: $(php_user || echo 알 수 없음)"
  if ps -eo comm= | grep -q '^php-fpm'; then echo "PHP 방식: php-fpm"; else echo "PHP 방식: 웹서버 모듈(mod_php)로 추정"; fi
  echo "웹 루트 관련 Apache 설정(경로·AllowOverride 만):"
  S grep -rhs -E '^\s*(DocumentRoot|AllowOverride|<Directory|</Directory)' /etc/apache2/sites-enabled/ /etc/apache2/apache2.conf 2>/dev/null || echo "  (Apache 설정 파일 없음)"
  echo "open_basedir 설정:"
  S grep -rhs -E '^\s*(php_admin_value\[open_basedir\]|open_basedir|php_admin_value\s+open_basedir)' \
    /etc/php/*/apache2/php.ini /etc/php/*/fpm/php.ini /etc/php/*/fpm/pool.d/ /etc/apache2/ /etc/nginx/ 2>/dev/null \
    | grep -v '^\s*;' || echo "  (설정 없음)"

  hr "api/data"
  S stat -c '%n  소유 %U:%G  권한 %a' "$OLD" || fail "$OLD 가 없습니다"
  echo "파일 수: $(S find "$OLD" -type f | wc -l), 크기: $(S du -sh "$OLD" | cut -f1)"
  S test -f "$OLD/.htaccess" && echo "임시 차단 .htaccess: 있음" || echo "임시 차단 .htaccess: 없음"
  hr "디스크 여유"
  df -h "$(dirname "$W")" "$BK" 2>/dev/null | awk 'NR==1 || !seen[$0]++'
  hr "웹 루트 밖 새 폴더"
  if S test -e "$NEW"; then echo "$NEW: 이미 있음"; S stat -c '  소유 %U:%G  권한 %a' "$NEW"; else echo "$NEW: 없음"; fi
  S test -e "${NEW}.tmp" && echo "${NEW}.tmp: 있음(이전 시도 흔적)" || true

  hr "외부 접근 (서버에서 공개 주소로 요청)"
  echo "/api/data/parties.json → $(code "$SITE/api/data/parties.json")"
  echo "/api/data/_register.log → $(code "$SITE/api/data/_register.log")"
  echo "응답 머리글(캐시·서버 흔적):"
  curl -s -I -m 20 "$SITE/api/data/parties.json" | grep -iE '^(server|via|x-cache|x-amz-cf-|cf-ray|cf-cache-status|age|x-served-by|cache-control|pragma|expires):' || echo "  (해당 머리글 없음)"
  echo "메인 페이지 머리글(.htaccess 적용 여부 — Pragma: no-cache / Expires: 0 이 있으면 적용):"
  curl -s -I -m 20 "$SITE/" | grep -iE '^(server|via|x-cache|x-amz-cf-|cf-ray|pragma|expires|cache-control):' || echo "  (해당 머리글 없음)"

  hr "접근 로그"
  LOGS="$(S sh -c 'ls -1 /var/log/apache2/*access*.log* /var/log/nginx/*access*.log* /var/log/httpd/*access*log* 2>/dev/null' || true)"
  if [ -z "$LOGS" ]; then
    echo "접근 로그 파일을 찾지 못했습니다."
  else
    echo "로그 파일(이름·수정일·크기):"
    for f in $LOGS; do S stat -c '  %n  %y  %s바이트' "$f" | sed -E 's/\.[0-9]+ [+-][0-9]{4}//'; done
    # 한 번 읽으며 집계 — 출력은 묶은 경로별 횟수, 서로 다른 IP 수, 기간만
    for f in $LOGS; do S zcat -f "$f"; done | perl -e '
      use strict; use warnings; use Time::Local;
      my %mon=(Jan=>0,Feb=>1,Mar=>2,Apr=>3,May=>4,Jun=>5,Jul=>6,Aug=>7,Sep=>8,Oct=>9,Nov=>10,Dec=>11);
      my ($allmin,$allmax,$min,$max); my (%cnt,%ip,%ipall,$any,$total);
      sub ep { my ($d)=@_; return undef unless $d=~m{^(\d+)/(\w+)/(\d+):(\d+):(\d+):(\d+)}; return timegm($6,$5,$4,$1,$mon{$2},$3); }
      while (my $l=<STDIN>) {
        next unless $l=~m{^(?:\S+:\d+\s+)?(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3})};
        my ($ip,$dt,$m,$p,$st)=($1,$2,$3,$4,$5); my $e=ep($dt); next unless defined $e; $total++;
        $allmin=$e if !defined $allmin || $e<$allmin; $allmax=$e if !defined $allmax || $e>$allmax;
        $p=~s/\?.*//; next unless $p=~m{^/api/data(/|$)}; $any++; $ipall{$ip}=1;
        next unless $st eq "200" && ($m eq "GET" || $m eq "HEAD");
        next if $p eq "/api/data/parties.json";
        $p=~s/bookings_[0-9a-f]{32}\.json$/bookings_<해시>.json/; $p=~s/cart_[0-9a-f]{32}\.json$/cart_<해시>.json/;
        $p=~s/profile_[0-9a-f]{32}\.json$/profile_<해시>.json/; $p=~s/_pw_reset_gate_[0-9a-f]{32}\.txt$/_pw_reset_gate_<해시>.txt/;
        $p=~s{/pending/[^/]+\.json$}{/pending/<주문번호>.json}; $p=~s{/membership/[^/]+$}{/membership/<파일>};
        $cnt{$p}++; $ip{$ip}=1; $min=$e if !defined $min || $e<$min; $max=$e if !defined $max || $e>$max;
      }
      my $f=sub{ my @t=gmtime($_[0]); sprintf("%04d-%02d-%02d %02d:%02d (로그 시각대 기준)",$t[5]+1900,$t[4]+1,$t[3],$t[2],$t[1]) };
      printf "로그 전체 기간: %s ~ %s, 요청 %d건\n", ($allmin?$f->($allmin):"-"), ($allmax?$f->($allmax):"-"), $total||0;
      printf "/api/data/ 요청(상태 무관): %d건, 서로 다른 IP %d개\n", $any||0, scalar(keys %ipall);
      if (!%cnt) { print "parties.json 을 뺀 /api/data/ 200 응답: 없음\n"; exit 0; }
      print "parties.json 을 뺀 /api/data/ 200 응답 (경로별 횟수):\n";
      printf "  %5d  %s\n", $cnt{$_}, $_ for sort { $cnt{$b} <=> $cnt{$a} || $a cmp $b } keys %cnt;
      printf "서로 다른 IP 수: %d, 가장 이른 시각: %s, 가장 늦은 시각: %s\n", scalar(keys %ip), $f->($min), $f->($max);
    '
  fi
  ;;

# ─────────────────────────────────────────────────────────────────────
migrate)
  hr "사전 확인"
  S test -d "$OLD" || fail "$OLD 가 없습니다 (이미 옮겼다면 finalize 를 실행하세요)"
  S test -f "$OLD/parties.json" || fail "$OLD/parties.json 이 없습니다"
  S test -e "$NEW" && fail "$NEW 가 이미 있습니다 — 중복 실행 방지로 멈춥니다"
  S test -e "${NEW}.tmp" && fail "${NEW}.tmp 가 있습니다 — 이전 시도 흔적, 확인 후 다시 실행하세요"
  S stat -c '옛 폴더: %n  소유 %U:%G  권한 %a' "$OLD"

  hr "1) 백업 (웹 루트 밖)"
  S mkdir -p "$BK"
  ARCHIVE="$BK/api-data-$TS.tar.gz"
  S tar -czf "$ARCHIVE" -C "$W/api" data || fail "백업 실패"
  S chmod 600 "$ARCHIVE"
  S stat -c '백업 파일: %n  (%s바이트)' "$ARCHIVE"
  S tar -tzf "$ARCHIVE" | wc -l | xargs echo "백업 안 항목 수:"

  hr "2) 복사 → 권한 맞추기 → 전환 → 재동기화"
  S rsync -a --exclude=.htaccess "$OLD/" "${NEW}.tmp/" || fail "복사 실패"
  S chown -R --reference="$OLD" "${NEW}.tmp" || fail "소유자 맞추기 실패"
  S chmod --reference="$OLD" "${NEW}.tmp" || fail "권한 맞추기 실패"
  S mv "${NEW}.tmp" "$NEW" || fail "이름 바꾸기(전환) 실패"
  echo "전환 시각: $(date '+%F %T %Z')"
  S rsync -a --update --exclude=.htaccess "$OLD/" "$NEW/"
  S chown -R --reference="$OLD" "$NEW"
  S stat -c '새 폴더: %n  소유 %U:%G  권한 %a' "$NEW"
  echo "파일 수: 옛 $(S find "$OLD" -type f | wc -l) / 새 $(S find "$NEW" -type f | wc -l)"

  hr "3) 전환 확인"
  echo "/api/parties.php → $(code "$SITE/api/parties.php")"
  where="$(probe_data_dir migrate)"
  if [ "$where" != "new" ]; then
    diagnose
    S mv "$NEW" "${NEW}-failed-$TS"
    echo "새 폴더를 ${NEW}-failed-$TS 로 비켜 두었습니다(사이트는 옛 폴더를 계속 씀). 옛 api/data 는 그대로입니다."
    fail "PHP 가 새 폴더로 전환되지 않았습니다 (결과: $where). finalize 로 넘어가지 마세요."
  fi
  echo "확인: PHP 가 새 폴더($NEW)를 쓰고 있습니다."
  echo "참고: 옛 api/data 는 finalize 전까지 그대로 있습니다(더 이상 쓰이지 않음)."
  ;;

# ─────────────────────────────────────────────────────────────────────
finalize)
  hr "사전 확인"
  S test -d "$NEW" || fail "$NEW 가 없습니다 — migrate 를 먼저 실행하세요"
  S test -f "$NEW/parties.json" || fail "$NEW/parties.json 이 없습니다"
  S test -d "$OLD" || fail "$OLD 가 없습니다 (이미 치웠을 수 있음)"
  where="$(probe_data_dir finalize)"
  [ "$where" = "new" ] || { diagnose; fail "PHP 가 새 폴더를 쓰고 있지 않습니다 (결과: $where). 옛 폴더를 옮기지 않았습니다."; }

  hr "1) 마지막 재동기화 후 옛 폴더를 웹 루트 밖으로 이동"
  S rsync -a --update --exclude=.htaccess "$OLD/" "$NEW/"
  S chown -R --reference="$NEW" "$NEW"
  DEST="${NEW}-old-$DAY"; S test -e "$DEST" && DEST="${NEW}-old-$TS"
  S mv "$OLD" "$DEST" || fail "옛 폴더 이동 실패"
  echo "옛 폴더 보관 위치: $DEST"

  hr "2) 상태 코드"
  for p in /api/data/parties.json /api/data/_register.log /api/data/coupons.json /api/data/ /api/data/pending/ /api/parties.php /; do
    printf '%-26s → %s\n' "$p" "$(code "$SITE$p")"
  done
  where="$(probe_data_dir after)"; echo "옛 폴더 이동 뒤 PHP 데이터 폴더: $where"
  ;;
*) fail "알 수 없는 단계: $STEP" ;;
esac
