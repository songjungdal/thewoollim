<?php
/**
 * 관리자 매칭파티 CRUD.
 *
 * GET   → { ok: true, items: [...] }   (관리자 전용 — host_name 등 내부 필드 포함)
 *
 * POST { action: 'create'|'update'|'delete', party?: {...}, id?: '...' } → { ok: true }
 * POST { action: 'update_host', id, host_name } → { ok: true, host_name }
 *
 * 데이터 저장: /api/data/parties.json (단일 진실 소스)
 *
 * Party 객체 (관리자 폼 입력값):
 *   id, title, dateString, calendarDate, location, target, price, tag,
 *   maleStock, femaleStock, maleBooked, femaleBooked,
 *   minAge?, maxAge?, allowedMaritalStatus?,
 *   imageUrl?, description?, targetGroup?, theme?, locationTag?, host_name?
 *
 * 보안:
 *   - host_name 은 본 엔드포인트(GET / update_host) 에서만 노출/수정
 *   - 공개 /api/parties.php 는 화이트리스트로 host_name 자동 차단
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

$file = dataDir() . '/parties.json';

// ─── GET — 관리자 전용 전체 데이터 (host_name 포함) ───────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $items = [];
    if (file_exists($file)) {
        $d = json_decode((string)file_get_contents($file), true);
        if (is_array($d)) {
            foreach ($d as $p) {
                if (!is_array($p)) continue;
                // host_name 항상 노출 (없으면 빈 문자열)
                $p['host_name'] = (string)($p['host_name'] ?? '');
                $items[] = $p;
            }
        }
    }
    jsonOut(['ok' => true, 'items' => $items]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');

// ─── update_host — 호스트 이름만 부분 업데이트 (인라인 편집용) ───
if ($action === 'update_host') {
    $id   = (string)($body['id'] ?? '');
    $host = trim((string)($body['host_name'] ?? ''));

    if ($id === '') jsonFail('id 가 필요합니다.');
    if (mb_strlen($host) > 100) jsonFail('호스트 이름이 너무 깁니다 (최대 100자).');
    // XSS 방어 — 제어문자 / HTML 태그 차단
    if (preg_match('/[<>\x00-\x1F\x7F]/u', $host)) {
        jsonFail('사용할 수 없는 문자가 포함돼있습니다.');
    }

    $applied = null;
    try {
        withFileLock($file, function (array $parties) use ($id, $host, &$applied): array {
            $found = false;
            foreach ($parties as &$row) {
                if ((string)($row['id'] ?? '') === $id) {
                    $row['host_name'] = $host;
                    $applied = $host;
                    $found = true;
                    break;
                }
            }
            unset($row);
            if (!$found) throw new RuntimeException('party not found');
            return $parties;
        });
    } catch (Throwable $e) {
        error_log('[admin/parties update_host] ' . $e->getMessage());
        jsonFail($e->getMessage(), 400);
    }

    logAdminActivity('update', 'party', $id,
        "호스트 변경 — 파티 #{$id} → " . ($host === '' ? '(없음)' : $host),
        null, ['host_name' => $applied]);

    jsonOut(['ok' => true, 'host_name' => $applied]);
}

// ─── 기존 CRUD (create / update / delete) ────────────────────────
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
                        // host_name 보존 — sanitizeParty 가 명시 입력 없으면 기존 값 유지
                        if (!array_key_exists('host_name', $p)) {
                            $p['host_name'] = $row['host_name'] ?? '';
                        }
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

    // host_name (관리자 전용 — 공개 API 응답에는 포함 안 됨)
    if (array_key_exists('host_name', $p)) {
        $h = trim((string)$p['host_name']);
        // 제어문자 / HTML 태그 차단
        if (!preg_match('/[<>\x00-\x1F\x7F]/u', $h) && mb_strlen($h) <= 100) {
            $clean['host_name'] = $h;
        } else {
            $clean['host_name'] = '';
        }
    }

    // voting_status (매칭 투표 상태) — admin/matching.php 가 주로 변경하지만
    // sanitize 화이트리스트에 포함 — admin/parties.php update 시 보존
    $vs = (string)($p['voting_status'] ?? 'closed');
    $clean['voting_status'] = in_array($vs, ['closed', 'open', 'finalized'], true) ? $vs : 'closed';

    // 파티 자체 상태 — 'completed' (모임종료, admin/matching.php 'end' 액션이 설정).
    // 일반 파티 폼 저장 시에도 기존 값 보존되도록 화이트리스트에 포함.
    if (isset($p['status']) && $p['status'] === 'completed') {
        $clean['status'] = 'completed';
    }

    return $clean;
}
