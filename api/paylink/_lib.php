<?php
/**
 * 대관료 결제 링크 공통 기능 (docs/specs/paylink.md).
 *
 *  - 저장: privateDataDir()/paylinks.json (웹 루트 밖, 0600). 웹 루트 밖 폴더가 없으면 저장하지 않는다(api/data 대체 저장 금지).
 *    { seq: 마지막 번호, links: [링크…] } — 항상 withFileLock() 으로 읽고 쓴다.
 *  - 결제 승인·취소처럼 토스를 부르는 동안에는 링크별 잠금 파일(paylink-locks/<번호>.lock)을 잡는다.
 *    잠금 순서: 링크 잠금 → (짧게) 저장 파일 잠금. 저장 파일 잠금을 잡은 채로 링크 잠금을 잡지 않는다.
 *  - 상태(status): open(결제 대기) | stopped(중지) | paid(결제 완료) | partial_cancelled(부분 취소) | cancelled(전액 취소)
 *    "기한 지남"은 저장하지 않고 open + 기한(expiresAt) 지남으로 판단한다(paylinkState).
 *  - 파티 예약·장바구니·쿠폰·정원·매출 통계와 섞지 않는다.
 *  - 토스 키는 api/payments/toss-config.php 를 읽기만 한다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

const PAYLINK_AMOUNT_MIN      = 1000;
const PAYLINK_AMOUNT_MAX      = 2000000;
const PAYLINK_TITLE_MIN       = 2;
const PAYLINK_TITLE_MAX       = 40;
const PAYLINK_USEINFO_MAX     = 100;
const PAYLINK_NOTICE_MAX      = 500;
const PAYLINK_MEMO_MAX        = 500;
const PAYLINK_PAYER_NAME_MAX  = 20;
const PAYLINK_DEADLINE_DAYS   = 30;      // 결제 기한 최대 (오늘부터)
const PAYLINK_DEFAULT_DAYS    = 7;       // 결제 기한 기본값 (오늘부터, 23:59)
const PAYLINK_ORDER_TTL       = 600;     // 주문번호 유효 10분
const PAYLINK_PREPARE_LIMIT   = 10;      // 같은 링크 10분에 prepare 10회까지
const PAYLINK_CANCEL_REASON_MAX = 100;

/** 링크 하나 → 처리 중 오류 (HTTP 코드 포함). 저장 파일 잠금 안에서 던지면 아무것도 쓰지 않는다 */
final class PaylinkError extends RuntimeException {
    public function __construct(string $message, public readonly int $http = 400) { parent::__construct($message); }
}

/** 결제 페이지·문자에 쓰는 사이트 주소 (로컬 검증은 PAYLINK_SITE_URL 상수로 바꾼다) */
function paylinkSiteUrl(): string {
    return defined('PAYLINK_SITE_URL') ? rtrim((string)constant('PAYLINK_SITE_URL'), '/') : 'https://thewoollim.com';
}
function paylinkTossBase(): string {
    return defined('PAYLINK_TOSS_API_BASE') ? rtrim((string)constant('PAYLINK_TOSS_API_BASE'), '/') : 'https://api.tosspayments.com';
}
function paylinkSmsSendUrl(): string {
    return defined('PAYLINK_SMS_SEND_URL') ? (string)constant('PAYLINK_SMS_SEND_URL') : 'https://apis.aligo.in/send/';
}

function paylinkPayUrl(string $token): string {
    return paylinkSiteUrl() . '/pay/?t=' . $token;
}

// ─── 저장 ─────────────────────────────────────────────────────────

/** 저장 파일 경로. 웹 루트 밖 폴더가 없으면 null */
function paylinkStorePath(): ?string {
    $d = privateDataDir();
    return $d === null ? null : $d . '/paylinks.json';
}

function paylinkNormalize($cur): array {
    $s = is_array($cur) ? $cur : [];
    $links = is_array($s['links'] ?? null) ? array_values(array_filter($s['links'], 'is_array')) : [];
    $seq = max((int)($s['seq'] ?? 0), $links ? max(array_map(fn($l) => (int)($l['id'] ?? 0), $links)) : 0);
    return ['seq' => $seq, 'links' => $links];
}

/** 읽기 전용 (잠금 상태로 읽고 쓰지 않음). 저장 파일이 없거나 폴더가 없으면 빈 저장소 */
function paylinkRead(): array {
    $path = paylinkStorePath();
    if ($path === null || !is_file($path)) return paylinkNormalize([]);
    $out = [];
    withFileLock($path, function (array $cur) use (&$out) { $out = $cur; return null; });
    return paylinkNormalize($out);
}

/**
 * 저장소 고치기. $fn(array &$store) 의 반환값을 돌려준다.
 * $fn 이 예외를 던지면 아무것도 쓰지 않는다. 웹 루트 밖 폴더가 없으면 PaylinkError(409).
 */
function paylinkMutate(callable $fn) {
    $path = paylinkStorePath();
    if ($path === null) throw new PaylinkError('웹 루트 밖 데이터 폴더가 없어 결제 링크를 저장할 수 없습니다.', 409);
    $isNew = !is_file($path);
    $result = null;
    withFileLock($path, function (array $cur) use ($fn, &$result) {
        $store = paylinkNormalize($cur);
        $result = $fn($store);
        return $store;
    });
    if ($isNew) @chmod($path, 0600);
    return $result;
}

/** 링크별 잠금 — 토스 승인·취소·수정이 같은 링크에서 겹치지 않게. 잠금 파일을 열 수 없으면 PaylinkError(503) */
function paylinkWithLinkLock(int $id, callable $fn) {
    $base = privateDataDir();
    if ($base === null) throw new PaylinkError('웹 루트 밖 데이터 폴더가 없습니다.', 409);
    $dir = $base . '/paylink-locks';
    if (!is_dir($dir)) { @mkdir($dir, 0700, true); }
    $fp = @fopen($dir . '/' . $id . '.lock', 'c');
    if (!$fp) throw new PaylinkError('잠시 후 다시 시도해주세요.', 503);
    flock($fp, LOCK_EX);
    try {
        return $fn();
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/** 번호로 링크 찾기 (없으면 null) — $store 는 paylinkNormalize 결과 */
function paylinkIndex(array $store, int $id): ?int {
    foreach ($store['links'] as $i => $l) if ((int)($l['id'] ?? 0) === $id) return $i;
    return null;
}

function paylinkFindById(int $id): ?array {
    $store = paylinkRead();
    $i = paylinkIndex($store, $id);
    return $i === null ? null : $store['links'][$i];
}

function paylinkTokenValid(string $t): bool {
    return (bool)preg_match('/^[a-f0-9]{32}$/', $t);
}

function paylinkFindByToken(string $token): ?array {
    if (!paylinkTokenValid($token)) return null;
    foreach (paylinkRead()['links'] as $l) {
        if (hash_equals((string)($l['token'] ?? ''), $token)) return $l;
    }
    return null;
}

/** 주문번호 "pl<번호>_<24자>" → 링크 번호 (형식이 틀리면 0) */
function paylinkIdFromOrderId(string $orderId): int {
    return preg_match('/^pl(\d{1,9})_[a-f0-9]{24}$/', $orderId, $m) ? (int)$m[1] : 0;
}

function paylinkNewOrderId(int $id): string {
    return 'pl' . $id . '_' . bin2hex(random_bytes(12));
}

// ─── 상태 ─────────────────────────────────────────────────────────

/** 화면 상태: open | expired | stopped | paid | partial_cancelled | cancelled */
function paylinkState(array $l, ?int $now = null): string {
    $st = (string)($l['status'] ?? 'open');
    if ($st === 'open' && strtotime((string)($l['expiresAt'] ?? '')) < ($now ?? time())) return 'expired';
    return $st;
}

/** 살아 있는(10분 안에 발급된) 주문들 */
function paylinkLiveOrders(array $l, ?int $now = null): array {
    $now ??= time();
    return array_values(array_filter((array)($l['orders'] ?? []), fn($o) => is_array($o) && (int)($o['issuedAt'] ?? 0) + PAYLINK_ORDER_TTL >= $now));
}

function paylinkCancelledAmount(array $l): int {
    return (int)($l['cancelledAmount'] ?? 0);
}

/** 남은 결제 금액 (결제 완료·부분 취소일 때만 의미) */
function paylinkRemaining(array $l): int {
    return max(0, (int)($l['amount'] ?? 0) - paylinkCancelledAmount($l));
}

/**
 * 환불 규정 4단계 — 파티 규정 refundQuote() 에서 비율을 그대로 가져온다(새 규칙을 따로 두지 않음).
 * 결제할 때 이 값을 링크에 그대로 남긴다(refundPolicy).
 */
function paylinkRefundPolicy(): array {
    $today = mktime(0, 0, 0, (int)date('n'), (int)date('j'), (int)date('Y'));
    $tiers = [[5, '이용일 5일 전 이상'], [4, '이용일 4일 전'], [3, '이용일 3일 전'], [2, '이용일 2일 전 ~ 당일']];
    $out = [];
    foreach ($tiers as [$days, $when]) {
        $q = refundQuote(100, date('Y-m-d', mktime(0, 0, 0, (int)date('n', $today), (int)date('j', $today) + $days, (int)date('Y', $today))), $today);
        $rate = (float)($q['rate'] ?? 0);
        $out[] = ['when' => $when, 'rate' => $rate, 'label' => $rate > 0 ? ((int)round($rate * 100)) . '% 환불' : '환불 불가'];
    }
    return $out;
}

/** 오늘 기준 규정 환불 금액 (남은 결제액 기준). 이용일을 모르면 null */
function paylinkRefundQuote(array $l, ?int $atTs = null): ?array {
    return refundQuote(paylinkRemaining($l), (string)($l['useDate'] ?? ''), $atTs);
}

// ─── 입력 검사 (만들기·수정) ────────────────────────────────────────

function paylinkCleanLine($v, int $max): string {
    $s = trim(preg_replace('/\s+/u', ' ', (string)$v) ?? '');
    return mb_substr($s, 0, $max + 1);   // 길이 검사는 호출한 쪽 (넘치면 거절)
}
function paylinkCleanText($v): string {
    $s = str_replace(["\r\n", "\r"], "\n", (string)$v);
    $s = preg_replace('/[^\P{C}\n\t]/u', '', $s) ?? '';   // 줄바꿈·탭 말고 제어문자 제거
    return trim(preg_replace("/\n{3,}/", "\n\n", $s) ?? '');
}

/** "YYYY-MM-DD" 가 실제 날짜인지 */
function paylinkValidDate(string $d): bool {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** 결제 기한 입력 "YYYY-MM-DDTHH:MM" / "YYYY-MM-DD HH:MM[:SS]" → 'Y-m-d H:i:59' (분 끝까지). 틀리면 null */
function paylinkParseDeadline(string $v): ?string {
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/', trim($v), $m)) return null;
    if (!paylinkValidDate($m[1]) || (int)$m[2] > 23 || (int)$m[3] > 59) return null;
    return sprintf('%s %02d:%02d:59', $m[1], (int)$m[2], (int)$m[3]);
}

/** 기본 결제 기한 — 오늘부터 7일 뒤 23:59, 이용일이 더 빠르면 이용일 23:59 */
function paylinkDefaultDeadline(string $useDate, ?int $now = null): string {
    $now ??= time();
    $d = date('Y-m-d', mktime(0, 0, 0, (int)date('n', $now), (int)date('j', $now) + PAYLINK_DEFAULT_DAYS, (int)date('Y', $now)));
    if (paylinkValidDate($useDate) && $useDate < $d) $d = $useDate;
    return $d . ' 23:59:59';
}

/**
 * 만들기·수정 입력 검사 → 저장할 값. 틀리면 PaylinkError(400).
 * (화면 PaylinkAdmin.tsx 도 같은 규칙으로 먼저 검사하지만 최종 판단은 여기)
 */
function paylinkValidateInput(array $in, ?int $now = null): array {
    $now ??= time();
    $today = date('Y-m-d', $now);

    $title = paylinkCleanLine($in['title'] ?? '', PAYLINK_TITLE_MAX);
    $len = mb_strlen($title);
    if ($len < PAYLINK_TITLE_MIN || $len > PAYLINK_TITLE_MAX) throw new PaylinkError('결제명은 ' . PAYLINK_TITLE_MIN . '~' . PAYLINK_TITLE_MAX . '자로 입력해주세요.');

    $rawAmount = $in['amount'] ?? null;
    if (is_string($rawAmount)) $rawAmount = str_replace(',', '', trim($rawAmount));
    if (!(is_int($rawAmount) || (is_string($rawAmount) && preg_match('/^\d{1,9}$/', $rawAmount)) || (is_float($rawAmount) && floor($rawAmount) === $rawAmount))) {
        throw new PaylinkError('금액은 원 단위 숫자로 입력해주세요.');
    }
    $amount = (int)$rawAmount;
    if ($amount < PAYLINK_AMOUNT_MIN || $amount > PAYLINK_AMOUNT_MAX) {
        throw new PaylinkError('금액은 ' . number_format(PAYLINK_AMOUNT_MIN) . '원 ~ ' . number_format(PAYLINK_AMOUNT_MAX) . '원으로 입력해주세요.');
    }

    $useDate = trim((string)($in['useDate'] ?? ''));
    if (!paylinkValidDate($useDate)) throw new PaylinkError('이용일을 선택해주세요.');
    if ($useDate < $today) throw new PaylinkError('이용일은 오늘 이후로 정해주세요.');

    $useInfo = paylinkCleanLine($in['useInfo'] ?? '', PAYLINK_USEINFO_MAX);
    if (mb_strlen($useInfo) > PAYLINK_USEINFO_MAX) throw new PaylinkError('이용 시간·장소는 ' . PAYLINK_USEINFO_MAX . '자 이내로 입력해주세요.');

    $payerName = paylinkCleanLine($in['payerName'] ?? '', PAYLINK_PAYER_NAME_MAX);
    if (mb_strlen($payerName) > PAYLINK_PAYER_NAME_MAX) throw new PaylinkError('결제자 이름은 ' . PAYLINK_PAYER_NAME_MAX . '자 이내로 입력해주세요.');

    $payerPhone = preg_replace('/\D+/', '', (string)($in['payerPhone'] ?? '')) ?? '';
    if ($payerPhone !== '' && !preg_match('/^01\d{8,9}$/', $payerPhone)) throw new PaylinkError('결제자 연락처는 01로 시작하는 휴대폰 번호 10~11자리로 입력해주세요.');

    $notice = paylinkCleanText($in['notice'] ?? '');
    if (mb_strlen($notice) > PAYLINK_NOTICE_MAX) throw new PaylinkError('추가 안내는 ' . PAYLINK_NOTICE_MAX . '자 이내로 입력해주세요.');

    $memo = paylinkCleanText($in['adminMemo'] ?? '');
    if (mb_strlen($memo) > PAYLINK_MEMO_MAX) throw new PaylinkError('관리자 메모는 ' . PAYLINK_MEMO_MAX . '자 이내로 입력해주세요.');

    $rawDeadline = trim((string)($in['expiresAt'] ?? ''));
    $expiresAt = $rawDeadline === '' ? paylinkDefaultDeadline($useDate, $now) : paylinkParseDeadline($rawDeadline);
    if ($expiresAt === null) throw new PaylinkError('결제 기한을 날짜와 시각으로 입력해주세요.');
    $expTs = strtotime($expiresAt);
    if ($expTs <= $now) throw new PaylinkError('결제 기한은 지금 이후로 정해주세요.');
    $maxTs = mktime(23, 59, 59, (int)date('n', $now), (int)date('j', $now) + PAYLINK_DEADLINE_DAYS, (int)date('Y', $now));
    if ($expTs > $maxTs) throw new PaylinkError('결제 기한은 오늘부터 최대 ' . PAYLINK_DEADLINE_DAYS . '일까지 정할 수 있습니다.');
    if (substr($expiresAt, 0, 10) > $useDate) throw new PaylinkError('결제 기한은 이용일보다 늦을 수 없습니다.');

    return [
        'title' => $title, 'amount' => $amount, 'useDate' => $useDate, 'useInfo' => $useInfo,
        'payerName' => $payerName, 'payerPhone' => $payerPhone, 'notice' => $notice,
        'expiresAt' => $expiresAt, 'adminMemo' => $memo,
    ];
}

// ─── 화면용 값 ────────────────────────────────────────────────────

/**
 * 결제 페이지(/pay/)용 — 결제 대기면 결제에 필요한 값, 그 밖에는 상태와 3-2 화면에 필요한 값만.
 * 결제자 연락처는 어떤 상태에서도 내보내지 않는다. 결제자 이름은 결제 대기일 때 미리 채울 이름만.
 */
function paylinkPublicView(array $l): array {
    $state = paylinkState($l);
    $out = ['ok' => true, 'status' => $state];
    if ($state === 'open') {
        return $out + [
            'title' => (string)$l['title'], 'amount' => (int)$l['amount'], 'useDate' => (string)$l['useDate'],
            'useInfo' => (string)($l['useInfo'] ?? ''), 'expiresAt' => (string)$l['expiresAt'],
            'notice' => (string)($l['notice'] ?? ''), 'refundPolicy' => paylinkRefundPolicy(),
            'payerName' => (string)($l['payerName'] ?? ''),
        ];
    }
    if (in_array($state, ['paid', 'partial_cancelled', 'cancelled'], true)) {
        $p = (array)($l['payment'] ?? []);
        return $out + [
            'title' => (string)$l['title'], 'amount' => (int)$l['amount'],
            'paidAt' => (string)($p['approvedAt'] ?? ''), 'receiptUrl' => (string)($p['receiptUrl'] ?? ''),
            'cancelledAmount' => paylinkCancelledAmount($l),
        ];
    }
    return $out;   // expired | stopped
}

// ─── 토스 ─────────────────────────────────────────────────────────

/** api/payments/toss-config.php (읽기만). 비밀 키 형식이 틀리면 null */
function paylinkTossConfig(): ?array {
    $path = __DIR__ . '/../payments/toss-config.php';
    if (!is_file($path)) return null;
    $cfg = require $path;
    $sk = is_array($cfg) ? (string)($cfg['secret_key'] ?? '') : '';
    if (!str_starts_with($sk, 'test_') && !str_starts_with($sk, 'live_')) return null;
    return $cfg;
}

/** 토스 API 호출 → ['http'=>int(통신 실패 0), 'json'=>array, 'raw'=>string, 'errno'=>int] (예외 없음) */
function paylinkTossRequest(array $cfg, string $method, string $path, ?array $body = null): array {
    try {
        $ch = curl_init(paylinkTossBase() . $path);
        $opts = [
            CURLOPT_HTTPHEADER     => ['Authorization: Basic ' . base64_encode((string)$cfg['secret_key'] . ':'), 'Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 20,
        ];
        if ($method === 'POST') { $opts[CURLOPT_POST] = true; $opts[CURLOPT_POSTFIELDS] = json_encode($body ?? new stdClass(), JSON_UNESCAPED_UNICODE); }
        curl_setopt_array($ch, $opts);
        $raw = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        curl_close($ch);
        $raw = is_string($raw) ? $raw : '';
        return ['http' => $errno !== 0 ? 0 : $http, 'json' => json_decode($raw, true) ?: [], 'raw' => $raw, 'errno' => $errno];
    } catch (Throwable $e) {
        return ['http' => 0, 'json' => [], 'raw' => $e->getMessage(), 'errno' => -1];
    }
}

/**
 * 결제 취소 (api/admin/bookings.php 와 같은 호출). 이미 취소된 결제(ALREADY_CANCELED_PAYMENT)는 성공으로 본다.
 * → ['ok'=>bool, 'already'=>bool, 'http'=>int, 'message'=>string]
 */
function paylinkTossCancel(array $cfg, string $paymentKey, int $amount, string $reason): array {
    $r = paylinkTossRequest($cfg, 'POST', '/v1/payments/' . rawurlencode($paymentKey) . '/cancel', ['cancelReason' => $reason, 'cancelAmount' => $amount]);
    $already = $r['http'] === 400 && (string)($r['json']['code'] ?? '') === 'ALREADY_CANCELED_PAYMENT';
    @file_put_contents(dataDir() . '/_paylink_toss.log', sprintf("[%s] CANCEL paymentKey=%s amount=%d http=%d code=%s\n",
        date('c'), $paymentKey, $amount, $r['http'], (string)($r['json']['code'] ?? '')), FILE_APPEND);
    return ['ok' => $r['http'] === 200 || $already, 'already' => $already, 'http' => $r['http'],
            'message' => (string)($r['json']['message'] ?? ($r['http'] === 0 ? '토스 서버에 연결하지 못했습니다' : "HTTP {$r['http']}"))];
}

/** 토스 결제 객체 → 저장할 결제 정보 (결제 수단·승인 일시·영수증) */
function paylinkPaymentInfo(array $p): array {
    $method = (string)($p['method'] ?? '');
    $provider = (string)($p['easyPay']['provider'] ?? '');
    if ($provider !== '' && !str_contains($method, $provider)) $method = trim($method . ' (' . $provider . ')');
    $approved = strtotime((string)($p['approvedAt'] ?? ''));
    return [
        'method'     => $method !== '' ? $method : '카드·간편결제',
        'approvedAt' => date('Y-m-d H:i:s', $approved !== false ? $approved : time()),
        'receiptUrl' => (string)($p['receipt']['url'] ?? ''),
    ];
}

// ─── 문자 (알리고) ─────────────────────────────────────────────────

/** 기록용 — 번호는 뒤 4자리만 */
function paylinkMaskPhone(string $phone): string {
    $d = preg_replace('/\D+/', '', $phone) ?? '';
    return $d === '' ? '-' : str_repeat('*', max(0, strlen($d) - 4)) . substr($d, -4);
}

/**
 * 문자 보내기 (api/auth/sms-config.php — 다른 알림 문자와 같은 설정). 90바이트 넘으면 LMS.
 * → ['ok'=>bool, 'error'=>string]. 예외를 던지지 않는다.
 */
function paylinkSendSms(string $phone, string $msg, string $title, string $tag): array {
    $phone = preg_replace('/\D+/', '', $phone) ?? '';
    $log = function (string $result, string $detail) use ($tag, $phone) {
        @file_put_contents(dataDir() . '/_paylink_sms.log', sprintf("[%s] %s %s to=%s %s\n", date('c'), $tag, $result, paylinkMaskPhone($phone), $detail), FILE_APPEND);
    };
    try {
        if (!preg_match('/^01\d{8,9}$/', $phone)) { $log('skip', 'invalid phone'); return ['ok' => false, 'error' => '휴대폰 번호가 올바르지 않습니다.']; }
        $cfgPath = __DIR__ . '/../auth/sms-config.php';
        if (!is_file($cfgPath)) { $log('error', 'sms-config.php missing'); return ['ok' => false, 'error' => '문자 발송 설정이 없습니다.']; }
        $cfg = require $cfgPath;
        $type = strlen($msg) > 90 ? 'LMS' : 'SMS';
        $params = [
            'key' => $cfg['apikey'], 'user_id' => $cfg['userid'], 'sender' => preg_replace('/\D+/', '', (string)$cfg['sender']),
            'receiver' => $phone, 'msg' => $msg, 'msg_type' => $type, 'testmode_yn' => 'N',
        ];
        if ($type === 'LMS') $params['title'] = $title;
        $ch = curl_init(paylinkSmsSendUrl());
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($params), CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $body = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $j = is_string($body) ? (json_decode($body, true) ?: []) : [];
        $ok = (string)($j['result_code'] ?? '') === '1';
        $log($ok ? 'sent' : 'fail', sprintf('type=%s http=%d code=%s msg=%s', $type, $http, (string)($j['result_code'] ?? ''), substr((string)($j['message'] ?? ''), 0, 80)));
        return ['ok' => $ok, 'error' => $ok ? '' : ('문자 발송에 실패했습니다' . (!empty($j['message']) ? ': ' . $j['message'] : '.'))];
    } catch (Throwable $e) {
        $log('error', substr($e->getMessage(), 0, 120));
        return ['ok' => false, 'error' => '문자 발송 중 오류가 발생했습니다.'];
    }
}

/** "11/20 23:59" */
function paylinkShortDateTime(string $dt): string {
    $ts = strtotime($dt);
    return $ts === false ? $dt : date('m/d H:i', $ts);
}

// ─── 응답 ─────────────────────────────────────────────────────────

/** 이동 응답을 먼저 보내고 나서 $after 실행 (알림이 결제자 화면을 늦추지 않게, respondJsonThen 과 같은 방식) */
function paylinkRedirectThen(string $url, ?callable $after = null): void {
    header('Location: ' . $url, true, 302);
    if ($after === null) exit;
    header('Content-Length: 0');
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) @ob_end_flush();
        @flush();
    }
    ignore_user_abort(true);
    try { $after(); } catch (Throwable $e) { error_log('[paylink] after: ' . $e->getMessage()); }
    exit;
}
