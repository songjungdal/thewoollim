<?php
/**
 * 관리자 파티(매칭파티·솔로파티) CRUD.
 *
 * GET   → { ok: true, items: [...] }   (관리자 전용 — host_name 등 내부 필드 포함)
 *
 * POST { action: 'create'|'update'|'delete', party?: {...}, id?: '...' } → { ok: true }
 * POST { action: 'update_host', id, host_name } → { ok: true, host_name }
 * POST { action: 'recruit', partyId, mode: 'auto'|'closed'|'open' } → 모집 마감·마감 해제·다시 자동 마감 (취소·시작된 파티는 거절)
 * POST { action: 'cancel_preview', partyId } → 파티 취소 미리보기(결제 수단별 건수·금액) / 취소된 파티는 남은 처리·무통장 송금 목록
 * POST { action: 'cancel_party', partyId, reason, sendSms, confirmTitle } → 파티 취소 + 신청자 전원 전액 환불 (_party_cancel.php)
 * POST { action: 'cancel_retry', partyId } → 취소된 파티의 남은 환불 다시 시도 (이미 처리된 예약은 건너뜀)
 * POST { action: 'manual_refund_done', partyId, email, bookingId } → 무통장 환불 [송금 완료]
 *   (docs/specs/party-recruit-close-cancel.md 5·6장. 모집 상태·취소 정보는 수정(update) 저장으로 바뀌지 않는다)
 *
 * 데이터 저장: /api/data/parties.json (단일 진실 소스)
 *
 * Party 객체 (관리자 폼 입력값):
 *   id, title, dateString, calendarDate, location, target, price, tag,
 *   maleStock, femaleStock, maleBooked, femaleBooked,
 *   minAge?, maxAge?, allowedMaritalStatus?,
 *   imageUrl? (대표이미지 — 파티 카드), heroImageUrl? (상단이미지 — 상세페이지 맨 위 16:9), description?, targetGroup?, theme?, locationTag?,
 *   locationShort? (짧은 장소명, 최대 10자), host_name?,
 *   partyType ('matching'|'solo', create 시 필수), detail? (상세페이지 안내 — lib.php sanitizePartyDetail)
 *   couponDisabled (쿠폰 적용 불가 — true 면 이 파티 결제에 쿠폰을 쓸 수 없다. 없으면 false)
 *   discountRate (할인율 0~90 정수, 그 밖의 값은 0 — 결제 금액은 lib.php priceForGender 가 할인가로 계산. docs/specs/party-discount-rate.md)
 *   sessions?·options? (솔로파티 참가 구성 — lib.php sanitizePartyOptions, docs/specs/party-options-solo.md)
 *
 * update: 요청에 없는 host_name·partyType·detail·voting_status·status·couponDisabled·discountRate·imageUrl·heroImageUrl·locationShort·sessions·options 는
 *         기존 값을 그대로 둔다. imageUrl·heroImageUrl·locationShort 는 키가 있고 비어 있으면 null 로 저장한다(이미지 제거·장소명 지우기).
 * GET: 참가 구성이 있는 파티에는 applicants(취소되지 않은 예약 기준 항목별·회차별 신청자 수)를 덧붙인다.
 *      applicants.seats 는 회차별 참가확정 인원 — 회차 정원은 이 값보다 적게 줄일 수 없다 (lib.php sanitizePartyOptions).
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
            $withOptions = array_values(array_map(fn($p) => (string)$p['id'], array_filter($d, fn($p) => is_array($p) && partyHasOptions($p))));
            $stats = $withOptions ? partyApplicantStats($withOptions) : [];
            $seatCounts = $withOptions ? readConfirmedCounts() : [];
            foreach ($d as $p) {
                if (!is_array($p)) continue;
                // host_name 항상 노출 (없으면 빈 문자열)
                $p['host_name'] = (string)($p['host_name'] ?? '');
                if (partyHasOptions($p)) {
                    $st = $stats[(string)$p['id']] ?? ['options' => [], 'sessions' => []];
                    $seatRow = $seatCounts[(string)$p['id']] ?? null;
                    $seats = is_array($seatRow) && is_array($seatRow['sessions'] ?? null) ? $seatRow['sessions'] : [];
                    $p['applicants'] = ['options' => (object)$st['options'], 'sessions' => (object)$st['sessions'], 'seats' => (object)$seats];
                }
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

// ─── 모집 마감·마감 해제·파티 취소 (docs/specs/party-recruit-close-cancel.md 5·6장) ─────────────
if (in_array($action, ['recruit', 'cancel_preview', 'cancel_party', 'cancel_retry', 'manual_refund_done'], true)) {
    require_once __DIR__ . '/_party_cancel.php';
    $adminId = (string)($_SESSION['adminId'] ?? '?');
    $partyId = (string)($body['partyId'] ?? '');
    if ($partyId === '') jsonFail('partyId 가 필요합니다.');

    // [모집 마감] / [마감 해제] / [다시 자동 마감으로] — recruitMode 만 바꾼다
    if ($action === 'recruit') {
        $mode = (string)($body['mode'] ?? '');
        if (!in_array($mode, ['auto', 'closed', 'open'], true)) jsonFail('mode 가 올바르지 않습니다.');
        $before = null; $after = null;
        try {
            withFileLock($file, function (array $parties) use ($partyId, $mode, $adminId, &$before, &$after): array {
                foreach ($parties as &$row) {
                    if (!is_array($row) || (string)($row['id'] ?? '') !== $partyId) continue;
                    if (partyIsCancelled($row)) throw new RuntimeException('취소된 파티는 모집 상태를 바꿀 수 없습니다.');
                    if (partyRecruitState($row, time())['state'] === 'ended') throw new RuntimeException('이미 시작된 파티는 모집 상태를 바꿀 수 없습니다.');
                    $before = normalizeRecruitMode($row['recruitMode'] ?? null);
                    $row['recruitMode']   = $mode;
                    $row['recruitModeBy'] = $adminId;
                    $row['recruitModeAt'] = date('c');
                    $after = $row;
                    return $parties;
                }
                unset($row);
                throw new RuntimeException('party not found');
            });
        } catch (Throwable $e) {
            jsonFail($e->getMessage(), 400);
        }
        $label = ['auto' => '자동 마감', 'closed' => '모집 마감(관리자)', 'open' => '마감 해제'];
        logAdminActivity('update', 'party', $partyId,
            "모집 상태 변경 — [" . partyTypeLabel($after) . "] #{$partyId} " . (string)($after['title'] ?? '') . " · {$label[$before]} → {$label[$mode]}",
            ['recruitMode' => $before], ['recruitMode' => $mode]);
        jsonOut(['ok' => true, 'recruitMode' => $mode, 'recruitModeAt' => $after['recruitModeAt']]);
    }

    $party = partyCancelFindParty($partyId);
    if ($party === null) jsonFail('파티를 찾을 수 없습니다.', 404);

    // 미리보기 — 결제 수단별 건수·금액 (취소된 파티는 남은 처리 건수와 무통장 송금 목록)
    if ($action === 'cancel_preview') {
        jsonOut(['ok' => true] + partyCancelPreview($party));
    }

    // [송금 완료] — 파티 취소로 생긴 무통장 환불 송금 기록만
    if ($action === 'manual_refund_done') {
        $email = normalizeEmail((string)($body['email'] ?? ''));
        $bid   = (string)($body['bookingId'] ?? '');
        $done = partyCancelMarkManualRefundDone($partyId, $email, $bid, $adminId);
        if (is_string($done)) jsonFail($done);
        require_once __DIR__ . '/_log_detail.php';
        logAdminActivity('update', 'booking', $bid,
            "파티 취소 무통장 환불 송금 완료 — 파티 #{$partyId} " . (string)($party['title'] ?? '') . ', ' . number_format((int)$done['amount']) . '원',
            ['manualRefund' => 'pending'], ['manualRefund' => 'done'],
            adminLogBookingDetail($email, $done['booking'], ['송금 금액' => number_format((int)$done['amount']) . '원']));
        jsonOut(['ok' => true, 'manualRefund' => $done['booking']['manualRefund']]);
    }

    // [파티 취소 실행] / [남은 환불 다시 시도]
    if ($action === 'cancel_party') {
        if (partyIsCancelled($party)) jsonFail('이미 취소된 파티입니다. [남은 환불 다시 시도]를 이용해주세요.');
        $reason = trim((string)preg_replace('/[\x00-\x1F\x7F<>]/u', '', (string)($body['reason'] ?? '')));
        if ($reason === '') jsonFail('취소 사유를 입력해주세요.');
        if (mb_strlen($reason) > PARTY_CANCEL_REASON_MAX) jsonFail('취소 사유는 ' . PARTY_CANCEL_REASON_MAX . '자 이하로 입력해주세요.');
        if (trim((string)($body['confirmTitle'] ?? '')) !== trim((string)($party['title'] ?? ''))) {
            jsonFail('파티 제목이 일치하지 않습니다. 제목을 그대로 입력해주세요.');
        }
        $sendSms = filter_var($body['sendSms'] ?? true, FILTER_VALIDATE_BOOLEAN);
        // 1) 파티에 취소 기록 먼저 — 이 순간부터 신청·결제 불가 (명세 6-2 1번)
        try {
            $party = partyCancelMark($partyId, $reason, $sendSms, $adminId);
        } catch (Throwable $e) {
            jsonFail($e->getMessage(), 400);
        }
    } else { // cancel_retry
        if (!partyIsCancelled($party)) jsonFail('취소된 파티가 아닙니다.');
    }

    // 2) 예약 처리 — 하나가 실패해도 나머지는 계속 (브라우저가 끊겨도 끝까지)
    ignore_user_abort(true);
    @set_time_limit(0);
    $result = partyCancelProcess($party);

    // 3) 텔레그램 (설정 켜져 있을 때만) — 회원 이름·연락처 없이 건수만
    partyCancelNotifyTelegram($party, $result, $adminId, $action === 'cancel_retry');

    // 4) 활동 로그
    logAdminActivity('update', 'party', $partyId,
        ($action === 'cancel_retry' ? '파티 취소 — 남은 환불 다시 시도' : '파티 취소') . " — [" . partyTypeLabel($party) . "] #{$partyId} " . (string)($party['title'] ?? '')
            . ' · 카드 환불 ' . $result['summary']['card'] . '건 / 무통장 송금 필요 ' . $result['summary']['vbankPaid'] . '건 / 입금 대기 취소 ' . $result['summary']['vbankPending'] . '건 / 실패 ' . $result['summary']['failed'] . '건',
        $action === 'cancel_party' ? ['cancelledAt' => null] : null,
        ['cancelledAt' => $party['cancelledAt'] ?? null, 'cancelReason' => $party['cancelReason'] ?? null, 'sendSms' => !empty($party['cancelSms'])],
        partyCancelLogDetail($result));

    jsonOut(['ok' => true, 'party' => ['id' => $partyId, 'cancelledAt' => $party['cancelledAt'] ?? null]] + $result);
}

// ─── 기존 CRUD (create / update / delete) ────────────────────────
$logInfo = ['id' => '', 'row' => null, 'detailChanged' => false];
try {
    withFileLock($file, function (array $parties) use ($body, $action, &$logInfo): array {
        switch ($action) {
            case 'create': {
                $p = $body['party'] ?? null;
                if (!is_array($p)) throw new RuntimeException('party required');
                if (!isset(PARTY_TYPE_LABELS[(string)($p['partyType'] ?? '')])) {
                    throw new RuntimeException('파티 종류를 선택해주세요.');
                }
                $newId = ((int)max(0, ...array_map(fn($x) => (int)($x['id'] ?? 0), $parties))) + 1;
                $p['id'] = (string)$newId;
                $row = sanitizePartyOptions($p, null, sanitizeParty($p));
                $parties[] = $row;
                $logInfo = ['id' => $row['id'], 'row' => $row, 'detailChanged' => isset($row['detail'])];
                return $parties;
            }
            case 'update': {
                $p = $body['party'] ?? null;
                if (!is_array($p) || empty($p['id'])) throw new RuntimeException('party.id required');
                $found = false;
                foreach ($parties as &$row) {
                    if ((string)($row['id'] ?? '') === (string)$p['id']) {
                        // 요청에 없는 필드는 기존 값 유지 — 관리자 폼이 보내지 않는 값(투표 상태·모임종료 표시·담당자)이
                        // 저장 때마다 초기화되지 않도록. partyType·detail 도 요청에 없으면 그대로 둔다.
                        // imageUrl·heroImageUrl·locationShort 도 요청에 키가 없으면(예전 관리자 화면) 그대로 둔다 — 키가 있고 비어 있으면 지운다(sanitizeParty)
                        foreach (['host_name', 'partyType', 'detail', 'voting_status', 'status', 'couponDisabled', 'discountRate', 'imageUrl', 'heroImageUrl', 'locationShort'] as $keep) {
                            if (!array_key_exists($keep, $p) && array_key_exists($keep, $row)) {
                                $p[$keep] = $row[$keep];
                            }
                        }
                        $before = $row;
                        // 참가 구성(sessions·options)은 요청에 없으면 sanitizePartyOptions 가 기존 값을 유지한다
                        $row = sanitizePartyOptions($p, $before, sanitizeParty($p, true));
                        // 모집 상태·파티 취소 정보는 전용 동작(recruit·cancel_party)으로만 바뀐다 — 수정 저장은 요청 값과 상관없이 기존 값 유지
                        foreach (PARTY_RECRUIT_CANCEL_FIELDS as $keep) {
                            if (array_key_exists($keep, $before)) $row[$keep] = $before[$keep];
                        }
                        $logInfo = [
                            'id'            => $row['id'],
                            'row'           => $row,
                            'detailChanged' => ($before['detail'] ?? null) !== ($row['detail'] ?? null),
                        ];
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
                // 활동 로그 상세용 — 지우기 직전 파티 값을 남겨 둔다 (삭제 처리에는 쓰지 않는다)
                foreach ($parties as $p) {
                    if (is_array($p) && (string)($p['id'] ?? '') === $id) {
                        $logInfo = ['id' => $id, 'row' => $p, 'detailChanged' => false];
                        break;
                    }
                }
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

$pid     = $logInfo['id'] !== '' ? $logInfo['id'] : (string)($body['party']['id'] ?? $body['id'] ?? '');
$pTitle  = (string)($logInfo['row']['title'] ?? $body['party']['title'] ?? '');
$pType   = $logInfo['row'] ? '[' . partyTypeLabel($logInfo['row']) . '] ' : '';
$summary = match ($action) {
    'create' => "파티 생성 — {$pType}#{$pid} {$pTitle}",
    'update' => "파티 수정 — {$pType}#{$pid} {$pTitle}",
    'delete' => "파티 삭제 — {$pType}#{$pid} {$pTitle}",
    default  => "파티 {$action}"
};
// 기록에는 detail 전체 대신 개수만 남긴다 (변경·등록된 경우에만).
$afterValue = $body['party'] ?? null;
if (is_array($afterValue)) {
    unset($afterValue['detail']);
    if ($logInfo['detailChanged'] && isset($logInfo['row']['detail'])) {
        $afterValue['detail'] = ($action === 'create' ? '상세 안내 등록됨(' : '상세 안내 변경됨(')
            . partyDetailCounts($logInfo['row']['detail']) . ')';
    }
}
// 삭제는 지운 파티의 값(변경 전)과 상세 정보(일시·장소·참가비·정원·신청 인원·예약 현황 등)를 함께 남긴다.
$beforeValue = null;
$logDetail   = null;
if ($action === 'delete' && is_array($logInfo['row'])) {
    require_once __DIR__ . '/_log_detail.php';
    $beforeValue = adminLogPartySnapshot($logInfo['row']);
    $logDetail   = adminLogPartyDetail($logInfo['row']);
}
logAdminActivity($action === 'delete' ? 'delete' : ($action === 'create' ? 'create' : 'update'),
    'party', $pid, $summary, $beforeValue, $afterValue, $logDetail);

jsonOut(['ok' => true]);

/**
 * 관리자 입력 파티 객체 정규화 — 알려진 필드만 통과시켜 안전한 형태로 저장.
 */
function sanitizeParty(array $p, bool $isUpdate = false): array {
    $clean = [
        'id'                   => (string)($p['id']           ?? ''),
        'title'                => trim((string)($p['title']        ?? '')),
        'dateString'           => trim((string)($p['dateString']   ?? '')),
        'calendarDate'         => trim((string)($p['calendarDate'] ?? '')),
        'location'             => trim((string)($p['location']     ?? '')),
        'target'               => trim((string)($p['target']       ?? '')),
        'price'                => (int)   ($p['price']        ?? 0),
        'priceMale'            => max(0, (int)($p['priceMale']   ?? 0)),
        'priceFemale'          => max(0, (int)($p['priceFemale'] ?? 0)),
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

    // 콘텐츠 — 대표이미지(imageUrl, 파티신청·목록 카드)와 상단이미지(heroImageUrl, 상세페이지 맨 위 16:9).
    //   수정(update) 때 키가 있는데 비어 있으면 null 로 저장한다 — 관리자가 [이미지 제거] 후 저장한 것을 그대로 반영. 등록은 비면 넣지 않는다.
    foreach (['imageUrl', 'heroImageUrl'] as $k) {
        if (!empty($p[$k]))                                $clean[$k] = (string)$p[$k];
        elseif ($isUpdate && array_key_exists($k, $p))     $clean[$k] = null;
    }
    if (!empty($p['description'])) $clean['description'] = (string)$p['description'];

    // 카테고리
    $tg = (string)($p['targetGroup'] ?? '');
    if (in_array($tg, ['싱글', '돌싱'], true)) $clean['targetGroup'] = $tg;

    // 테마 — 새 선택지 3개(화면 app/lib/data.ts THEMES) + 예전 값 3개(LEGACY_THEMES). 예전 값은 관리자 화면에서 새로 고를 수 없고,
    //   이미 그 값이 저장된 파티를 그대로 저장할 때 지워지지 않게 받는다 (docs/specs/party-request-tabs.md)
    $th = (string)($p['theme'] ?? '');
    if (in_array($th, ['로테이션소개팅', '와인파티', '솔로파티', '티타임', '사케파티', '쿠킹클래스'], true)) $clean['theme'] = $th;

    $lt = (string)($p['locationTag'] ?? '');
    if (in_array($lt, ['서울', '성남', '수원', '인천', '용인', '기타'], true)) $clean['locationTag'] = $lt;

    // 짧은 장소명 (상세페이지 하단 바, 최대 10자) — 제어문자·HTML 꺾쇠는 지운다. 수정 때 키가 있는데 비어 있으면 null
    $ls = mb_substr(trim((string)preg_replace('/[<>\x00-\x1F\x7F]/u', '', (string)($p['locationShort'] ?? ''))), 0, 10);
    if ($ls !== '')                                          $clean['locationShort'] = $ls;
    elseif ($isUpdate && array_key_exists('locationShort', $p)) $clean['locationShort'] = null;

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

    // 파티 종류 — 허용 목록 밖이면 matching (create 의 필수 검사는 위 핸들러에서)
    $clean['partyType'] = isset(PARTY_TYPE_LABELS[(string)($p['partyType'] ?? '')]) ? (string)$p['partyType'] : 'matching';

    // 쿠폰 적용 불가 (매칭·솔로 공통) — 값이 없거나 false 면 false (기존 파티는 지금처럼 쿠폰 사용 가능)
    $clean['couponDisabled'] = filter_var($p['couponDisabled'] ?? false, FILTER_VALIDATE_BOOLEAN);

    // 할인율 (단일 가격 파티) — 0~90 정수만, 그 밖의 값은 0 (docs/specs/party-discount-rate.md 1장)
    $clean['discountRate'] = partyDiscountRate($p);

    // 상세페이지 안내 — 있으면 검증 후 저장 (입력 제한 위반 시 RuntimeException → 저장 거절)
    if (array_key_exists('detail', $p) && $p['detail'] !== null) {
        $clean['detail'] = sanitizePartyDetail($p['detail']);
    }

    return $clean;
}
