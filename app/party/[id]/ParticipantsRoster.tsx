"use client";

import { Mars, Venus } from "lucide-react";

export type Participant = {
  id: string;
  maskedName: string;
  ageBand: string;
  mbti: string;
  job: string;
  status?: "confirmed" | "pending_approval" | "completed" | "paid_pending_profile" | string;
  optionName?: string;   // 솔로파티 참가 구성 — 신청한 항목 이름
};

/** 성별 자리 현황 — 머리 카드(n/정원·진행바·잔여석)에만 쓴다 */
export type GenderSeats = { booked: number; cap: number; remaining: number; full: boolean };

/** 명단 제목 아래 한 줄 — 진행 중 / 0명 / 마감 */
export type RosterStatus =
  | { kind: "open"; total: number; cap: number; remaining: number }
  | { kind: "empty" }
  | { kind: "full" };

/**
 * 이름 — 성(첫 글자)만 남기고 나머지 글자 수만큼 "*" (김민준 → 김**).
 * 서버(api/party-participants.php participantMaskedName)가 이미 가려서 보내지만 화면에서도 같은 규칙으로 한 번 더 가린다.
 * 이미 가린 이름("김**", 탈퇴 회원 "***")은 그대로 나온다.
 */
export function maskParticipantName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return "";
  return chars[0] + "*".repeat(Math.max(1, chars.length - 1));
}

/** 상태 미니 배지 — 마이페이지 STATUS_DISPLAY 와 동일 색상/라벨, 사이즈만 컴팩트 */
function StatusMiniBadge({ status }: { status?: string }) {
  if (status === "paid_pending_profile") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
        결제완료(프로필 대기)
      </span>
    );
  }
  if (status === "confirmed") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
        참가확정
      </span>
    );
  }
  if (status === "pending_approval") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-[#F5F5DC] text-[#5D4037] whitespace-nowrap">
        확정 대기 중
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-gray-200 text-black whitespace-nowrap">
        모임종료
      </span>
    );
  }
  return null;
}

const TONES = {
  male:   { label: "남성", Icon: Mars,  text: "text-male",   head: "bg-male-bg",   fill: "bg-male",   card: "bg-male-seat border-male-line" },
  female: { label: "여성", Icon: Venus, text: "text-female", head: "bg-female-bg", fill: "bg-female", card: "bg-female-seat border-female-line" },
} as const;

/** 성별 열 — 맨 위 머리 카드 + 실제 참가자 카드만 신청 순서대로 (빈자리 칸은 그리지 않는다) */
function GenderColumn({ gender, list, seats, hideProfile }: {
  gender: "male" | "female";
  list: Participant[];
  seats: GenderSeats;
  hideProfile: boolean;
}) {
  const t = TONES[gender];
  const pct = seats.cap > 0 ? Math.min(100, Math.round((seats.booked / seats.cap) * 100)) : 0;
  return (
    <div className="min-w-0 space-y-2" data-testid={`roster-${gender}`}>
      <div className={`rounded-xl ${t.head} p-2.5 md:flex md:items-center md:gap-3 md:px-4 md:py-3`}>
        <div className="flex items-center gap-1.5 md:flex-shrink-0">
          <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-white md:size-7" aria-hidden>
            <t.Icon className={`size-3.5 md:size-4 ${t.text}`} strokeWidth={2.5} />
          </span>
          <span className={`text-[14px] font-black md:text-[15px] ${t.text}`}>{t.label}</span>
          <span className="ml-auto text-[13px] font-bold tabular-nums text-brand-black md:ml-1 md:text-[14px]">{seats.booked}/{seats.cap}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white md:mt-0 md:min-w-0 md:flex-1"
          role="progressbar"
          aria-label={`${t.label} 신청 현황`}
          aria-valuemin={0}
          aria-valuemax={seats.cap}
          aria-valuenow={Math.min(seats.booked, seats.cap)}
        >
          <div className={`h-full rounded-full ${t.fill}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] font-bold tabular-nums text-gray-600 md:mt-0 md:flex-shrink-0 md:text-[13px]">
          {seats.full ? "마감" : `잔여 ${seats.remaining}석`}
        </p>
      </div>
      {list.map(p => {
        const meta = (hideProfile ? [p.ageBand] : [p.ageBand, p.mbti, p.job]).filter(Boolean).join(" · ");
        return (
          <div key={p.id} className={`min-h-[58px] rounded-lg border px-2.5 py-2 max-[359px]:px-1.5 ${t.card}`} data-testid="participant-card">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className={`whitespace-nowrap text-[14px] font-black max-[359px]:text-[13px] ${t.text}`}>{maskParticipantName(p.maskedName)}</span>
              <StatusMiniBadge status={p.status} />
              {/* 솔로파티 참가 구성 — 신청한 항목 이름 */}
              {p.optionName && (
                <span className="inline-block max-w-full truncate rounded-full border border-gray-200 bg-white px-1.5 py-0.5 align-middle text-xs font-bold text-gray-600">
                  {p.optionName}
                </span>
              )}
            </div>
            {meta && <p className="mt-1 truncate text-[12px] text-gray-500">{meta}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 실시간 참가자 명단 (docs/specs/party-detail-relayout.md D-4) — 남/여 2열(모든 화면 폭), 열 높이는 따로.
 * 남은 자리는 성별 머리 카드(진행바·잔여석)로만 보여 준다. 명단 아래 범례·안내 문구는 두지 않는다.
 */
export default function ParticipantsRoster({ male, female, maleSeats, femaleSeats, status, updatedAt, hideProfile, titleClassName }: {
  male: Participant[];
  female: Participant[];
  maleSeats: GenderSeats;
  femaleSeats: GenderSeats;
  status: RosterStatus;
  updatedAt: string | null;   // "14:05" (한국 시간) — 아직 못 받았으면 null
  hideProfile: boolean;       // 솔로파티 — MBTI·직업 없음
  titleClassName: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={titleClassName}>실시간 참가자 명단</h2>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-gray-500 md:text-[13px]">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
          {updatedAt ? `${updatedAt} 기준 · 자동 갱신` : "자동 갱신"}
        </span>
      </div>
      <p className="mt-2 text-[14px] text-gray-700 md:text-[15px]" data-testid="roster-status">
        {status.kind === "full" ? (
          <span className="font-bold text-danger">모집이 마감됐어요</span>
        ) : status.kind === "empty" ? (
          <span className="font-bold text-brand-point-ink">모집을 시작했어요 · 첫 번째 참가자가 되어 보세요</span>
        ) : (
          <>
            총 <strong className="font-black text-brand-black">{status.total}</strong>명 신청 ·{" "}
            <strong className="font-black text-brand-black">{status.cap}</strong>자리 중{" "}
            <strong className="font-black text-brand-point-ink">{status.remaining}</strong>자리 남았어요
          </>
        )}
      </p>
      <div className="mt-4 grid grid-cols-2 items-start gap-2.5 max-[359px]:gap-1.5 md:mt-5 md:gap-4">
        <GenderColumn gender="male" list={male} seats={maleSeats} hideProfile={hideProfile} />
        <GenderColumn gender="female" list={female} seats={femaleSeats} hideProfile={hideProfile} />
      </div>
    </>
  );
}
