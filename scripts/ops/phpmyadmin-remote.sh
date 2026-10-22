#!/usr/bin/env bash
# [서버에서 실행 — .github/workflows/ops-phpmyadmin.yml 이 ssh 로 넘겨 실행] 1회용
# phpMyAdmin 외부 접근 점검·차단
#
# 사용: bash -s -- <public-ip|check|block>
#   public-ip : 서버 공인 IP 한 줄만 출력 (워크플로가 받자마자 로그에서 가림 처리)
#   check     : 읽기만 — phpMyAdmin 설치 방식, Apache 설정, 기본 사이트(/var/www/html) 구성, 접근 로그 요약
#   block     : /etc/apache2/conf-available/zz-block-phpmyadmin.conf 를 만들고 켠다 (모든 사이트에서 /phpmyadmin 접근 차단 — 사용하지 않으므로 서버 자신도 막음)
#               설정 검사(configtest)가 실패하면 그 파일을 지우고 멈춘다. 되돌리기: a2disconf zz-block-phpmyadmin && systemctl reload apache2
#
# 로그에는 개별 IP, 파일 내용, 계정 정보를 찍지 않는다.
set -uo pipefail

STEP="${1:?step}"
S() { sudo -n "$@"; }
hr() { echo; echo "===== $* ====="; }
fail() { echo "::error::$*"; exit 1; }
CONF_NAME="zz-block-phpmyadmin"
CONF="/etc/apache2/conf-available/${CONF_NAME}.conf"

case "$STEP" in
public-ip)
  tok="$(curl -s -m 5 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)"
  ip=""
  [ -n "$tok" ] && ip="$(curl -s -m 5 -H "X-aws-ec2-metadata-token: $tok" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
  [ -z "$ip" ] && ip="$(curl -s -m 10 https://checkip.amazonaws.com | tr -d '[:space:]' || true)"
  printf '%s\n' "$ip"
  ;;

check)
  hr "phpMyAdmin 설치 방식"
  S test -d /var/www/html/phpmyadmin && echo "/var/www/html/phpmyadmin: 있음 (파일 $(S find /var/www/html/phpmyadmin -type f | wc -l)개)" || echo "/var/www/html/phpmyadmin: 없음"
  S test -d /usr/share/phpmyadmin && echo "/usr/share/phpmyadmin(패키지): 있음" || echo "/usr/share/phpmyadmin(패키지): 없음"
  dpkg -l phpmyadmin 2>/dev/null | awk '/^ii/{print "패키지 설치됨: " $2 " " $3}' || true
  echo "phpMyAdmin 관련 Apache 설정(파일 이름과 Alias·Require·Directory 줄):"
  S grep -rlis phpmyadmin /etc/apache2/ 2>/dev/null | while read -r f; do
    echo "  [$f]"; S grep -hiE '^\s*(Alias|<Directory|</Directory>|<Location|Require|Allow|Deny|Order)' "$f" | sed 's/^/    /'
  done
  echo "켜진 conf: $(ls /etc/apache2/conf-enabled/ 2>/dev/null | tr '\n' ' ')"
  echo "켜진 사이트: $(ls /etc/apache2/sites-enabled/ 2>/dev/null | tr '\n' ' ')"
  S test -f "$CONF" && echo "차단 설정($CONF_NAME): 이미 있음" || echo "차단 설정($CONF_NAME): 없음"

  hr "기본 사이트 /var/www/html (최상위 이름만)"
  S ls -la /var/www/html 2>/dev/null | awk 'NR>1 {print "  " $1 "  " $NF}'
  echo "서버 이름 없이 IP 로 들어온 요청을 받는 사이트(가상 호스트 목록):"
  S apache2ctl -S 2>/dev/null | grep -E 'default server|port [0-9]+ namevhost|^\*:[0-9]+' | sed -E 's/\(\/etc[^)]*\)//' | sed 's/^/  /'

  hr "접근 로그: /phpmyadmin 요청 요약"
  LOGS="$(S sh -c 'ls -1 /var/log/apache2/*access*.log* 2>/dev/null' || true)"
  if [ -z "$LOGS" ]; then echo "접근 로그 없음"; else
    for f in $LOGS; do S zcat -f "$f"; done | perl -e '
      use strict; use warnings; use Time::Local;
      my %mon=(Jan=>0,Feb=>1,Mar=>2,Apr=>3,May=>4,Jun=>5,Jul=>6,Aug=>7,Sep=>8,Oct=>9,Nov=>10,Dec=>11);
      my (%st,%ip,%ip200,$n,$post,$min,$max);
      sub ep { my ($d)=@_; return undef unless $d=~m{^(\d+)/(\w+)/(\d+):(\d+):(\d+):(\d+)}; return timegm($6,$5,$4,$1,$mon{$2},$3); }
      while (my $l=<STDIN>) {
        next unless $l=~m{^(?:\S+:\d+\s+)?(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3})};
        my ($ip,$dt,$m,$p,$s)=($1,$2,$3,$4,$5); next unless $p=~m{^/phpmyadmin}i;
        $n++; $st{$s}++; $ip{$ip}=1; $ip200{$ip}=1 if $s eq "200"; $post++ if $m eq "POST" && $s=~/^(200|302)$/;
        my $e=ep($dt); if (defined $e) { $min=$e if !defined $min||$e<$min; $max=$e if !defined $max||$e>$max; }
      }
      my $f=sub{ my @t=gmtime($_[0]); sprintf("%04d-%02d-%02d",$t[5]+1900,$t[4]+1,$t[3]) };
      if (!$n) { print "요청 없음\n"; exit 0; }
      printf "요청 %d건, 서로 다른 IP %d개, 기간 %s ~ %s\n", $n, scalar(keys %ip), $f->($min), $f->($max);
      print "상태 코드별: ", join(", ", map {"$_=$st{$_}"} sort keys %st), "\n";
      printf "200 응답을 받은 IP 수: %d, 로그인 시도로 보이는 POST(200·302): %d건\n", scalar(keys %ip200), $post||0;
    '
  fi
  ;;

block)
  hr "차단 설정 만들기"
  S test -f "$CONF" && echo "이미 있음 — 다시 씀"
  S tee "$CONF" >/dev/null <<'EOF'
# phpMyAdmin 접근 차단 (2026-10-22, 어울림 운영 점검) — 모든 사이트에서 /phpmyadmin 을 막는다(사용하지 않음)
# Location 은 Directory 설정보다 나중에 적용되므로, 사이트 설정의 "Require all granted" 보다 우선한다
# 되돌리기: sudo a2disconf zz-block-phpmyadmin && sudo systemctl reload apache2
<LocationMatch "(?i)^/phpmyadmin">
    Require all denied
</LocationMatch>
EOF
  S a2enconf "$CONF_NAME" >/dev/null || { S rm -f "$CONF"; fail "a2enconf 실패 — 설정 파일을 지웠습니다"; }
  if ! S apache2ctl configtest 2>&1 | tee /dev/stderr | grep -q 'Syntax OK'; then
    S a2disconf "$CONF_NAME" >/dev/null 2>&1; S rm -f "$CONF"
    fail "Apache 설정 검사 실패 — 차단 설정을 지우고 원래대로 두었습니다(다시 읽기 전이라 사이트 영향 없음)"
  fi
  S systemctl reload apache2 || fail "Apache 다시 읽기 실패"
  sleep 2
  systemctl is-active apache2 | sed 's/^/apache2: /'
  echo "서버 안에서(localhost) /phpmyadmin/ (403 이어야 함) → $(curl -s -o /dev/null -m 10 -w '%{http_code}' http://localhost/phpmyadmin/)"
  ;;
*) fail "알 수 없는 단계: $STEP" ;;
esac
