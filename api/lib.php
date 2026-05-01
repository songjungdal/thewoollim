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
