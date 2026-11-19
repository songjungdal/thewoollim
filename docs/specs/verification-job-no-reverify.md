# 직업 인증 "재인증 필요" 제거 수정 명세서
- 기준 코드: main 47706a2
- 관련 명세: docs/specs/photo-job-verification.md 2-4

## 1. 문제
관리자가 직업 인증 [승인]을 눌렀는데 상태가 "재인증 필요"로 나온다. (예: 프로필 직업 "회사원", 표시 직업 "직장인")

## 2. 원인 (코드 확인)
- 승인할 때 그 순간의 프로필 직업 글자를 job_text로 저장한다 (api/admin/verifications.php 247행)
- 이후 프로필 직업이 job_text와 한 글자라도 다르면
  - 배지를 숨기고 상태를 "재인증 필요"로 계산하고 (api/verification/_lib.php verifyJobBadge, verifyJobSummary)
  - 회원이 프로필 카드를 저장할 때 기록 자체를 reverify로 바꾼다 (api/profile.php 125~141행)
- 신청 흐름이 "가입 → 사진·직업 인증 → 결제 → 프로필 카드 작성" 순서라서, 직업 인증을 승인할 때는 프로필 직업이 비어 있는 경우가 많다. job_text가 빈 값으로 저장되고, 회원이 나중에 프로필 카드에 직업을 쓰는 순간 "재인증 필요"가 된다.

## 3. 결정 (대표 2026-11-19)
운영진이 서류를 보고 승인했으면 그대로 승인 상태를 유지한다. 프로필 직업 글자와 비교하지 않는다.
- 참여자 명단은 이미 직업 인증 회원에게 관리자가 입력한 "표시 직업"을 보여주고 있다 (api/party-participants.php 131행). 그래서 비교를 없애도 인증되지 않은 직업이 배지와 함께 보이지 않는다.

## 4. 변경 사항
1. api/verification/_lib.php
   - verifyJobBadge(): 승인 기록(approved 또는 예전 reverify)이 있으면 true. 프로필 직업과 비교하지 않음
   - verifyJobSummary(): 승인 기록이 있으면 status = 'approved'. 'reverify'를 돌려주지 않음
2. api/profile.php 125~141행의 reverify 전환 코드 삭제
3. api/admin/verifications.php
   - 목록 행의 status가 기록상 reverify면 approved로 내려줌
   - 승인 때 job_text 저장은 기록용으로 남겨도 되지만 판정에 쓰지 않음
4. 이미 reverify로 저장된 운영 기록은 읽을 때 approved와 똑같이 취급 (위 1·3). 운영 파일을 일괄 수정하는 작업은 하지 않음
5. "재인증 필요" 화면 문구 정리 (삭제하거나 승인과 같게 처리)
   - app/verification/VerificationClient.tsx 257·384·391·394행
   - app/mypage/VerificationSection.tsx
   - 관리자 dashboard의 VerificationReview.tsx 34행, page.tsx 1862행
6. 회원이 직업을 바꿔 다시 인증받고 싶으면 지금처럼 인증 페이지에서 새 서류를 제출할 수 있게 둠 (새 승인 시 이전 승인 기록은 기존대로 superseded)
7. docs/specs/photo-job-verification.md 2-4와 docs/PROJECT_OVERVIEW.md의 "직업 글자를 바꾸면 배지 숨김" 설명을 이번 결정에 맞게 수정

## 5. 유지할 기능 (회귀 금지)
- 직업 인증 접수·승인·반려, 서류 즉시 삭제, 결과 문자, 텔레그램 알림
- 사진 심사 전체 (결제 전 검사, [사진 심사 필수] 스위치)
- 프로필 카드 저장 (직업 외 항목 포함), 결제·예약 흐름
- 솔로파티 명단에는 직업·배지를 보여주지 않는 규칙

## 6. 완료 기준
- [ ] 프로필 직업이 빈 회원을 승인 → 상태 "승인", 이후 프로필 카드에 직업을 써도 "승인" 유지
- [ ] 프로필 직업 "회사원", 표시 직업 "직장인"으로 승인 → "승인", 매칭파티 명단에 "직장인 + 직업 인증" 배지
- [ ] 승인 후 회원이 프로필 직업을 바꿔도 배지 유지, 명단에는 표시 직업이 나옴
- [ ] 이미 reverify였던 기록(운영 데이터와 같은 모양으로 로컬 재현)이 관리자·마이페이지·명단에서 "승인"·배지로 보임
- [ ] 관리자 회원 표 "직업 인증" 열에 "재인증 필요"가 나오지 않음
- [ ] php -l, npx tsc --noEmit, npx eslint ., npm run build 통과, 사진 심사 기존 검증 회귀 통과

## 7. 구현 메모 (2026-11-19)
- 승인으로 보는 상태는 `api/verification/_lib.php`의 `VERIFY_JOB_APPROVED_STATUSES`(`approved`, 예전 `reverify`) 한 곳에 둔다. 배지(`verifyJobBadge`)·상태(`verifyJobSummary`)·명단(`api/party-participants.php`)·관리자 목록 필터와 다시 승인 때의 "대체됨" 처리가 모두 이 값을 쓴다.
- 관리자 목록 행 상태는 `verifyPublicStatus()`로 예전 `reverify`를 `approved`로 바꿔 내려준다. 운영 파일의 기록은 그대로 둔다(일괄 수정 없음).
- `verifyJobSummary()`·`verifyJobBadge()`는 프로필 직업을 더 받지 않는다(비교하지 않으므로). 그래서 `api/verification/state.php`는 회원 직업을 읽지 않는다.
- 화면의 직업 인증 상태 종류에서 "재인증 필요"를 뺐다(`app/lib/verification.ts` `JobStatus`).
