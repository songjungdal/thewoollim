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
//   참가 항목(options)이 있는 솔로파티는 고른 항목의 남/여 가격. 항목이 없거나 잘못된 optionId 면 null
//   → 호출한 쪽에서 결제를 거절한다 (docs/specs/party-options-solo.md 6장).
function priceForGender(array $party, string $gender, ?string $optionId = null): ?int {
    if (partyHasOptions($party)) {
        $opt = partyOptionById($party, (string)$optionId);
        if ($opt === null) return null;
        return $gender === '남성' ? (int)$opt['priceMale'] : (int)$opt['priceFemale'];
    }
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

// ─── 참가 구성 (회차 sessions · 참가 항목 options) — 솔로파티 전용 ─────────────
// 명세: docs/specs/party-options-solo.md. options 가 없는 파티는 지금과 똑같이 동작한다.
//   회차   : { id:"s1", name, startTime:"HH:MM", maleStock, femaleStock }  1~5개, 시작 시각 순서
//   항목   : { id:"o1", name, sessionIds:[...], priceMale, priceFemale }   1~6개
//   인원   : party_counts.json[파티]['sessions'][회차id]['male'|'female'] — 항목에 포함된 회차마다 +1
//   예약   : optionId · optionName · sessionIds · sessionTimes 를 결제 시점 사본으로 저장
const PARTY_SESSIONS_MAX = 5;
const PARTY_OPTIONS_MAX  = 6;
const PARTY_OPTION_NAME_MAX = 20;
const PARTY_SESSION_STOCK_MAX = 100;
const PARTY_OPTION_PRICE_MAX = 10000000;

function partyHasOptions(array $party): bool {
    return partyTypeOf($party) === 'solo'
        && !empty($party['options']) && is_array($party['options'])
        && !empty($party['sessions']) && is_array($party['sessions']);
}

function partyOptionById(array $party, string $optionId): ?array {
    if ($optionId === '' || !partyHasOptions($party)) return null;
    foreach ($party['options'] as $o) {
        if (is_array($o) && (string)($o['id'] ?? '') === $optionId) return $o;
    }
    return null;
}

function partySessionById(array $party, string $sessionId): ?array {
    foreach ((array)($party['sessions'] ?? []) as $s) {
        if (is_array($s) && (string)($s['id'] ?? '') === $sessionId) return $s;
    }
    return null;
}

/** 항목에 포함된 회차를 시작 시각 순서로 (파티 sessions 순서 = 시작 시각 순서) */
function partyOptionSessions(array $party, array $option): array {
    $ids = array_map('strval', (array)($option['sessionIds'] ?? []));
    $out = [];
    foreach ((array)($party['sessions'] ?? []) as $s) {
        if (is_array($s) && in_array((string)($s['id'] ?? ''), $ids, true)) $out[] = $s;
    }
    return $out;
}

/** 예약에 남길 결제 시점 사본 — optionId · optionName · sessionIds · sessionTimes */
function bookingOptionSnapshot(array $party, array $option): array {
    $sessions = partyOptionSessions($party, $option);
    return [
        'optionId'     => (string)$option['id'],
        'optionName'   => (string)$option['name'],
        'sessionIds'   => array_map(fn($s) => (string)$s['id'], $sessions),
        'sessionTimes' => array_map(fn($s) => (string)$s['startTime'], $sessions),
    ];
}

/** 예약의 처음 참석 회차 시작 시각 ("HH:MM") — 항목 예약이 아니면 '' */
function bookingFirstSessionTime(array $booking): string {
    $times = (array)($booking['sessionTimes'] ?? []);
    return isset($times[0]) ? (string)$times[0] : '';
}

/** 회차 정원 (1 이상, 없으면 0 → 항상 마감으로 본다) */
function sessionStockLimit(array $session, string $genderKey): int {
    return max(0, (int)($session[$genderKey === 'male' ? 'maleStock' : 'femaleStock'] ?? 0));
}

/**
 * 항목에 포함된 회차 중 "현재 인원 + $add" 가 정원을 넘는 회차 id 목록.
 * $countsRow = party_counts.json 의 그 파티 항목. 회차가 파티에서 사라졌으면 마감으로 본다.
 */
function optionSessionsOverStock(array $party, array $option, array $countsRow, string $genderKey, int $add = 1): array {
    $over = [];
    foreach (array_map('strval', (array)($option['sessionIds'] ?? [])) as $sid) {
        $s = partySessionById($party, $sid);
        $cur = (int)($countsRow['sessions'][$sid][$genderKey] ?? 0);
        if ($s === null || $cur + $add > sessionStockLimit($s, $genderKey)) $over[] = $sid;
    }
    return $over;
}

/**
 * 인원 증감 — 파티 신청 인원(male/female)과 회차별 인원을 함께. 0 미만으로 내려가지 않는다.
 * 파일 잠금은 호출한 쪽에서 잡는다 (success.php · admin/bookings.php 의 flock 블록 안에서 호출).
 */
function countsAdjust(array &$counts, string $partyId, string $genderKey, array $sessionIds, int $delta): void {
    if (!isset($counts[$partyId]) || !is_array($counts[$partyId])) $counts[$partyId] = ['male' => 0, 'female' => 0];
    $row = &$counts[$partyId];
    foreach (['male', 'female'] as $g) $row[$g] = (int)($row[$g] ?? 0);
    $row[$genderKey] = max(0, $row[$genderKey] + $delta);
    foreach (array_map('strval', $sessionIds) as $sid) {
        if ($sid === '') continue;
        if (!isset($row['sessions'][$sid]) || !is_array($row['sessions'][$sid])) $row['sessions'][$sid] = ['male' => 0, 'female' => 0];
        $cur = (int)($row['sessions'][$sid][$genderKey] ?? 0);
        $row['sessions'][$sid][$genderKey] = max(0, $cur + $delta);
    }
    unset($row);
}

/**
 * 결제 전 항목 확인 — 성공 시 ['option'=>..., 'price'=>int], 실패 시 회원에게 보여줄 문구(string).
 * 항목이 없는 파티는 ['option'=>null, 'price'=>기존 성별 가격].
 */
function resolvePartyOption(array $party, string $gender, string $optionId) {
    if (!partyHasOptions($party)) return ['option' => null, 'price' => (int)priceForGender($party, $gender)];
    $title = (string)($party['title'] ?? '파티');
    if ($optionId === '') return "참가 항목을 선택해주세요. ($title)";
    $opt = partyOptionById($party, $optionId);
    if ($opt === null) return "선택한 참가 항목을 찾을 수 없습니다. 다시 선택해주세요. ($title)";
    return ['option' => $opt, 'price' => (int)priceForGender($party, $gender, $optionId)];
}

/**
 * 파티별 신청자 집계 — 취소되지 않은 예약 기준 (입금 대기 무통장 포함).
 * 반환: [partyId => ['total'=>n, 'options'=>[oid=>n], 'sessions'=>[sid=>['male'=>n,'female'=>n]]]]
 * $partyIds 가 비어 있으면 모든 파티. 관리자 저장 검사(6-1)와 관리자 화면 표시에 쓴다.
 */
function partyApplicantStats(array $partyIds = []): array {
    $want = array_flip(array_map('strval', $partyIds));
    $stats = [];
    foreach (glob(dataDir() . '/bookings_*.json') ?: [] as $f) {
        $list = json_decode((string)@file_get_contents($f), true);
        if (!is_array($list)) continue;
        foreach ($list as $b) {
            if (!is_array($b) || (string)($b['status'] ?? '') === 'cancelled') continue;
            $pid = (string)($b['partyId'] ?? '');
            if ($pid === '' || ($want && !isset($want[$pid]))) continue;
            $st = &$stats[$pid];
            if ($st === null) $st = ['total' => 0, 'options' => [], 'sessions' => []];
            $st['total']++;
            $oid = (string)($b['optionId'] ?? '');
            if ($oid !== '') $st['options'][$oid] = ($st['options'][$oid] ?? 0) + 1;
            $g = (string)($b['gender'] ?? '') === '남성' ? 'male' : 'female';
            foreach (array_map('strval', (array)($b['sessionIds'] ?? [])) as $sid) {
                if (!isset($st['sessions'][$sid])) $st['sessions'][$sid] = ['male' => 0, 'female' => 0];
                $st['sessions'][$sid][$g]++;
            }
            unset($st);
        }
    }
    return $stats;
}

/** "일시" 글자 속 시각을 첫 회차 시작 시각으로 (시각이 없으면 뒤에 붙인다) */
function dateStringWithTime(string $dateString, string $time): string {
    $dateString = trim($dateString);
    if (preg_match('/\d{1,2}:\d{2}/', $dateString)) return (string)preg_replace('/\d{1,2}:\d{2}/', $time, $dateString, 1);
    return $dateString === '' ? $time : "$dateString $time";
}

/**
 * 관리자 저장 — 회차·항목 검사·정리 (6-1). 규칙을 어기면 RuntimeException(회원·관리자에게 보여줄 문구).
 *  - $in   : 요청의 party (sessions / options 키를 본다. 새 회차·항목은 임시 id 를 써도 되고, 서버가 새 id 를 붙인다)
 *  - $prev : 저장되어 있던 파티 (create 면 null)
 *  - $clean: sanitizeParty 결과 — 여기에 sessions/options/대표 가격·정원/일시를 반영해 돌려준다
 * 요청에 sessions·options 키가 모두 없으면 기존 값을 그대로 둔다. 매칭파티면 회차·항목을 지운다.
 * 신청자가 있는 회차·항목을 지우거나(단일 가격·매칭파티 전환 포함), 항목의 포함 회차를 바꾸거나,
 * 회차 정원을 신청 인원보다 적게 바꾸면 거절한다.
 */
function sanitizePartyOptions(array $in, ?array $prev, array $clean): array {
    $prevSessions = is_array($prev['sessions'] ?? null) ? $prev['sessions'] : [];
    $prevOptions  = is_array($prev['options']  ?? null) ? $prev['options']  : [];
    $hasKeys = array_key_exists('sessions', $in) || array_key_exists('options', $in);
    $clean['sessionSeq'] = (int)($prev['sessionSeq'] ?? 0);
    $clean['optionSeq']  = (int)($prev['optionSeq']  ?? 0);

    $isSolo = ($clean['partyType'] ?? 'matching') === 'solo';
    if ($isSolo && array_key_exists('sessions', $in) !== array_key_exists('options', $in)) {
        throw new RuntimeException('회차와 참가 항목을 함께 보내야 합니다.');
    }
    $wantOptions = $isSolo && $hasKeys && is_array($in['options'] ?? null) && count($in['options']) > 0;
    if ($isSolo && !$hasKeys) {
        // 요청에 없으면 기존 구성을 그대로 둔다
        if ($prevOptions) { $clean['sessions'] = $prevSessions; $clean['options'] = $prevOptions; }
        return $prevOptions ? syncOptionSummary($clean) : dropZeroOptionSeq($clean);
    }

    $stats = null;
    if ($prev !== null && $prevOptions) {
        $stats = partyApplicantStats([(string)$prev['id']])[(string)$prev['id']] ?? ['total' => 0, 'options' => [], 'sessions' => []];
    }

    if (!$wantOptions) {
        // 참가 구성을 지운다 (단일 가격 또는 매칭파티) — 신청자가 있는 항목이 있으면 거절
        if ($stats && array_sum($stats['options']) > 0) {
            throw new RuntimeException('신청자가 있는 참가 구성은 지울 수 없습니다. (신청자 ' . array_sum($stats['options']) . '명)');
        }
        return dropZeroOptionSeq($clean);
    }

    $sessIn = is_array($in['sessions'] ?? null) ? array_values($in['sessions']) : [];
    $optIn  = array_values($in['options']);
    if (count($sessIn) < 1 || count($sessIn) > PARTY_SESSIONS_MAX) throw new RuntimeException('회차는 1~' . PARTY_SESSIONS_MAX . '개까지 등록할 수 있습니다.');
    if (count($optIn) < 1 || count($optIn) > PARTY_OPTIONS_MAX)    throw new RuntimeException('참가 항목은 1~' . PARTY_OPTIONS_MAX . '개까지 등록할 수 있습니다.');

    $prevSessIds = array_map(fn($s) => (string)($s['id'] ?? ''), $prevSessions);
    $prevOptById = [];
    foreach ($prevOptions as $o) if (is_array($o)) $prevOptById[(string)($o['id'] ?? '')] = $o;

    // 회차
    $idMap = []; $sessions = []; $names = [];
    foreach ($sessIn as $i => $s) {
        if (!is_array($s)) throw new RuntimeException('회차 정보가 올바르지 않습니다.');
        $n = $i + 1;
        $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($s['name'] ?? '')));
        if ($name === '') throw new RuntimeException("회차 {$n}의 이름을 입력해주세요.");
        if (mb_strlen($name) > PARTY_OPTION_NAME_MAX) throw new RuntimeException("회차 이름은 " . PARTY_OPTION_NAME_MAX . "자 이하로 입력해주세요. ({$name})");
        if (isset($names[$name])) throw new RuntimeException("회차 이름이 겹칩니다: {$name}");
        $names[$name] = true;
        $time = trim((string)($s['startTime'] ?? ''));
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) throw new RuntimeException("{$name}의 시작 시각을 HH:MM 형식(예: 19:00)으로 입력해주세요.");
        $ms = $s['maleStock'] ?? null; $fs = $s['femaleStock'] ?? null;
        foreach ([['남', $ms], ['여', $fs]] as [$g, $v]) {
            if (!is_numeric($v) || (int)$v != $v || (int)$v < 1 || (int)$v > PARTY_SESSION_STOCK_MAX) {
                throw new RuntimeException("{$name}의 {$g} 정원은 1~" . PARTY_SESSION_STOCK_MAX . "명으로 입력해주세요.");
            }
        }
        $key = (string)($s['id'] ?? '');
        if ($key !== '' && in_array($key, $prevSessIds, true) && !isset($idMap[$key])) {
            $id = $key;
        } else {
            $clean['sessionSeq']++;
            $id = 's' . $clean['sessionSeq'];
            while (in_array($id, $prevSessIds, true)) { $clean['sessionSeq']++; $id = 's' . $clean['sessionSeq']; }
        }
        if ($key !== '') $idMap[$key] = $id;
        $sessions[] = ['id' => $id, 'name' => $name, 'startTime' => $time, 'maleStock' => (int)$ms, 'femaleStock' => (int)$fs];
    }
    usort($sessions, fn($a, $b) => strcmp($a['startTime'], $b['startTime']));
    $finalSessIds = array_map(fn($s) => $s['id'], $sessions);

    // 항목
    $options = []; $names = []; $usedOptIds = [];
    $prevOptIds = array_keys($prevOptById);
    foreach ($optIn as $i => $o) {
        if (!is_array($o)) throw new RuntimeException('참가 항목 정보가 올바르지 않습니다.');
        $n = $i + 1;
        $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($o['name'] ?? '')));
        if ($name === '') throw new RuntimeException("참가 항목 {$n}의 이름을 입력해주세요.");
        if (mb_strlen($name) > PARTY_OPTION_NAME_MAX) throw new RuntimeException("참가 항목 이름은 " . PARTY_OPTION_NAME_MAX . "자 이하로 입력해주세요. ({$name})");
        if (isset($names[$name])) throw new RuntimeException("참가 항목 이름이 겹칩니다: {$name}");
        $names[$name] = true;
        $sids = [];
        foreach ((array)($o['sessionIds'] ?? []) as $k) {
            $k = (string)$k;
            $mapped = $idMap[$k] ?? null;
            if ($mapped === null) throw new RuntimeException("{$name}에 없는 회차가 포함되어 있습니다.");
            if (!in_array($mapped, $sids, true)) $sids[] = $mapped;
        }
        if (!$sids) throw new RuntimeException("{$name}에 포함할 회차를 1개 이상 선택해주세요.");
        usort($sids, fn($a, $b) => array_search($a, $finalSessIds, true) <=> array_search($b, $finalSessIds, true));
        $pm = $o['priceMale'] ?? null; $pf = $o['priceFemale'] ?? null;
        foreach ([['남', $pm], ['여', $pf]] as [$g, $v]) {
            if (!is_numeric($v) || (int)$v != $v || (int)$v < 1 || (int)$v > PARTY_OPTION_PRICE_MAX) {
                throw new RuntimeException("{$name}의 {$g} 가격은 1원 이상으로 입력해주세요.");
            }
        }
        $key = (string)($o['id'] ?? '');
        if ($key !== '' && isset($prevOptById[$key]) && !isset($usedOptIds[$key])) {
            $id = $key;
        } else {
            $clean['optionSeq']++;
            $id = 'o' . $clean['optionSeq'];
            while (in_array($id, $prevOptIds, true)) { $clean['optionSeq']++; $id = 'o' . $clean['optionSeq']; }
        }
        $usedOptIds[$id] = true;
        $options[] = ['id' => $id, 'name' => $name, 'sessionIds' => $sids, 'priceMale' => (int)$pm, 'priceFemale' => (int)$pf];
    }

    // 신청자가 있을 때 막는 수정
    if ($stats) {
        $optApplicants = $stats['options'];
        foreach ($prevOptById as $oid => $po) {
            $cnt = (int)($optApplicants[$oid] ?? 0);
            if ($cnt <= 0) continue;
            $now = null;
            foreach ($options as $o) if ($o['id'] === $oid) { $now = $o; break; }
            $pname = (string)($po['name'] ?? $oid);
            if ($now === null) throw new RuntimeException("신청자가 있는 참가 항목은 삭제할 수 없습니다: {$pname} (신청자 {$cnt}명)");
            $a = array_map('strval', (array)($po['sessionIds'] ?? [])); sort($a);
            $b = $now['sessionIds']; sort($b);
            if ($a !== $b) throw new RuntimeException("신청자가 있는 참가 항목의 포함 회차는 바꿀 수 없습니다: {$pname} (신청자 {$cnt}명)");
        }
        foreach ($prevSessions as $ps) {
            $sid = (string)($ps['id'] ?? '');
            $sc = $stats['sessions'][$sid] ?? ['male' => 0, 'female' => 0];
            if ($sc['male'] + $sc['female'] <= 0) continue;
            $now = null;
            foreach ($sessions as $s) if ($s['id'] === $sid) { $now = $s; break; }
            $pname = (string)($ps['name'] ?? $sid);
            if ($now === null) throw new RuntimeException("신청자가 있는 회차는 삭제할 수 없습니다: {$pname} (신청자 " . ($sc['male'] + $sc['female']) . "명)");
            if ($now['maleStock'] < $sc['male'])     throw new RuntimeException("{$now['name']}의 남 정원을 현재 신청 인원({$sc['male']}명)보다 적게 바꿀 수 없습니다.");
            if ($now['femaleStock'] < $sc['female']) throw new RuntimeException("{$now['name']}의 여 정원을 현재 신청 인원({$sc['female']}명)보다 적게 바꿀 수 없습니다.");
        }
    }

    $clean['sessions'] = $sessions;
    $clean['options']  = $options;
    return syncOptionSummary($clean);
}

/** id 번호(sessionSeq/optionSeq)는 한 번 쓰면 계속 남겨 지운 회차·항목의 id 를 다시 쓰지 않는다. 쓴 적 없으면 필드를 두지 않는다. */
function dropZeroOptionSeq(array $clean): array {
    if ((int)($clean['sessionSeq'] ?? 0) <= 0) unset($clean['sessionSeq']);
    if ((int)($clean['optionSeq']  ?? 0) <= 0) unset($clean['optionSeq']);
    return $clean;
}

/** 참가 구성이 있는 파티의 대표 가격(항목 최솟값)·대표 정원(회차 최댓값)·일시(첫 회차 시각)를 맞춘다 (5-1) */
function syncOptionSummary(array $clean): array {
    $pm = array_map(fn($o) => (int)$o['priceMale'], $clean['options']);
    $pf = array_map(fn($o) => (int)$o['priceFemale'], $clean['options']);
    $clean['priceMale']   = min($pm);
    $clean['priceFemale'] = min($pf);
    $clean['price']       = min(min($pm), min($pf));
    $clean['maleStock']   = max(array_map(fn($s) => (int)$s['maleStock'], $clean['sessions']));
    $clean['femaleStock'] = max(array_map(fn($s) => (int)$s['femaleStock'], $clean['sessions']));
    $clean['dateString']  = dateStringWithTime((string)($clean['dateString'] ?? ''), (string)$clean['sessions'][0]['startTime']);
    return $clean;
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
