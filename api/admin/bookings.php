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
        // active + withdrawn 모두 포함 — 탈퇴 회원의 completed booking 도 admin 보존 노출
        $stmt = $pdo->query("
            SELECT id, email, name, gender, phone, mbti, job, status,
                   DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date,
                   marital_status, interests, ideal_type AS idealType
            FROM users WHERE status IN ('active', 'withdrawn') ORDER BY id DESC
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
                    'userStatus'        => $u['status'],   // 'active' | 'withdrawn' — 취소 컬럼 분기용
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

    if (!in_array($action, ['approve', 'cancel', 'confirm_vbank'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'unknown action']);
        exit;
    }
    $bookings = loadBookings($email);

    // ─── action === 'confirm_vbank' — 무통장 입금 확인 (v7.0) ──────────────
    //  vbank_pending → pending_approval(확정 대기 중) 전환 + 이 시점에 party_counts +1.
    //  (카드결제는 success.php 에서 결제 즉시 +1 하지만, 무통장은 입금 확인된 지금 +1)
    if ($action === 'confirm_vbank') {
        $found = false; $target = null;
        foreach ($bookings as &$b) {
            if (($b['id'] ?? '') === $bid) {
                if (($b['status'] ?? '') !== 'vbank_pending') {
                    echo json_encode(['ok' => false, 'error' => '입금 확인 대상이 아닙니다. (현재 상태: ' . ($b['status'] ?? '?') . ')']); exit;
                }
                $target = $b;  // 전환 전 정보 (gender/partyId)
                $found = true; break;
            }
        }
        unset($b);
        if (!$found) { echo json_encode(['ok' => false, 'error' => 'booking not found']); exit; }

        $partyId   = (string)($target['partyId'] ?? '');
        $gender    = (string)($target['gender']  ?? '');
        $genderKey = $gender === '남성' ? 'male' : 'female';

        // party_counts +1 (atomic) + 정원(12/성별) 초과 검증 — 카드결제 success.php 와 동일 상한.
        $STOCK_PER_SIDE = 12;
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
            if ((int)($counts[$partyId][$genderKey] ?? 0) + 1 > $STOCK_PER_SIDE) {
                flock($fp, LOCK_UN); fclose($fp);
                echo json_encode(['ok' => false, 'error' => '잔여 정원을 초과하여 입금 확인을 진행할 수 없습니다.']); exit;
            }
            $counts[$partyId][$genderKey] = (int)($counts[$partyId][$genderKey] ?? 0) + 1;
            ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($counts));
            fflush($fp); flock($fp, LOCK_UN); fclose($fp);
        }

        // 상태 전환 → pending_approval (이후 [참가확정] 으로 confirmed 가능 — 카드와 동일 흐름)
        foreach ($bookings as &$b) {
            if (($b['id'] ?? '') === $bid) {
                $b['status']      = 'pending_approval';
                $b['updatedAt']   = date('c');
                $b['vbankPaidAt'] = date('c');
                break;
            }
        }
        unset($b);
        saveBookings($email, $bookings);

        @file_put_contents($dataDir . '/_vbank_confirm.log', sprintf(
            "[%s] CONFIRM_VBANK email=%s bid=%s partyId=%s gender=%s\n",
            date('c'), $email, $bid, $partyId, $gender
        ), FILE_APPEND);

        logAdminActivity(
            'update', 'booking', $bid,
            "무통장 입금 확인 — 회원 {$email}, 파티 #{$partyId}, 성별 {$gender} (+1 인원 반영)",
            ['status' => 'vbank_pending'],
            ['status' => 'pending_approval']
        );

        echo json_encode(['ok' => true, 'partyId' => $partyId, 'gender' => $gender]);
        exit;
    }

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

        logAdminActivity(
            'update', 'booking', $bid,
            "예약 참가확정 — 회원 {$email}, 파티 #" . ($approvedBooking['partyId'] ?? '?'),
            ['status' => $approvedBooking['status'] ?? null],
            ['status' => 'confirmed']
        );

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

    logAdminActivity(
        'update', 'booking', $bid,
        "예약 강제 취소 — 회원 {$email}, 파티 #{$partyId}, 성별 {$gender}",
        ['status' => $beforeBooking['status'] ?? ''],
        ['status' => 'cancelled']
    );

    echo json_encode(['ok' => true, 'partyId' => $partyId, 'gender' => $gender]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false]);
