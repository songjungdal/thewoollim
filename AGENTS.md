<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 어울림(thewoollim) 저장소 작업 규칙

이 저장소에서 일하는 모든 코딩 에이전트(Claude Code, Codex 등)가 따르는 공통 규칙이다.

- 화면·기능·비즈니스 로직의 자세한 설명: `docs/PROJECT_OVERVIEW.md`
- 운영 배포 절차와 설정: `docs/DEPLOYMENT.md`
- 개발 명세서: `docs/specs/` (명세서가 있는 작업은 명세서의 "변경하지 않는 것"과 완료 기준을 지킨다)

작업 전에 관련 코드를 직접 읽는다. 이 문서나 위 문서의 설명이 코드와 다르면 코드가 기준이다.

## 1. 구조 한눈에 보기

| 구분 | 내용 |
|---|---|
| 서비스 | thewoollim.com. 오프라인 매칭파티(1:1 로테이션 소개팅) 신청·결제·운영 사이트. 솔로파티 도입 진행 중(`docs/specs/party-type-solo.md`) |
| 화면 | Next.js 16 App Router + React 19 + Tailwind CSS 4 + TypeScript. `next.config.ts`의 `output: "export"`로 **정적 HTML(`out/`)** 을 만든다 |
| 서버 | `api/` 아래 PHP 파일. 브라우저가 `/api/*.php`를 직접 호출한다 |
| 데이터 | 회원·후기·현장스케치·관리자 메모·매칭 투표는 MySQL/MariaDB(PDO, `api/db.php`). 파티·예약·장바구니·쿠폰·관리자 활동 기록은 서버의 `api/data/*.json` 파일 |
| 외부 연동 | 토스페이먼츠(결제), 포트원 V2 + 다날(본인인증), 알리고(SMS), 카카오·네이버·구글 로그인(현재 화면에서 숨김) |
| 운영 | AWS EC2. 배포는 GitHub Actions 수동 워크플로로만 한다(13장) |

## 2. 폴더

| 경로 | 내용 |
|---|---|
| `app/` | 화면. 폴더 이름이 URL이다. 대부분 `"use client"` 컴포넌트 |
| `app/components/` | 공통 컴포넌트(Header, Footer, ReviewBoard 등) |
| `app/context/AuthContext.tsx` | 로그인·장바구니·예약·프로필 전역 상태 |
| `app/lib/` | 공통 규칙과 데이터(가격, 환불, 참가 자격, 시간 포맷, 테스트 회원 등) |
| `app/admin****/` | 관리자 로그인·대시보드 (실제 폴더 이름은 문서에 적지 않는다, 12장) |
| `api/lib.php` | PHP 공통 헬퍼(JSON 응답, 파일 잠금, 가격·정원·쿠폰 계산 등) |
| `api/auth/`, `api/payments/`, `api/admin/`, `api/matching/` | 로그인·본인인증 / 결제 / 관리자 전용 / 매칭 투표 API |
| `api/cron/` | 서버 타이머로 실행되는 문자 발송 배치(CLI 전용) |
| `api/**/*.example.php` | 비밀 설정 파일의 템플릿. 실제 설정 파일은 서버에만 있다 |
| `db/migrations/` | `users` 테이블 SQL만 있다. 다른 DB 테이블의 생성 SQL은 저장소에 없다 |
| `scripts/deploy/`, `.github/workflows/deploy.yml` | 배포 스크립트와 워크플로 |
| `scripts/sync-company.mjs` | 빌드 직전 운영 API에서 회사정보를 받아 `app/lib/company-snapshot.json`에 저장 |
| `public/` | 이미지, `robots.txt`, `.htaccess` |

**쓰지 않는 것**: `next-auth`, `prisma`, `@prisma/client`, `prisma/`, `prisma.config.ts`, `dev.db`는 초기 템플릿 흔적이다. 새 코드에서 쓰지 않는다. `scratch/`는 실험용 파일이며 배포 패키지에 들어가지 않는다. 이것들을 지우거나 정리하는 일은 사용자 확인 후에만 한다.

## 3. 명령어

| 명령 | 용도 |
|---|---|
| `npm ci` | 의존성 설치 |
| `npm run dev` | 화면 개발 서버. **PHP API가 없으므로 `/api/*.php` 호출은 실패한다.** 화면 배치 확인용으로만 쓴다 |
| `npx tsc --noEmit` | 타입 검사 |
| `npx eslint .` | 린트 (배포 워크플로는 오류 시 중단, 경고는 허용) |
| `npm run build` | 정적 빌드(`out/`). `prebuild`가 운영 API에서 회사정보를 받아 `app/lib/company-snapshot.json`을 갱신할 수 있다. 네트워크가 안 되면 기존 파일을 그대로 둔다 |
| `php -l <파일>` | PHP 문법 검사 |

- 저장소에는 로컬 PHP·DB 실행 환경이 없다. 비밀 설정 파일(`*-config.php`)과 `api/data/`가 없으면 API는 동작하지 않는다.
- 그래서 PHP 변경은 `php -l`과 코드 읽기로 검증하고, 실제 서버 동작 확인이 필요한 부분은 작업 보고에 따로 적는다.
- 자동 테스트는 없다.

## 4. 화면(Next.js) 작성 규칙

- **정적 export 제약**: 요청마다 서버에서 실행되는 기능은 쓸 수 없다(Server Actions, middleware, 요청 시점 렌더링, `cookies()`·`headers()`, 이미지 최적화 등). 확신이 없으면 `node_modules/next/dist/docs/`에서 static export 제약을 확인한다. 서버 로직이 필요하면 PHP API로 만든다.
- **동적 경로**는 `generateStaticParams`로 미리 만든 경로만 존재한다. 파티 상세(`app/party/[id]/page.tsx`)는 id 1~500만 만든다. 501번 이후 파티는 상세 페이지가 없을 수 있다.
- **데이터 호출**: 화면이 열린 뒤 `fetch("/api/....php")`로 받는다. 로그인이 필요한 호출은 기존 코드처럼 `credentials: "include"`, `cache: "no-store"`를 쓴다.
- **주소**: `trailingSlash: true`라서 내부 링크는 `/mypage/`처럼 `/`로 끝낸다.
- **`NEXT_PUBLIC_*` 값**은 빌드할 때 화면 파일에 박히고 브라우저에 공개된다. 비밀값을 넣지 않는다. 값이 바뀌면 다시 빌드해야 한다.
- **시간**: 모든 시간은 한국 시간(KST)이다. 화면 표시는 `app/lib/datetime.ts`의 `formatKST`를 쓴다.
- **디자인**: 색상·폰트는 `app/globals.css`와 `docs/PROJECT_OVERVIEW.md` 5장을 따른다. 모바일과 PC를 모두 확인한다.

## 5. 서버(PHP) 작성 규칙

- 새 파일은 기존 파일처럼 `declare(strict_types=1);`로 시작하고 `api/lib.php`의 헬퍼(`jsonBody`, `jsonOut`, `jsonFail` 등)를 쓴다.
- DB는 `api/db.php`의 `getDB()`(PDO, prepared statement)로만 접근한다. 연결 직후 DB 시간대가 KST로 고정된다.
- `api/data/*.json`을 고칠 때는 반드시 `withFileLock()`으로 읽고 쓴다. 동시 결제·신청에서 데이터가 깨지는 것을 막기 위해서다.
- 회원 세션은 `api/auth/_session.php`, 관리자 세션은 `api/admin/_session.php`를 쓴다. 관리자 API는 관리자 세션 검사를 빠뜨리지 않는다.
- 결제 금액·정원·쿠폰·환불 금액은 **서버가 최종 판단**한다. 화면에서 보낸 값을 그대로 믿지 않는다.
- `api/cron/*.php`는 서버 타이머로만 실행하는 CLI 스크립트다. HTTP로 열리게 만들지 않는다.
- 문자(SMS)는 실제 비용이 드는 실발송이다. 테스트·관리자 계정을 발송 대상에서 빼는 기존 규칙을 유지하고, 개발 중에 실제 발송을 일으키지 않는다.

## 6. 화면과 서버에 같은 규칙이 있는 곳 (반드시 함께 고친다)

| 규칙 | 화면 | 서버 |
|---|---|---|
| 성별별 참가비 | `app/lib/data.ts` | `api/lib.php`(`priceForGender`), `api/payments/pending.php`·`success.php`·`vbank-submit.php` |
| 환불 비율 | `app/lib/refund.ts` | `api/admin/bookings.php`(관리자 취소 처리) |
| 테스트 회원 | `app/lib/testUsers.ts` | `api/lib.php`(`isTestUser`) |
| 문자 발송 제외 대상 | — | `api/_pending_sms.php`, `api/_profile_notify_sms.php`, `api/admin/_confirm_sms.php`, `api/admin/_cancel_sms.php`, `api/cron/*.php`, `api/auth/reset-password.php`(임시 비밀번호 문자) |

참가 자격(나이·혼인 여부)은 지금 화면(`app/lib/eligibility.ts`)에서만 검사한다.

`api/payments/refund.php`에는 예전 환불 규칙(파티 5일 전 이상 100%, 그 외 0%)이 남아 있다. 지금 화면은 이 파일을 호출하지 않고 `api/payments/cancel-request.php`로 취소를 요청한다. 환불 규칙을 바꿀 때 이 파일을 기준으로 삼지 않는다.

## 7. 조심해서 다룰 영역

회원가입·본인인증, 결제·무통장 입금, 예약 상태, 취소·환불은 실제 돈과 개인정보가 걸린 흐름이다.

- 요청받은 범위 밖의 동작을 바꾸지 않는다. 바꿔야 하면 이유를 작업 보고에 적는다.
- 예약 상태값은 `vbank_pending`, `paid_pending_profile`, `pending_approval`, `confirmed`, `completed`, `cancel_requested`, `refund_completed`, `cancelled`이다. 상태를 추가하거나 바꾸면 화면, 관리자 대시보드, 문자 발송, cron 배치를 모두 검색해 함께 고친다.
- 기존 운영 데이터(`api/data/*.json`, DB)와 호환되게 만든다. 새 필드는 없을 때의 기본값을 정해 둔다.

## 8. 작업을 마칠 때

1. 바꾼 범위에 맞게 검사한다.
   - 화면 변경: `npx tsc --noEmit`, `npx eslint .`, `npm run build`
   - PHP 변경: 바꾼 파일마다 `php -l`
2. 문서 갱신이 필요한지 판단한다(11장).
3. 작업 보고에 다음을 적는다.
   - 무엇을 왜 바꿨는지
   - 실행한 검사와 결과
   - 문서를 갱신했는지, 안 했다면 그 이유
   - 운영 서버에서 사람이 직접 확인해야 할 것

## 9. Git·PR

- `main`에 직접 push하지 않는다. 브랜치를 만들고 PR로 올린다. PR은 작성자가 아닌 다른 1명이 승인해야 병합된다.
- 커밋 메시지는 `종류(범위): 한국어 요약` 형식을 쓴다. 예: `feat(payments): ...`, `fix(deploy): ...`, `docs: ...`
  - 종류: `feat`, `fix`, `docs`, `content`(문구), `chore`, `ci`, `security`

## 10. 비밀 정보

- 실제 설정 파일(`api/db-config.php`, `api/auth/*-config.php`, `api/payments/toss-config.php`), `.env*`, `api/data/`, `api/uploads/`, 세션 폴더는 커밋하지 않는다(`.gitignore`). 설정 항목을 바꾸면 `*.example.php` 템플릿만 고친다.
- 비밀번호, API 키, SSH 키, 서버 주소는 코드·문서·커밋 메시지·PR 설명·대화에 적지 않는다.
- 저장소에 이미 알려진 보안 문제가 있다(`docs/PROJECT_OVERVIEW.md` 7-3). 해당 코드를 다룰 때 실제 값을 문서나 PR에 옮겨 적지 않는다.

## 11. 프로젝트 문서 관리 규칙

`docs/PROJECT_OVERVIEW.md`는 어울림 홈페이지의 기획·디자인 참고 문서다. 기획자와 디자이너가 읽으므로 쉬운 한국어로 쓴다.

### 문서를 함께 갱신해야 하는 작업

다음 내용이 실질적으로 바뀌는 작업에서는 같은 작업 안에서 `docs/PROJECT_OVERVIEW.md`의 해당 섹션도 갱신한다.

- 페이지 구조: 페이지 추가·삭제, URL 변경, 화면 섹션 구성이나 순서 변경, 접근 조건(로그인·관리자) 변경
- 디자인 시스템: 색상 토큰, 폰트, 공통 컴포넌트, 반응형 기준, 주요 UI 패턴 변경
- 주요 기능: 회원가입·로그인, 온보딩·프로필, 장바구니, 쿠폰, 후기, 매칭 투표, 관리자 기능의 추가·변경·삭제
- 사용자 흐름: 신청 → 결제 → 프로필 → 확정 → 투표 흐름 변경
- 예약·결제 로직: 예약 상태값, 결제 수단, 가격·할인 규칙, 정원, 환불 규정, 취소 처리 방식 변경
- 자동 알림: 문자 발송 시점·대상·주기 변경
- 데이터 저장 위치, 주요 코드 파일 경로 변경

배포 방식이 바뀌면 `docs/DEPLOYMENT.md`를, 이 문서에 적힌 구조·명령어·규칙이 바뀌면 이 `AGENTS.md`와 `README.md`도 함께 고친다.

### 문서 갱신을 생략해도 되는 작업

- 오타, 문구 미세 수정
- 동작이 바뀌지 않는 코드 정리(리팩터링, 포맷, 주석)
- 사용자에게 보이는 동작이나 규칙이 바뀌지 않는 버그 수정
- 의존성 버전의 사소한 업데이트

### 판단이 애매할 때

작업을 중단하고 질문하지 않는다. 변경이 기획·디자인·사용자 경험에 주는 영향도를 스스로 판단해 문서 갱신 여부를 정하고 작업을 끝낸다. 작업 결과 보고에는 문서를 갱신했는지, 갱신하지 않았다면 그 이유를 함께 적는다.

### 작성 원칙

- 코드가 기준이다. 문서 설명이 실제 코드와 다르면 코드에 맞게 문서를 고친다. 코드를 문서에 맞추지 않는다.
- 코드로 확인되지 않는 내용은 추측하지 말고 `[코드상 확인 불가]`로 표시한다.
- 근거가 되는 코드 파일 경로를 함께 적는다.
- 문서 상단의 기준 날짜는 실제 수정한 날짜로 갱신한다. 기준 커밋 ID는 정확하게 확인할 수 있을 때만 적고, 확인할 수 없으면 적지 않는다.
- 변경과 관련된 섹션만 수정한다. 문서 전체를 불필요하게 다시 쓰지 않는다.

## 12. 문서에 적지 않는 정보

다음 정보는 문서(`docs/`, `README.md`, 이 파일), 커밋 메시지, PR 설명에 기록하지 않는다. 필요하면 `[민감정보 생략]`으로 표시한다.

- 비밀번호, API 키, 토큰, 시크릿, 인증서
- 서버 IP·호스트명·접속 계정, DB 접속정보
- 실제 계좌번호·예금주, 사업자 개인 연락처
- 회원·관리자의 이름, 이메일, 전화번호, 생년월일 등 개인정보
- 관리자 화면의 실제 URL 경로(`/admin****`처럼 가려서 표기)

보안 문제는 기록하되, 실제 값 없이 문제의 종류와 파일 위치만 적는다.

## 13. 운영 배포 규칙

운영 배포는 GitHub Actions 워크플로 `.github/workflows/deploy.yml`("Deploy (manual)")로만 한다. 절차와 설정은 `docs/DEPLOYMENT.md`를 따른다.

- 서버에 직접 SSH·rsync로 배포하지 않는다. 서버 접속, AWS 설정 변경은 사용자의 명시적 허락 없이는 하지 않는다.
- 배포 대상은 PR로 리뷰되어 `main`에 병합된 코드뿐이다.
- "배포해 줘" 요청을 받으면 다음 순서를 지킨다.
  1. 배포할 `main` 커밋과 대상(`frontend` / `api` / `all`)을 확인한다.
  2. `mode=plan`으로 실행하고, 실행 요약의 변경 파일 수·삭제 예정·검사 결과를 사용자에게 보고한다.
  3. 사용자가 그 계획을 보고 명시적으로 승인한 경우에만 `mode=deploy`, `confirm=DEPLOY`로 실행한다.
  4. 결과(상태 확인, 백업 이름)를 보고한다. 실패하면 롤백 여부를 사용자에게 묻는다.
- `deploy.yml`의 `DEPLOY_UNLOCKED` 값, 보호 규칙(`scripts/deploy/*.rsync-filter`)은 사용자 승인 없이 바꾸지 않는다.
- SSH 개인키, 서버 주소, API 키 등 인증정보는 코드·문서·대화에 기록하지 않는다. GitHub Secrets에만 둔다.
