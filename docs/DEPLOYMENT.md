# 어울림 운영 배포 가이드 (GitHub Actions 수동 배포)

> 대표와 개발자가 같은 방법으로 배포하기 위한 문서입니다.
> 실제 비밀번호·키 값은 이 문서와 저장소 어디에도 적지 않습니다. 값은 GitHub 설정 화면에만 등록합니다.

## 1. 한눈에 보기

```
[GitHub Actions 실행기]                                   [AWS EC2 운영 서버]
 ① 빌드·검사 ─ 실패 시 여기서 중단                          
    npm ci → 타입검사 → 린트 → npm run build(out/)           
    → PHP 문법검사 → 금지 파일 검사                         
 ② 배포 계획 (main, production 환경) ─ rsync --dry-run (읽기만) ─▶  /var/www/thewoollim/  (비교만)
 ③ 운영 반영 (잠금 해제 + DEPLOY 확인 후, main, production 환경)
    rsync ──────────────────────────────────────────────▶  /home/admin/deploy-staging/thewoollim-gha-release/  (임시 경로)
    ssh: 백업 ──────────────────────────────────────────▶  /home/admin/deploy-backups/*.tar.gz
    ssh: sudo rsync 임시 경로 → 운영 경로 (필터 적용) ───▶  /var/www/thewoollim/
 ④ 상태 확인 ───── HTTPS 요청 ──────────────────────────▶  https://thewoollim.com
```

서버에 접속하는 단계(②·③, 백업 목록, 되돌리기)는 모두 GitHub 의 **production 환경**에서 실행됩니다. 서버 접속 키는 이 환경에만 있고 **`main` 브랜치에서만** 열리므로, `main` 에 병합된 코드(상대방의 PR 승인을 거친 코드)만 서버에 접속할 수 있습니다. 배포 실행에는 **별도 승인 단계가 없어** 대표·개발자가 각자 바로 실행할 수 있습니다. ①은 서버에 접속하지 않습니다.

| 파일 | 역할 |
|---|---|
| `.github/workflows/deploy.yml` | 수동 실행 워크플로 (Actions → "Deploy (manual)") |
| `scripts/deploy/prepare-payload.sh` | 배포 패키지 생성 + 금지 파일·PHP 문법 검사 |
| `scripts/deploy/frontend.rsync-filter` | 프론트엔드 보호·제외 규칙 |
| `scripts/deploy/api.rsync-filter` | PHP API 보호·제외 규칙 |
| `scripts/deploy/remote-backup.sh` | (서버) 배포 직전 백업 |
| `scripts/deploy/remote-apply.sh` | (서버) 임시 경로 → 운영 경로 반영, 반영 전후 보호 대상 비교 |
| `scripts/deploy/remote-rollback.sh` | (서버) 백업 목록 보기·복원 |
| `scripts/deploy/ssh-setup.sh` | (실행기) production 환경 Secret 으로 SSH 접속 설정, sudo 가능 여부 확인 (서버 이름은 로그에 출력하지 않음) |
| `scripts/deploy/aws-sg.sh` | (실행기, 선택) 보안그룹에 실행기 IP 를 임시로 열고 닫기 |
| `scripts/deploy/healthcheck.sh` | 배포 후 사이트·API 응답 확인 |

## 2. 실행 모드

| 모드 | 하는 일 | 서버 변경 | 필요 조건 |
|---|---|---|---|
| `plan` | 빌드·검사 → 서버와 비교해 바뀔 파일 목록을 실행 요약(Summary)에 표시 | 없음 | main 브랜치. production 환경에 서버 Secret 이 없으면 빌드·검사만 수행 |
| `deploy` | plan 과 같은 검사 → 임시 경로 업로드 → **백업** → 반영 → 상태 확인 | 있음 | `DEPLOY_UNLOCKED: "true"` + main 브랜치 + `confirm=DEPLOY` |
| `rollback-list` | 서버의 백업 목록 표시 | 없음 | main 브랜치 |
| `rollback` | 지정한 백업으로 복원 → 상태 확인 | 있음 | `DEPLOY_UNLOCKED: "true"` + main 브랜치 + `confirm=ROLLBACK` |

네 모드 모두 별도 배포 승인 없이 실행됩니다. 실행할 수 있는 사람은 저장소 쓰기 권한이 있는 대표·개발자입니다.

**잠금 상태에서도 서버와 통신하는 경우**

| 모드 | 서버 SSH 접속 | 서버 파일 변경 | AWS 보안그룹 변경 |
|---|---|---|---|
| `plan` (production 환경에 서버 Secret 미등록) | 없음 | 없음 | 없음 |
| `plan` (서버 Secret 등록) | **있음** — 접속 확인, `sudo -n true`, `rsync --dry-run` (읽기만) | 없음 | `aws-sg-temporary` 일 때만 실행기 IP 를 **임시로 추가했다가 제거** |
| `rollback-list` | **있음** — 백업 폴더 목록 읽기 | 없음 | 위와 같음 |
| `deploy` (잠금) | 없음 — 빌드 첫 단계에서 실패 | 없음 | 없음 |
| `rollback` (잠금) | 없음 — 첫 단계에서 실패 | 없음 | 없음 |

**지금은 잠금 상태**입니다(`deploy.yml` 의 `DEPLOY_UNLOCKED: "false"`). `plan`과 `rollback-list`만 동작하고, `deploy`·`rollback`은 첫 단계에서 실패합니다. 잠금을 풀려면 이 값을 `"true"`로 바꾸는 PR 을 상대방이 승인한 뒤 병합해야 합니다.

**배포 대상(target)**

| 값 | 내용 |
|---|---|
| `frontend` | `out/` → 웹 루트. `api/`, `uploads/`, `.htaccess` 는 건드리지 않음 |
| `api` | Git 이 관리하는 `api/` 파일 → 웹 루트의 `api/`. **추가·변경 파일만 반영하고 삭제는 절대 안 함** |
| `all` | `api` 를 먼저, 그다음 `frontend` |

## 3. 보호 규칙 (덮어쓰기·삭제 금지)

rsync 필터의 `P`(삭제 금지)와 `-`(전송 제외)를 함께 적용합니다. 반영 직후 `remote-apply.sh` 가 비밀 설정 5종과 데이터·세션·업로드 폴더가 그대로인지 다시 비교하고, 달라졌으면 실패로 끝냅니다.

| 구분 | 서버 경로 (웹 루트 기준) |
|---|---|
| 비밀 설정 | `api/db-config.php`, `api/auth/sms-config.php`, `api/auth/oauth-config.php`, `api/auth/portone-config.php`, `api/payments/toss-config.php`, 그 밖의 `*-config.php` |
| 운영 데이터 | `api/data/` |
| 세션 | `api/auth/sessions/`, `api/admin/sessions/` (그 밖의 `sessions/` 포함) |
| 업로드 | `uploads/`, `api/uploads/` |
| 서버 설정 | `.htaccess` (웹 루트) |
| 로그 | `*.log` |
| 웹 루트의 PHP | 프론트엔드 배포는 `.php` 파일을 전송·삭제하지 않음 |

- 프론트엔드의 "옛 정적 파일 삭제"(`frontend_delete`)는 기본값이 꺼짐입니다. 켜더라도 위 보호 대상은 삭제되지 않으며, 삭제될 파일은 `plan` 결과에서 먼저 확인할 수 있습니다.
- PHP API 배포 계획에 삭제가 하나라도 보이면 워크플로가 중단합니다.
- 배포 패키지에는 Git 이 관리하는 파일만 들어갑니다. 비밀 설정·데이터 파일 이름이 섞이면 빌드 단계에서 실패합니다.

## 4. 서버 접속 방식 비교 (GitHub 실행기의 유동 IP 문제)

GitHub 이 제공하는 실행기(GitHub-hosted runner)는 실행할 때마다 IP 가 바뀝니다. 현재 서버 보안그룹이 특정 IP 에서만 SSH(22번)를 허용한다면 그대로는 접속할 수 없습니다.

| 방식 | 내용 | 장점 | 단점·위험 | 이 초안 지원 |
|---|---|---|---|---|
| A. 보안그룹 22번 전체 개방 | 0.0.0.0/0 허용 | 설정 쉬움 | 전 세계에서 SSH 접속 시도 가능. **권장하지 않음** | `direct` 로 가능하나 비권장 |
| B. GitHub IP 대역 전체 등록 | GitHub 공개 IP 목록 등록 | 고정 규칙 | 대역이 수천 개이고 자주 바뀜. 보안그룹 규칙 수 제한 | 미지원 |
| **C. 실행 중에만 임시 허용 (권장)** | GitHub OIDC 로 AWS 임시 권한 → 실행기 IP/32 를 열고, 끝나면 닫음 | 평소엔 닫혀 있음. 장기 AWS 키 불필요 | AWS 에 IAM 역할 1개 생성 필요. 작업이 비정상 종료되면 규칙이 남을 수 있음(설명에 실행 번호 기록) | `aws-sg-temporary` |
| D. 서버에 self-hosted runner 설치 | 서버가 GitHub 에서 작업을 받아 직접 실행 | 인바운드 SSH 불필요 | 운영 서버에서 워크플로 코드가 실행됨. 러너 관리 필요 | 미지원 (추후 선택) |
| E. AWS SSM (Session Manager) | 22번 없이 AWS API 로 명령 실행 | 포트 개방 0 | SSM 에이전트·IAM 설정 필요, 파일 전송은 S3 경유로 구조 변경 큼 | 미지원 (추후 선택) |

**권장: C (`DEPLOY_ACCESS_MODE=aws-sg-temporary`)**
현재 보안그룹이 이미 넓게 열려 있다면 처음에는 `direct` 로 시작할 수 있지만, C 로 전환하는 것을 권장합니다.

## 5. GitHub 에 등록할 항목

설정 위치
- Repository Secrets·Variables: GitHub 저장소 → **Settings → Secrets and variables → Actions** (Secrets 탭 = 값이 가려지는 비밀값 / Variables 탭 = 일반 설정값)
- production 환경과 환경 Secret: **Settings → Environments → `production`**

### 5-1. Repository Secrets (빌드용 — build 작업에서 사용)

| 이름 | 내용 | 필수 |
|---|---|---|
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 토스 결제위젯 클라이언트 키 | deploy 시 필수 |
| `NEXT_PUBLIC_PORTONE_STORE_ID` | 포트원 상점 ID | deploy 시 필수 |
| `NEXT_PUBLIC_PORTONE_IDENTITY_CHANNEL_KEY` | 포트원 본인인증 채널 키 | deploy 시 필수 |

> `NEXT_PUBLIC_*` 값은 빌드된 화면 파일에 들어가 브라우저에 공개되는 값입니다. 그래도 저장소 코드에 적지 않고 Secret 으로 관리합니다.
> PHP 비밀 설정 5종(DB·문자·OAuth·토스·포트원)은 **GitHub 에 넣지 않습니다.** 지금처럼 서버에만 둡니다.

### 5-2. production Environment Secrets (서버 접속용 — main 의 production 작업만 사용)

| 이름 | 내용 |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | **배포 전용으로 새로 만든** SSH 개인키 전체 (기존 개발자 개인키·Mac 수동 배포용 키 사용 금지) |
| `DEPLOY_SSH_HOST` | 서버 주소 |
| `DEPLOY_SSH_KNOWN_HOSTS` | 서버 호스트 키 한 줄 (`ssh-keyscan` 결과를 지문으로 직접 확인한 뒤 등록) |

- `environment: production` 을 지정한 작업(`plan`·`deploy`·`rollback-list`·`rollback`)이 **`main` 브랜치에서 실행될 때만** 이 값을 읽을 수 있습니다. `build` 작업과 다른 브랜치의 실행은 읽을 수 없습니다.
- **같은 이름을 Repository Secrets 에 두지 않습니다.** 남아 있으면 production 환경을 지정하지 않은 작업(예: 다른 브랜치에서 수정한 워크플로)도 그 값을 읽을 수 있어 `main` 전용 제한을 우회할 수 있습니다.
  - 현재 Repository Secrets 에는 빌드용 3개만 있고, 서버 접속용 3개는 production 환경에만 있습니다.

### 5-3. Variables (일반 설정값) — 비워 두면 괄호 안 기본값 사용

| 이름 | 기본값 | 내용 |
|---|---|---|
| `DEPLOY_WEB_ROOT` | `/var/www/thewoollim` | 운영 웹 경로 |
| `DEPLOY_STAGING_DIR` | `/home/admin/htdocs` | 서버 임시 경로 (그 아래 `thewoollim-gha-release/` 만 사용). **현재 설정: `/home/admin/deploy-staging`** — Mac 수동 배포의 임시 폴더(`/home/admin/htdocs`)·운영 웹 경로·백업 폴더와 분리. 첫 배포 때 워크플로가 자동으로 만듦 |
| `DEPLOY_BACKUP_DIR` | `/home/admin/deploy-backups` | 배포 백업 보관 위치 (대상별 최근 10개 유지) |
| `DEPLOY_SITE_URL` | `https://thewoollim.com` | 상태 확인·sitemap 주소 |
| `DEPLOY_SSH_USER` | `admin` | 접속 계정 |
| `DEPLOY_SSH_PORT` | `22` | SSH 포트 |
| `DEPLOY_ACCESS_MODE` | `direct` | `direct` 또는 `aws-sg-temporary` |
| `DEPLOY_FILE_OWNER` | (비움) | 반영 파일 소유자 (`rsync --chown`). **현재 설정: `admin:admin`** — 서버 기존 파일과 같은 소유자로 맞춤. 비우면 반영된 파일이 root 소유가 될 수 있음 |
| `AWS_REGION` | — | `aws-sg-temporary` 일 때 필수 |
| `AWS_SECURITY_GROUP_ID` | — | `aws-sg-temporary` 일 때 필수 |
| `AWS_DEPLOY_ROLE_ARN` | — | `aws-sg-temporary` 일 때 필수 (GitHub OIDC 신뢰 IAM 역할) |

### 5-4. production 환경 (main 전용, 별도 배포 승인 없음)

설정 위치: **Settings → Environments → `production`**

| 설정 | 값 | 의미 |
|---|---|---|
| Required reviewers | 없음 | 배포 실행에 별도 승인 단계가 없습니다. 대표·개발자가 각자 바로 실행합니다 |
| Deployment branches | `main` 만 | `main` 의 워크플로만 서버 접속 키를 쓸 수 있습니다. 다른 브랜치의 실행은 production 작업으로 넘어가지 못합니다 |
| Allow administrators to bypass | 꺼짐 | 환경 보호 규칙을 관리자도 건너뛰지 않도록 유지합니다 |

- 이 환경을 쓰는 작업: `plan`, `deploy`, `rollback-list`, `rollback` (`build` 는 쓰지 않음)
- 서버에 올라가는 코드는 `main` 에 병합된 코드뿐이고, `main` 병합에는 상대방의 PR 승인 1명이 필요합니다(11장 "코드 변경 승인").
- 다른 브랜치에서는 `plan` 의 서버 비교도 할 수 없습니다. 변경은 PR 로 `main` 에 병합한 뒤 `plan` 을 실행합니다.

## 6. 서버·AWS 쪽 준비 (담당자가 직접 진행)

> 아래 작업은 서버·AWS 설정 변경이므로 담당자가 직접 하거나, 별도 승인 후 진행합니다.

1. **배포 전용 SSH 키 만들기** — 담당자 PC 에서 새 키 쌍 생성 (예: `ssh-keygen -t ed25519 -C github-actions-deploy`).
   - 공개키 → 서버 `admin` 계정의 `~/.ssh/authorized_keys` 에 추가
   - 개인키 → **production 환경 Secret** `DEPLOY_SSH_PRIVATE_KEY` 에만 등록, PC 에서는 등록·검증 후 안전하게 보관 또는 삭제
   - 문제가 생기면 이 공개키 한 줄만 지우면 GitHub 의 접속 권한이 즉시 사라집니다.
2. **호스트 키 확인** — `ssh-keyscan -t ed25519 <서버주소>` 결과가 실제 서버의 키와 같은지 지문으로 확인 후 **production 환경 Secret** `DEPLOY_SSH_KNOWN_HOSTS` 에 등록.
3. **서버 확인 사항**
   - `rsync` 설치 여부
   - `admin` 계정의 비밀번호 없는 `sudo` 가능 여부 (`sudo -n true`)
   - `admin` 계정이 임시 경로(`DEPLOY_STAGING_DIR`, 현재 `/home/admin/deploy-staging`)를 만들고 쓸 수 있는지 (첫 배포 때 워크플로가 자동 생성)
4. **(권장 방식 C 를 쓸 때) AWS 설정**
   - IAM → 자격 증명 공급자에 GitHub OIDC(`token.actions.githubusercontent.com`) 추가
   - IAM 역할 생성: 신뢰 조건을 이 저장소(`repo:songjungdal/thewoollim:*`)로 제한, 권한은 해당 보안그룹 하나에 대한 `ec2:AuthorizeSecurityGroupIngress`, `ec2:RevokeSecurityGroupIngress` 만
   - 보안그룹의 기존 22번 허용 규칙은 담당자 IP 등 필요한 것만 남김

## 7. 처음 가동하는 순서

1. 워크플로 PR 을 상대방이 승인한 뒤 병합 (잠금 상태 그대로)
2. 빌드용 Repository Secret 3개 등록 → `plan` 실행 → **빌드·검사만** 통과하는지 확인
3. 6장의 서버 준비 + `production` 환경 설정(5-4) + 서버 접속 Secret 3개를 **production 환경**에 등록
4. `plan` 실행 → 실행 요약의 **변경 목록**과 **삭제 예정 0건**(API) 확인
5. `rollback-list` 실행 → 서버 접속·sudo 확인 (백업은 아직 없음)
6. Repository Secrets 에 서버 접속용 같은 이름이 남아 있지 않은지 확인 (있으면 삭제) → `plan` 을 한 번 더 실행해 정상인지 확인
7. `DEPLOY_UNLOCKED: "true"` 로 바꾸는 PR → 상대방 승인 후 병합
8. 첫 배포는 `target=frontend` 또는 `target=api` 하나로 범위를 좁혀 시작 → 상태 확인 결과 검토 → 이후 `all` 사용

## 8. 평소 배포 절차 ("배포해 줘")

1. 변경 사항이 PR 로 리뷰되어(상대방 승인 1명) **main 에 병합**되어 있어야 합니다.
2. `plan` 실행 → 실행 요약에서 바뀔 파일 목록 확인
3. 확인 후 `deploy` 실행 (`confirm=DEPLOY`, 같은 target) — 별도 승인 없이 바로 진행됩니다
4. 워크플로가 배포 계획 → 백업 → 반영 → 상태 확인을 자동으로 진행
5. 실행 요약에서 결과와 **백업 이름** 확인

Claude Code 에서 "배포해 줘"라고 요청하면 Claude 는 위 순서대로 진행합니다. `plan` 결과를 먼저 보고하고, 요청자의 명시적 승인을 받은 뒤에만 `deploy` 를 실행합니다. (CLAUDE.md 의 "운영 배포 규칙" 참고)

## 9. 백업과 롤백

- `deploy` 는 대상별로 반영 **직전**에 백업합니다: `<날짜-시간>-<커밋7자리>.<frontend|api>.tar.gz`
  - frontend 백업: 웹 루트 전체에서 `api/`, `uploads/` 제외
  - api 백업: `api/` 에서 비밀 설정·데이터·세션·로그 제외
- 되돌리기: `rollback-list` 로 이름 확인 → `rollback`, `backup_name=<파일이름>`, `confirm=ROLLBACK`
- 한계: 백업 시점의 파일을 다시 덮어쓰는 방식이라, 문제 배포로 **새로 생긴 파일은 남습니다**(정적 파일은 영향 없음, 새 PHP 파일은 담당자가 확인). DB 변경은 롤백되지 않습니다.

## 10. 배포 후 상태 확인 (자동)

`healthcheck.sh` 가 다음을 확인하고, 하나라도 실패하면 워크플로가 실패로 표시됩니다.

- 메인 `/`, 파티 상세 `/party/1/`, 환불규정 `/refund/` → 200 응답
- 없는 주소 → 404 응답
- `/api/parties.php` → 200 응답이고 본문이 JSON 배열(`[` … `]`)일 것. 오류 응답(`{"ok":false,...}`)이나 HTML 페이지는 실패로 봅니다.
- `/api/admin/company.php` → 200 응답이고 본문에 `company` 포함
- 메인 화면이 참조하는 JS 파일 → 200 응답 (구버전 파일 참조 문제 확인)

실패하면 실행 요약의 백업 이름으로 즉시 롤백을 검토합니다. 결제·로그인·문자 등은 자동 확인 대상이 아니므로, 담당자가 화면에서 직접 확인합니다.

## 11. 알아둘 점

- **.htaccess**: 요청에 따라 서버의 `.htaccess` 를 보존하도록 했습니다. 저장소의 `public/.htaccess` 를 수정해도 자동 반영되지 않으므로, 바꿀 때는 서버에서 따로 적용해야 합니다.
- **파일 소유자**: 반영은 `sudo rsync` 로 하므로 소유자를 지정하지 않으면 변경된 파일이 root 소유가 될 수 있습니다. 현재 `DEPLOY_FILE_OWNER=admin:admin` 으로 서버 기존 파일과 같은 소유자로 맞춥니다. 비밀 설정·운영 데이터·업로드·세션은 배포 대상이 아니므로 소유자가 바뀌지 않습니다.
- **코드 변경 승인**: `main` 에는 PR 로만 병합하며, 작성자가 아닌 상대방 1명의 승인이 필요합니다. 새 커밋을 올리면 기존 승인이 취소되고, 마지막으로 커밋을 올린 사람이 아닌 사람이 승인해야 합니다. 상대방 PR 에는 직접 커밋하지 말고 의견으로 남깁니다.
- **공개 저장소**: Actions 실행 기록·실행 요약·결과 파일은 누구나 볼 수 있습니다. Secret 값은 자동으로 가려지고, 접속 확인 단계는 서버 이름을 출력하지 않습니다.
- **배포 권한**: 저장소 쓰기 권한이 있는 대표·개발자는 각자 별도 승인 없이 `main` 의 코드를 배포·되돌리기 할 수 있습니다. 배포 전에 `plan` 결과를 확인합니다.
- **Mac 수동 배포**: 기존 `.pem` 키로 하는 수동 배포는 GitHub Actions(PR 승인·`main` 전용 제한)를 거치지 않습니다. 사용 원칙은 대표·개발자가 정합니다.
- **문자 예약발송 타이머(systemd)**, DB 마이그레이션, PHP 비밀 설정 변경은 이 워크플로의 범위가 아닙니다.
- **외부 액션**: `actions/checkout`, `setup-node`, `upload-artifact`, `download-artifact`, `aws-actions/configure-aws-credentials` 를 커밋 SHA 로 고정했습니다(버전은 주석). 업데이트할 때도 SHA 로 바꿉니다.
- **GITHUB_TOKEN 권한**: 기본값은 권한 없음(`permissions: {}`). 빌드는 `contents: read`, 서버를 다루는 작업은 `contents: read` + `id-token: write`(AWS 임시 자격증명용)만 씁니다. checkout 은 토큰을 남기지 않도록 `persist-credentials: false` 입니다.
- 워크플로 파일(`.github/workflows/`)을 push 하려면 GitHub 토큰에 workflow 권한이 필요합니다.
