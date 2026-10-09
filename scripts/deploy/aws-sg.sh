#!/usr/bin/env bash
# [GitHub Actions 실행기에서 실행] 선택 기능 — DEPLOY_ACCESS_MODE=aws-sg-temporary 일 때만 사용.
# 작업 시간 동안만 이 실행기의 현재 IP(/32)에 SSH 포트를 열고, 끝나면 반드시 닫는다.
# AWS 인증은 GitHub OIDC 로 받은 임시 자격증명을 쓴다(장기 Access Key 저장 불필요).
#
# 사용법: aws-sg.sh open|close
# 필요한 환경변수: AWS_SECURITY_GROUP_ID, DEPLOY_SSH_PORT(기본 22)
set -euo pipefail

ACTION="${1:?open 또는 close}"
SG="${AWS_SECURITY_GROUP_ID:?AWS_SECURITY_GROUP_ID 변수가 필요합니다}"
PORT="${DEPLOY_SSH_PORT:-22}"
STATE="$RUNNER_TEMP/aws-sg-opened-cidr"

case "$ACTION" in
  open)
    IP="$(curl -sS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')"
    [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "::error::실행기 IP 확인 실패"; exit 1; }
    aws ec2 authorize-security-group-ingress --group-id "$SG" \
      --ip-permissions "IpProtocol=tcp,FromPort=$PORT,ToPort=$PORT,IpRanges=[{CidrIp=$IP/32,Description=github-actions-deploy-$GITHUB_RUN_ID}]"
    echo "$IP/32" > "$STATE"
    echo "보안그룹 임시 허용 추가 (실행기 IP /32, 포트 $PORT)"
    ;;
  close)
    if [ -f "$STATE" ]; then
      CIDR="$(cat "$STATE")"
      aws ec2 revoke-security-group-ingress --group-id "$SG" \
        --ip-permissions "IpProtocol=tcp,FromPort=$PORT,ToPort=$PORT,IpRanges=[{CidrIp=$CIDR}]"
      echo "보안그룹 임시 허용 제거 완료"
    else
      echo "열어 둔 규칙이 없어 제거할 것이 없습니다."
    fi
    ;;
  *) echo "알 수 없는 동작: $ACTION" >&2; exit 1 ;;
esac
