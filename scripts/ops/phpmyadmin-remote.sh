#!/usr/bin/env bash
# [서버에서 실행 — .github/workflows/ops-phpmyadmin.yml 이 ssh 로 넘겨 실행] 1회용
# phpMyAdmin 외부 접근 점검·차단 + IP 로 열리는 기본 사이트(/var/www/html) 점검·차단
#
# 사용: bash -s -- <public-ip|check|audit|block>
#   public-ip : 서버 공인 IP 한 줄만 출력 (워크플로가 받자마자 로그에서 가림 처리)
#   check     : 읽기만 — phpMyAdmin 설치 방식, Apache 설정, 기본 사이트 구성, 접근 로그 요약
#   audit     : 읽기만 — (1) 접근 로그의 /phpmyadmin 과거 기록(200 응답·로그인 POST·로그인 성공 흔적)
#                        (2) 기본 사이트 /var/www/html 의 파일 점검(위험한 파일 이름, 개인정보로 보이는 내용의 개수)
#                        (3) 켜진 사이트의 이름·웹 루트
#   block     : Apache 설정 2개를 만들고 켠다 (모든 사이트에 적용, 기존 설정 파일은 고치지 않음)
#               zz-block-phpmyadmin   : /phpmyadmin 을 모든 접속(서버 자신 포함)에서 403
#               zz-deny-default-site  : 웹 루트가 /var/www/html 인 사이트(=IP·등록 안 된 이름으로 들어온 요청을 받는 기본 사이트) 전체를 403
#               설정 검사 실패 → 이번에 만든 파일을 지우고 멈춤. 반영 뒤 thewoollim.com 이 200 이 아니면 기본 사이트 차단을 즉시 끄고 멈춤.
#               되돌리기: sudo a2disconf zz-block-phpmyadmin zz-deny-default-site && sudo systemctl reload apache2
#
# 로그에는 개별 IP, 파일 내용, 개인정보 값, 계정 정보, 관리자 폴더의 실제 이름을 찍지 않는다(경로의 admin… 은 admin**** 로 가림).
set -uo pipefail

STEP="${1:?step}"
S() { sudo -n "$@"; }
hr() { echo; echo "===== $* ====="; }
fail() { echo "::error::$*"; exit 1; }
mask() { sed -E 's#(^|/|[[:space:]])admin[^/[:space:]]*#\1admin****#g'; }
PMA_NAME="zz-block-phpmyadmin"
PMA_CONF="/etc/apache2/conf-available/${PMA_NAME}.conf"
DEF_NAME="zz-deny-default-site"
DEF_CONF="/etc/apache2/conf-available/${DEF_NAME}.conf"
DEF_ROOT="/var/www/html"

# 켜진 사이트 파일별 ServerName·ServerAlias·DocumentRoot (도메인·경로만)
sites_summary() {
  for f in /etc/apache2/sites-enabled/*.conf; do
    [ -e "$f" ] || continue
    names="$(S grep -hiE '^\s*Server(Name|Alias)\s' "$f" | awk '{for(i=2;i<=NF;i++) printf "%s ", $i}')"
    roots="$(S grep -hiE '^\s*DocumentRoot\s' "$f" | awk '{print $2}' | tr -d '"' | sort -u | tr '\n' ' ')"
    echo "  $(basename "$f"): 이름[${names:-없음(기본 사이트)}] 웹 루트[${roots:-없음}]"
  done
}

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
  echo "켜진 conf: $(ls /etc/apache2/conf-enabled/ 2>/dev/null | tr '\n' ' ')"
  echo "켜진 사이트:"; sites_summary
  for n in "$PMA_NAME" "$DEF_NAME"; do
    S test -e "/etc/apache2/conf-enabled/$n.conf" && echo "차단 설정($n): 켜짐" || echo "차단 설정($n): 없음"
  done
  ;;

audit)
  hr "1. phpMyAdmin 설정·설치 기록"
  for f in /etc/apache2/conf-available/phpmyadmin.conf /etc/apache2/conf-enabled/phpmyadmin.conf /etc/phpmyadmin/apache.conf /var/www/html/phpmyadmin; do
    if S test -L "$f"; then echo "  $f: 링크 → $(S readlink "$f")"
    elif S test -e "$f"; then echo "  $f: 있음 (수정일 $(S stat -c %y "$f" | cut -d' ' -f1))"
    else echo "  $f: 없음"; fi
  done
  echo "  apache2.conf 안 phpmyadmin 관련 줄 번호: $(S grep -niE 'phpmyadmin' /etc/apache2/apache2.conf | cut -d: -f1 | tr '\n' ' ')"
  echo "  패키지 설치·변경 기록(dpkg.log, 남아 있는 것만):"
  S sh -c 'zcat -f /var/log/dpkg.log* 2>/dev/null' | grep -E ' (install|upgrade|remove|purge) phpmyadmin[: ]' | awk '{print "    " $1 " " $3 " " $4 " " $6}' | sort | head -10
  fsize() { S stat -c '%s바이트' "$1" 2>/dev/null || echo 없음; }
  echo "  기본 사이트 파일 크기 참고(200 응답 크기와 비교용): index.html $(fsize $DEF_ROOT/index.html), 404.html $(fsize $DEF_ROOT/404.html)"
  echo "  기본 사이트 .htaccess 의 오류 페이지·주소 바꾸기 줄:"
  S grep -hiE '^\s*(ErrorDocument|FallbackResource|RewriteRule|RewriteCond|Redirect)' $DEF_ROOT/.htaccess 2>/dev/null | mask | sed 's/^/    /' | head -20

  hr "2. 접근 로그의 /phpmyadmin 요청 (개수·날짜만, IP 는 개수만)"
  LOGS="$(S sh -c 'ls -1 /var/log/apache2/*access*.log* 2>/dev/null' || true)"
  if [ -z "$LOGS" ]; then echo "접근 로그 없음"; else
    echo "  읽은 로그 파일: $(echo "$LOGS" | xargs -n1 basename | tr '\n' ' ')"
    # shellcheck disable=SC2086
    S perl -e '
      use strict; use warnings; use Time::Local; use File::Basename;
      my %mon=(Jan=>0,Feb=>1,Mar=>2,Apr=>3,May=>4,Jun=>5,Jul=>6,Aug=>7,Sep=>8,Oct=>9,Nov=>10,Dec=>11);
      sub ep { my ($d)=@_; return undef unless $d=~m{^(\d+)/(\w+)/(\d+):(\d+):(\d+):(\d+)}; return timegm($6,$5,$4,$1,$mon{$2},$3); }
      sub day { my @t=gmtime($_[0]); sprintf("%04d-%02d-%02d",$t[5]+1900,$t[4]+1,$t[3]) }
      sub rng { my ($a,$b)=@_; defined $a ? day($a)." ~ ".day($b) : "-" }
      my (%st,%ipall,$n,$lmin,$lmax);
      my (%g);   # 그룹별 {n,min,max,ip{}}
      my (%month200,%size200,%path200,%file200,%vh200,%poststat,%postip,%authip);
      my $AUTH = qr{[?&](route=/(server|database|table|sql|import|export|navigation|db_|preferences)|db=|table=|server=\d)|/(db_[a-z_]+|tbl_[a-z_]+|server_[a-z_]+|sql|import|export|navigation)\.php}i;
      sub add { my ($k,$e,$ip)=@_; $g{$k}{n}++; $g{$k}{ip}{$ip}=1; if (defined $e) { $g{$k}{min}=$e if !defined $g{$k}{min}||$e<$g{$k}{min}; $g{$k}{max}=$e if !defined $g{$k}{max}||$e>$g{$k}{max}; } }
      my @rows;
      for my $file (@ARGV) {
        open(my $fh, "-|", "zcat", "-f", $file) or next;
        my $bn = basename($file); $bn =~ s/\.\d+(\.gz)?$//;
        while (my $l=<$fh>) {
          my ($vh,$ip,$dt,$m,$p,$s,$b);
          if ($l=~m{^(\S+):\d+ (\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\S+)}) { ($vh,$ip,$dt,$m,$p,$s,$b)=($1,$2,$3,$4,$5,$6,$7); }
          elsif ($l=~m{^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\S+)}) { ($vh,$ip,$dt,$m,$p,$s,$b)=("",$1,$2,$3,$4,$5,$6); }
          else { next; }
          my $e=ep($dt);
          if (defined $e) { $lmin=$e if !defined $lmin||$e<$lmin; $lmax=$e if !defined $lmax||$e>$lmax; }
          next unless $p=~m{^/phpmyadmin}i;
          $n++; $st{$s}++; $ipall{$ip}=1;
          push @rows, [$e,$ip,$m,$p,$s];
          if ($s eq "200") {
            add("200",$e,$ip);
            $month200{substr(day($e),0,7)}++ if defined $e;
            $size200{$b eq "-" ? 0 : $b}++;
            (my $q=lc $p)=~s/\?.*//; $path200{$q}++;
            $file200{$bn}++;
            $vh200{ $vh eq "" ? "(가상호스트 표시 없음)" : ($vh=~/thewoollim\.com$/i ? $vh : "기본 사이트") }++;
          }
          if ($m eq "POST") { add("post",$e,$ip); $poststat{$s}++; $postip{$ip}=1; }
          if ($s eq "200" && $p=~$AUTH) { add("auth",$e,$ip); $authip{$ip}=1; }
        }
        close $fh;
      }
      print "  로그에 남아 있는 전체 기간: ", rng($lmin,$lmax), "\n";
      if (!$n) { print "  /phpmyadmin 요청 없음\n"; exit 0; }
      printf "  전체: %d건, 서로 다른 IP %d개, 상태 코드별 %s\n", $n, scalar(keys %ipall), join(", ", map {"$_=$st{$_}"} sort keys %st);
      for my $k (["200","200 응답"],["post","POST 요청"],["auth","로그인해야 보이는 화면 주소의 200 응답(성공 흔적)"]) {
        my $x=$g{$k->[0]};
        if ($x) { printf "  %s: %d건, 서로 다른 IP %d개, 기간 %s\n", $k->[1], $x->{n}, scalar(keys %{$x->{ip}}), rng($x->{min},$x->{max}); }
        else { printf "  %s: 0건\n", $k->[1]; }
      }
      print "  POST 상태 코드별: ", (join(", ", map {"$_=$poststat{$_}"} sort keys %poststat) || "-"), "\n";
      # POST 를 보낸 IP 가 그 뒤 로그인 화면 주소에서 200 을 받은 경우(성공 흔적)
      my %firstpost; for my $r (sort { ($a->[0]//0) <=> ($b->[0]//0) } @rows) { $firstpost{$r->[1]} //= $r->[0] if $r->[2] eq "POST"; }
      my %after; for my $r (@rows) { next unless $r->[4] eq "200" && $r->[3]=~$AUTH && defined $firstpost{$r->[1]} && defined $r->[0] && $r->[0] >= $firstpost{$r->[1]}; $after{$r->[1]}++; }
      printf "  POST 를 보낸 뒤 같은 IP 가 로그인 화면 주소에서 200 을 받은 경우: IP %d개, %d건\n", scalar(keys %after), eval { my $t=0; $t+=$_ for values %after; $t };
      if (%month200) {
        print "  200 응답 월별: ", join(", ", map {"$_=$month200{$_}"} sort keys %month200), "\n";
        print "  200 응답이 기록된 로그: ", join(", ", map {"$_=$file200{$_}"} sort keys %file200), "\n";
        print "  200 응답 받은 사이트: ", join(", ", map {"$_=$vh200{$_}"} sort keys %vh200), "\n";
        my @sz = sort { $size200{$b} <=> $size200{$a} || $a <=> $b } keys %size200;
        print "  200 응답 크기(바이트, 많은 순 5개): ", join(", ", map {"$_ x$size200{$_}"} @sz[0..($#sz<4?$#sz:4)]), "\n";
        my @pp = sort { $path200{$b} <=> $path200{$a} || $a cmp $b } keys %path200;
        print "  200 응답 경로(물음표 뒤 제외, 많은 순 8개): ", join(", ", map {"$_ x$path200{$_}"} @pp[0..($#pp<7?$#pp:7)]), "\n";
      }
    ' $LOGS
  fi

  hr "3. 기본 사이트 $DEF_ROOT 파일 점검 (이름·개수만, 내용은 출력하지 않음)"
  if ! S test -d "$DEF_ROOT"; then echo "  폴더 없음"; else
    echo "  파일 $(S find "$DEF_ROOT" -type f | wc -l)개, 폴더 $(S find "$DEF_ROOT" -type d | wc -l)개, 전체 $(S du -sh "$DEF_ROOT" | cut -f1)"
    echo "  가장 오래된/최근 수정일: $(S find "$DEF_ROOT" -type f -printf '%TY-%Tm-%Td\n' | sort | sed -n '1p;$p' | tr '\n' ' ')"
    echo "  최상위 폴더: $(S find "$DEF_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | mask | tr '\n' ' ')"
    echo "  [위험할 수 있는 이름의 파일] (경로 · 크기 · 수정일):"
    S find "$DEF_ROOT" -type f \( \
        -iname '*.sql' -o -iname '*.sql.*' -o -iname '*.dump' -o -iname '*.db' -o -iname '*.sqlite*' -o -iname '*.mdb' \
        -o -iname '*.bak' -o -iname '*.backup' -o -iname '*.old' -o -iname '*.orig' -o -iname '*.save' -o -iname '*.swp' -o -iname '*~' \
        -o -iname '*.zip' -o -iname '*.tar' -o -iname '*.tar.*' -o -iname '*.tgz' -o -iname '*.gz' -o -iname '*.7z' -o -iname '*.rar' \
        -o -iname '*.php' -o -iname '*.phtml' -o -iname '*.inc' -o -iname '*.ini' -o -iname '*.conf' -o -iname '*.cnf' -o -iname '*.env' -o -iname '.env*' \
        -o -iname '*.yml' -o -iname '*.yaml' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.crt' -o -iname '*.p12' \
        -o -iname '*.log' -o -iname '*.csv' -o -iname '*.xls' -o -iname '*.xlsx' -o -iname '*.json' \
        -o -ipath '*/data/*' -o -ipath '*/api/*' -o -ipath '*/uploads/*' -o -ipath '*backup*' -o -ipath '*config*' -o -ipath '*/sessions/*' \
      \) -not -path "$DEF_ROOT/_next/static/*" -printf '    %P · %s바이트 · %TY-%Tm-%Td\n' | sort | mask | head -200
    echo "    (위 목록 끝 — 최대 200줄)"
    echo "  [_next/static 안의 위험 확장자]: $(S find "$DEF_ROOT/_next/static" -type f \( -iname '*.sql*' -o -iname '*.bak' -o -iname '*.zip' -o -iname '*.env' -o -iname '*.key' -o -iname '*.pem' -o -iname '*.log' -o -iname '*.csv' -o -iname '*.php' \) 2>/dev/null | wc -l)개"
    echo "  [개인정보로 보이는 내용] 이메일(@thewoollim.com 제외)·휴대폰 번호 형식의 서로 다른 값 개수 (값은 출력하지 않음):"
    # shellcheck disable=SC2016
    S find "$DEF_ROOT" -type f -not -path "$DEF_ROOT/_next/static/*" -size -20M \
        \( -iname '*.html' -o -iname '*.htm' -o -iname '*.txt' -o -iname '*.json' -o -iname '*.csv' -o -iname '*.sql*' -o -iname '*.log' \
           -o -iname '*.php' -o -iname '*.xml' -o -iname '*.bak' -o -iname '*.old' -o -iname '*.js' -o -iname '*.dump' -o -iname '*.tsv' \) -print0 \
      | S xargs -0 -r perl -e '
          use strict; use warnings;
          my (%E,%P,$files,$hit);
          for my $f (@ARGV) {
            open(my $fh,"<",$f) or next; local $/; my $c=<$fh>; close $fh; $files++;
            my (%e,%p);
            $e{lc $1}=1 while $c=~/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
            delete $e{$_} for grep { /\@thewoollim\.com$/ || /\.(png|jpe?g|gif|svg|webp)$/ } keys %e;
            while ($c=~/(?<!\d)(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})(?!\d)/g) { $p{"$1$2$3"}=1; }
            $E{$_}=1 for keys %e; $P{$_}=1 for keys %p;
            my $ne=keys %e; my $np=keys %p;
            if ($ne+$np >= 3) { $hit++; (my $r=$f)=~s{^/var/www/html/}{}; printf "    %s · 이메일 %d개 · 휴대폰 %d개\n", $r, $ne, $np; }
          }
          printf "    검사한 파일 %d개, 값이 3개 이상인 파일 %d개, 전체에서 서로 다른 이메일 %d개 · 휴대폰 %d개\n", $files||0, $hit||0, scalar(keys %E), scalar(keys %P);
        ' | mask
  fi

  hr "4. 켜진 사이트 (이름·웹 루트)"
  sites_summary
  ;;

block)
  hr "사전 확인"
  sites_summary
  # thewoollim.com 을 받는 사이트의 웹 루트가 기본 사이트 폴더면 기본 사이트 차단을 하지 않는다
  MAIN_ON_DEF=0; DEF_USED=0
  for f in /etc/apache2/sites-enabled/*.conf; do
    [ -e "$f" ] || continue
    roots="$(S grep -hiE '^\s*DocumentRoot\s' "$f" | awk '{print $2}' | tr -d '"' | sed 's#/$##')"
    echo "$roots" | grep -qx "$DEF_ROOT" || continue
    DEF_USED=1
    S grep -qiE '^\s*Server(Name|Alias)\s.*thewoollim\.com' "$f" && MAIN_ON_DEF=1
  done
  [ "$MAIN_ON_DEF" = "0" ] || fail "thewoollim.com 사이트의 웹 루트가 $DEF_ROOT 입니다 — 기본 사이트 차단을 하면 실제 사이트가 막히므로 아무것도 바꾸지 않고 멈춥니다"
  [ "$DEF_USED" = "1" ] || echo "::warning::웹 루트가 $DEF_ROOT 인 사이트를 찾지 못했습니다 — 기본 사이트 차단 설정은 아무 사이트에도 적용되지 않을 수 있습니다"

  hr "차단 설정 만들기"
  NEW=()
  S test -e "$PMA_CONF" || NEW+=("$PMA_NAME")
  S test -e "$DEF_CONF" || NEW+=("$DEF_NAME")
  S tee "$PMA_CONF" >/dev/null <<'EOF'
# phpMyAdmin 접근 차단 (2026-10-22, 어울림 운영 점검) — 모든 사이트에서 /phpmyadmin 을 막는다(사용하지 않음, 서버 자신도 막음)
# Location 은 Directory 설정보다 나중에 적용되므로, 사이트 설정의 "Require all granted" 보다 우선한다
# 되돌리기: sudo a2disconf zz-block-phpmyadmin && sudo systemctl reload apache2
<LocationMatch "(?i)^/phpmyadmin">
    Require all denied
</LocationMatch>
EOF
  S tee "$DEF_CONF" >/dev/null <<'EOF'
# 기본 사이트(/var/www/html — 예전 사이트 사본) 접근 차단 (2026-10-22, 어울림 운영 점검)
# IP 주소나 등록되지 않은 이름으로 들어온 요청은 웹 루트가 /var/www/html 인 기본 사이트가 받는다. 그 사이트 전체를 403 으로 막는다.
# thewoollim.com 사이트(다른 웹 루트)에는 적용되지 않는다. <If> 는 Directory·.htaccess·Location 보다 나중에 적용되어 .htaccess 의 허용보다 우선한다.
# 파일은 지우지 않았다. 되돌리기: sudo a2disconf zz-deny-default-site && sudo systemctl reload apache2
<If "%{DOCUMENT_ROOT} =~ m#^/var/www/html/?$#">
    Require all denied
</If>
EOF
  undo_new() { for n in "${NEW[@]}"; do S a2disconf -q "$n" >/dev/null 2>&1; S rm -f "/etc/apache2/conf-available/$n.conf"; done; }
  S a2enconf -q "$PMA_NAME" "$DEF_NAME" >/dev/null || { undo_new; fail "a2enconf 실패 — 이번에 만든 설정을 지웠습니다"; }
  if ! S apache2ctl configtest 2>&1 | grep -q 'Syntax OK'; then
    S apache2ctl configtest 2>&1 | grep -v -iE 'ServerName' | sed 's/^/  /' | head -10
    undo_new
    fail "Apache 설정 검사 실패 — 이번에 만든 설정을 지우고 원래대로 두었습니다(다시 읽기 전이라 사이트 영향 없음)"
  fi
  S systemctl reload apache2 || fail "Apache 다시 읽기 실패"
  sleep 2
  systemctl is-active apache2 | sed 's/^/apache2: /'

  hr "서버 안에서 확인"
  code() { curl -s -o /dev/null -m 10 -k -w '%{http_code}' "$@"; }
  MAIN="$(code --resolve thewoollim.com:443:127.0.0.1 https://thewoollim.com/)"
  echo "thewoollim.com / (200 이어야 함) → $MAIN"
  if [ "$MAIN" != "200" ]; then
    S a2disconf -q "$DEF_NAME" >/dev/null 2>&1; S systemctl reload apache2
    fail "실제 사이트가 200 이 아니어서 기본 사이트 차단을 바로 껐습니다. phpMyAdmin 차단은 유지. 다시 확인 → $(code --resolve thewoollim.com:443:127.0.0.1 https://thewoollim.com/)"
  fi
  echo "thewoollim.com /phpmyadmin/ (403 이어야 함) → $(code --resolve thewoollim.com:443:127.0.0.1 https://thewoollim.com/phpmyadmin/)"
  echo "localhost / (기본 사이트, 403 이어야 함) → $(code http://127.0.0.1/)"
  echo "localhost /phpmyadmin/ (403 이어야 함) → $(code http://127.0.0.1/phpmyadmin/)"
  ;;
*) fail "알 수 없는 단계: $STEP" ;;
esac
