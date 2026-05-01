<?php
/**
 * 어울림 DB 헬퍼 (PDO).
 *  - getDB(): 싱글톤 PDO 인스턴스 반환
 *  - 모든 시간 데이터는 KST (Asia/Seoul, UTC+9) 로 처리
 *      · PHP date_default_timezone_set('Asia/Seoul')
 *      · PDO 연결 직후 SET time_zone='+09:00' (NOW(), CURRENT_TIMESTAMP 영향)
 *  - 실패 시 PDOException 전파 (호출자가 try/catch)
 *
 * 사용 예:
 *   require_once __DIR__ . '/db.php';
 *   $pdo = getDB();
 *   $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 *   $stmt->execute([$email]);
 */

declare(strict_types=1);

// ── PHP 측 타임존 — date(), strtotime() 등 모든 시간 함수 영향
date_default_timezone_set('Asia/Seoul');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $cfg = require __DIR__ . '/db-config.php';
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $cfg['host'], $cfg['name'], $cfg['charset'] ?? 'utf8mb4'
    );

    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    // ── DB 세션 타임존 KST 고정 — NOW(), CURRENT_TIMESTAMP, TIMESTAMP 컬럼 모두 영향
    //    OS 타임존(UTC) 무관하게 일관된 한국 시간 보장
    $pdo->exec("SET time_zone = '+09:00'");

    return $pdo;
}
