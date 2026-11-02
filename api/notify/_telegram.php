<?php
/**
 * 운영자 텔레그램 알림 공통 (docs/specs/verification-telegram.md — 10장: 그룹방 대신 운영자 개인 대화로도 받음).
 *
 * ★ 개인정보 원칙 — 텔레그램은 회사 밖 서비스다. 이름·연락처·이메일·생년월일·사진·서류·사업자번호 등
 *   개인을 알아볼 수 있는 정보는 메시지에 절대 넣지 않는다(성별·나이대·구분·건수·시각·관리자 아이디만).
 *   이 원칙 덕분에 개인정보처리방침을 바꾸지 않았다. 메시지에 항목을 더할 때 반드시 지킨다.
 *
 * 설정: privateDataDir()/notify/telegram.json (웹 루트 밖, 0600, withFileLock)
 *   { enabled, token, recipients:[{id,title,type}], admin_url, last_summary_date, updated_by, updated_at }
 *   recipients: 알림 받을 대화 — 운영자 개인 대화(private, 그 사람이 봇에게 /start 를 보낸 대화) 또는 그룹. 최대 TELEGRAM_MAX_RECIPIENTS.
 *   예전 형식(chat_id·chat_title 하나)도 읽는다(telegramRecipients).
 *   토큰 원문은 화면·API 응답·로그 어디에도 내보내지 않는다(telegramMaskToken 으로 가린 값만).
 * 발송: 연결 3초·전체 5초 제한, 실패해도 예외를 던지지 않고 false. 재시도하지 않는다.
 *   22:00~08:00(KST)에는 무음. 실패 기록은 dataDir()/_telegram.log 에 시각·HTTP 코드·텔레그램 오류 설명만(토큰·주소 없음).
 * TELEGRAM_API_BASE 는 로컬 검증 스크립트가 흉내 서버를 쓰려고 미리 정의할 때만 바뀐다(운영은 정의하지 않음).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

const TELEGRAM_TEST_TEXT = '[어울림] 텔레그램 알림 연결 테스트입니다.';
const TELEGRAM_DEFAULT_ADMIN_LINE = '관리자 > 인증 심사에서 확인';
const TELEGRAM_MAX_RECIPIENTS = 5;

function telegramDefaults(): array {
    return ['enabled' => false, 'token' => '', 'recipients' => [], 'chat_id' => '', 'chat_title' => '', 'admin_url' => '', 'last_summary_date' => ''];
}

/** 알림 받을 대화 목록 [{id,title,type}] — 예전 형식(chat_id 하나)도 받아 준다 */
function telegramRecipients(array $cfg): array {
    $out = [];
    foreach ((array)($cfg['recipients'] ?? []) as $r) {
        if (is_array($r) && preg_match('/^-?\d{1,20}$/', (string)($r['id'] ?? ''))) {
            $out[] = ['id' => (string)$r['id'], 'title' => (string)($r['title'] ?? ''), 'type' => (string)($r['type'] ?? 'private')];
        }
    }
    if (!$out && (string)($cfg['chat_id'] ?? '') !== '') {
        $out[] = ['id' => (string)$cfg['chat_id'], 'title' => (string)($cfg['chat_title'] ?? ''), 'type' => 'group'];
    }
    return array_slice($out, 0, TELEGRAM_MAX_RECIPIENTS);
}

/** 설정 파일 경로 — 웹 루트 밖 폴더가 없으면 null (설정 저장 거절) */
function telegramConfigPath(): ?string {
    $base = privateDataDir();
    if ($base === null) return null;
    $dir = $base . '/notify';
    if (!is_dir($dir)) { @mkdir($dir, 0700, true); @chmod($dir, 0700); }
    return is_dir($dir) ? $dir . '/telegram.json' : null;
}

/** 설정 읽기 (없으면 기본값) */
function telegramConfig(): array {
    $base = privateDataDir();
    $path = $base === null ? null : $base . '/notify/telegram.json';
    if ($path === null || !is_file($path)) return telegramDefaults();
    $fp = @fopen($path, 'r');
    if (!$fp) return telegramDefaults();
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    $cfg = $raw ? json_decode($raw, true) : null;
    return is_array($cfg) ? $cfg + telegramDefaults() : telegramDefaults();
}

/** 설정 고치기 — $fn(현재 설정) 이 돌려준 배열을 저장하고 돌려준다. 웹 루트 밖 폴더가 없으면 RuntimeException */
function telegramUpdateConfig(callable $fn): array {
    $path = telegramConfigPath();
    if ($path === null) throw new RuntimeException('private data dir missing');
    $saved = withFileLock($path, function (array $cur) use ($fn) {
        return $fn($cur + telegramDefaults());
    });
    @chmod($path, 0600);
    return is_array($saved) ? $saved + telegramDefaults() : telegramConfig();
}

/** 화면용 — 앞 4자리만 남기고 가림 */
function telegramMaskToken(string $token): string {
    return $token === '' ? '' : substr($token, 0, 4) . '••••••';
}

function telegramTokenValid(string $token): bool {
    return (bool)preg_match('/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/', $token);
}

/** 알림을 보낼 수 있는 상태 (스위치 켜짐 + 토큰 + 받는 사람 1명 이상) */
function telegramReady(array $cfg): bool {
    return !empty($cfg['enabled']) && (string)$cfg['token'] !== '' && telegramRecipients($cfg) !== [];
}

/** 22:00~08:00(KST) — 무음 */
function telegramQuietHours(?int $ts = null): bool {
    $h = (int)date('G', $ts ?? time());   // lib.php 가 KST 고정
    return $h >= 22 || $h < 8;
}

/** 메시지 마지막 줄 — 관리자 바로가기 주소가 있으면 그 주소 */
function telegramAdminLine(array $cfg): string {
    $u = trim((string)($cfg['admin_url'] ?? ''));
    return $u !== '' ? $u : TELEGRAM_DEFAULT_ADMIN_LINE;
}

/** 실패 기록 — 시각·메서드·HTTP 코드·텔레그램 오류 설명만 (토큰·주소 없음) */
function telegramLog(string $method, int $http, string $desc): void {
    $desc = preg_replace('/\d{5,15}:[A-Za-z0-9_-]{20,}/', '[token]', $desc);   // 만약을 위해 토큰 모양은 지움
    @file_put_contents(dataDir() . '/_telegram.log',
        sprintf("[%s] fail method=%s http=%d desc=%s\n", date('c'), $method, $http, substr((string)$desc, 0, 200)), FILE_APPEND);
}

/**
 * 텔레그램 봇 API 호출 — ['ok'=>bool, 'http'=>int(통신 실패 0), 'result'=>mixed, 'error'=>string(텔레그램 오류 설명)]
 * 연결 3초·전체 5초. 예외를 던지지 않는다.
 */
function telegramApi(string $token, string $method, array $params): array {
    $base = defined('TELEGRAM_API_BASE') ? (string)constant('TELEGRAM_API_BASE') : 'https://api.telegram.org';
    try {
        $ch = curl_init($base . '/bot' . $token . '/' . $method);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($params, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT        => 5,
        ]);
        $res  = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err  = curl_error($ch);
        $json = is_string($res) ? json_decode($res, true) : null;
        if (is_array($json) && !empty($json['ok'])) return ['ok' => true, 'http' => $http, 'result' => $json['result'] ?? null, 'error' => ''];
        $desc = is_array($json) ? (string)($json['description'] ?? '') : ($err !== '' ? '통신 실패(' . (stripos($err, 'timed out') !== false ? '시간 초과' : '연결 오류') . ')' : '응답 없음');
        telegramLog($method, $http, $desc);
        return ['ok' => false, 'http' => $http, 'result' => null, 'error' => $desc !== '' ? $desc : '알 수 없는 오류'];
    } catch (Throwable $e) {
        telegramLog($method, 0, 'exception');
        return ['ok' => false, 'http' => 0, 'result' => null, 'error' => '통신 실패'];
    }
}

/**
 * 받는 사람 모두에게 메시지 보내기 — 한 명이라도 받았으면 true. 일반 텍스트, 링크 미리보기 끔. 22:00~08:00 은 무음으로 강제.
 *  $requireEnabled=false 는 [테스트 알림 보내기] 전용 (스위치가 꺼져 있어도 토큰·받는 사람이 있으면 보냄)
 *  $cfg 를 주지 않으면 저장된 설정을 읽는다. $results 에 받는 사람별 [id,title,ok,error](토큰 없음)
 */
function telegramSend(string $text, bool $silent = false, ?array $cfg = null, bool $requireEnabled = true, ?array &$results = null): bool {
    $results = [];
    try {
        $cfg ??= telegramConfig();
        $to = telegramRecipients($cfg);
        if ($requireEnabled ? !telegramReady($cfg) : ((string)$cfg['token'] === '' || $to === [])) return false;
        if (telegramQuietHours()) $silent = true;
        $any = false;
        foreach ($to as $r) {
            $res = telegramApi((string)$cfg['token'], 'sendMessage', [
                'chat_id'              => $r['id'],
                'text'                 => $text,
                'disable_notification' => $silent,
                'link_preview_options' => ['is_disabled' => true],
            ]);
            $results[] = ['id' => $r['id'], 'title' => $r['title'], 'ok' => $res['ok'], 'error' => $res['error']];
            $any = $any || $res['ok'];
        }
        return $any;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * 응답을 먼저 보내고 나서 $after 실행 (알림이 회원·관리자 응답을 늦추지 않게).
 * fastcgi_finish_request 가 있으면 연결을 끊고, 없으면(mod_php) 응답을 다 내보낸 뒤 실행한다. $after 의 오류는 삼킨다.
 */
function respondJsonThen(array $data, callable $after): void {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();   // 알림 보내는 동안 같은 회원·관리자의 다음 요청을 막지 않게
    http_response_code(200);
    $body = json_encode($data, JSON_UNESCAPED_UNICODE);
    header('Content-Length: ' . strlen((string)$body));
    echo $body;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) @ob_end_flush();
        @flush();
    }
    ignore_user_abort(true);
    try { $after(); } catch (Throwable $e) { error_log('[telegram] after: ' . $e->getMessage()); }
    exit;
}
