<?php
/**
 * 마이페이지 멤버십 해지 / 해지 취소.
 *
 * POST { action: 'cancel' | 'resume' } → { ok: true, membership }
 *  - cancel : 다음 결제부터 청구하지 않음(cancel_at_period_end=true). 이미 결제한 기간 끝까지 이용.
 *  - resume : 해지 예약을 되돌림.
 *  - 이용 중(결제한 기간 안)인 멤버십에만 쓸 수 있다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
requireUser();

$cfg = membershipConfig();
if (!$cfg['ready']) jsonFail('멤버십 기능을 준비하고 있습니다. 잠시 후 다시 시도해주세요.', 503);

$action = (string)(jsonBody()['action'] ?? '');
if ($action !== 'cancel' && $action !== 'resume') jsonFail('잘못된 요청입니다.');

$userId = (int)currentUserId();
$result = null;
try {
    membershipWithStore($cfg, function (array $store) use ($userId, $action, &$result): ?array {
        $idx = membershipLatestIndex($store, $userId);
        if ($idx === null || !membershipIsCurrent($store['memberships'][$idx])) {
            $result = ['error' => '이용 중인 멤버십이 없습니다.'];
            return null;
        }
        $m = $store['memberships'][$idx];
        $m['cancel_at_period_end'] = $action === 'cancel';
        $m['canceled_at']          = $action === 'cancel' ? date('c') : null;
        $m['updated_at']           = date('c');
        $store['memberships'][$idx] = $m;
        membershipLog("{$action} membership={$m['id']} userId={$userId}");
        $result = ['membership' => membershipView($m, $store['payments'])];
        return $store;
    });
} catch (Throwable $e) {
    membershipLog('cancel error: ' . $e->getMessage());
    jsonFail('처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', 500);
}

if (isset($result['error'])) jsonFail($result['error'], 409);
jsonOut(['ok' => true, 'membership' => $result['membership']]);
