<?php
/**
 * 사진 심사 · 직업 인증 공통 (docs/specs/photo-job-verification.md).
 *
 * 저장 (명세 9장 — DB 대신 웹 루트 밖 JSON, 사용자 결정 2026-11-02)
 *  - 폴더: privateDataDir()/verification/ (웹 루트 밖, 0700). 없으면 업로드를 거절한다 — 웹 루트 안으로 대체 저장하지 않는다.
 *  - store.json (파일 잠금): { seq, records[], settings{photo_required,...}, rate{userId:[시각...]} }
 *      record = { id, user_id, kind:'photo'|'job', status:'pending'|'approved'|'rejected'|'superseded'|'reverify',
 *                 job_type, doc_kind, job_label, job_text, files[], biz_check, reject_reason,
 *                 reviewed_by, reviewed_at, superseded_at, files_deleted_at, consent_at, created_at }
 *      job_text: 직업 승인 때 회원 프로필의 직업 글자. 프로필 직업이 이와 달라지면 배지를 숨기고 'reverify'(재인증 필요)
 *  - files/<무작위 32자>.jpg — 서버에서 다시 저장(재인코딩)해 EXIF(촬영 위치 등)를 지우고 긴 변 1600px 로 줄인 JPEG
 *
 * 보관: 승인 사진은 탈퇴 때까지, 반려·대체된 사진은 30일 뒤 삭제(verifyCleanup — cron), 직업 서류는 처리 즉시 삭제.
 * 로그(_verification.log)에는 회원 번호·기록 번호만 남기고 이름·연락처·사업자번호는 남기지 않는다.
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';

const VERIFY_MAX_BYTES    = 10 * 1024 * 1024;
const VERIFY_MAX_SIDE     = 1600;
const VERIFY_MAX_PIXELS   = 40000000;   // 원본 가로×세로 상한 — 서버 메모리 보호
const VERIFY_RATE_MAX     = 5;          // 10분에 5회
const VERIFY_RATE_WINDOW  = 600;
const VERIFY_KEEP_DAYS    = 30;         // 반려·대체된 사진 보관 일수

const VERIFY_JOB_TYPES = ['employee' => '직장인', 'business' => '사업자', 'other' => '기타'];
const VERIFY_DOC_KINDS = [
    'employee' => [
        'employment_cert'  => '재직증명서',
        'business_card'    => '명함',
        'employee_id'      => '사원증',
        'health_insurance' => '건강보험 자격득실확인서',
    ],
    'business' => ['biz_registration' => '사업자등록증'],
    'other'    => [
        'license'  => '자격증',
        'contract' => '위촉·용역계약서',
        'etc'      => '기타 직업 증빙 서류',
    ],
];
const VERIFY_REJECT_REASONS = [
    'photo' => ['얼굴이 잘 보이지 않음', '본인 사진이 아닌 것으로 보임', '단체 사진', '과도한 보정·필터'],
    'job'   => ['주민등록번호 미가림', '서류로 직업 확인 불가'],
];
const VERIFY_REASON_MAX = 100;
const VERIFY_LABEL_MAX  = 30;

// ─── 저장 위치 · 준비 상태 ────────────────────────────────────────

/** 이미지 다시 저장에 쓸 수 있는 기능 — 'gd' | 'imagick' | null */
function verifyImageEngine(): ?string {
    if (function_exists('imagecreatefromjpeg') && function_exists('imagejpeg') && function_exists('imagecreatetruecolor')) return 'gd';
    if (class_exists('Imagick')) return 'imagick';
    return null;
}

/** 저장 폴더 (없으면 만든다). 웹 루트 밖 폴더가 없으면 null */
function verifyDir(): ?string {
    $base = privateDataDir();
    if ($base === null) return null;
    $dir = $base . '/verification';
    if (!is_dir($dir . '/files')) {
        @mkdir($dir . '/files', 0700, true);
        @chmod($dir, 0700);
        @chmod($dir . '/files', 0700);
    }
    return is_dir($dir . '/files') ? $dir : null;
}

/** 업로드 가능 여부 — ['ready'=>bool, 'reason'=>'' | 'private_data_dir_missing' | 'image_engine_missing'] */
function verifyReady(): array {
    if (verifyImageEngine() === null) return ['ready' => false, 'reason' => 'image_engine_missing'];
    if (verifyDir() === null)         return ['ready' => false, 'reason' => 'private_data_dir_missing'];
    return ['ready' => true, 'reason' => ''];
}

function verifyNow(): string { return date('Y-m-d H:i:s'); }   // lib.php 가 KST 고정

/** 운영 확인용 로그 — 회원 번호·기록 번호만 */
function verifyLog(string $line): void {
    $dir = verifyDir();
    if ($dir === null) { error_log('[verification] ' . $line); return; }
    @file_put_contents($dir . '/_verification.log', sprintf("[%s] %s\n", date('c'), $line), FILE_APPEND);
}

function verifyEmptyStore(): array {
    return ['seq' => 0, 'records' => [], 'settings' => ['photo_required' => false], 'rate' => []];
}

function verifyNormalizeStore($s): array {
    if (!is_array($s)) $s = [];
    $s += verifyEmptyStore();
    if (!is_array($s['records']))  $s['records']  = [];
    if (!is_array($s['settings'])) $s['settings'] = ['photo_required' => false];
    if (!is_array($s['rate']))     $s['rate']     = [];
    $s['seq'] = (int)$s['seq'];
    return $s;
}

/**
 * 저장 파일을 잠근 채 $fn($store) 실행. 배열을 돌려주면 저장, null 이면 저장하지 않는다. $fn 의 반환값을 그대로 돌려준다.
 * 저장 폴더가 없으면 RuntimeException.
 */
function verifyWithStore(callable $fn) {
    $dir = verifyDir();
    if ($dir === null) throw new RuntimeException('verification dir missing');
    $path = $dir . '/store.json';
    $fp = fopen($path, 'c+');
    if (!$fp) throw new RuntimeException('verification store open failed');
    @chmod($path, 0600);
    flock($fp, LOCK_EX);
    try {
        $raw = stream_get_contents($fp);
        $cur = $raw ? json_decode($raw, true) : [];
        if ($raw && !is_array($cur)) throw new RuntimeException('verification store corrupted');
        $next = $fn(verifyNormalizeStore($cur));
        if (is_array($next)) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($next, JSON_UNESCAPED_UNICODE));
            fflush($fp);
        }
        return $next;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

/** 읽기 전용 (공유 잠금). 저장 폴더·파일이 없으면 빈 저장소 */
function verifyReadStore(): array {
    $dir = privateDataDir();
    $path = $dir === null ? null : $dir . '/verification/store.json';
    if ($path === null || !is_file($path)) return verifyEmptyStore();
    $fp = @fopen($path, 'r');
    if (!$fp) throw new RuntimeException('verification store open failed');
    flock($fp, LOCK_SH);
    try {
        $raw = stream_get_contents($fp);
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
    $cur = $raw ? json_decode($raw, true) : [];
    if ($raw && !is_array($cur)) throw new RuntimeException('verification store corrupted');
    return verifyNormalizeStore($cur);
}

/** "사진 심사 필수" 스위치 — 준비가 안 된 서버에서는 켜져 있어도 꺼진 것으로 본다 */
function verifyPhotoRequired(array $store): bool {
    return !empty($store['settings']['photo_required']) && verifyReady()['ready'];
}

// ─── 회원별 상태 ──────────────────────────────────────────────────

/** 회원의 $kind 기록들 (오래된 순) */
function verifyUserRecords(array $store, int $userId, string $kind): array {
    return array_values(array_filter($store['records'], fn($r) =>
        is_array($r) && (int)($r['user_id'] ?? 0) === $userId && ($r['kind'] ?? '') === $kind));
}

function verifyLatestWithStatus(array $records, array $statuses): ?array {
    $found = null;
    foreach ($records as $r) if (in_array($r['status'] ?? '', $statuses, true)) $found = $r;
    return $found;
}

/** 마지막으로 처리(승인·반려)된 기록 — 처리 시각 기준, 같으면 나중 기록 */
function verifyLatestDecision(array $records): ?array {
    $found = null;
    foreach ($records as $r) {
        if (empty($r['reviewed_at'])) continue;
        if ($found === null || (string)$r['reviewed_at'] >= (string)$found['reviewed_at']) $found = $r;
    }
    return $found;
}

/**
 * 사진 상태 — status: 'none'|'pending'|'approved'|'rejected'
 *  approved: 승인 사진이 있음(심사 중·반려 중이어도 이전 승인 사진으로 신청 가능)
 */
function verifyPhotoSummary(array $store, int $userId): array {
    $recs     = verifyUserRecords($store, $userId, 'photo');
    $approved = verifyLatestWithStatus($recs, ['approved']);
    $pending  = verifyLatestWithStatus($recs, ['pending']);
    $last     = verifyLatestDecision($recs);
    $status = $pending ? 'pending' : ($last && ($last['status'] ?? '') === 'rejected' ? 'rejected' : ($approved ? 'approved' : 'none'));
    return [
        'status'       => $status,
        'approved'     => $approved !== null,
        'rejectReason' => $status === 'rejected' ? (string)($last['reject_reason'] ?? '') : null,
        'submittedAt'  => $pending['created_at'] ?? ($last['created_at'] ?? null),
        'reviewedAt'   => $last['reviewed_at'] ?? null,
        'approvedAt'   => $approved['reviewed_at'] ?? null,
    ];
}

/** 승인된 직업 기록이 지금 프로필 직업과 맞는지 (배지 표시 조건) */
function verifyJobBadge(?array $approved, ?string $currentJob): bool {
    if ($approved === null || ($approved['status'] ?? '') !== 'approved') return false;
    return $currentJob !== null && trim($currentJob) === trim((string)($approved['job_text'] ?? ''));
}

/**
 * 직업 인증 상태 — status: 'none'|'pending'|'approved'|'reverify'|'rejected'
 *  $currentJob: 회원 프로필의 지금 직업 (null 이면 비교하지 않음)
 */
function verifyJobSummary(array $store, int $userId, ?string $currentJob): array {
    $recs     = verifyUserRecords($store, $userId, 'job');
    $approved = verifyLatestWithStatus($recs, ['approved', 'reverify']);
    $pending  = verifyLatestWithStatus($recs, ['pending']);
    $last     = verifyLatestDecision($recs);
    $badge    = verifyJobBadge($approved, $currentJob);
    if ($pending) $status = 'pending';
    elseif ($last && ($last['status'] ?? '') === 'rejected') $status = 'rejected';
    elseif ($approved && $currentJob === null) $status = (string)$approved['status'];   // 'approved' | 'reverify'
    elseif ($approved) $status = $badge ? 'approved' : 'reverify';
    else $status = 'none';
    return [
        'status'       => $status,
        'verified'     => $badge,
        'label'        => $approved !== null ? (string)($approved['job_label'] ?? '') : null,
        'jobType'      => $pending['job_type'] ?? ($approved['job_type'] ?? null),
        'rejectReason' => $status === 'rejected' ? (string)($last['reject_reason'] ?? '') : null,
        'submittedAt'  => $pending['created_at'] ?? null,
        'reviewedAt'   => $last['reviewed_at'] ?? null,
    ];
}

/**
 * 결제 진입 검사 (명세 3-1). 막아야 하면 [code, message, http] 아니면 null.
 *  - 스위치가 꺼져 있거나 서버가 업로드 준비가 안 됐으면 통과
 *  - 테스트 회원 통과
 *  - 저장소를 읽지 못하면 막는다(서버 검사가 기준) — 잠시 후 다시 시도 안내
 */
function verifyPaymentBlock(int $userId, string $email): ?array {
    if (isTestUser($email)) return null;
    try {
        $store = verifyReadStore();
    } catch (Throwable $e) {
        error_log('[verification] payment check read failed: ' . $e->getMessage());
        return ['PHOTO_CHECK_FAILED', '사진 심사 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 500];
    }
    if (!verifyPhotoRequired($store)) return null;
    $p = verifyPhotoSummary($store, $userId);
    if ($p['approved']) return null;
    $code = $p['status'] === 'pending' ? 'PHOTO_PENDING' : ($p['status'] === 'rejected' ? 'PHOTO_REJECTED' : 'PHOTO_REQUIRED');
    return [$code, '사진 심사 승인 후 파티를 신청할 수 있습니다.', 403];
}

// ─── 업로드 · 이미지 ──────────────────────────────────────────────

/** 업로드 제한 — 10분에 5회. 넘으면 false (저장소에 시각을 남긴다) */
function verifyRateHit(array &$store, int $userId): bool {
    $now = time();
    $key = (string)$userId;
    $hits = array_values(array_filter((array)($store['rate'][$key] ?? []), fn($t) => is_int($t) && $t > $now - VERIFY_RATE_WINDOW));
    if (count($hits) >= VERIFY_RATE_MAX) { $store['rate'][$key] = $hits; return false; }
    $hits[] = $now;
    $store['rate'][$key] = $hits;
    // 오래된 회원 기록 정리
    foreach ($store['rate'] as $k => $ts) {
        if ($k !== $key && max(array_merge([0], (array)$ts)) <= $now - VERIFY_RATE_WINDOW) unset($store['rate'][$k]);
    }
    return true;
}

/** $_FILES 항목 검사 — 문제 있으면 오류 문구, 없으면 null */
function verifyUploadError($f): ?string {
    if (!is_array($f) || !isset($f['error'])) return '파일이 없습니다.';
    if (is_array($f['error'])) return '파일은 하나씩 올려주세요.';
    if ((int)$f['error'] !== UPLOAD_ERR_OK) {
        return in_array((int)$f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
            ? '파일은 10MB 이하만 올릴 수 있습니다.' : '업로드 중 문제가 생겼습니다. 다시 시도해주세요.';
    }
    if ((int)$f['size'] > VERIFY_MAX_BYTES) return '파일은 10MB 이하만 올릴 수 있습니다.';
    if (!is_uploaded_file((string)$f['tmp_name'])) return '파일이 없습니다.';
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file((string)$f['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) return 'JPG·PNG·WEBP 사진만 올릴 수 있습니다. iPhone 사진은 JPG로 저장해서 올려주세요.';
    $info = @getimagesize((string)$f['tmp_name']);
    if (!$info || $info[0] < 1 || $info[1] < 1) return '사진을 읽을 수 없습니다. 다른 사진으로 올려주세요.';
    if ($info[0] * $info[1] > VERIFY_MAX_PIXELS) return '사진 해상도가 너무 큽니다. 조금 줄여서 올려주세요.';
    return null;
}

/** 긴 변 기준 축소 크기 */
function verifyTargetSize(int $w, int $h): array {
    $scale = min(1.0, VERIFY_MAX_SIDE / max($w, $h));
    return [max(1, (int)round($w * $scale)), max(1, (int)round($h * $scale))];
}

/**
 * 이미지를 JPEG 로 다시 저장 — EXIF·메타데이터를 모두 버리고 긴 변 1600px 로 줄인다.
 * JPEG 의 촬영 방향(EXIF Orientation)은 지우기 전에 반영한다(exif 기능이 있을 때).
 */
function verifyReencode(string $src, string $dest): bool {
    @ini_set('memory_limit', '384M');
    $engine = verifyImageEngine();
    $mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($src);
    if ($engine === 'gd') {
        $im = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($src),
            'image/png'  => @imagecreatefrompng($src),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($src) : false,
            default      => false,
        };
        if (!$im) return false;
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($src);
            $o = (int)($exif['Orientation'] ?? 1);
            $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
            if ($rot !== 0) { $r = imagerotate($im, $rot, 0); if ($r) { imagedestroy($im); $im = $r; } }
        }
        $w = imagesx($im); $h = imagesy($im);
        [$tw, $th] = verifyTargetSize($w, $h);
        $out = imagecreatetruecolor($tw, $th);
        imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));   // 투명 배경 → 흰색
        imagecopyresampled($out, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
        imagedestroy($im);
        $ok = imagejpeg($out, $dest, 85);
        imagedestroy($out);
        return $ok && is_file($dest);
    }
    if ($engine === 'imagick') {
        try {
            $im = new Imagick($src);
            $im = $im->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
            if (method_exists($im, 'autoOrient')) $im->autoOrient();
            [$tw, $th] = verifyTargetSize($im->getImageWidth(), $im->getImageHeight());
            $im->resizeImage($tw, $th, Imagick::FILTER_LANCZOS, 1);
            $im->setImageBackgroundColor('white');
            $im->stripImage();
            $im->setImageFormat('jpeg');
            $im->setImageCompressionQuality(85);
            $ok = $im->writeImage($dest);
            $im->clear();
            return $ok && is_file($dest);
        } catch (Throwable $e) {
            error_log('[verification] imagick: ' . $e->getMessage());
            return false;
        }
    }
    return false;
}

/** 업로드 파일을 다시 저장해 files/ 에 둔다. 저장한 파일 이름(무작위) 또는 null */
function verifySaveUpload(string $tmp): ?string {
    $dir = verifyDir();
    if ($dir === null) return null;
    $name = bin2hex(random_bytes(16)) . '.jpg';
    $dest = $dir . '/files/' . $name;
    if (!verifyReencode($tmp, $dest)) { @unlink($dest); return null; }
    @chmod($dest, 0600);
    return $name;
}

/** 저장 파일의 실제 경로 — 이름 형식이 맞고 파일이 있을 때만 */
function verifyFilePath(string $name): ?string {
    if (!preg_match('/^[a-f0-9]{32}\.jpg$/', $name)) return null;
    $dir = verifyDir();
    if ($dir === null) return null;
    $p = $dir . '/files/' . $name;
    return is_file($p) ? $p : null;
}

/** 기록의 파일을 지우고 files_deleted_at 을 남긴다 */
function verifyDeleteRecordFiles(array &$rec): void {
    if (!empty($rec['files_deleted_at'])) return;
    foreach ((array)($rec['files'] ?? []) as $name) {
        $p = verifyFilePath((string)$name);
        if ($p !== null) @unlink($p);
    }
    $rec['files_deleted_at'] = verifyNow();
}

/** 이미지 파일 내보내기 (본인 미리보기·관리자 보기 공통) */
function verifySendImage(string $path): void {
    header_remove('Content-Type');
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="photo.jpg"');
    readfile($path);
    exit;
}

// ─── 국세청 사업자 확인 ───────────────────────────────────────────

/** 사업자번호 표시용 — 뒤 5자리 가림 (123-45-*****) */
function verifyMaskBizNo(string $bizNo): string {
    $d = preg_replace('/\D+/', '', $bizNo);
    return strlen($d) === 10 ? substr($d, 0, 3) . '-' . substr($d, 3, 2) . '-*****' : '';
}

/** 국세청 인증키 (api/verification/nts-config.php — 서버에만). 없으면 '' */
function verifyNtsKey(): string {
    $p = __DIR__ . '/nts-config.php';
    if (!is_file($p)) return '';
    $cfg = require $p;
    return is_array($cfg) ? trim((string)($cfg['service_key'] ?? '')) : '';
}

/**
 * 공공데이터포털 "국세청_사업자등록정보 진위확인 및 상태조회" — 진위확인(validate) 한 번으로 대표자·개업일 일치와 상태를 함께 받는다.
 * 돌려주는 값(저장용 요약): { checked_at, result:'match'|'mismatch'|'unavailable', message, status?, biz_no_masked, open_date }
 *  - 인증키가 없거나 호출 실패면 'unavailable' — 자동 승인·반려에 쓰지 않는다(참고만)
 * VERIFY_NTS_API_BASE 는 로컬 검증 스크립트가 흉내 서버를 쓰려고 미리 정의할 때만 바뀐다(운영은 정의하지 않음).
 */
function verifyNtsCheck(string $bizNo, string $openDate, string $ownerName): array {
    $out = [
        'checked_at'    => verifyNow(),
        'result'        => 'unavailable',
        'message'       => '자동 확인 불가 — 서류로 판단',
        'status'        => null,
        'biz_no_masked' => verifyMaskBizNo($bizNo),
        'open_date'     => $openDate,
    ];
    $key = verifyNtsKey();
    if ($key === '') { $out['message'] = '자동 확인 불가(인증키 없음) — 서류로 판단'; return $out; }
    if (trim($ownerName) === '') { $out['message'] = '자동 확인 불가(회원 이름 없음) — 서류로 판단'; return $out; }

    $base = defined('VERIFY_NTS_API_BASE') ? (string)constant('VERIFY_NTS_API_BASE') : 'https://api.odcloud.kr/api/nts-businessman/v1';
    $body = json_encode(['businesses' => [[
        'b_no'     => preg_replace('/\D+/', '', $bizNo),
        'start_dt' => str_replace('-', '', $openDate),
        'p_nm'     => trim($ownerName),
    ]]], JSON_UNESCAPED_UNICODE);
    $ch = curl_init($base . '/validate?serviceKey=' . rawurlencode($key) . '&returnType=JSON');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $res  = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = is_string($res) ? json_decode($res, true) : null;
    $row  = is_array($json['data'][0] ?? null) ? $json['data'][0] : null;
    if ($http !== 200 || $row === null) {
        verifyLog("nts call failed http={$http}");   // 인증키·사업자번호는 남기지 않음
        $out['message'] = '자동 확인 불가(조회 실패) — 서류로 판단';
        return $out;
    }
    $valid = (string)($row['valid'] ?? '');
    $st = is_array($row['status'] ?? null) ? (string)($row['status']['b_stt'] ?? '') : '';
    $out['status'] = $st !== '' ? $st : null;
    if ($valid === '01') {
        $out['result']  = 'match';
        $out['message'] = '국세청 확인: 사업자번호·개업일자·대표자 이름 일치' . ($st !== '' ? " (상태: {$st})" : '');
    } else {
        $out['result']  = 'mismatch';
        $out['message'] = '국세청 확인: 일치하는 정보 없음 — 서류로 판단 (신규 개업자는 반영까지 1~2일 걸릴 수 있음)';
    }
    return $out;
}

// ─── 탈퇴 · 정리 ──────────────────────────────────────────────────

/** 회원 탈퇴·관리자 삭제 — 그 회원의 파일과 기록을 모두 지운다 (보관 기간: 탈퇴 시까지). 실패해도 던지지 않는다 */
function verifyDeleteUser(int $userId): void {
    if ($userId <= 0 || verifyDir() === null) return;
    try {
        verifyWithStore(function (array $store) use ($userId) {
            $keep = [];
            $n = 0;
            foreach ($store['records'] as $r) {
                if (is_array($r) && (int)($r['user_id'] ?? 0) === $userId) { verifyDeleteRecordFiles($r); $n++; continue; }
                $keep[] = $r;
            }
            unset($store['rate'][(string)$userId]);
            if ($n === 0) return null;
            $store['records'] = $keep;
            verifyLog("user {$userId} deleted: {$n} records and files removed");
            return $store;
        });
    } catch (Throwable $e) {
        error_log('[verification] delete user failed: ' . $e->getMessage());
    }
}

/** 반려·대체된 사진은 30일 뒤 파일 삭제, 처리된 직업 서류가 남아 있으면 삭제 (cron). 지운 기록 수를 돌려준다 */
function verifyCleanup(?int $now = null): int {
    if (verifyDir() === null) return 0;
    $now ??= time();
    $limit = date('Y-m-d H:i:s', $now - VERIFY_KEEP_DAYS * 86400);
    $count = 0;
    verifyWithStore(function (array $store) use ($limit, &$count) {
        foreach ($store['records'] as &$r) {
            if (!is_array($r) || !empty($r['files_deleted_at'])) continue;
            $st = (string)($r['status'] ?? '');
            if (($r['kind'] ?? '') === 'job') {
                if ($st !== 'pending') { verifyDeleteRecordFiles($r); $count++; }
                continue;
            }
            $since = $st === 'rejected' ? (string)($r['reviewed_at'] ?? '') : ($st === 'superseded' ? (string)($r['superseded_at'] ?? '') : '');
            if ($since !== '' && $since <= $limit) { verifyDeleteRecordFiles($r); $count++; }
        }
        unset($r);
        return $count > 0 ? $store : null;
    });
    if ($count > 0) verifyLog("cleanup: files removed for {$count} records");
    return $count;
}
