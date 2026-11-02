<?php
/**
 * 직업 인증 요청 (선택, 명세 2-2 ②, 3-2, 3-3).
 *
 * POST FormData { type: employee|business|other, docKind, file, agree=1, (사업자) bizNo, openDate } → { ok:true, job:{...상태} }
 *  - 사진과 같은 업로드 규칙(형식·크기·다시 저장·무작위 이름·웹 루트 밖·10분 5회)
 *  - 사업자: 국세청 진위확인(사업자번호+개업일자+대표자=본인인증 이름) 결과를 참고로 남긴다. 자동 승인·반려하지 않는다.
 *    사업자번호는 뒤 5자리를 가려서만 저장한다
 *  - 이미 심사 중인 직업 서류가 있으면 새 제출로 대체하고 이전 서류 파일은 바로 지운다
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
requireUser();
$userId = (int)currentUserId();

$ready = verifyReady();
if (!$ready['ready']) {
    verifyLog("job upload refused (not ready: {$ready['reason']}) user={$userId}");
    error_log('[verification/job] not ready: ' . $ready['reason']);
    jsonFail('지금은 서류를 등록할 수 없습니다. 잠시 후 다시 시도해주세요.', 503);
}
if (($_POST['agree'] ?? '') !== '1') jsonFail('직업 증빙 서류 수집·이용에 동의해주세요.');

$type    = (string)($_POST['type'] ?? '');
$docKind = (string)($_POST['docKind'] ?? '');
if (!isset(VERIFY_JOB_TYPES[$type])) jsonFail('구분을 선택해주세요.');
if (!isset(VERIFY_DOC_KINDS[$type][$docKind])) jsonFail('서류 종류를 선택해주세요.');

$bizNo = $openDate = '';
if ($type === 'business') {
    $bizNo = preg_replace('/\D+/', '', (string)($_POST['bizNo'] ?? ''));
    if (strlen($bizNo) !== 10) jsonFail('사업자등록번호 10자리를 입력해주세요.');
    $od = preg_replace('/\D+/', '', (string)($_POST['openDate'] ?? ''));
    $dt = strlen($od) === 8 ? DateTimeImmutable::createFromFormat('!Ymd', $od) : false;
    if (!$dt || $dt->format('Ymd') !== $od || $od > date('Ymd')) jsonFail('개업일자를 확인해주세요.');
    $openDate = $dt->format('Y-m-d');
}

$err = verifyUploadError($_FILES['file'] ?? null);
if ($err !== null) jsonFail($err);

try {
    $stmt = getDB()->prepare("SELECT name FROM users WHERE id = ? AND status = 'active' LIMIT 1");
    $stmt->execute([$userId]);
    $u = $stmt->fetch();
    if (!$u) jsonFail('unauthorized', 401);
    $allowed = verifyWithStore(function (array $store) use ($userId) {
        return verifyRateHit($store, $userId) ? $store : null;
    });
} catch (Throwable $e) {
    error_log('[verification/job] ' . $e->getMessage());
    jsonFail('잠시 후 다시 시도해주세요.', 500);
}
if ($allowed === null) jsonFail('짧은 시간에 너무 많이 올렸습니다. 10분 뒤에 다시 시도해주세요.', 429);

$name = verifySaveUpload((string)$_FILES['file']['tmp_name']);
if ($name === null) {
    verifyLog("job reencode failed user={$userId}");
    jsonFail('서류 사진을 처리하지 못했습니다. JPG로 저장해서 다시 올려주세요.');
}

$bizCheck = $type === 'business' ? verifyNtsCheck($bizNo, $openDate, (string)($u['name'] ?? '')) : null;

$summary = null;
try {
    verifyWithStore(function (array $store) use ($userId, $type, $docKind, $name, $bizCheck, &$summary) {
        $now = verifyNow();
        foreach ($store['records'] as &$r) {
            if (is_array($r) && (int)($r['user_id'] ?? 0) === $userId && ($r['kind'] ?? '') === 'job' && ($r['status'] ?? '') === 'pending') {
                $r['status'] = 'superseded';
                $r['superseded_at'] = $now;
                verifyDeleteRecordFiles($r);   // 직업 서류는 보관하지 않는다
            }
        }
        unset($r);
        $store['seq']++;
        $rec = [
            'id'         => $store['seq'],
            'user_id'    => $userId,
            'kind'       => 'job',
            'status'     => 'pending',
            'job_type'   => $type,
            'doc_kind'   => $docKind,
            'files'      => [$name],
            'consent_at' => $now,
            'created_at' => $now,
        ];
        if ($bizCheck !== null) $rec['biz_check'] = $bizCheck;
        $store['records'][] = $rec;
        $summary = verifyJobSummary($store, $userId, null);
        verifyLog("job submitted record={$store['seq']} user={$userId} type={$type}" . ($bizCheck ? " nts={$bizCheck['result']}" : ''));
        return $store;
    });
} catch (Throwable $e) {
    $p = verifyFilePath($name); if ($p) @unlink($p);
    error_log('[verification/job] save: ' . $e->getMessage());
    jsonFail('잠시 후 다시 시도해주세요.', 500);
}

jsonOut(['ok' => true, 'job' => $summary]);
