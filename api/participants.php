<?php
/**
 * 메인 페이지 '실시간 신규 가입자' 카드용 — 핵심 5종 + 보조 5종 모두 채운 회원만 노출.
 *
 * GET → [{ id, job, age, keywords:[mbti, interests...], gender }]
 *
 * 익명화:
 *  - id 는 user.id (DB pk) 그대로 — 외부 노출은 단지 React key 용도
 *  - age 는 birth_date → '20대 초반' 등 라벨 (lib.ageBand)
 *  - keywords[0] = MBTI, 이후 interests CSV 분해
 *  - gender 는 'male' / 'female' (영문 — frontend PARTICIPANTS 와 동일 형태)
 *
 * 노출 조건:
 *  - status = 'active'
 *  - role  != 'admin'
 *  - 핵심 5종 + 보조 5종(job, mbti, interests) 모두 채워짐
 */

declare(strict_types=1);
require_once __DIR__ . '/lib.php';
require_once __DIR__ . '/db.php';
jsonHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonFail('method not allowed', 405);

try {
    $pdo = getDB();
    $stmt = $pdo->query("
        SELECT id, gender, job, mbti, interests,
               DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date
        FROM users
        WHERE status = 'active'
          AND role  != 'admin'
          AND name IS NOT NULL    AND name != ''
          AND gender IN ('남성','여성')
          AND birth_date IS NOT NULL
          AND marital_status IN ('싱글','돌싱')
          AND job  IS NOT NULL    AND job  != ''
          AND mbti IS NOT NULL    AND mbti != ''
        ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
        LIMIT 50
    ");
    $rows = $stmt->fetchAll();
} catch (Throwable $e) {
    error_log('[participants] ' . $e->getMessage());
    echo json_encode([]);
    exit;
}

$out = [];
foreach ($rows as $r) {
    $keywords = [(string)$r['mbti']];
    $interests = trim((string)$r['interests']);
    if ($interests !== '') {
        // interests 는 ',' 또는 '#' 또는 공백 구분 — 최대 4개까지 추가
        $parts = preg_split('/[,#\s]+/u', $interests, -1, PREG_SPLIT_NO_EMPTY);
        if (is_array($parts)) {
            foreach (array_slice($parts, 0, 4) as $p) $keywords[] = (string)$p;
        }
    }
    $out[] = [
        'id'       => (int)$r['id'],
        'job'      => (string)$r['job'],
        'age'      => ageBand((string)$r['birth_date']),
        'keywords' => $keywords,
        'gender'   => $r['gender'] === '남성' ? 'male' : 'female',
    ];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
