<?php
/**
 * 관리자 — 인증 심사 (docs/specs/photo-job-verification.md 4장).
 *
 * GET [?kind=photo|job|all][&status=pending|approved|rejected|all]
 *   → { ok, settings:{photoRequired, ready, reason, updatedBy, updatedAt}, pendingCount, rows:[...] }
 *     rows: 심사 중 먼저, 같은 상태끼리는 오래된 순. 회원 정보(이름·성별·나이·혼인여부·가입일·참가 이력 수·프로필 직업)를 붙인다.
 *     파일 이름·경로는 내려주지 않는다 — 사진·서류는 verification-file.php?id=&slot= 로만 본다.
 * GET ?approvedPhotoFor=<email> → { ok, recordId|null }   (예약 현황 명단의 [사진] — 현장 본인 확인)
 * GET ?summary=1 → { ok, pendingCount, users:{ userId:{photo, jobVerified, jobLabel} } }   (회원 관리 표·확인할 업무)
 *
 * POST { action:'approve', id, jobLabel? }   — 직업은 표시 직업 필수. 직업 서류는 처리 즉시 파일 삭제
 * POST { action:'reject',  id, reason }       — 사진은 30일 뒤 삭제(cron), 직업 서류는 즉시 삭제
 * POST { action:'setRequired', on:bool }      — 결제 전 사진 승인 필요 스위치. 업로드가 불가능한 서버에서는 켤 수 없다
 *  승인·반려 뒤 결과 문자(_verification_sms.php), 모든 처리는 관리자 활동 로그에 남긴다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
require_once __DIR__ . '/../verification/_lib.php';
jsonHeaders();
adminRequire();

$method = $_SERVER['REQUEST_METHOD'];

/** 회원 정보 맵 (id → row) */
function _verifyUsers(array $ids): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $stmt = getDB()->prepare("
        SELECT id, email, name, gender, job, marital_status, status,
               DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date,
               DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
          FROM users WHERE id IN ($in)
    ");
    $stmt->execute($ids);
    $out = [];
    foreach ($stmt->fetchAll() as $u) $out[(int)$u['id']] = $u;
    return $out;
}

/** 참가 이력 수 — 참가 확정·모임 종료 예약 */
function _verifyAttendCount(string $email): int {
    $f = dataDir() . '/bookings_' . md5(normalizeEmail($email)) . '.json';
    $b = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    if (!is_array($b)) return 0;
    return count(array_filter($b, fn($x) => is_array($x) && in_array((string)($x['status'] ?? ''), ['confirmed', 'completed'], true)));
}

function _verifySettingsView(array $store): array {
    $r = verifyReady();
    return [
        'photoRequired' => verifyPhotoRequired($store),
        'switchOn'      => !empty($store['settings']['photo_required']),
        'ready'         => $r['ready'],
        'reason'        => $r['reason'],
        'updatedBy'     => $store['settings']['updated_by'] ?? null,
        'updatedAt'     => $store['settings']['updated_at'] ?? null,
    ];
}

function _verifyPendingCount(array $store): int {
    return count(array_filter($store['records'], fn($r) => is_array($r) && ($r['status'] ?? '') === 'pending'));
}

if ($method === 'GET') {
    try {
        $store = verifyReadStore();

        // 예약 현황 명단 [사진] — 승인 사진 기록 번호
        if (isset($_GET['approvedPhotoFor'])) {
            $email = normalizeEmail((string)$_GET['approvedPhotoFor']);
            $stmt = getDB()->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
            $stmt->execute([$email]);
            $uid = (int)($stmt->fetchColumn() ?: 0);
            $rec = $uid > 0 ? verifyLatestWithStatus(verifyUserRecords($store, $uid, 'photo'), ['approved']) : null;
            jsonOut(['ok' => true, 'recordId' => $rec !== null && empty($rec['files_deleted_at']) ? (int)$rec['id'] : null]);
        }

        // 회원 관리 표 · 확인할 업무
        if (isset($_GET['summary'])) {
            $userIds = array_unique(array_map(fn($r) => (int)($r['user_id'] ?? 0), array_filter($store['records'], 'is_array')));
            $users = _verifyUsers($userIds);
            $map = [];
            foreach ($userIds as $uid) {
                if (!isset($users[$uid])) continue;
                $p = verifyPhotoSummary($store, $uid);
                $j = verifyJobSummary($store, $uid, (string)($users[$uid]['job'] ?? ''));
                $map[(string)$uid] = ['photo' => $p['status'], 'photoApproved' => $p['approved'], 'job' => $j['status'], 'jobVerified' => $j['verified'], 'jobLabel' => $j['label']];
            }
            jsonOut(['ok' => true, 'pendingCount' => _verifyPendingCount($store), 'settings' => _verifySettingsView($store), 'users' => (object)$map]);
        }

        $kind   = (string)($_GET['kind'] ?? 'all');
        $status = (string)($_GET['status'] ?? 'pending');
        $recs = array_values(array_filter($store['records'], function ($r) use ($kind, $status) {
            if (!is_array($r)) return false;
            if ($kind !== 'all' && ($r['kind'] ?? '') !== $kind) return false;
            $st = (string)($r['status'] ?? '');
            if ($st === 'superseded') return $status === 'all';
            if ($status === 'all') return true;
            if ($status === 'approved') return $st === 'approved' || $st === 'reverify';
            return $st === $status;
        }));
        // 심사 중 먼저, 같은 묶음은 오래된 순 (처리된 것은 최근 처리 순)
        usort($recs, function ($a, $b) {
            $pa = ($a['status'] ?? '') === 'pending' ? 0 : 1;
            $pb = ($b['status'] ?? '') === 'pending' ? 0 : 1;
            if ($pa !== $pb) return $pa <=> $pb;
            if ($pa === 0) return strcmp((string)$a['created_at'], (string)$b['created_at']) ?: ((int)$a['id'] <=> (int)$b['id']);
            return strcmp((string)($b['reviewed_at'] ?? $b['created_at']), (string)($a['reviewed_at'] ?? $a['created_at']));
        });
        $recs = array_slice($recs, 0, 300);
        $users = _verifyUsers(array_map(fn($r) => (int)$r['user_id'], $recs));
        $attend = [];

        $rows = [];
        foreach ($recs as $r) {
            $uid = (int)$r['user_id'];
            $u = $users[$uid] ?? null;
            $email = (string)($u['email'] ?? '');
            if ($email !== '' && !isset($attend[$email])) $attend[$email] = _verifyAttendCount($email);
            $prev = null;
            if (($r['kind'] ?? '') === 'photo') {
                $ap = verifyLatestWithStatus(verifyUserRecords($store, $uid, 'photo'), ['approved']);
                if ($ap !== null && (int)$ap['id'] !== (int)$r['id'] && empty($ap['files_deleted_at'])) $prev = (int)$ap['id'];
            }
            $jt = (string)($r['job_type'] ?? '');
            $rows[] = [
                'id'            => (int)$r['id'],
                'kind'          => (string)$r['kind'],
                'status'        => (string)$r['status'],
                'userId'        => $uid,
                'email'         => $email,
                'name'          => (string)($u['name'] ?? '(알 수 없음)'),
                'gender'        => (string)($u['gender'] ?? ''),
                'age'           => !empty($u['birth_date']) ? calcAgeFromBirthDate((string)$u['birth_date']) : null,
                'maritalStatus' => (string)($u['marital_status'] ?? ''),
                'joinedAt'      => (string)($u['created_at'] ?? ''),
                'attendCount'   => $email !== '' ? $attend[$email] : 0,
                'profileJob'    => (string)($u['job'] ?? ''),
                'createdAt'     => (string)($r['created_at'] ?? ''),
                'reviewedAt'    => $r['reviewed_at'] ?? null,
                'reviewedBy'    => $r['reviewed_by'] ?? null,
                'rejectReason'  => $r['reject_reason'] ?? null,
                'jobType'       => $jt !== '' ? (VERIFY_JOB_TYPES[$jt] ?? $jt) : null,
                'docKind'       => $jt !== '' ? (VERIFY_DOC_KINDS[$jt][(string)($r['doc_kind'] ?? '')] ?? (string)($r['doc_kind'] ?? '')) : null,
                'jobLabel'      => $r['job_label'] ?? null,
                'bizCheck'      => $r['biz_check'] ?? null,
                'fileCount'     => empty($r['files_deleted_at']) ? count((array)($r['files'] ?? [])) : 0,
                'filesDeletedAt'=> $r['files_deleted_at'] ?? null,
                'prevApprovedId'=> $prev,
            ];
        }
        jsonOut([
            'ok'            => true,
            'settings'      => _verifySettingsView($store),
            'pendingCount'  => _verifyPendingCount($store),
            'rejectReasons' => VERIFY_REJECT_REASONS,
            'rows'          => $rows,
        ]);
    } catch (Throwable $e) {
        error_log('[admin/verifications GET] ' . $e->getMessage());
        jsonFail('인증 심사 목록을 불러오지 못했습니다.', 500);
    }
}

if ($method !== 'POST') jsonFail('method not allowed', 405);

$body   = jsonBody();
$action = (string)($body['action'] ?? '');
$adminId = (string)($_SESSION['adminId'] ?? '?');

if ($action === 'setRequired') {
    $on = !empty($body['on']);
    if ($on && !verifyReady()['ready']) {
        jsonFail('서버에서 사진을 저장할 수 없는 상태라 켤 수 없습니다(' . verifyReady()['reason'] . ').', 409);
    }
    try {
        $store = verifyWithStore(function (array $store) use ($on, $adminId) {
            $store['settings']['photo_required'] = $on;
            $store['settings']['updated_by'] = $adminId;
            $store['settings']['updated_at'] = verifyNow();
            return $store;
        });
    } catch (Throwable $e) {
        error_log('[admin/verifications setRequired] ' . $e->getMessage());
        jsonFail('저장하지 못했습니다.', 500);
    }
    verifyLog("photo_required=" . ($on ? 'on' : 'off') . " by admin {$adminId}");
    logAdminActivity('update', 'verification', 'settings', '사진 심사 필수 ' . ($on ? '켜기' : '끄기') . ' — 결제 전 사진 승인 ' . ($on ? '필요' : '불필요'),
        null, null, ['설정' => '사진 심사 필수', '변경' => $on ? '켜짐' : '꺼짐']);
    jsonOut(['ok' => true, 'settings' => _verifySettingsView($store)]);
}

if ($action !== 'approve' && $action !== 'reject') jsonFail('unknown action');

$id = (int)($body['id'] ?? 0);
if ($id <= 0) jsonFail('id required');
$approve  = $action === 'approve';
$reason   = trim(preg_replace('/\s+/u', ' ', (string)($body['reason'] ?? '')));
$jobLabel = trim(preg_replace('/\s+/u', ' ', (string)($body['jobLabel'] ?? '')));
if (!$approve && ($reason === '' || mb_strlen($reason) > VERIFY_REASON_MAX)) jsonFail('반려 사유를 선택하거나 입력해주세요 (100자 이내).');
if ($jobLabel !== '' && mb_strlen($jobLabel) > VERIFY_LABEL_MAX) jsonFail('표시 직업은 30자 이내로 입력해주세요.');

$result = null;   // ['kind', 'userId']
try {
    // 직업 승인 때 회원 프로필 직업 글자를 함께 저장 (나중에 바뀌면 배지 숨김)
    $profileJob = null;
    $pre = verifyReadStore();
    $target = null;
    foreach ($pre['records'] as $r) if (is_array($r) && (int)($r['id'] ?? 0) === $id) $target = $r;
    if ($target === null) jsonFail('기록을 찾을 수 없습니다.', 404);
    if (($target['kind'] ?? '') === 'job' && $approve) {
        if ($jobLabel === '') jsonFail('표시 직업을 입력해주세요.');
        $stmt = getDB()->prepare("SELECT job FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([(int)$target['user_id']]);
        $profileJob = (string)($stmt->fetchColumn() ?: '');
    }

    verifyWithStore(function (array $store) use ($id, $approve, $reason, $jobLabel, $profileJob, $adminId, &$result) {
        $idx = null;
        foreach ($store['records'] as $i => $r) if (is_array($r) && (int)($r['id'] ?? 0) === $id) $idx = $i;
        if ($idx === null) throw new DomainException('기록을 찾을 수 없습니다.');
        $rec = $store['records'][$idx];
        if (($rec['status'] ?? '') !== 'pending') throw new DomainException('이미 처리된 기록입니다. 목록을 새로고침해주세요.');
        $kind = (string)$rec['kind'];
        $uid  = (int)$rec['user_id'];
        $now  = verifyNow();

        if ($approve) {
            // 같은 회원의 이전 승인 기록 → 대체됨 (사진은 30일 뒤 삭제, 직업 서류는 이미 지워져 있음)
            foreach ($store['records'] as $i => &$r) {
                if ($i !== $idx && is_array($r) && (int)($r['user_id'] ?? 0) === $uid && ($r['kind'] ?? '') === $kind
                    && in_array($r['status'] ?? '', ['approved', 'reverify'], true)) {
                    $r['status'] = 'superseded';
                    $r['superseded_at'] = $now;
                }
            }
            unset($r);
            $rec['status'] = 'approved';
            if ($kind === 'job') {
                $rec['job_label'] = $jobLabel;
                $rec['job_text']  = (string)$profileJob;
            }
        } else {
            $rec['status'] = 'rejected';
            $rec['reject_reason'] = $reason;
        }
        $rec['reviewed_by'] = $adminId;
        $rec['reviewed_at'] = $now;
        if ($kind === 'job') verifyDeleteRecordFiles($rec);   // 직업 서류: 승인·반려 즉시 삭제
        $store['records'][$idx] = $rec;
        $result = ['kind' => $kind, 'userId' => $uid, 'createdAt' => (string)($rec['created_at'] ?? '')];
        verifyLog("record {$id} {$kind} " . ($approve ? 'approved' : 'rejected') . " by admin {$adminId}");
        return $store;
    });
} catch (DomainException $e) {
    jsonFail($e->getMessage(), 409);
} catch (Throwable $e) {
    error_log('[admin/verifications POST] ' . $e->getMessage());
    jsonFail('처리하지 못했습니다.', 500);
}

// 로그 — 누가 언제 누구의 기록을 처리했는지
$email = '';
try {
    $stmt = getDB()->prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$result['userId']]);
    $who = $stmt->fetch() ?: [];
    $email = (string)($who['email'] ?? '');
} catch (Throwable $e) { $who = []; }
$kindLabel = $result['kind'] === 'photo' ? '사진 심사' : '직업 인증';
$detail = ['구분' => $kindLabel, '회원' => (string)($who['name'] ?? '') . ' (' . $email . ')', '결과' => $approve ? '승인' : '반려', '기록 번호' => (string)$id];
if ($approve && $result['kind'] === 'job') $detail['표시 직업'] = $jobLabel;
if (!$approve) $detail['반려 사유'] = $reason;
if ($result['kind'] === 'job') $detail['서류 파일'] = '처리와 함께 삭제';
logAdminActivity('update', 'verification', $email !== '' ? $email : (string)$result['userId'],
    "{$kindLabel} " . ($approve ? '승인' : '반려') . " — " . (string)($who['name'] ?? "회원 #{$result['userId']}") . ($approve ? '' : " (사유: {$reason})"),
    null, null, $detail);

require_once __DIR__ . '/_verification_sms.php';
notifyVerificationSms($result['userId'], $result['kind'], $approve, $reason);

// 운영자 텔레그램 처리 완료 알림(무음) — 응답을 보낸 뒤 (docs/specs/verification-telegram.md 4-2)
require_once __DIR__ . '/../verification/_notify.php';
respondJsonThen(['ok' => true], fn() => verifyNotifyDecision($result['userId'], $result['kind'], $approve, $reason, $adminId, $result['createdAt']));
