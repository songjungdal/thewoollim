#!/usr/bin/env bash
# [GitHub Actions 실행기에서 실행] GitHub Secrets 로 받은 값으로 SSH 접속 설정을 만든다.
# 키는 실행기의 임시 폴더에만 저장되고, 작업이 끝나면 실행기와 함께 폐기된다.
#
# 필요한 환경변수 (워크플로가 Secrets/Variables 에서 넘겨줌)
#   DEPLOY_SSH_PRIVATE_KEY  배포 전용 SSH 개인키 (Secret)
#   DEPLOY_SSH_KNOWN_HOSTS  서버 호스트 키 한 줄 이상 (Secret) — 가짜 서버 접속 방지
#   DEPLOY_SSH_HOST         서버 주소 (Secret)
#   DEPLOY_SSH_USER         접속 계정 (Variable, 기본 admin)
#   DEPLOY_SSH_PORT         포트 (Variable, 기본 22)
# 결과: ~/.ssh/config 에 "thewoollim-prod" 라는 접속 이름이 생긴다.
set -euo pipefail

missing=()
for v in DEPLOY_SSH_PRIVATE_KEY DEPLOY_SSH_KNOWN_HOSTS DEPLOY_SSH_HOST; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::서버 접속용 GitHub Secret 이 없습니다: ${missing[*]} (docs/DEPLOYMENT.md 참고)"
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
ssh thewoollim-prod 'echo "SSH 접속 확인: $(whoami)@$(hostname)"; sudo -n true && echo "sudo(비밀번호 없음) 확인"'
