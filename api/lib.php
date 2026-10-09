<?php
/**
 * 어울림 공통 유틸리티.
 *
 * 모든 PHP 엔드포인트의 시작에서 require_once.
 * 세션 관리는 모듈별 분리:
 *   - 관리자 세션 → api/admin/_session.php (WOOLLIM_ADMIN 쿠키)
 *   - 회원 세션  → api/auth/_session.php  (WOOLLIM_USER  쿠키)  ← 다음 phase
 */

declare(strict_types=1);

// ─── 타임존 ────────────────────────────────────────────────────────
//   서버 OS(UTC) 무관 — 모든 PHP date(), strtotime() 등에 KST 적용.
//   db.php 가 require 되지 않는 엔드포인트(send-sms 등)도 동일 보장.
date_default_timezone_set('Asia/Seoul');

// ─── HTTP 응답 ────────────────────────────────────────────────────
function jsonHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
}

function jsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function jsonOut($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function jsonFail(string $error, int $status = 400, array $extra = []): void {
    jsonOut(array_merge(['ok' => false, 'error' => $error], $extra), $status);
}

// ─── 입력 검증 ────────────────────────────────────────────────────

/**
 * 휴대폰 번호 자동 하이픈 포맷팅.
 *  '01012345678'  → '010-1234-5678'
 *  '0212345678'   → '02-1234-5678'  (서울)
 *  '0311234567'   → '031-123-4567'  (지역 7자리)
 *  '03112345678'  → '031-1234-5678' (지역 8자리)
 *  잘못된 입력 → 입력값 그대로 반환
 */
function formatPhone(string $raw): string {
    $d = preg_replace('/\D+/', '', $raw);
    if ($d === null || $d === '') return $raw;
    $len = strlen($d);

    // 휴대폰 010/011/016/017/018/019
    if (preg_match('/^01[016789]/', $d)) {
        if ($len === 10) return substr($d,0,3).'-'.substr($d,3,3).'-'.substr($d,6,4);
        if ($len === 11) return substr($d,0,3).'-'.substr($d,3,4).'-'.substr($d,7,4);
    }
    // 서울 02
    if (str_starts_with($d, '02')) {
        if ($len === 9)  return '02-'.substr($d,2,3).'-'.substr($d,5,4);
        if ($len === 10) return '02-'.substr($d,2,4).'-'.substr($d,6,4);
    }
    // 그 외 지역번호 (031, 032 …)
    if ($len === 10) return substr($d,0,3).'-'.substr($d,3,3).'-'.substr($d,6,4);
    if ($len === 11) return substr($d,0,3).'-'.substr($d,3,4).'-'.substr($d,7,4);

    return $raw; // 알 수 없는 패턴은 원본 유지
}

function normalizeEmail(string $email): string {
    return strtolower(trim($email));
}

/**
 * 테스트 회원 식별.
 *  패턴: a1@naver.com ~ a10@naver.com / b1@naver.com ~ b10@naver.com
 *  → 프로필 핵심 5종 잠금 해제 (관리자 권한 부여 — 테스트 편의)
 *  클라이언트 동일 로직: app/lib/testUsers.ts
 */
function isTestUser(string $email): bool {
    $e = normalizeEmail($email);
    return (bool)preg_match('/^(a|b)([1-9]|10)@naver\.com$/', $e);
}

// ─── 회원·참가자 표시 헬퍼 ─────────────────────────────────────────

/**
 * 한글 이름 → 성씨 + 마스킹.
 *  '홍길동'  → '홍**'
 *  '이재용'  → '이**'
 *  '김지'    → '김*'
 *  '남궁민'  → '남궁*'   (성씨 두 글자 화이트리스트)
 *  영문 입력 → 첫 글자 + 나머지 마스킹
 */
function maskName(string $name): string {
    $name = trim($name);
    if ($name === '') return '';

    $TWO_CHAR_SURNAMES = ['남궁','황보','선우','독고','서문','동방','사공','제갈','어금'];
    foreach ($TWO_CHAR_SURNAMES as $sn) {
        if (str_starts_with($name, $sn)) {
            $rest = mb_substr($name, mb_strlen($sn));
            return $sn . str_repeat('*', max(1, mb_strlen($rest)));
        }
    }
    $first = mb_substr($name, 0, 1);
    $rest  = mb_substr($name, 1);
    if ($rest === '') return $first . '*';
    return $first . str_repeat('*', mb_strlen($rest));
}

/**
 * 'YYYY-MM-DD' 또는 DateTime → 만 나이 → 연령대 라벨.
 *  ~24세 → '20대 초반'
 *  25~27 → '20대 중반'
 *  28~29 → '20대 후반'
 *  30~32 → '30대 초반'
 *  ...
 *  비유효 → ''
 */
function ageBand(string $birthDate): string {
    $age = calcAgeFromBirthDate($birthDate);
    if ($age <= 0) return '';

    $decade = intdiv($age, 10) * 10;
    $within = $age - $decade;
    $stage  = $within <= 4 ? '초반' : ($within <= 7 ? '중반' : '후반');
    return $decade . '대 ' . $stage;
}

function calcAgeFromBirthDate(string $birthDate): int {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $birthDate, $m)) return 0;
    $by = (int)$m[1]; $bm = (int)$m[2]; $bd = (int)$m[3];
    $now = new DateTimeImmutable('today');
    $age = (int)$now->format('Y') - $by;
    if ((int)$now->format('n') < $bm
        || ((int)$now->format('n') === $bm && (int)$now->format('j') < $bd)) {
        $age--;
    }
    return max(0, $age);
}

// ─── 파일 락 헬퍼 (party_counts 등 atomic 읽기/쓰기) ───────────────

/**
 * 파일을 LOCK_EX 로 잠그고 callback($current) 의 반환값을 다시 씀.
 *  $callback 가 null 을 반환하면 쓰기 skip (읽기 전용 트랜잭션).
 */
function withFileLock(string $path, callable $callback) {
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException("cannot open $path");

    flock($fp, LOCK_EX);
    try {
        $raw = stream_get_contents($fp);
        $cur = $raw ? json_decode($raw, true) : [];
        if (!is_array($cur)) $cur = [];

        $next = $callback($cur);

        if ($next !== null) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($next, JSON_UNESCAPED_UNICODE));
            fflush($fp);
        }
        return $next;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

// ─── 성별별 참가비 ────────────────────────────────────────────────
//   priceMale / priceFemale 우선, 미설정 또는 0 이면 price 폴백.
//   클라이언트(priceForGender) 와 동일 규칙 — 결제 금액 검증 일치.
function priceForGender(array $party, string $gender): int {
    $male   = (int)($party['priceMale']   ?? 0);
    $female = (int)($party['priceFemale'] ?? 0);
    if ($gender === '남성' && $male   > 0) return $male;
    if ($gender === '여성' && $female > 0) return $female;
    return (int)($party['price'] ?? 0);
}

// ─── 파티별 성별 정원 ──────────────────────────────────────────────
// 결제 마감 기준 — parties.json 의 maleStock / femaleStock. 값이 없거나 0 이하면 12.
//   사용처: payments/pending.php · vbank-submit.php (결제창 열기 전 사전 검사),
//           payments/success.php (토스 승인 뒤 atomic 검사), admin/bookings.php (confirm_vbank).
function partyStockLimit(array $party, string $genderKey): int {
    $stock = (int)($party[$genderKey === 'male' ? 'maleStock' : 'femaleStock'] ?? 0);
    return $stock > 0 ? $stock : 12;
}

// 결제 전 사전 검사 — 현재 인원 + 1 이 상한을 넘는 partyId 목록. (잠금 없는 읽기: 최종 판정은 success.php / confirm_vbank)
function partiesOverStock(array $partyIds, array $partyMap, string $genderKey): array {
    $counts = json_decode((string)@file_get_contents(dataDir() . '/party_counts.json'), true);
    if (!is_array($counts)) $counts = [];
    $over = [];
    foreach ($partyIds as $pid) {
        $cur = (int)($counts[$pid][$genderKey] ?? 0);
        if ($cur + 1 > partyStockLimit($partyMap[$pid] ?? [], $genderKey)) $over[] = $pid;
    }
    return $over;
}

// ─── 파티 종류 (매칭파티 / 솔로파티) ───────────────────────────────
// 저장값은 영문 코드. 값이 없거나 허용 목록 밖이면 matching (기존 파티는 데이터 변환 없이 매칭파티).
//   화면 쪽 같은 정의: app/lib/data.ts (PARTY_TYPES, partyTypeOf)
const PARTY_TYPE_LABELS = ['matching' => '매칭파티', 'solo' => '솔로파티'];

function partyTypeOf(array $party): string {
    $t = (string)($party['partyType'] ?? '');
    return isset(PARTY_TYPE_LABELS[$t]) ? $t : 'matching';
}

function partyTypeLabel(array $party): string {
    return PARTY_TYPE_LABELS[partyTypeOf($party)];
}

// ─── 상세페이지 안내 (detail) 검증 ──────────────────────────────────
// 구조·기본 내용: app/lib/partyDetailTemplates.ts. 입력 제한은 같은 파일의 DETAIL_LIMITS 와 일치해야 한다.
const PARTY_DETAIL_IMAGE_SLOTS = ['beforeApply', 'afterApply', 'beforeTimeline', 'beforeNotice', 'afterNotice'];
const PARTY_DETAIL_IMAGE_SLOT_LABELS = [
    'beforeApply'    => '사진 ① 참가 신청 방법 위',
    'afterApply'     => '사진 ② 참가 신청 방법 아래',
    'beforeTimeline' => '사진 ③ 진행 안내 위',
    'beforeNotice'   => '사진 ④ 필수 확인 사항 위',
    'afterNotice'    => '사진 ⑤ 필수 확인 사항 아래',
];

// 제어문자 제거 — 줄바꿈 허용 필드($multiline)는 줄바꿈만 남기고, 한 줄 필드는 공백으로 바꾼다.
function cleanDetailText($v, bool $multiline): string {
    $s = str_replace(["\r\n", "\r"], "\n", (string)$v);
    $s = (string)preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', $s);
    if (!$multiline) $s = str_replace("\n", ' ', $s);
    return trim($s);
}

// 길이 초과 시 RuntimeException(한국어 사유) — 관리자 저장 요청에서 jsonFail 로 전달된다.
function detailTextField(array $src, string $key, int $max, bool $multiline, string $label): string {
    $s = cleanDetailText($src[$key] ?? '', $multiline);
    if (mb_strlen($s) > $max) throw new RuntimeException("{$label}은(는) {$max}자 이하로 입력해주세요. (현재 " . mb_strlen($s) . "자)");
    return $s;
}

/**
 * 관리자 입력 detail 정규화 + 입력 제한 검사. 알려진 필드만 남긴다.
 * 넘치거나 허용되지 않은 값이면 RuntimeException (저장 거절).
 */
function sanitizePartyDetail($d): array {
    if (!is_array($d)) throw new RuntimeException('상세페이지 안내 형식이 올바르지 않습니다.');
    $tl   = is_array($d['timeline'] ?? null)  ? $d['timeline']  : [];
    $du   = is_array($d['durations'] ?? null) ? $d['durations'] : [];
    $imgs = is_array($d['images'] ?? null)    ? $d['images']    : [];

    $stepsIn = is_array($tl['steps'] ?? null) ? array_values($tl['steps']) : [];
    if (count($stepsIn) > 10) throw new RuntimeException('진행 단계는 10개까지 입력할 수 있습니다.');
    $steps = [];
    foreach ($stepsIn as $i => $st) {
        if (!is_array($st)) throw new RuntimeException('진행 단계 형식이 올바르지 않습니다.');
        $n = $i + 1;
        $step = [
            'title' => detailTextField($st, 'title', 60,  false, "단계 {$n} 제목"),
            'time'  => detailTextField($st, 'time',  20,  false, "단계 {$n} 소요시간"),
            'desc'  => detailTextField($st, 'desc',  500, true,  "단계 {$n} 설명"),
            'note'  => detailTextField($st, 'note',  200, true,  "단계 {$n} 참고 문구"),
        ];
        if ($step['title'] === '') throw new RuntimeException("단계 {$n}의 제목을 입력해주세요.");
        if ($step['desc'] === '')  throw new RuntimeException("단계 {$n}의 설명을 입력해주세요.");
        $steps[] = $step;
    }

    $rowsIn = is_array($du['rows'] ?? null) ? array_values($du['rows']) : [];
    if (count($rowsIn) > 6) throw new RuntimeException('소요 시간 안내는 6줄까지 입력할 수 있습니다.');
    $rows = [];
    foreach ($rowsIn as $i => $r) {
        if (!is_array($r)) throw new RuntimeException('소요 시간 안내 형식이 올바르지 않습니다.');
        $n = $i + 1;
        $rows[] = [
            'label' => detailTextField($r, 'label', 30, false, "소요 시간 {$n}번째 줄 구분"),
            'total' => detailTextField($r, 'total', 30, false, "소요 시간 {$n}번째 줄 시간"),
        ];
    }

    $images = [];
    foreach (PARTY_DETAIL_IMAGE_SLOTS as $slot) {
        $list = is_array($imgs[$slot] ?? null) ? array_values($imgs[$slot]) : [];
        $label = PARTY_DETAIL_IMAGE_SLOT_LABELS[$slot];
        if (count($list) > 10) throw new RuntimeException("{$label}: 사진은 10장까지 넣을 수 있습니다.");
        $out = [];
        foreach ($list as $i => $img) {
            if (!is_array($img)) throw new RuntimeException("{$label}: 사진 형식이 올바르지 않습니다.");
            $url = trim((string)($img['url'] ?? ''));
            // /uploads/parties/파일명 또는 /images/파일명 만 허용 (외부 주소 불가). '.', '..' 같은 이름도 막는다.
            if (!preg_match('#^/(uploads/parties|images)/[A-Za-z0-9._-]+$#', $url) || preg_match('#/\.+$#', $url)) {
                throw new RuntimeException("{$label}: 허용되지 않은 사진 주소입니다.");
            }
            $out[] = ['url' => $url, 'alt' => detailTextField($img, 'alt', 100, false, "{$label} " . ($i + 1) . "번째 사진 대체 텍스트")];
        }
        $images[$slot] = $out;
    }

    return [
        'timeline'  => [
            'title' => detailTextField($tl, 'title', 60,  false, '진행 안내 제목'),
            'intro' => detailTextField($tl, 'intro', 200, false, '소개 문구'),
            'steps' => $steps,
        ],
        'durations' => [
            'title' => detailTextField($du, 'title', 60, false, '소요 시간 안내 제목'),
            'rows'  => $rows,
        ],
        'images'    => $images,
    ];
}

// 관리자 활동 기록용 요약 — detail 전체 대신 개수만 남긴다.
function partyDetailCounts(array $detail): string {
    $steps  = count($detail['timeline']['steps'] ?? []);
    $photos = 0;
    foreach (PARTY_DETAIL_IMAGE_SLOTS as $slot) $photos += count($detail['images'][$slot] ?? []);
    return "단계 {$steps}개, 사진 {$photos}장";
}

// ─── 쿠폰 할인 계산 ────────────────────────────────────────────────
//   amount  : KRW 정액 차감 (lineTotal 초과 안 함)
//   percent : lineTotal × (amount/100), max_discount 가 양수면 그 한도로 캡, 0원 미만 방지.
//   서버측 단일 진실 — pending.php / success.php 가 모두 이 함수로 계산.
function calcCouponDiscount(array $coupon, int $lineTotal): int {
    if ($lineTotal <= 0) return 0;
    $type   = (string)($coupon['discount_type'] ?? 'amount');
    $amount = max(0, (int)($coupon['amount'] ?? 0));

    if ($type === 'percent') {
        $discount = (int)floor($lineTotal * $amount / 100);
        $maxDisc  = max(0, (int)($coupon['max_discount'] ?? 0));
        if ($maxDisc > 0) $discount = min($discount, $maxDisc);
        return min($discount, $lineTotal);
    }
    return min($amount, $lineTotal);
}

// ─── 쿠폰 성별 대상 제한 ────────────────────────────────────────────
//   maleAllowed / femaleAllowed 가 명시적으로 false 인 경우만 차단.
//   필드 자체가 없는 기존(구버전) 쿠폰 데이터는 항상 허용 — 하위호환 유지.
//   서버측 단일 진실 — coupons-validate.php / pending.php / success.php /
//   vbank-submit.php 가 모두 이 함수로 판정.
function couponAllowsGender(array $coupon, string $gender): bool {
    if ($gender === '남성') return !array_key_exists('maleAllowed', $coupon)   || !empty($coupon['maleAllowed']);
    if ($gender === '여성') return !array_key_exists('femaleAllowed', $coupon) || !empty($coupon['femaleAllowed']);
    return true;
}

// ─── 쿠폰 사용 횟수 (max_count 검증용) ──────────────────────────────
function countCouponUsages(array $usages, string $code): int {
    $code = strtoupper($code);
    $n = 0;
    foreach ($usages as $u) {
        if (strtoupper((string)($u['code'] ?? '')) === $code) $n++;
    }
    return $n;
}

// ─── 쿠폰 사용 이력 해제 (취소/환불 시 "사용 안 한 것처럼" 복원) ──────────────
//   coupon_usages.json 에서 해당 code+email 사용 기록을 제거.
//   - 동일 사용자 재사용 차단 검사(coupons-validate.php/pending.php/success.php/
//     vbank-submit.php)와 max_count 집계(countCouponUsages)가 모두 이 파일을
//     그때그때 다시 읽어 판정하므로, 기록만 지우면 재사용 가능 여부·잔여 발급
//     수량·관리자 화면의 "사용 N건" 표시까지 자동으로 원복됨(다른 로직 수정 불필요).
//   - 한 사용자는 같은 코드를 1회만 쓸 수 있어(중복 사용 차단) 매칭 건은 최대 1개.
function releaseCouponUsage(string $code, string $email): void {
    if ($code === '' || $email === '') return;
    $file = dataDir() . '/coupon_usages.json';
    if (!file_exists($file)) return;
    $fp = fopen($file, 'c+');
    if (!$fp) return;
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $usages = $raw ? json_decode($raw, true) : [];
    if (!is_array($usages)) $usages = [];
    $next = array_values(array_filter($usages, function ($u) use ($code, $email) {
        if (!is_array($u)) return true;
        $sameCode  = strtoupper((string)($u['code']  ?? '')) === strtoupper($code);
        $sameEmail = strtolower((string)($u['email'] ?? '')) === strtolower($email);
        return !($sameCode && $sameEmail);
    }));
    ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($next, JSON_UNESCAPED_UNICODE));
    fflush($fp); flock($fp, LOCK_UN); fclose($fp);
}

// ─── 데이터 디렉토리 경로 ──────────────────────────────────────────
function dataDir(): string {
    // /var/www/thewoollim/api/<this>.php → /var/www/thewoollim/api/data
    // /var/www/thewoollim/api/admin/<x>.php 에서 호출 시도 자동 보정
    $candidates = [
        __DIR__ . '/data',
        dirname(__DIR__) . '/data',
    ];
    foreach ($candidates as $p) {
        if (is_dir($p)) return $p;
    }
    return $candidates[0];
}
