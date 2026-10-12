<?php
/**
 * 관리자 메인이미지(히어로) 업로드 — upload-gallery.php 와 같은 방식.
 *
 * POST FormData { image: <File> } → { ok: true, url: '/uploads/hero/<file>' }
 *
 *  - 관리자 세션 필수
 *  - finfo MIME 화이트리스트 (jpg/jpeg/png/webp)
 *  - 최대 5MB (메인 첫 화면 이미지 — 로딩 속도를 위해 갤러리 10MB 보다 작게)
 *  - 파일명 서버 생성 (hero_<hex>_<ts>.<ext>)
 *
 * 저장 경로: 웹 루트/uploads/hero/  (URL: /uploads/hero/...)
 *
 * 본 엔드포인트는 파일 업로드만 담당. 슬라이드 연결은 별도 저장:
 *   POST /api/admin/hero.php { config }
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

if ($f['size'] > 5 * 1024 * 1024) jsonFail('파일은 5MB 이하만 가능합니다.');

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = (string)$finfo->file($f['tmp_name']);
$allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
];
if (!isset($allowed[$mime])) jsonFail('JPG/PNG/WEBP 형식만 가능합니다.');

$ext  = $allowed[$mime];
$base = sprintf('hero_%s_%d.%s', bin2hex(random_bytes(6)), time(), $ext);

$uploadDir = dirname(__DIR__, 2) . '/uploads/hero';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0775, true);
}
$dest = $uploadDir . '/' . $base;

if (!move_uploaded_file($f['tmp_name'], $dest)) {
    jsonFail('파일 저장 실패', 500);
}
@chmod($dest, 0644);

logAdminActivity('create', 'image', $base,
    "메인이미지 업로드 — {$base} ({$mime}, " . round((int)$f['size'] / 1024) . "KB)");

jsonOut([
    'ok'  => true,
    'url' => '/uploads/hero/' . $base,
]);
