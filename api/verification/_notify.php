<?php
/**
 * 사진 심사·직업 인증 → 운영자 텔레그램 알림 문구 (docs/specs/verification-telegram.md 4장 — 받는 곳은 운영자 개인 대화·그룹, 10장).
 *
 * ★ 개인정보 원칙(api/notify/_telegram.php 머리말과 같음): 이름·연락처·이메일·생년월일·사진·서류·사업자번호는 넣지 않는다.
 *   성별·나이대(ageBand)·구분·건수·시각·처리한 관리자 아이디만 쓴다.
 *  - 테스트 회원(isTestUser)의 요청·처리는 보내지 않고, 대기 건수에서도 뺀다.
 *  - 모든 함수는 예외를 밖으로 던지지 않는다 — 알림 실패가 접수·승인에 영향을 주면 안 된다.
 */

declare(strict_types=1);
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/../notify/_telegram.php';
require_once __DIR__ . '/../db.php';

const VERIFY_NOTIFY_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 회원 id → ['email','gender','birth_date'] (없으면 빈 배열) */
function verifyNotifyUsers(array $ids): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $stmt = getDB()->prepare("SELECT id, email, gender, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date FROM users WHERE id IN ($in)");
    $stmt->execute($ids);
    $out = [];
    foreach ($stmt->fetchAll() as $u) $out[(int)$u['id']] = $u;
    return $out;
}

/** "남성 · 30대 초반" — 성별·나이대만 */
function verifyNotifyWho(array $u): string {
    $g = trim((string)($u['gender'] ?? '')) ?: '성별 미입력';
    $band = !empty($u['birth_date']) ? ageBand((string)$u['birth_date']) : '';
    return $band !== '' ? "{$g} · {$band}" : $g;
}

/** 'Y-m-d H:i:s' → "11/02(월) 17:30" */
function verifyNotifyWhen(string $dt): string {
    $ts = strtotime($dt);
    if ($ts === false) return $dt;
    return date('m/d', $ts) . '(' . VERIFY_NOTIFY_WEEKDAYS[(int)date('w', $ts)] . ') ' . date('H:i', $ts);
}

/** 테스트 회원을 뺀 심사 대기 기록들 */
function verifyNotifyPendingRecords(array $store): array {
    $pending = array_values(array_filter($store['records'], fn($r) => is_array($r) && ($r['status'] ?? '') === 'pending'));
    if (!$pending) return [];
    $users = verifyNotifyUsers(array_map(fn($r) => (int)$r['user_id'], $pending));
    return array_values(array_filter($pending, fn($r) => !isTestUser((string)($users[(int)$r['user_id']]['email'] ?? ''))));
}

/**
 * 4-1 심사 요청 접수.
 *  $photoKind: 사진만 — '첫 제출' | '재제출(반려 후)' | '사진 교체(승인 회원)' | '다시 제출(심사 중 교체)'
 */
function verifyNotifySubmit(int $userId, int $recordId, string $photoKind = ''): void {
    try {
        $cfg = telegramConfig();
        if (!telegramReady($cfg)) return;
        $u = verifyNotifyUsers([$userId])[$userId] ?? null;
        if ($u === null || isTestUser((string)$u['email'])) return;
        $store = verifyReadStore();
        $rec = null;
        foreach ($store['records'] as $r) if (is_array($r) && (int)($r['id'] ?? 0) === $recordId) $rec = $r;
        if ($rec === null) return;

        if (($rec['kind'] ?? '') === 'photo') {
            $lines = ['[어울림] 사진 심사 요청', '· ' . verifyNotifyWho($u), '· ' . ($photoKind !== '' ? $photoKind : '첫 제출')];
        } else {
            $type = VERIFY_JOB_TYPES[(string)($rec['job_type'] ?? '')] ?? '기타';
            $lines = ["[어울림] 직업 인증 요청 ({$type})", '· ' . verifyNotifyWho($u)];
            if (($rec['job_type'] ?? '') === 'business') {
                $nts = ['match' => '일치', 'mismatch' => '불일치'][(string)($rec['biz_check']['result'] ?? '')] ?? '확인 불가';
                $lines[] = "· 국세청 확인: {$nts}";
            }
        }
        $lines[] = '· 접수 ' . verifyNotifyWhen((string)($rec['created_at'] ?? ''));
        $lines[] = '· 현재 대기 ' . count(verifyNotifyPendingRecords($store)) . '건';
        $lines[] = telegramAdminLine($cfg);
        telegramSend(implode("\n", $lines), false, $cfg);
    } catch (Throwable $e) {
        error_log('[verification notify submit] ' . $e->getMessage());
    }
}

/** 4-2 처리 완료 (항상 무음) */
function verifyNotifyDecision(int $userId, string $kind, bool $approved, string $reason, string $adminId, string $createdAt): void {
    try {
        $cfg = telegramConfig();
        if (!telegramReady($cfg)) return;
        $u = verifyNotifyUsers([$userId])[$userId] ?? null;
        if ($u === null || isTestUser((string)$u['email'])) return;
        $what = ($kind === 'photo' ? '사진' : '직업') . ' ' . ($approved ? '승인' : '반려');
        if (!$approved && $reason !== '') $what .= " (사유: {$reason})";
        $at = strtotime($createdAt);
        $lines = [
            "[어울림] 처리 완료 · {$what}",
            '· ' . verifyNotifyWho($u) . ($at !== false ? ' (' . date('H:i', $at) . ' 접수)' : ''),
            "· 처리: {$adminId}",
            '· 남은 대기 ' . count(verifyNotifyPendingRecords(verifyReadStore())) . '건',
        ];
        telegramSend(implode("\n", $lines), true, $cfg);
    } catch (Throwable $e) {
        error_log('[verification notify decision] ' . $e->getMessage());
    }
}

/**
 * 4-3 매일 오전 10시 대기 요약 — 매시 정각 배치(api/cron/profile_24h_reminder.php)가 부른다.
 * KST 10시에만, 대기 1건 이상일 때만, 같은 날 한 번만(보낸 날짜를 설정 파일에 남김). 보냈으면 true.
 */
function verifyNotifyDailySummary(?int $now = null): bool {
    try {
        $now ??= time();
        if ((int)date('G', $now) !== 10) return false;
        $cfg = telegramConfig();
        if (!telegramReady($cfg)) return false;
        $today = date('Y-m-d', $now);
        if ((string)$cfg['last_summary_date'] === $today) return false;
        $pending = verifyNotifyPendingRecords(verifyReadStore());
        if (!$pending) return false;
        $photo = count(array_filter($pending, fn($r) => ($r['kind'] ?? '') === 'photo'));
        $job   = count($pending) - $photo;
        $oldest = min(array_map(fn($r) => (int)strtotime((string)$r['created_at']), $pending));
        $hours = max(0, intdiv($now - $oldest, 3600));
        $age = $hours < 1 ? '1시간 이내' : ($hours < 48 ? "{$hours}시간 전" : intdiv($hours, 24) . '일 전');
        $text = implode("\n", [
            '[어울림] 심사 대기 요약',
            "· 사진 {$photo}건 / 직업 {$job}건",
            "· 가장 오래된 요청: {$age}",
            telegramAdminLine($cfg),
        ]);
        if (!telegramSend($text, false, $cfg)) return false;
        telegramUpdateConfig(function (array $c) use ($today) { $c['last_summary_date'] = $today; return $c; });
        return true;
    } catch (Throwable $e) {
        error_log('[verification notify summary] ' . $e->getMessage());
        return false;
    }
}
