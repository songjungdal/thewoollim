#!/usr/bin/env bash
# [GitHub Actions 실행기에서 실행] production 환경 Secret 으로 받은 값으로 SSH 접속 설정을 만든다.
# 키는 실행기의 임시 폴더에만 저장되고, 작업이 끝나면 실행기와 함께 폐기된다.
#
# 필요한 환경변수 (워크플로가 넘겨줌)
#   서버 접속 값 3개는 production 환경 Secret 이다. environment: production 을 지정하고
#   승인을 거친 작업(plan·deploy·rollback-list·rollback)에서만 값이 채워진다.
#   DEPLOY_SSH_PRIVATE_KEY  배포 전용 SSH 개인키 (production 환경 Secret)
#   DEPLOY_SSH_KNOWN_HOSTS  서버 호스트 키 한 줄 이상 (production 환경 Secret) — 가짜 서버 접속 방지
#   DEPLOY_SSH_HOST         서버 주소 (production 환경 Secret)
#   DEPLOY_SSH_USER         접속 계정 (Variable, 기본 admin)
#   DEPLOY_SSH_PORT         포트 (Variable, 기본 22)
# 결과: ~/.ssh/config 에 "thewoollim-prod" 라는 접속 이름이 생긴다.
set -euo pipefail

missing=()
for v in DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_KNOWN_HOSTS DEPLOY_SSH_HOST; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::서버 접속용 production 환경 Secret 이 없습니다: ${missing[*]} — 이 작업에 environment: production 이 지정됐는지, production 환경에 Secret 이 등록됐는지 확인하세요 (docs/DEPLOYMENT.md 5장)"
  exit 1
fi

mkdir -p ~/.ssh
chmod 700 ~/.ssh
KEY="$HOME/.ssh/thewoollim_deploy"
umask 077
printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" > "$KEY"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts_thewoollim

cat > ~/.ssh/config <<EOF
Host thewoollim-prod
  HostName ${DEPLOY_SSH_HOST}
  User ${DEPLOY_SSH_USER:-admin}
  Port ${DEPLOY_SSH_PORT:-22}
  IdentityFile ${KEY}
  IdentitiesOnly yes
  UserKnownHostsFile ~/.ssh/known_hosts_thewoollim
  StrictHostKeyChecking yes
  BatchMode yes
  ConnectTimeout 20
  ServerAliveInterval 15
EOF
chmod 600 ~/.ssh/config

# 접속 확인 + 비밀번호 없는 sudo 가능 여부 확인 (아무것도 바꾸지 않는 명령)
# 서버 이름(hostname)은 공개 저장소의 실행 로그에 남지 않도록 출력하지 않는다.
ssh thewoollim-prod 'echo "SSH 접속 확인: 계정 $(whoami)"; sudo -n true && echo "sudo(비밀번호 없음) 확인"'
