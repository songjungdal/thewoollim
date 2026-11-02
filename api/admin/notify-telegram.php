<?php
/**
 * 관리자 — 텔레그램 알림 설정 (docs/specs/verification-telegram.md 3장, 공통 기능 api/notify/_telegram.php).
 *
 * GET → { ok, ready(웹 루트 밖 폴더 있음), settings:{ enabled, hasToken, tokenMasked, chatId, chatTitle, adminUrl, lastSummaryDate, updatedBy, updatedAt } }
 *       토큰 원문은 내려주지 않는다(앞 4자리만).
 * POST { action:'save', token?, chatId?, chatTitle?, adminUrl? }
 *       token 을 주면 새 토큰으로 바꾼다(바꾸면 그룹도 다시 골라야 하므로 chatId 를 함께 주지 않으면 그룹을 비운다).
 * POST { action:'find_groups', token? } → { ok, groups:[{id,title,type}] }   token 을 주지 않으면 저장된 토큰. 그룹·슈퍼그룹만
 * POST { action:'test' }   → 연결 테스트 메시지 (스위치가 꺼져 있어도 토큰·그룹이 있으면 보냄)
 * POST { action:'toggle', on:bool }  — 켜려면 토큰·그룹 필요
 * 모든 변경·테스트는 관리자 활동 로그에 남긴다(토큰 원문 없음).
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/../notify/_telegram.php';
jsonHeaders();
adminRequire();

function _tgView(array $c): array {
    return [
        'enabled'         => !empty($c['enabled']),
        'hasToken'        => (string)$c['token'] !== '',
        'tokenMasked'     => telegramMaskToken((string)$c['token']),
        'chatId'          => (string)$c['chat_id'],
        'chatTitle'       => (string)$c['chat_title'],
        'adminUrl'        => (string)$c['admin_url'],
        'lastSummaryDate' => (string)$c['last_summary_date'],
        'updatedBy'       => $c['updated_by'] ?? null,
        'updatedAt'       => $c['updated_at'] ?? null,
    ];
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    jsonOut(['ok' => true, 'ready' => telegramConfigPath() !== null, 'settings' => _tgView(telegramConfig())]);
}
if ($method !== 'POST') jsonFail('method not allowed', 405);

if (telegramConfigPath() === null) jsonFail('웹 루트 밖 데이터 폴더가 없어 설정을 저장할 수 없습니다.', 409);

$body    = jsonBody();
$action  = (string)($body['action'] ?? '');
$adminId = (string)($_SESSION['adminId'] ?? '?');
$stamp   = fn(array $c) => ['updated_by' => $adminId, 'updated_at' => date('Y-m-d H:i:s')] + $c;

if ($action === 'find_groups') {
    $token = trim((string)($body['token'] ?? ''));
    if ($token === '') $token = (string)telegramConfig()['token'];
    if (!telegramTokenValid($token)) jsonFail('봇 토큰 형식이 올바르지 않습니다. BotFather 가 준 토큰 전체를 붙여넣어 주세요.');
    $r = telegramApi($token, 'getUpdates', ['allowed_updates' => ['message', 'my_chat_member']]);
    if (!$r['ok']) jsonFail('텔레그램에서 그룹을 불러오지 못했습니다: ' . $r['error'], 502);
    $groups = [];
    foreach ((array)$r['result'] as $u) {
        foreach (['message', 'edited_message', 'my_chat_member', 'channel_post'] as $k) {
            $chat = $u[$k]['chat'] ?? null;
            if (!is_array($chat) || !in_array($chat['type'] ?? '', ['group', 'supergroup'], true)) continue;
            $groups[(string)$chat['id']] = ['id' => (string)$chat['id'], 'title' => (string)($chat['title'] ?? '(이름 없음)'), 'type' => (string)$chat['type']];
        }
    }
    jsonOut(['ok' => true, 'groups' => array_values($groups),
        'message' => $groups ? '' : '그룹방에 봇을 초대한 뒤 /start 를 입력하고 다시 눌러주세요']);
}

if ($action === 'save') {
    $token   = trim((string)($body['token'] ?? ''));
    $chatId  = trim((string)($body['chatId'] ?? ''));
    $title   = trim(preg_replace('/\s+/u', ' ', (string)($body['chatTitle'] ?? '')));
    $hasUrl  = array_key_exists('adminUrl', $body);
    $url     = trim((string)($body['adminUrl'] ?? ''));
    if ($token !== '' && !telegramTokenValid($token)) jsonFail('봇 토큰 형식이 올바르지 않습니다. BotFather 가 준 토큰 전체를 붙여넣어 주세요.');
    if ($chatId !== '' && !preg_match('/^-?\d{3,20}$/', $chatId)) jsonFail('그룹 번호가 올바르지 않습니다.');
    if (mb_strlen($title) > 100) $title = mb_substr($title, 0, 100);
    if ($url !== '' && (mb_strlen($url) > 300 || !preg_match('#^https://[^\s]+$#', $url) || filter_var($url, FILTER_VALIDATE_URL) === false)) {
        jsonFail('관리자 화면 주소는 https:// 로 시작하는 주소로 입력해주세요.');
    }
    $changes = [];
    try {
        $saved = telegramUpdateConfig(function (array $c) use ($token, $chatId, $title, $hasUrl, $url, $stamp, &$changes) {
            if ($token !== '' && $token !== $c['token']) {
                $c['token'] = $token;
                $changes[] = '봇 토큰 변경';
                if ($chatId === '') { $c['chat_id'] = ''; $c['chat_title'] = ''; $c['enabled'] = false; $changes[] = '그룹 연결 해제(토큰이 바뀜)'; }
            }
            if ($chatId !== '' && ($chatId !== $c['chat_id'] || $title !== $c['chat_title'])) {
                $c['chat_id'] = $chatId; $c['chat_title'] = $title; $changes[] = "그룹 연결: {$title}";
            }
            if ($hasUrl && $url !== $c['admin_url']) { $c['admin_url'] = $url; $changes[] = $url === '' ? '관리자 바로가기 주소 지움' : '관리자 바로가기 주소 변경'; }
            return $stamp($c);
        });
    } catch (Throwable $e) {
        error_log('[admin/notify-telegram save] ' . $e->getMessage());
        jsonFail('저장하지 못했습니다.', 500);
    }
    if ($changes) logAdminActivity('update', 'telegram', 'settings', '텔레그램 알림 설정 — ' . implode(', ', $changes), null, null,
        ['변경' => implode(', ', $changes), '토큰' => telegramMaskToken((string)$saved['token']) ?: '없음', '그룹' => (string)$saved['chat_title'] ?: '없음']);
    jsonOut(['ok' => true, 'settings' => _tgView($saved)]);
}

if ($action === 'toggle') {
    $on = !empty($body['on']);
    $cur = telegramConfig();
    if ($on && ((string)$cur['token'] === '' || (string)$cur['chat_id'] === '')) jsonFail('봇 토큰과 그룹을 먼저 저장해주세요.', 409);
    try {
        $saved = telegramUpdateConfig(fn(array $c) => $stamp(['enabled' => $on] + $c));
    } catch (Throwable $e) {
        jsonFail('저장하지 못했습니다.', 500);
    }
    logAdminActivity('update', 'telegram', 'settings', '텔레그램 알림 ' . ($on ? '켜기' : '끄기'), null, null, ['설정' => '텔레그램 알림', '변경' => $on ? '켜짐' : '꺼짐']);
    jsonOut(['ok' => true, 'settings' => _tgView($saved)]);
}

if ($action === 'test') {
    $err = null;
    $ok = telegramSend(TELEGRAM_TEST_TEXT, false, null, false, $err);
    logAdminActivity('create', 'telegram', 'test', '텔레그램 테스트 알림 ' . ($ok ? '성공' : '실패'), null, null,
        ['결과' => $ok ? '성공' : '실패', '오류' => $ok ? '-' : (string)$err]);
    if (!$ok) jsonFail('테스트 알림을 보내지 못했습니다: ' . $err, 502);
    jsonOut(['ok' => true]);
}

jsonFail('unknown action');
