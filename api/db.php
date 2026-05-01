<?php
/**
 * 어울림 DB 헬퍼 (PDO).
 *  - getDB(): 싱글톤 PDO 인스턴스 반환
 *  - 실패 시 PDOException 전파 (호출자가 try/catch)
 *
 * 사용 예:
 *   require_once __DIR__ . '/db.php';
 *   $pdo = getDB();
 *   $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
 *   $stmt->execute([$email]);
 */

declare(strict_types=1);

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
    return $pdo;
}
