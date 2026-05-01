<?php
/**
 * 관리자 예약 관리.
 *  GET  : 모든 회원의 예약 + 회원 정보 조인 (status/gender 필터링용 데이터 포함)
 *  POST { action: "approve", email, bookingId } → status='paid_pending_profile'|'pending_approval' → 'confirmed'
 *  POST { action: "cancel",  email, bookingId } → status='cancelled' + party_counts -1 (atomic)
 */

declare(strict_types=1);
require_once __DIR__ . '/../lib.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/_session.php';
jsonHeaders();

// 관리자 세션 검증
if (!adminIsLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'unauthorized']);
    exit;
}

$dataDir = __DIR__ . '/../data';

function loadBookings(string $email): array {
    global $dataDir;
    $f = $dataDir . '/bookings_' . md5(strtolower(trim($email))) . '.json';
    if (!file_exists($f)) return [];
    $d = json_decode((string)file_get_contents($f), true);
    return is_array($d) ? $d : [];
}
function saveBookings(string $email, array $bookings): void {
    global $dataDir;
    file_put_contents(
        $dataDir . '/bookings_' . md5(strtolower(trim($email))) . '.json',
        json_encode($bookings, JSON_UNESCAPED_UNICODE)
    );
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $pdo = getDB();
        $stmt = $pdo->query("
            SELECT id, email, name, gender, phone, mbti, job, status,
                   DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date,
                   marital_status, interests, ideal_type AS idealType
            FROM users WHERE status = 'active' ORDER BY id DESC
        ");
        $users = $stmt->fetchAll();

        $rows = [];
        foreach ($users as $u) {
            $bookings = loadBookings((string)$u['email']);
            foreach ($bookings as $b) {
                $rows[] = array_merge($b, [
                    'userEmail'         => $u['email'],
                    'userName'          => $u['name'],
                    'userGender'        => $u['gender'],
                    'userPhone'         => $u['phone'],
                    'userMbti'          => $u['mbti'],
                    'userJob'           => $u['job'],
                    'userBirthDate'     => $u['birth_date'],
                    'userMaritalStatus' => $u['marital_status'],
                    'userInterests'     => $u['interests'],
                    'userIdealType'     => $u['idealType'],
                ]);
            }
        }
        usort($rows, fn($a, $b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
        echo json_encode(['ok' => true, 'rows' => $rows], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        error_log('[admin/bookings GET] ' . $e->getMessage());
        echo json_encode(['ok' => false, 'rows' => []]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body   = jsonBody();
    $action = (string)($body['action']    ?? '');
    $email  = (string)($body['email']     ?? '');
    $bid    = (string)($body['bookingId'] ?? '');

    if (!in_array($action, ['approve', 'cancel'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'unknown action']);
        exit;
    }
    $bookings = loadBookings($email);

    if ($action === 'approve') {
        $found = false;
        $approvedBooking = null;
        foreach ($bookings as &$b) {
            if (($b['id'] ?? '') === $bid) {
                $b['status']    = 'confirmed';
                $b['updatedAt'] = date('c');
                $approvedBooking = $b;
                $found = true; break;
            }
        }
        unset($b);
        if (!$found) { echo json_encode(['ok' => false, 'error' => 'booking not found']); exit; }
        saveBookings($email, $bookings);
        @file_put_contents($dataDir . '/_admin_approvals.log', sprintf(
            "[%s] APPROVED email=%s bid=%s\n", date('c'), $email, $bid
        ), FILE_APPEND);

        echo json_encode(['ok' => true]);
        exit;
    }

    // ─── action === 'cancel' ──────────────────────────────────────
    $found = false;
    $beforeBooking = null;
    foreach ($bookings as &$b) {
        if (($b['id'] ?? '') === $bid) {
            if (($b['status'] ?? '') === 'cancelled') {
                echo json_encode(['ok' => false, 'error' => '이미 취소된 예약입니다.']); exit;
            }
            $beforeBooking    = $b;
            $b['status']      = 'cancelled';
            $b['updatedAt']   = date('c');
            $b['cancelledAt'] = date('c');
            $b['cancelledBy'] = 'admin';
            $found = true; break;
        }
    }
    unset($b);
    if (!$found) { echo json_encode(['ok' => false, 'error' => 'booking not found']); exit; }
    saveBookings($email, $bookings);

    // party_counts 해당 성별 -1 (atomic)
    $partyId   = (string)($beforeBooking['partyId'] ?? '');
    $gender    = (string)($beforeBooking['gender']  ?? '');
    $genderKey = $gender === '남성' ? 'male' : 'female';
    if ($partyId !== '') {
        $countsFile = "$dataDir/party_counts.json";
        $fp = fopen($countsFile, 'c+');
        if ($fp) {
            flock($fp, LOCK_EX);
            $raw = stream_get_contents($fp);
            $counts = $raw ? json_decode($raw, true) : [];
            if (!is_array($counts)) $counts = [];
            if (!isset($counts[$partyId]) || !is_array($counts[$partyId])) {
                $counts[$partyId] = ['male' => 0, 'female' => 0];
            }
            $counts[$partyId][$genderKey] = max(0, (int)($counts[$partyId][$genderKey] ?? 0) - 1);
            ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($counts));
            fflush($fp); flock($fp, LOCK_UN); fclose($fp);
        }
    }

    @file_put_contents($dataDir . '/_admin_cancellations.log', sprintf(
        "[%s] CANCELLED email=%s bid=%s partyId=%s gender=%s\n",
        date('c'), $email, $bid, $partyId, $gender
    ), FILE_APPEND);

    echo json_encode(['ok' => true, 'partyId' => $partyId, 'gender' => $gender]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false]);
