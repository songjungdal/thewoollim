<?php
/**
 * 사진 심사 요청 (명세 2-2 ①, 3-2).
 *
 * POST FormData { photo1, photo2, agree=1 } → { ok:true, photo:{...상태} }
 *  - 회원 세션 필수, 본인 것만. JPG·PNG·WEBP, 장당 10MB 이하(finfo 검사)
 *  - 서버에서 다시 저장해 EXIF(촬영 위치 등)를 지우고 긴 변 1600px 로 줄인다. 파일 이름은 서버가 무작위로 만든다
 *  - 저장 위치는 웹 루트 밖(privateDataDir()/verification) — 없으면 거절(웹 루트 안으로 대체 저장하지 않음)
 *  - 10분에 5회까지 (사진·직업 업로드 합산)
 *  - 이미 심사 중인 사진이 있으면 새 제출로 대체(superseded). 승인 사진은 새 사진이 승인될 때까지 그대로 둔다
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../auth/_session.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
requireUser();
$userId = (int)currentUserId();

$ready = verifyReady();
if (!$ready['ready']) {
    verifyLog("photo upload refused (not ready: {$ready['reason']}) user={$userId}");
    error_log('[verification/photo] not ready: ' . $ready['reason']);
    jsonFail('지금은 사진을 등록할 수 없습니다. 잠시 후 다시 시도해주세요.', 503);
}
if (($_POST['agree'] ?? '') !== '1') jsonFail('사진 수집·이용에 동의해주세요.');

foreach (['photo1' => '얼굴 정면 사진', 'photo2' => '자유 사진'] as $field => $label) {
    $err = verifyUploadError($_FILES[$field] ?? null);
    if ($err !== null) jsonFail("{$label}: {$err}");
}

try {
    $allowed = verifyWithStore(function (array $store) use ($userId) {
        return verifyRateHit($store, $userId) ? $store : null;
    });
} catch (Throwable $e) {
    error_log('[verification/photo] store: ' . $e->getMessage());
    jsonFail('잠시 후 다시 시도해주세요.', 500);
}
if ($allowed === null) jsonFail('짧은 시간에 너무 많이 올렸습니다. 10분 뒤에 다시 시도해주세요.', 429);

$files = [];
foreach (['photo1', 'photo2'] as $field) {
    $name = verifySaveUpload((string)$_FILES[$field]['tmp_name']);
    if ($name === null) {
        foreach ($files as $n) { $p = verifyFilePath($n); if ($p) @unlink($p); }
        verifyLog("photo reencode failed user={$userId}");
        jsonFail('사진을 처리하지 못했습니다. JPG로 저장해서 다시 올려주세요.');
    }
    $files[] = $name;
}

$summary = null;
try {
    verifyWithStore(function (array $store) use ($userId, $files, &$summary) {
        $now = verifyNow();
        foreach ($store['records'] as &$r) {
            if (is_array($r) && (int)($r['user_id'] ?? 0) === $userId && ($r['kind'] ?? '') === 'photo' && ($r['status'] ?? '') === 'pending') {
                $r['status'] = 'superseded';
                $r['superseded_at'] = $now;
            }
        }
        unset($r);
        $store['seq']++;
        $store['records'][] = [
            'id'         => $store['seq'],
            'user_id'    => $userId,
            'kind'       => 'photo',
            'status'     => 'pending',
            'files'      => $files,
            'consent_at' => $now,
            'created_at' => $now,
        ];
        $summary = verifyPhotoSummary($store, $userId);
        verifyLog("photo submitted record={$store['seq']} user={$userId}");
        return $store;
    });
} catch (Throwable $e) {
    foreach ($files as $n) { $p = verifyFilePath($n); if ($p) @unlink($p); }
    error_log('[verification/photo] save: ' . $e->getMessage());
    jsonFail('잠시 후 다시 시도해주세요.', 500);
}

jsonOut(['ok' => true, 'photo' => $summary]);
