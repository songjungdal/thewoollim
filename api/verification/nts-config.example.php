<?php
/**
 * 국세청 사업자등록정보 진위확인 인증키 템플릿 — 직업 인증(사업자) 참고 조회용 (docs/specs/photo-job-verification.md 3-3).
 *  - 실제 파일: 서버의 api/verification/nts-config.php (이 템플릿을 복사해 값만 채운다, chmod 640)
 *  - 저장소에 커밋하지 않는다(.gitignore). 배포 때 덮어쓰이지 않는다(scripts/deploy/api.rsync-filter 의 *-config.php 보호).
 *  - 발급: 공공데이터포털(data.go.kr) → "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 활용 신청 → 마이페이지의 일반 인증키(Decoding)
 *  - 비어 있거나 파일이 없으면 관리자 화면에 "자동 확인 불가 — 서류로 판단" 으로 보이고 수동 심사로 진행한다.
 */
return [
    'service_key' => '',
];
