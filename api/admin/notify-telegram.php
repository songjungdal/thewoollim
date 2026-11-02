<?php
/**
 * 관리자 — 텔레그램 알림 설정 (docs/specs/verification-telegram.md 3장·10장, 공통 기능 api/notify/_telegram.php).
 *  알림은 운영자 개인 대화(각자 봇에게 /start)나 그룹방으로 받는다. 받는 사람은 최대 TELEGRAM_MAX_RECIPIENTS.
 *
 * GET → { ok, ready(웹 루트 밖 폴더 있음), settings:{ enabled, hasToken, tokenMasked, recipients:[{id,title,type}], adminUrl, lastSummaryDate, updatedBy, updatedAt } }
 *       토큰 원문은 내려주지 않는다(앞 4자리만).
 * POST { action:'save', token?, recipients?:[{id,title,type}], adminUrl? }
 *       token 을 주면 새 토큰으로 바꾼다(다른 봇이므로 recipients 를 함께 주지 않으면 받는 사람을 비우고 알림을 끈다).
 * POST { action:'find_chats', token? } → { ok, chats:[{id,title,type}] }   봇에게 말을 건 개인 대화와 봇이 들어간 그룹·슈퍼그룹(채널 제외)
 *       ('find_groups' 도 같은 동작 — 예전 이름)
 * POST { action:'test' }   → 받는 사람 모두에게 연결 테스트 메시지 (스위치가 꺼져 있어도) → { ok, results:[{title,ok,error}] }
 * POST { action:'toggle', on:bool }  — 켜려면 토큰·받는 사람 필요
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
        'recipients'      => telegramRecipients($c),
        'adminUrl'        => (string)$c['admin_url'],
        'lastSummaryDate' => (string)$c['last_summary_date'],
        'updatedBy'       => $c['updated_by'] ?? null,
        'updatedAt'       => $c['updated_at'] ?? null,
    ];
}

/** 텔레그램 chat → 받는 사람 표시 (개인 대화는 텔레그램 이름·아이디, 그룹은 방 이름) */
function _tgChat(array $chat): ?array {
    $type = (string)($chat['type'] ?? '');
    if (!in_array($type, ['private', 'group', 'supergroup'], true)) return null;
    if ($type === 'private') {
        $name = trim((string)($chat['first_name'] ?? '') . ' ' . (string)($chat['last_name'] ?? ''));
        if (!empty($chat['username'])) $name .= ($name !== '' ? ' ' : '') . '@' . $chat['username'];
        $title = $name !== '' ? $name : '(이름 없음)';
    } else {
        $title = (string)($chat['title'] ?? '(이름 없음)');
    }
    return ['id' => (string)$chat['id'], 'title' => mb_substr($title, 0, 100), 'type' => $type];
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

if ($action === 'find_chats' || $action === 'find_groups') {
    $token = trim((string)($body['token'] ?? ''));
    if ($token === '') $token = (string)telegramConfig()['token'];
    if (!telegramTokenValid($token)) jsonFail('봇 토큰 형식이 올바르지 않습니다. BotFather 가 준 토큰 전체를 붙여넣어 주세요.');
    $r = telegramApi($token, 'getUpdates', ['allowed_updates' => ['message', 'my_chat_member']]);
    if (!$r['ok']) jsonFail('텔레그램에서 대화를 불러오지 못했습니다: ' . $r['error'], 502);
    $chats = [];
    foreach ((array)$r['result'] as $u) {
        foreach (['message', 'edited_message', 'my_chat_member'] as $k) {
            $c = is_array($u[$k]['chat'] ?? null) ? _tgChat($u[$k]['chat']) : null;
            if ($c !== null) $chats[$c['id']] = $c;
        }
    }
    // 이미 저장된 받는 사람도 목록에 (텔레그램은 최근 24시간 대화만 돌려준다)
    foreach (telegramRecipients(telegramConfig()) as $c) $chats[$c['id']] ??= $c;
    jsonOut(['ok' => true, 'chats' => array_values($chats),
        'message' => $chats ? '' : '알림 받을 분이 텔레그램에서 봇을 검색해 [시작](/start)을 누른 뒤 다시 눌러주세요']);
}

if ($action === 'save') {
    $token   = trim((string)($body['token'] ?? ''));
    $hasRcpt = array_key_exists('recipients', $body);
    $hasUrl  = array_key_exists('adminUrl', $body);
    $url     = trim((string)($body['adminUrl'] ?? ''));
    if ($token !== '' && !telegramTokenValid($token)) jsonFail('봇 토큰 형식이 올바르지 않습니다. BotFather 가 준 토큰 전체를 붙여넣어 주세요.');
    $rcpt = [];
    if ($hasRcpt) {
        if (!is_array($body['recipients'])) jsonFail('받는 사람 형식이 올바르지 않습니다.');
        foreach ($body['recipients'] as $r) {
            $id = trim((string)($r['id'] ?? ''));
            if (!preg_match('/^-?\d{1,20}$/', $id)) jsonFail('받는 사람 번호가 올바르지 않습니다.');
            $type = (string)($r['type'] ?? 'private');
            $rcpt[$id] = ['id' => $id, 'title' => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($r['title'] ?? ''))), 0, 100),
                          'type' => in_array($type, ['private', 'group', 'supergroup'], true) ? $type : 'private'];
        }
        $rcpt = array_values($rcpt);
        if (count($rcpt) > TELEGRAM_MAX_RECIPIENTS) jsonFail('받는 사람은 ' . TELEGRAM_MAX_RECIPIENTS . '명까지 정할 수 있습니다.');
    }
    if ($url !== '' && (mb_strlen($url) > 300 || !preg_match('#^https://[^\s]+$#', $url) || filter_var($url, FILTER_VALIDATE_URL) === false)) {
        jsonFail('관리자 화면 주소는 https:// 로 시작하는 주소로 입력해주세요.');
    }
    $changes = [];
    try {
        $saved = telegramUpdateConfig(function (array $c) use ($token, $hasRcpt, $rcpt, $hasUrl, $url, $stamp, &$changes) {
            $c['recipients'] = telegramRecipients($c);   // 예전 형식 → 새 형식
            $c['chat_id'] = ''; $c['chat_title'] = '';
            if ($token !== '' && $token !== $c['token']) {
                $c['token'] = $token;
                $changes[] = '봇 토큰 변경';
                if (!$hasRcpt) { $c['recipients'] = []; $c['enabled'] = false; $changes[] = '받는 사람 비움(토큰이 바뀜)'; }
            }
            if ($hasRcpt && $rcpt !== $c['recipients']) {
                $c['recipients'] = $rcpt;
                $changes[] = '받는 사람 ' . count($rcpt) . '명';
                if (!$rcpt) $c['enabled'] = false;
            }
            if ($hasUrl && $url !== $c['admin_url']) { $c['admin_url'] = $url; $changes[] = $url === '' ? '관리자 바로가기 주소 지움' : '관리자 바로가기 주소 변경'; }
            return $stamp($c);
        });
    } catch (Throwable $e) {
        error_log('[admin/notify-telegram save] ' . $e->getMessage());
        jsonFail('저장하지 못했습니다.', 500);
    }
    if ($changes) logAdminActivity('update', 'telegram', 'settings', '텔레그램 알림 설정 — ' . implode(', ', $changes), null, null,
        ['변경' => implode(', ', $changes), '토큰' => telegramMaskToken((string)$saved['token']) ?: '없음',
         '받는 사람' => implode(', ', array_map(fn($r) => $r['title'], telegramRecipients($saved))) ?: '없음']);
    jsonOut(['ok' => true, 'settings' => _tgView($saved)]);
}

if ($action === 'toggle') {
    $on = !empty($body['on']);
    $cur = telegramConfig();
    if ($on && ((string)$cur['token'] === '' || telegramRecipients($cur) === [])) jsonFail('봇 토큰과 받는 사람을 먼저 저장해주세요.', 409);
    try {
        $saved = telegramUpdateConfig(fn(array $c) => $stamp(['enabled' => $on] + $c));
    } catch (Throwable $e) {
        jsonFail('저장하지 못했습니다.', 500);
    }
    logAdminActivity('update', 'telegram', 'settings', '텔레그램 알림 ' . ($on ? '켜기' : '끄기'), null, null, ['설정' => '텔레그램 알림', '변경' => $on ? '켜짐' : '꺼짐']);
    jsonOut(['ok' => true, 'settings' => _tgView($saved)]);
}

if ($action === 'test') {
    $results = [];
    $ok = telegramSend(TELEGRAM_TEST_TEXT, false, null, false, $results);
    $view = array_map(fn($r) => ['title' => $r['title'], 'ok' => $r['ok'], 'error' => $r['error']], $results);
    $summary = implode(', ', array_map(fn($r) => $r['title'] . ' ' . ($r['ok'] ? '성공' : '실패(' . $r['error'] . ')'), $view));
    logAdminActivity('create', 'telegram', 'test', '텔레그램 테스트 알림 ' . ($ok ? '보냄' : '실패'), null, null,
        ['결과' => $summary !== '' ? $summary : '받는 사람 없음']);
    if (!$results) jsonFail('봇 토큰과 받는 사람을 먼저 저장해주세요.', 409);
    if (!$ok) jsonFail('테스트 알림을 보내지 못했습니다: ' . implode(', ', array_unique(array_map(fn($r) => $r['error'], $view))), 502, ['results' => $view]);
    jsonOut(['ok' => true, 'results' => $view]);
}

jsonFail('unknown action');
