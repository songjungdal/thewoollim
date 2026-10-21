<?php
/**
 * 멤버십 화면용 상태 조회.
 *
 * GET [?join=1] → {
 *   ok, ready(키 설정 완료), mode('test'|'live'), price, today, nextBillingDate,
 *   clientKey?(ready 일 때만 — 브라우저용 공개 키), loggedIn,
 *   customerKey?(join=1 이고 로그인했을 때만 — 없으면 이때 만든다),
 *   membership?(가장 최근 멤버십 요약, 없으면 null)
 * }
 *  - 시크릿 키·빌링키는 내려주지 않는다.
 *  - customerKey 는 회원별로 한 번 만든 무작위 UUID 를 계속 쓴다(개인정보 없음).
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

$cfg   = membershipConfig();
$today = membershipToday();
$out = [
    'ok'              => true,
    'ready'           => $cfg['ready'],
    'mode'            => $cfg['mode'],
    'price'           => MEMBERSHIP_PRICE,
    'today'           => $today,
    'nextBillingDate' => membershipNextMonth($today, (int)substr($today, 8, 2)),
    'loggedIn'        => userIsLoggedIn(),
    'membership'      => null,
];
if ($cfg['ready']) $out['clientKey'] = $cfg['clientKey'];

if ($cfg['ready'] && userIsLoggedIn()) {
    $userId = (int)currentUserId();
    $join   = ($_GET['join'] ?? '') === '1';
    try {
        membershipWithStore($cfg, function (array $store) use ($userId, $join, &$out) {
            $changed = false;
            $key = (string)$userId;
            if ($join && empty($store['customers'][$key])) {
                $store['customers'][$key] = membershipUuid();
                $changed = true;
            }
            if ($join) $out['customerKey'] = (string)$store['customers'][$key];

            $idx = membershipLatestIndex($store, $userId);
            if ($idx !== null) $out['membership'] = membershipView($store['memberships'][$idx], $store['payments']);
            return $changed ? $store : null;
        });
    } catch (Throwable $e) {
        membershipLog('state error: ' . $e->getMessage());
        jsonFail('멤버십 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
    }
}

jsonOut($out);
