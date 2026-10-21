<?php
/**
 * 어울림 멤버십(자동결제·빌링) 공통 — 설정 읽기, 빌링키 암호화, 저장 파일 잠금, 토스 API 호출.
 *
 *  - 설정: api/payments/toss-billing-config.php (서버에만 있음, 템플릿 toss-billing-config.example.php).
 *    일반 결제 키(api/payments/toss-config.php)와 분리한다. 값이 없거나 형식이 틀리면 ready=false("준비 중").
 *  - 저장: api/data/membership/memberships-<암호화 키에서 만든 이름>.json 한 파일에
 *    { customers: {userId: customerKey}, memberships: [...], payments: [...] } 를 둔다.
 *    모든 읽기·쓰기는 membershipWithStore() 의 flock 안에서 한다 → 동시 요청에도 중복 발급·중복 결제가 없다.
 *    폴더에는 웹 접근 차단 .htaccess 를 만들고, 파일 이름은 암호화 키 없이는 알 수 없게 한다.
 *  - 빌링키는 AES-256-GCM 으로 암호화해 저장한다. 시크릿 키·빌링키는 응답·로그에 남기지 않는다.
 *  - 이번 단계(1-A)는 첫 결제까지만. 정기결제 스케줄러·재시도·카드 변경·혜택 연동은 없다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

const MEMBERSHIP_PRICE      = 99000;
const MEMBERSHIP_ORDER_NAME = '어울림 멤버십 (월간)';

// ─── 설정 ─────────────────────────────────────────────────────────

/**
 * ['ready'=>bool, 'mode'=>'test'|'live', 'clientKey', 'secretKey', 'encKey'(32바이트 원본), 'reason'=>string]
 * reason 은 운영자 확인용 짧은 코드 — 키 값 자체는 담지 않는다.
 */
function membershipConfig(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $out = ['ready' => false, 'mode' => 'test', 'clientKey' => '', 'secretKey' => '', 'encKey' => '', 'reason' => ''];
    $path = __DIR__ . '/../payments/toss-billing-config.php';
    if (!is_file($path)) { $out['reason'] = 'config_missing'; return $cfg = $out; }

    $raw = require $path;
    if (!is_array($raw)) { $out['reason'] = 'config_invalid'; return $cfg = $out; }

    $mode   = (string)($raw['TOSS_BILLING_MODE'] ?? 'test');
    $client = trim((string)($raw['TOSS_BILLING_CLIENT_KEY'] ?? ''));
    $secret = trim((string)($raw['TOSS_BILLING_SECRET_KEY'] ?? ''));
    $encB64 = trim((string)($raw['TOSS_BILLING_ENC_KEY'] ?? ''));
    $out['mode'] = $mode === 'live' ? 'live' : 'test';

    if ($mode !== 'test' && $mode !== 'live') { $out['reason'] = 'mode_invalid'; return $cfg = $out; }
    // test 모드는 test_ 키만, live 모드는 live_ 키만. API 개별 연동 키(ck)만 받는다(결제위젯 gck 불가).
    $prefix = $mode === 'live' ? 'live_' : 'test_';
    if (!str_starts_with($client, $prefix . 'ck_')) { $out['reason'] = 'client_key_invalid'; return $cfg = $out; }
    if (!str_starts_with($secret, $prefix . 'sk_')) { $out['reason'] = 'secret_key_invalid'; return $cfg = $out; }

    $enc = base64_decode($encB64, true);
    if ($enc === false || strlen($enc) !== 32) { $out['reason'] = 'enc_key_invalid'; return $cfg = $out; }

    // 일반 결제 키와 같은 값이면 막는다 (MID 혼용 방지)
    $generalPath = __DIR__ . '/../payments/toss-config.php';
    if (is_file($generalPath)) {
        $g = require $generalPath;
        if (is_array($g)) {
            $gs = (string)($g['secret_key'] ?? '');
            $gc = (string)($g['client_key'] ?? '');
            if (($gs !== '' && hash_equals($gs, $secret)) || ($gc !== '' && hash_equals($gc, $client))) {
                $out['reason'] = 'same_as_general_keys';
                return $cfg = $out;
            }
        }
    }

    if (!function_exists('openssl_encrypt')) { $out['reason'] = 'openssl_missing'; return $cfg = $out; }

    $out['ready']     = true;
    $out['clientKey'] = $client;
    $out['secretKey'] = $secret;
    $out['encKey']    = $enc;
    return $cfg = $out;
}

// ─── 빌링키 암호화 (AES-256-GCM) ─────────────────────────────────

function membershipEncrypt(string $plain, string $key): string {
    $iv  = random_bytes(12);
    $tag = '';
    $ct  = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ct === false) throw new RuntimeException('encrypt failed');
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function membershipDecrypt(string $enc, string $key): ?string {
    if (!str_starts_with($enc, 'v1:')) return null;
    $bin = base64_decode(substr($enc, 3), true);
    if ($bin === false || strlen($bin) < 29) return null;
    $plain = openssl_decrypt(substr($bin, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($bin, 0, 12), substr($bin, 12, 16));
    return $plain === false ? null : $plain;
}

// ─── 저장 파일 ────────────────────────────────────────────────────

function membershipDir(): string {
    $dir = dataDir() . '/membership';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    // 웹으로 직접 열리지 않게 (Apache 2.4 / 2.2 모두). 서버가 .htaccess 를 무시해도 파일 이름은 추측할 수 없다.
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "Options -Indexes\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    return $dir;
}

function membershipStorePath(array $cfg): string {
    $suffix = substr(hash('sha256', 'woollim-membership-store|' . $cfg['encKey']), 0, 24);
    return membershipDir() . "/memberships-{$suffix}.json";
}

/**
 * 저장 파일을 잠근 채 $fn($store, $save) 를 실행한다.
 *  - $store: ['customers'=>[], 'memberships'=>[], 'payments'=>[]]
 *  - $save($store): 잠금을 쥔 채 중간 저장 (토스 호출 전에 상태를 먼저 남길 때)
 *  - $fn 이 배열을 돌려주면 마지막에 저장, null 이면 저장하지 않는다.
 */
function membershipWithStore(array $cfg, callable $fn): void {
    $path = membershipStorePath($cfg);
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('membership store open failed');
    @chmod($path, 0660);
    flock($fp, LOCK_EX);
    try {
        $raw   = stream_get_contents($fp);
        $store = $raw ? json_decode($raw, true) : [];
        if (!is_array($store)) throw new RuntimeException('membership store corrupted');
        $store += ['customers' => [], 'memberships' => [], 'payments' => []];
        if (!is_array($store['customers']))   $store['customers']   = [];
        if (!is_array($store['memberships'])) $store['memberships'] = [];
        if (!is_array($store['payments']))    $store['payments']    = [];

        $save = function (array $next) use ($fp): void {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($next, JSON_UNESCAPED_UNICODE));
            fflush($fp);
        };
        $next = $fn($store, $save);
        if (is_array($next)) $save($next);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/** 운영 확인용 로그 — 빌링키·키·카드번호는 남기지 않는다 */
function membershipLog(string $line): void {
    @file_put_contents(membershipDir() . '/_membership.log', sprintf("[%s] %s\n", date('c'), $line), FILE_APPEND);
}

// ─── 회원 · 날짜 ──────────────────────────────────────────────────

function membershipUuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20, 12));
}

/** 토스 결제창에 보낼 이름 (없으면 빈 문자열 — 선택 항목) */
function membershipUserName(string $email): string {
    try {
        require_once __DIR__ . '/../db.php';
        $stmt = getDB()->prepare("SELECT name FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        return trim((string)($stmt->fetchColumn() ?: ''));
    } catch (Throwable $e) {
        return '';
    }
}

function membershipToday(): string { return date('Y-m-d'); }   // lib.php 가 KST 고정

/** 기준일($ymd)의 다음 달 같은 날. 그날이 없는 달은 말일 (약관 제15조 ②) */
function membershipNextMonth(string $ymd, int $anchorDay): string {
    [$y, $m] = array_map('intval', explode('-', $ymd));
    $m++;
    if ($m > 12) { $m = 1; $y++; }
    $last = (int)date('t', mktime(0, 0, 0, $m, 1, $y));
    return sprintf('%04d-%02d-%02d', $y, $m, min($anchorDay, $last));
}

function membershipDayBefore(string $ymd): string {
    return date('Y-m-d', strtotime($ymd . ' -1 day'));
}

/** 지금 이용 중(결제한 기간 안) */
function membershipIsCurrent(array $m): bool {
    return ($m['status'] ?? '') === 'active' && (string)($m['current_period_end'] ?? '') >= membershipToday();
}

/** 회원의 가장 최근 멤버십 위치 (없으면 null) */
function membershipLatestIndex(array $store, int $userId): ?int {
    $found = null;
    foreach ($store['memberships'] as $i => $m) {
        if ((int)($m['user_id'] ?? 0) === $userId) $found = $i;
    }
    return $found;
}

/** 화면에 내려줄 모양 — 빌링키·customerKey·인증키는 넣지 않는다 */
function membershipView(array $m, array $payments): array {
    $status = (string)($m['status'] ?? '');
    if ($status === 'active' && !membershipIsCurrent($m)) $status = 'expired';
    $mine = array_values(array_filter($payments, fn($p) => ($p['membership_id'] ?? '') === ($m['id'] ?? '')));
    return [
        'status'             => $status,
        'price'              => (int)($m['price'] ?? MEMBERSHIP_PRICE),
        'isTest'             => !empty($m['is_test']),
        'periodStart'        => $m['current_period_start'] ?? null,
        'periodEnd'          => $m['current_period_end'] ?? null,
        'nextBillingAt'      => !empty($m['cancel_at_period_end']) ? null : ($m['next_billing_at'] ?? null),
        'cancelAtPeriodEnd'  => !empty($m['cancel_at_period_end']),
        'canceledAt'         => $m['canceled_at'] ?? null,
        'cardCompany'        => $m['card_company'] ?? null,
        'cardLast4'          => $m['card_last4'] ?? null,
        'payments'           => array_map(fn($p) => [
            'cycleNo'     => (int)($p['cycle_no'] ?? 1),
            'orderId'     => (string)($p['order_id'] ?? ''),
            'amount'      => (int)($p['amount'] ?? 0),
            'status'      => (string)($p['status'] ?? ''),
            'approvedAt'  => $p['approved_at'] ?? null,
            'failMessage' => $p['fail_message'] ?? null,
        ], $mine),
    ];
}

// ─── 토스 API ─────────────────────────────────────────────────────

/**
 * 토스 코어 API 호출. ['http'=>int(통신 실패 0), 'json'=>array|null]
 * MEMBERSHIP_TOSS_API_BASE 는 로컬 검증 스크립트가 흉내 서버를 쓰려고 미리 정의할 때만 바뀐다(운영은 정의하지 않음).
 */
function membershipToss(string $method, string $path, ?array $body, string $secretKey, ?string $idempotencyKey = null): array {
    $base = defined('MEMBERSHIP_TOSS_API_BASE') ? (string)constant('MEMBERSHIP_TOSS_API_BASE') : 'https://api.tosspayments.com';
    $headers = [
        'Authorization: Basic ' . base64_encode($secretKey . ':'),
        'Content-Type: application/json',
    ];
    if ($idempotencyKey !== null) $headers[] = 'Idempotency-Key: ' . $idempotencyKey;

    $ch = curl_init($base . $path);
    $opts = [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => 30,
    ];
    if ($body !== null) $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    curl_setopt_array($ch, $opts);
    $res  = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res === false) $http = 0;
    $json = is_string($res) && $res !== '' ? json_decode($res, true) : null;
    return ['http' => $http, 'json' => is_array($json) ? $json : null];
}

/** 응답에서 빌링키 같은 값을 지운 사본 (raw_response 저장용) */
function membershipScrub(array $data): array {
    foreach ($data as $k => $v) {
        if (in_array((string)$k, ['billingKey', 'authKey', 'customerKey'], true)) { unset($data[$k]); continue; }
        if (is_array($v)) $data[$k] = membershipScrub($v);
    }
    return $data;
}

/** 카드 번호(가림 처리된 값)에서 끝 4자리 */
function membershipCardLast4(?string $number): ?string {
    $n = trim((string)$number);
    return $n === '' ? null : substr($n, -4);
}
