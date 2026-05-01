<?php
/**
 * 관리자 매칭파티 CRUD.
 *
 * POST { action: 'create'|'update'|'delete', party?: {...}, id?: '...' } → { ok: true }
 *
 * 데이터 저장: /api/data/parties.json (단일 진실 소스, 메인페이지 useParties() 가 매핑)
 *
 * Party 객체 (관리자 폼 입력값):
 *   id, title, dateString, calendarDate, location, target, price, tag,
 *   maleStock, femaleStock, maleBooked, femaleBooked,
 *   minAge?, maxAge?, allowedMaritalStatus?,
 *   imageUrl?, description?, targetGroup?, theme?, locationTag?
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');
$file   = dataDir() . '/parties.json';

try {
    withFileLock($file, function (array $parties) use ($body, $action): array {
        switch ($action) {
            case 'create': {
                $p = $body['party'] ?? null;
                if (!is_array($p)) throw new RuntimeException('party required');
                $newId = ((int)max(0, ...array_map(fn($x) => (int)($x['id'] ?? 0), $parties))) + 1;
                $p['id'] = (string)$newId;
                $parties[] = sanitizeParty($p);
                return $parties;
            }
            case 'update': {
                $p = $body['party'] ?? null;
                if (!is_array($p) || empty($p['id'])) throw new RuntimeException('party.id required');
                $found = false;
                foreach ($parties as &$row) {
                    if ((string)($row['id'] ?? '') === (string)$p['id']) {
                        $row = sanitizeParty($p);
                        $found = true;
                        break;
                    }
                }
                unset($row);
                if (!$found) throw new RuntimeException('party not found');
                return $parties;
            }
            case 'delete': {
                $id = (string)($body['id'] ?? '');
                if ($id === '') throw new RuntimeException('id required');
                $parties = array_values(array_filter($parties, fn($p) => (string)($p['id'] ?? '') !== $id));
                return $parties;
            }
            default:
                throw new RuntimeException('unknown action');
        }
    });
} catch (Throwable $e) {
    error_log('[admin/parties] ' . $e->getMessage());
    jsonFail($e->getMessage(), 400);
}

@file_put_contents(
    dataDir() . '/_admin_party_changes.log',
    sprintf("[%s] adminId=%s action=%s\n", date('c'), $_SESSION['adminId'] ?? '?', $action),
    FILE_APPEND
);

$pid     = (string)($body['party']['id'] ?? $body['id'] ?? '');
$pTitle  = (string)($body['party']['title'] ?? '');
$summary = match ($action) {
    'create' => "매칭파티 생성 — #{$pid} {$pTitle}",
    'update' => "매칭파티 수정 — #{$pid} {$pTitle}",
    'delete' => "매칭파티 삭제 — #{$pid}",
    default  => "매칭파티 {$action}"
};
logAdminActivity($action === 'delete' ? 'delete' : ($action === 'create' ? 'create' : 'update'),
    'party', $pid, $summary, null, $body['party'] ?? null);

jsonOut(['ok' => true]);

/**
 * 관리자 입력 파티 객체 정규화 — 알려진 필드만 통과시켜 안전한 형태로 저장.
 */
function sanitizeParty(array $p): array {
    $clean = [
        'id'                   => (string)($p['id']           ?? ''),
        'title'                => trim((string)($p['title']        ?? '')),
        'dateString'           => trim((string)($p['dateString']   ?? '')),
        'calendarDate'         => trim((string)($p['calendarDate'] ?? '')),
        'location'             => trim((string)($p['location']     ?? '')),
        'target'               => trim((string)($p['target']       ?? '')),
        'price'                => (int)   ($p['price']        ?? 0),
        'tag'                  => trim((string)($p['tag']           ?? '주제별')),
        'maleStock'            => max(0, (int)($p['maleStock']    ?? 12)),
        'femaleStock'          => max(0, (int)($p['femaleStock']  ?? 12)),
        'maleBooked'           => max(0, (int)($p['maleBooked']   ?? 0)),
        'femaleBooked'         => max(0, (int)($p['femaleBooked'] ?? 0)),
    ];

    // 자격 제한 (선택)
    if (isset($p['minAge']) && $p['minAge'] !== '' && $p['minAge'] !== null) {
        $clean['minAge'] = (int)$p['minAge'];
    }
    if (isset($p['maxAge']) && $p['maxAge'] !== '' && $p['maxAge'] !== null) {
        $clean['maxAge'] = (int)$p['maxAge'];
    }
    $ams = (string)($p['allowedMaritalStatus'] ?? '');
    if (in_array($ams, ['all', '싱글', '돌싱'], true)) {
        $clean['allowedMaritalStatus'] = $ams;
    }

    // 콘텐츠
    if (!empty($p['imageUrl']))    $clean['imageUrl']    = (string)$p['imageUrl'];
    if (!empty($p['description'])) $clean['description'] = (string)$p['description'];

    // 카테고리
    $tg = (string)($p['targetGroup'] ?? '');
    if (in_array($tg, ['싱글', '돌싱'], true)) $clean['targetGroup'] = $tg;

    $th = (string)($p['theme'] ?? '');
    if (in_array($th, ['티타임', '와인파티', '사케파티', '쿠킹클래스'], true)) $clean['theme'] = $th;

    $lt = (string)($p['locationTag'] ?? '');
    if (in_array($lt, ['서울', '성남', '수원', '인천', '용인', '기타'], true)) $clean['locationTag'] = $lt;

    return $clean;
}
