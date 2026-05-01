<?php
/**
 * 관리자 이미지 업로드 (파티 대표이미지 전용).
 *
 * POST FormData { image: <File> } → { ok: true, url: '/uploads/parties/<file>' }
 *
 * 보안:
 *  - 관리자 세션 필수
 *  - MIME / 확장자 화이트리스트: jpg / jpeg / png / webp
 *  - 최대 10MB (php.ini upload_max_filesize 제한과 일치)
 *  - 파일명은 서버에서 생성 (랜덤 hex + 시각) — 사용자 입력 무력화
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();
adminRequire();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonFail('method not allowed', 405);
if (!isset($_FILES['image'])) jsonFail('image 파일이 누락되었습니다.');

$f = $_FILES['image'];

if ($f['error'] !== UPLOAD_ERR_OK) {
    $errMap = [
        UPLOAD_ERR_INI_SIZE   => '파일이 너무 큽니다 (서버 제한).',
        UPLOAD_ERR_FORM_SIZE  => '파일이 너무 큽니다 (폼 제한).',
        UPLOAD_ERR_PARTIAL    => '업로드가 중단되었습니다.',
        UPLOAD_ERR_NO_FILE    => '파일이 없습니다.',
        UPLOAD_ERR_NO_TMP_DIR => '임시 디렉토리 오류.',
        UPLOAD_ERR_CANT_WRITE => '파일 쓰기 오류.',
    ];
    jsonFail($errMap[$f['error']] ?? '업로드 오류');
}

if ($f['size'] > 10 * 1024 * 1024) jsonFail('파일은 10MB 이하만 가능합니다.');

// MIME 검사 (finfo) — 확장자만 믿지 않음
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = (string)$finfo->file($f['tmp_name']);
$allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];
if (!isset($allowed[$mime])) jsonFail('JPG/PNG/WEBP 형식만 가능합니다.');

$ext  = $allowed[$mime];
$base = sprintf('p_%s_%d.%s', bin2hex(random_bytes(6)), time(), $ext);

$uploadDir = dirname(__DIR__, 2) . '/uploads/parties';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0775, true);
}
$dest = $uploadDir . '/' . $base;

if (!move_uploaded_file($f['tmp_name'], $dest)) {
    jsonFail('파일 저장 실패', 500);
}
@chmod($dest, 0644);

@file_put_contents(
    dataDir() . '/_admin_uploads.log',
    sprintf("[%s] adminId=%s file=%s size=%d mime=%s\n",
        date('c'), $_SESSION['adminId'] ?? '?', $base, (int)$f['size'], $mime),
    FILE_APPEND
);

jsonOut([
    'ok'  => true,
    'url' => '/uploads/parties/' . $base,
]);
