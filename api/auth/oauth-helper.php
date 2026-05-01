<?php
/**
 * OAuth 공통 헬퍼.
 *  - oauth.php / kakao|naver|google/callback.php 가 공유
 *  - 토큰 교환·프로필 조회·회원 매칭(이메일 기준) 로직 통합
 *
 * 회원 매칭 정책:
 *   1) sns_provider + sns_user_id 일치 행이 있으면 → 그 회원으로 로그인
 *   2) 없으면 email 일치 행이 있으면 → 기존 회원에 SNS 연결 후 로그인
 *   3) 둘 다 없으면 신규 회원 생성 (status='active', role='user')
 */

declare(strict_types=1);

function loadOAuthConfig(): array {
    $path = __DIR__ . '/oauth-config.php';
    if (!file_exists($path)) {
        throw new RuntimeException('oauth-config.php missing');
    }
    return require $path;
}

function oauthRedirect(string $url): void {
    header('Location: ' . $url);
    exit;
}

function oauthFail(string $msg): void {
    error_log('[oauth] ' . $msg);
    header('Location: https://thewoollim.com/login?error=' . urlencode($msg));
    exit;
}

/**
 * Authorization Code → Access Token 교환.
 * 각 공급자의 토큰 엔드포인트로 POST.
 */
function oauthExchangeToken(string $url, array $params): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($params),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !is_string($body)) {
        throw new RuntimeException("token exchange failed http=$code body=" . substr((string)$body, 0, 200));
    }
    $j = json_decode($body, true);
    if (!is_array($j) || empty($j['access_token'])) {
        throw new RuntimeException('token response invalid: ' . substr($body, 0, 200));
    }
    return $j;
}

/**
 * Access Token 으로 사용자 프로필 조회 (Authorization: Bearer <token>).
 * 반환 형식 정규화: ['id'=>..., 'email'=>..., 'name'=>...]
 */
function oauthFetchProfile(string $provider, string $accessToken): array {
    switch ($provider) {
        case 'kakao':
            $url = 'https://kapi.kakao.com/v2/user/me';
            $j   = oauthGet($url, $accessToken);
            $kakaoAccount = $j['kakao_account'] ?? [];
            return [
                'id'    => (string)($j['id'] ?? ''),
                'email' => (string)($kakaoAccount['email'] ?? ''),
                'name'  => (string)($kakaoAccount['profile']['nickname'] ?? ''),
            ];

        case 'naver':
            $url = 'https://openapi.naver.com/v1/nid/me';
            $j   = oauthGet($url, $accessToken);
            $r   = $j['response'] ?? [];
            return [
                'id'    => (string)($r['id']    ?? ''),
                'email' => (string)($r['email'] ?? ''),
                'name'  => (string)($r['name']  ?? ($r['nickname'] ?? '')),
            ];

        case 'google':
            $url = 'https://www.googleapis.com/oauth2/v3/userinfo';
            $j   = oauthGet($url, $accessToken);
            return [
                'id'    => (string)($j['sub']   ?? ''),
                'email' => (string)($j['email'] ?? ''),
                'name'  => (string)($j['name']  ?? ''),
            ];
    }
    throw new RuntimeException("unknown provider: $provider");
}

function oauthGet(string $url, string $bearer): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $bearer],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !is_string($body)) {
        throw new RuntimeException("profile fetch failed http=$code");
    }
    $j = json_decode($body, true);
    if (!is_array($j)) throw new RuntimeException('profile response invalid');
    return $j;
}

/**
 * SNS 프로필 → 회원 매칭/생성 → 세션 발급.
 * 회원 row 반환 (id, email, name, marital_status, gender, birth_date 등 핵심 필드).
 */
function oauthLoginOrCreate(string $provider, array $snsProfile): array {
    require_once __DIR__ . '/../db.php';

    $snsId = trim((string)$snsProfile['id']);
    $email = strtolower(trim((string)($snsProfile['email'] ?? '')));
    $name  = trim((string)($snsProfile['name'] ?? ''));

    if ($snsId === '') {
        throw new RuntimeException('sns id missing');
    }

    $pdo = getDB();

    // 1) sns_provider + sns_user_id 매칭
    $stmt = $pdo->prepare("SELECT * FROM users WHERE sns_provider = ? AND sns_user_id = ? AND status='active' LIMIT 1");
    $stmt->execute([$provider, $snsId]);
    $u = $stmt->fetch();
    if ($u) return $u;

    // 2) email 매칭 (있으면 SNS 연결)
    if ($email !== '') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? AND status='active' LIMIT 1");
        $stmt->execute([$email]);
        $u = $stmt->fetch();
        if ($u) {
            $upd = $pdo->prepare("UPDATE users SET sns_provider = ?, sns_user_id = ? WHERE id = ?");
            $upd->execute([$provider, $snsId, $u['id']]);
            $u['sns_provider'] = $provider;
            $u['sns_user_id']  = $snsId;
            return $u;
        }
    }

    // 3) 신규 생성 — 핵심 5종 미입력 상태로 (메인 진입 시 /onboarding 으로 자동 이동)
    $fallbackEmail = $email !== '' ? $email : ($provider . '_' . $snsId . '@sns.local');
    $fallbackName  = $name  !== '' ? $name  : 'SNS회원';

    try {
        $ins = $pdo->prepare("
            INSERT INTO users (email, name, marital_status, status, role, sns_provider, sns_user_id)
            VALUES (?, ?, '', 'active', 'user', ?, ?)
        ");
        $ins->execute([$fallbackEmail, $fallbackName, $provider, $snsId]);
        $newId = (int)$pdo->lastInsertId();
    } catch (PDOException $e) {
        // race: email UNIQUE collision — 다시 매칭 시도
        if ((int)$e->errorInfo[1] === 1062) {
            $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
            $stmt->execute([$fallbackEmail]);
            $u = $stmt->fetch();
            if ($u) return $u;
        }
        throw $e;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$newId]);
    return $stmt->fetch();
}
