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

    if (!in_array($action, ['approve', 'cancel', 'confirm_vbank', 'approve_refund'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'unknown action']);
        exit;
    }
    $bookings = loadBookings($email);

    // ─── action === 'confirm_vbank' — 무통장 입금 확인 (v7.0 / v5.9) ──────────────
    //  vbank_pending → (프로필 완성 여부에 따라) paid_pending_profile/pending_approval 전환 + party_counts +1.
    //  카드결제 success.php 와 동일 분기 — 결제완료 후 프로필 작성/자동전환 흐름을 그대로 탄다.
    //  (카드는 결제 즉시 +1, 무통장은 입금 확인된 지금 +1)
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

        // 카드 결제 성공(success.php)과 동일한 분기로 상태 전환 (v5.9):
        //   프로필(이름·성별·MBTI·직업) 완성 → 'pending_approval'(확정 대기 중) 즉시 전환
        //   미완성 → 'paid_pending_profile'(결제완료) — 마이페이지에서 프로필 작성 유도, 완료 시 기존 advance 로직이 자동 전환.
        $profileComplete = false;
        try {
            $pdo  = getDB();
            $stmt = $pdo->prepare("SELECT name, gender, mbti, job FROM users WHERE LOWER(email) = LOWER(?) AND status='active' LIMIT 1");
            $stmt->execute([$email]);
            $pu = $stmt->fetch();
            if ($pu && trim((string)$pu['name']) !== '' && trim((string)$pu['gender']) !== ''
                  && trim((string)$pu['job']) !== '' && trim((string)$pu['mbti']) !== '') {
                $profileComplete = true;
            }
        } catch (Throwable $e) {}
        $newStatus = $profileComplete ? 'pending_approval' : 'paid_pending_profile';

        foreach ($bookings as &$b) {
            if (($b['id'] ?? '') === $bid) {
                $b['status']      = $newStatus;
                $b['updatedAt']   = date('c');
                $b['vbankPaidAt'] = date('c');
                break;
            }
        }
        unset($b);
        saveBookings($email, $bookings);

        @file_put_contents($dataDir . '/_vbank_confirm.log', sprintf(
            "[%s] CONFIRM_VBANK email=%s bid=%s partyId=%s gender=%s newStatus=%s\n",
            date('c'), $email, $bid, $partyId, $gender, $newStatus
        ), FILE_APPEND);

        logAdminActivity(
            'update', 'booking', $bid,
            "무통장 입금 확인 — 회원 {$email}, 파티 #{$partyId}, 성별 {$gender} (+1 인원 반영, → {$newStatus})",
            ['status' => 'vbank_pending'],
            ['status' => $newStatus]
        );

        echo json_encode(['ok' => true, 'partyId' => $partyId, 'gender' => $gender, 'status' => $newStatus]);
        exit;
    }

    // ─── action === 'approve_refund' — 취소요청 승인(환불 처리) v7.0 ──────────
    //  cancel_requested → refund_completed. 카드는 Toss 결제취소 API 호출, 무통장은 상태만 변경.
    //  ⚠ party_counts(인원) 는 절대 건드리지 않음 — 인원 -1 은 관리자가 [예약/신청 현황]의
    //    [취소] 버튼으로 별도 처리하는 기존 흐름 유지 (사장님 운영 지침).
    if ($action === 'approve_refund') {
        $found = false; $target = null; $idx = -1;
        foreach ($bookings as $i => $b) {
            if (is_array($b) && (string)($b['id'] ?? '') === $bid) {
                if ((string)($b['status'] ?? '') !== 'cancel_requested') {
                    echo json_encode(['ok' => false, 'error' => '취소 요청 상태가 아닙니다. (현재: ' . ($b['status'] ?? '?') . ')']); exit;
                }
                $target = $b; $idx = $i; $found = true; break;
            }
        }
        if (!$found) { echo json_encode(['ok' => false, 'error' => 'booking not found']); exit; }

        // 환불 금액 — 프론트(refund.ts)와 동일한 날짜 대조 tier 산정 (서버 권위):
        //   파티까지 5일+ → 100% / 4일 → 80% / 3일 → 50% / 그 외 → 0%
        $partiesJson = file_exists("$dataDir/parties.json") ? json_decode((string)file_get_contents("$dataDir/parties.json"), true) : [];
        $calDate = '';
        foreach ((array)$partiesJson as $p) {
            if (isset($p['id']) && (string)$p['id'] === (string)($target['partyId'] ?? '')) { $calDate = (string)($p['calendarDate'] ?? ''); break; }
        }
        $paidAmount = (int)($target['total'] ?? 0);
        $refundAmount = 0;
        if ($calDate !== '' && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $calDate, $m)) {
            $partyMid = mktime(0, 0, 0, (int)$m[2], (int)$m[3], (int)$m[1]);
            $todayMid = mktime(0, 0, 0, (int)date('n'), (int)date('j'), (int)date('Y'));
            $days = (int)floor(($partyMid - $todayMid) / 86400);
            $rate = $days >= 5 ? 1.0 : ($days === 4 ? 0.8 : ($days === 3 ? 0.5 : 0.0));
            $refundAmount = (int)floor(max(0, $paidAmount) * $rate);
        }

        $method = (string)($target['paymentMethod'] ?? '');
        $isVbank = ($method === 'vbank');

        // 카드 결제 — Toss 결제취소 API 호출 (서버-서버). 무통장은 미호출(관리자 직접 송금 전제).
        if (!$isVbank) {
            $paymentKey = (string)($target['paymentId'] ?? '');
            if ($paymentKey === '') {
                echo json_encode(['ok' => false, 'error' => '결제 키(paymentId)가 없어 카드 취소를 진행할 수 없습니다.']); exit;
            }
            if ($refundAmount > 0) {
                try {
                    $cfg = require __DIR__ . '/../payments/toss-config.php';
                    $ch  = curl_init('https://api.tosspayments.com/v1/payments/' . urlencode($paymentKey) . '/cancel');
                    curl_setopt_array($ch, [
                        CURLOPT_POST           => true,
                        CURLOPT_POSTFIELDS     => json_encode(['cancelReason' => '취소요청 승인(관리자)', 'cancelAmount' => $refundAmount]),
                        CURLOPT_HTTPHEADER     => [
                            'Authorization: Basic ' . base64_encode($cfg['secret_key'] . ':'),
                            'Content-Type: application/json',
                        ],
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT        => 20,
                    ]);
                    $tossBody = curl_exec($ch);
                    $tossHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    $tossJson = is_string($tossBody) ? (json_decode($tossBody, true) ?: []) : [];
                    curl_close($ch);
                    @file_put_contents("$dataDir/_toss_refund.log", sprintf(
                        "[%s] APPROVE_REFUND paymentKey=%s amount=%d http=%d body=%s\n",
                        date('c'), $paymentKey, $refundAmount, $tossHttp, substr((string)$tossBody, 0, 400)
                    ), FILE_APPEND);
                    // 이미 취소된 결제(ALREADY_CANCELED)는 성공으로 간주
                    $alreadyCanceled = ($tossHttp === 400 && (string)($tossJson['code'] ?? '') === 'ALREADY_CANCELED_PAYMENT');
                    if ($tossHttp !== 200 && !$alreadyCanceled) {
                        echo json_encode(['ok' => false, 'error' => 'Toss 결제 취소 실패: ' . (string)($tossJson['message'] ?? "HTTP $tossHttp")]); exit;
                    }
                } catch (Throwable $e) {
                    error_log('[approve_refund toss] ' . $e->getMessage());
                    echo json_encode(['ok' => false, 'error' => '결제 취소 처리 중 오류가 발생했습니다.']); exit;
                }
            }
        }

        // 상태 전환 → refund_completed (인원 카운트 미변경)
        $bookings[$idx]['status']         = 'refund_completed';
        $bookings[$idx]['updatedAt']      = date('c');
        $bookings[$idx]['refundedAt']     = date('c');
        $bookings[$idx]['refundAmount']   = $refundAmount;
        $bookings[$idx]['refundedBy']     = 'admin';
        $bookings[$idx]['refundMethod']   = $isVbank ? 'vbank' : 'card';
        saveBookings($email, $bookings);

        @file_put_contents($dataDir . '/_admin_refunds.log', sprintf(
            "[%s] REFUND_APPROVED email=%s bid=%s method=%s amount=%d\n",
            date('c'), $email, $bid, $isVbank ? 'vbank' : 'card', $refundAmount
        ), FILE_APPEND);

        logAdminActivity(
            'update', 'booking', $bid,
            "취소요청 승인(환불) — 회원 {$email}, 방식 " . ($isVbank ? '무통장' : '카드') . ", 환불 {$refundAmount}원",
            ['status' => 'cancel_requested'],
            ['status' => 'refund_completed']
        );

        echo json_encode(['ok' => true, 'refundAmount' => $refundAmount, 'method' => $isVbank ? 'vbank' : 'card']);
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

    // ⚠ 무통장 미입금 건은 애초에 인원 카운트(+1)가 안 된 상태이므로 -1 차감에서 제외 (v7.0).
    //   카운트 시점: 카드=success.php 즉시 / 무통장=관리자 [결제확인](confirm_vbank, vbankPaidAt 기록).
    //   따라서 'vbank 인데 vbankPaidAt 이 없으면' 한 번도 카운트 안 된 건 → 차감 스킵.
    $wasCounted = !(($beforeBooking['paymentMethod'] ?? '') === 'vbank' && empty($beforeBooking['vbankPaidAt']));
    if ($partyId !== '' && $wasCounted) {
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
