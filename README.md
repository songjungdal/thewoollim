# 어울림 (thewoollim)

로테이션 소개팅 브랜드 **어울림**의 홈페이지 저장소입니다. 매칭파티 신청, 결제, 프로필 작성, 참가 확정, 현장 매칭 투표, 후기까지 한 사이트에서 처리합니다.

- 운영 사이트: https://thewoollim.com/
- 기획·디자인 설명서: [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md)
- 배포 가이드: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- 개발 명세서: [`docs/specs/`](docs/specs/)
- AI 코딩 도구용 작업 규칙: [`AGENTS.md`](AGENTS.md) (Claude Code는 [`CLAUDE.md`](CLAUDE.md)가 이 파일을 불러옴)

## 구조

```
브라우저 ──▶ 정적 화면 (Next.js 빌드 결과 out/)
   │
   └────▶ /api/*.php (PHP) ──▶ MySQL/MariaDB  : 회원, 후기, 현장스케치, 관리자 메모, 매칭 투표
                          ├──▶ api/data/*.json : 파티, 예약, 장바구니, 쿠폰 (서버에만 존재)
                          └──▶ 토스페이먼츠 · 포트원(다날) · 알리고 SMS
```

| 구분 | 기술 |
|---|---|
| 화면 | Next.js 16 (App Router, 정적 export), React 19, Tailwind CSS 4, TypeScript |
| 서버 | PHP + PDO (MySQL/MariaDB) |
| 결제 / 본인인증 / 문자 | 토스페이먼츠, 포트원 V2 + 다날, 알리고 |
| 운영·배포 | AWS EC2, GitHub Actions 수동 배포 |

## 개발 환경

Node.js 22 기준입니다(배포 워크플로와 동일).

```bash
npm ci               # 의존성 설치
npm run dev          # 화면 개발 서버 (http://localhost:3000)
npx tsc --noEmit     # 타입 검사
npx eslint .         # 린트
npm run build        # 정적 빌드 → out/
```

알아둘 점

- `npm run dev`에는 PHP API가 없어서 로그인, 파티 목록, 예약 같은 데이터는 불러오지 못합니다. 화면 배치 확인용입니다.
- `npm run build` 직전에 `scripts/sync-company.mjs`가 운영 사이트에서 회사정보(푸터)를 받아 `app/lib/company-snapshot.json`에 저장합니다. 받아오지 못하면 기존 값을 그대로 씁니다.
- PHP 파일은 `php -l <파일>`로 문법을 검사합니다. 저장소만으로는 PHP API를 실행할 수 없습니다(아래 설정 파일 필요).

## 설정 값

**빌드할 때 필요한 값** (`.env.local` 또는 GitHub Secrets). 화면 파일에 들어가 브라우저에 공개되는 값입니다.

| 이름 | 내용 |
|---|---|
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 토스 결제위젯 클라이언트 키 |
| `NEXT_PUBLIC_PORTONE_STORE_ID` | 포트원 상점 ID |
| `NEXT_PUBLIC_PORTONE_IDENTITY_CHANNEL_KEY` | 포트원 본인인증 채널 키 |
| `NEXT_PUBLIC_SITE_URL` | (선택) sitemap 주소. 기본값 `https://thewoollim.com` |
| `COMPANY_API_URL` | (선택) 빌드 시 회사정보를 받아올 주소 |

**서버에만 두는 PHP 설정 파일** (저장소에는 템플릿만 있음, 커밋 금지)

| 템플릿 | 실제 파일 | 내용 |
|---|---|---|
| `api/db-config.example.php` | `api/db-config.php` | DB 접속 |
| `api/auth/sms-config.example.php` | `api/auth/sms-config.php` | 알리고 문자 |
| `api/auth/oauth-config.example.php` | `api/auth/oauth-config.php` | 소셜 로그인 |
| `api/auth/portone-config.example.php` | `api/auth/portone-config.php` | 포트원 본인인증 |
| `api/payments/toss-config.example.php` | `api/payments/toss-config.php` | 토스 결제 |

## 협업 방식

- `main`에 직접 올리지 않고 브랜치 → PR → 작성자가 아닌 1명 승인 → 병합 순서로 진행합니다.
- 커밋 메시지는 `종류(범위): 한국어 요약` 형식입니다. 예: `feat(payments): 파티별 정원 검사`
- 운영 배포는 GitHub Actions → **Deploy (manual)** 로만 합니다. 서버에 직접 올리지 않습니다. 절차는 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)를 참고하세요.
- 화면 구성, 기능, 예약·결제 규칙이 바뀌면 같은 PR에서 `docs/PROJECT_OVERVIEW.md`도 고칩니다.
