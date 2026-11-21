"use client";

/**
 * 관리자 [파티 관리] — 모집 마감·마감 해제·파티 취소 (docs/specs/party-recruit-close-cancel.md 5·6장).
 *  - RecruitChip     : 파티 줄·수정 화면 상단의 모집 상태 칩 (솔로 회차 파티는 회차별 자동 마감 시각 펼쳐 보기)
 *  - RecruitButtons  : [모집 마감] / [마감 해제] / [다시 자동 마감으로] — 시작이 지났거나 취소된 파티는 버튼 없음
 *  - PartyCancelPanel: 수정 화면 하단 [파티 취소] (미리보기·사유·문자·제목 확인) / 취소된 파티는 남은 환불·무통장 송금 목록
 * 판정은 화면 공통 partyRecruitState (서버 api/lib.php 와 같은 규칙). 서버: api/admin/parties.php recruit·cancel_* 동작.
 */

import { useEffect, useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import {
  partyRecruitState, partyEventDate, kstHHMM, kstMMDD, normalizeRecruitMode, RECRUIT_CLOSE_BEFORE_MIN,
  type Party, type PartyRecruit,
} from "../../lib/data";
import { broadcastPartiesUpdated } from "../../lib/useParties";
import { useMinuteNow } from "../../lib/useMinuteNow";

const API = "/api/admin/parties.php";
const REASON_MAX = 50;

async function post(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

/** 시간·관리자 기준 모집 상태 — 칩·버튼은 정원(신청 인원)과 상관없이 정한다 */
function timeRecruit(party: Party, now: Date): PartyRecruit {
  return partyRecruitState({
    ...party, maleBooked: 0, femaleBooked: 0,
    ...(party.sessions ? { sessions: party.sessions.map(s => ({ ...s, maleBooked: 0, femaleBooked: 0 })) } : {}),
  }, now);
}

const at = (d: Date) => `${kstMMDD(d)} ${kstHHMM(d)}`;

/** 파티 시작 시각 "HH:MM" — 참가 구성 파티는 가장 늦은 회차 (마감 해제 확인창의 "시작 시각까지") */
function lastStartHHMM(party: Party, r: PartyRecruit): string {
  if (r.sessions.length) return kstHHMM(new Date(Math.max(...r.sessions.map(s => s.startAt.getTime()))));
  return kstHHMM(partyEventDate(party));
}

export function RecruitChip({ party }: { party: Party }) {
  const now = useMinuteNow();
  if (!now) return null;
  const r = timeRecruit(party, now);
  const chip = (() => {
    switch (r.state) {
      case "cancelled":    return { text: "취소됨", cls: "bg-gray-900 text-white" };
      case "ended":        return { text: "모집종료", cls: "bg-gray-200 text-gray-600" };
      case "closed_admin": return { text: "모집 마감(관리자)", cls: "bg-red-50 text-danger border border-red-200" };
      case "closed_auto":  return { text: "모집 마감(자동)", cls: "bg-gray-100 text-gray-700 border border-gray-300" };
      case "open_forced":  return { text: "마감 해제됨 · 시작까지 신청 가능", cls: "bg-amber-50 text-amber-800 border border-amber-200" };
      default:             return { text: `모집 중 · ${at(r.closeAt)} 자동 마감`, cls: "bg-brand-point/10 text-brand-point-ink border border-brand-point/30" };
    }
  })();
  return (
    <span className="inline-flex flex-col items-start gap-1" data-testid="recruit-chip">
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${chip.cls}`}>{chip.text}</span>
      {r.sessions.length > 0 && r.state !== "cancelled" && r.state !== "ended" && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer font-bold select-none">회차별 자동 마감</summary>
          <ul className="mt-1 space-y-0.5">
            {r.sessions.map(s => (
              <li key={s.id} className="whitespace-nowrap tabular-nums">{s.name} {kstHHMM(s.startAt)} 시작 → {kstHHMM(s.closeAt)} 마감</li>
            ))}
          </ul>
        </details>
      )}
    </span>
  );
}

export function RecruitButtons({ party, onChanged, compact = false }: { party: Party; onChanged?: () => void | Promise<void>; compact?: boolean }) {
  const now = useMinuteNow();
  const [busy, setBusy] = useState(false);
  if (!now) return null;
  const r = timeRecruit(party, now);
  if (r.state === "cancelled" || r.state === "ended") return null;

  const change = async (mode: "auto" | "closed" | "open", message: string) => {
    if (busy || !confirm(message)) return;
    setBusy(true);
    try {
      const d = await post({ action: "recruit", partyId: party.id, mode });
      if (!d?.ok) { alert(d?.error || "모집 상태를 바꾸지 못했습니다."); return; }
      broadcastPartiesUpdated();
      await onChanged?.();
    } catch {
      alert("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const cls = `${compact ? "px-2.5 py-1 text-xs min-h-11 md:min-h-0" : "px-3 py-2 text-sm min-h-11 md:min-h-0 md:h-9"} rounded-lg font-bold border transition-all disabled:opacity-50 whitespace-nowrap`;
  const mode = normalizeRecruitMode(party.recruitMode);
  if (r.state === "open" && mode !== "open") {
    return (
      <button type="button" disabled={busy} data-testid="recruit-close"
        onClick={() => change("closed", "지금부터 신청을 받지 않습니다.")}
        className={`${cls} border-gray-300 bg-white text-brand-black hover:bg-gray-50`}>
        모집 마감
      </button>
    );
  }
  if (r.state === "closed_auto" || r.state === "closed_admin") {
    return (
      <button type="button" disabled={busy} data-testid="recruit-reopen"
        onClick={() => change("open", `파티 시작 시각(${lastStartHHMM(party, r)})까지 다시 신청을 받습니다. 정원이 남아 있어야 신청할 수 있어요.`)}
        className={`${cls} border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}>
        마감 해제
      </button>
    );
  }
  if (r.state === "open_forced") {
    return (
      <button type="button" disabled={busy} data-testid="recruit-auto"
        onClick={() => change("auto", `다시 자동 마감으로 바꿉니다. 시작 ${RECRUIT_CLOSE_BEFORE_MIN}분 전이 지났으면 바로 마감됩니다.`)}
        className={`${cls} border-gray-300 bg-white text-brand-black hover:bg-gray-50`}>
        다시 자동 마감으로
      </button>
    );
  }
  return null;
}

// ─── 파티 취소 ───────────────────────────────────────────────────

type Remaining = { email: string; name: string; bookingId: string; kind: "card" | "vbank_paid" | "vbank_pending"; amount: number; status: string };
type ManualRefund = { email: string; name: string; phone: string; bookingId: string; amount: number; status: "pending" | "done"; doneAt: string; doneBy: string };
type Preview = {
  party: { id: string; title: string; cancelled: boolean; cancelledAt: string | null; cancelReason: string | null; cancelSms: boolean };
  card: { count: number; amount: number };
  vbankPaid: { count: number; amount: number };
  vbankPending: { count: number };
  cancelRequested: { count: number; amount: number };
  excluded: { cancelled: number; refundCompleted: number };
  targets: number;
  remaining: Remaining[];
  manualRefunds: ManualRefund[];
};
type ResultRow = { email: string; name: string; bookingId: string; kind: Remaining["kind"]; amount: number; ok: boolean; error: string };
type RunResult = { results: ResultRow[]; summary: { card: number; cardAmount: number; vbankPaid: number; vbankPaidAmount: number; vbankPending: number; failed: number } };

const KIND_LABEL: Record<Remaining["kind"], string> = { card: "카드", vbank_paid: "무통장(입금 완료)", vbank_pending: "무통장(입금 대기)" };
const won = (n: number) => `${n.toLocaleString()}원`;

export function PartyCancelPanel({ party, onChanged }: { party: Party; onChanged?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("주최측 사정");
  const [sendSms, setSendSms] = useState(true);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const cancelled = !!party.cancelledAt;

  const loadPreview = async () => {
    setLoading(true);
    try {
      const d = await post({ action: "cancel_preview", partyId: party.id });
      if (d?.ok) setPreview(d as Preview); else alert(d?.error || "미리보기를 불러오지 못했습니다.");
    } catch {
      alert("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 취소된 파티 — 남은 처리·송금 목록을 바로 보여준다
  useEffect(() => {
    if (!cancelled) return;
    let alive = true;
    post({ action: "cancel_preview", partyId: party.id })
      .then(d => { if (alive && d?.ok) setPreview(d as Preview); })
      .catch(() => {});
    return () => { alive = false; };
  }, [cancelled, party.id]);

  const run = async (action: "cancel_party" | "cancel_retry") => {
    if (running) return;
    if (action === "cancel_retry" && !confirm("남은 예약의 환불·취소를 다시 시도합니다. 이미 처리된 예약은 건너뜁니다.")) return;
    setRunning(true);
    try {
      const d = await post(action === "cancel_party"
        ? { action, partyId: party.id, reason: reason.trim(), sendSms, confirmTitle }
        : { action, partyId: party.id });
      if (!d?.ok) { alert(d?.error || "파티 취소를 처리하지 못했습니다."); return; }
      setResult({ results: d.results ?? [], summary: d.summary });
      broadcastPartiesUpdated();
      await onChanged?.();
      await loadPreview();
    } catch {
      alert("네트워크 오류 — 처리 결과를 확인하려면 화면을 새로고침해주세요. (이미 처리된 예약은 다시 시도해도 건너뜁니다)");
    } finally {
      setRunning(false);
    }
  };

  const markDone = async (m: ManualRefund) => {
    if (!confirm(`${m.name || m.email} 님에게 ${won(m.amount)} 송금을 마쳤나요?\n은행에서 직접 송금한 뒤 눌러주세요.`)) return;
    const d = await post({ action: "manual_refund_done", partyId: party.id, email: m.email, bookingId: m.bookingId }).catch(() => null);
    if (!d?.ok) { alert(d?.error || "송금 완료로 표시하지 못했습니다."); return; }
    await loadPreview();
  };

  const titleOk = confirmTitle.trim() === party.title.trim();
  const reasonOk = reason.trim().length > 0 && reason.trim().length <= REASON_MAX;

  const resultView = result && (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4" data-testid="cancel-result">
      <p className="text-sm font-black">처리 결과</p>
      <p className="mt-1 text-sm text-gray-700">
        카드 환불 {result.summary.card}건({won(result.summary.cardAmount)}) · 무통장 송금 필요 {result.summary.vbankPaid}건({won(result.summary.vbankPaidAmount)}) · 입금 대기 취소 {result.summary.vbankPending}건 ·{" "}
        <span className={result.summary.failed ? "font-black text-danger" : ""}>실패 {result.summary.failed}건</span>
      </p>
      {result.results.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-gray-100 text-xs">
          {result.results.map(r => (
            <li key={`${r.email}-${r.bookingId}`} className="flex flex-wrap items-center gap-x-2 py-1.5">
              <span className={`font-black ${r.ok ? "text-emerald-700" : "text-danger"}`}>{r.ok ? "성공" : "실패"}</span>
              <span className="font-bold">{r.name || r.email}</span>
              <span className="text-gray-500">{KIND_LABEL[r.kind]} · {won(r.amount)}</span>
              {r.error && <span className="w-full text-gray-500 break-keep">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // 취소된 파티 — 상태, 남은 처리, 무통장 환불 송금 목록
  if (cancelled) {
    const pending = preview?.remaining ?? [];
    return (
      <section className="rounded-2xl border-2 border-gray-900 bg-gray-50 p-4 md:p-5" data-testid="party-cancelled-panel">
        <h4 className="flex items-center gap-2 font-black text-base"><Ban size={16} /> 취소된 파티</h4>
        <p className="mt-1 text-sm text-gray-600 break-keep">
          {preview?.party.cancelReason ? `사유: ${preview.party.cancelReason} · ` : ""}신청·결제가 막혀 있습니다. 파티 취소는 되돌릴 수 없습니다.
        </p>
        {pending.length > 0 ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-black text-danger">아직 처리되지 않은 예약 {pending.length}건</p>
            <ul className="mt-1 text-xs text-gray-700 space-y-0.5">
              {pending.map(r => <li key={`${r.email}-${r.bookingId}`}>{r.name || r.email} · {KIND_LABEL[r.kind]} · {won(r.amount)}</li>)}
            </ul>
            <button type="button" onClick={() => run("cancel_retry")} disabled={running} data-testid="cancel-retry"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-danger bg-white px-3 py-2 text-sm font-bold text-danger hover:bg-red-100 disabled:opacity-50 min-h-11 md:min-h-0">
              <RotateCcw size={14} /> {running ? "처리 중…" : "남은 환불 다시 시도"}
            </button>
          </div>
        ) : preview && (
          <p className="mt-3 text-sm font-bold text-emerald-700">모든 예약의 취소·환불 처리가 끝났습니다.</p>
        )}
        {resultView}
        <div className="mt-4">
          <p className="text-sm font-black">무통장 환불 송금</p>
          {(preview?.manualRefunds.length ?? 0) === 0 ? (
            <p className="mt-1 text-xs text-gray-500">송금할 무통장 환불이 없습니다.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white" data-testid="manual-refund-list">
              {preview!.manualRefunds.map(m => (
                <li key={`${m.email}-${m.bookingId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <span className="font-black">{m.name || "-"}</span>
                  <span className="text-gray-600 tabular-nums">{m.phone || "-"}</span>
                  <span className="font-bold tabular-nums">{won(m.amount)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {m.status === "done" ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">송금 완료</span>
                    ) : (
                      <>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-danger">송금 필요</span>
                        <button type="button" onClick={() => markDone(m)} data-testid="manual-refund-done"
                          className="rounded-lg bg-brand-black px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-point hover:text-black min-h-11 md:min-h-0">
                          송금 완료
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-red-200 p-4 md:p-5" data-testid="party-cancel-section">
      <h4 className="font-black text-base text-danger">파티 취소</h4>
      <p className="mt-1 text-sm text-gray-600 break-keep">
        파티를 취소하고 신청자 전원에게 전액 환불합니다. 카드 결제는 토스에서 자동으로 취소되고, 무통장 입금은 관리자가 직접 송금합니다. 되돌릴 수 없습니다.
      </p>
      <button type="button" onClick={() => { setOpen(true); setResult(null); setConfirmTitle(""); loadPreview(); }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-2 border-danger bg-white px-4 py-2 text-sm font-black text-danger hover:bg-red-50 min-h-11 md:min-h-0" data-testid="party-cancel-open">
        <Ban size={14} /> 파티 취소
      </button>

      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-0 md:p-4" role="dialog" aria-modal="true" aria-labelledby="party-cancel-title">
          <div className="flex h-[100dvh] w-full flex-col bg-white md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 md:px-5">
              <h3 id="party-cancel-title" className="font-black text-base md:text-lg">파티 취소 · #{party.id}</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={running} aria-label="닫기"
                className="rounded-lg px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-100 min-h-11 md:min-h-0">닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
              <p className="font-black break-keep">{party.title}</p>
              {loading || !preview ? (
                <p className="mt-3 text-sm text-gray-500">신청 현황을 불러오는 중…</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm" data-testid="cancel-preview">
                  <li className="rounded-xl bg-gray-50 px-3 py-2.5"><b>카드·간편결제 {preview.card.count}건 · 합계 {won(preview.card.amount)}</b><br /><span className="text-gray-600">→ 토스에서 자동 전액 취소</span></li>
                  <li className="rounded-xl bg-gray-50 px-3 py-2.5"><b>무통장 입금 완료 {preview.vbankPaid.count}건 · 합계 {won(preview.vbankPaid.amount)}</b><br /><span className="text-gray-600">→ 관리자가 직접 송금 (자동 환불 안 됨)</span></li>
                  <li className="rounded-xl bg-gray-50 px-3 py-2.5"><b>무통장 입금 대기 {preview.vbankPending.count}건</b><br /><span className="text-gray-600">→ 예약만 취소 (돈을 받지 않았으므로 환불 없음)</span></li>
                  <li className="rounded-xl bg-gray-50 px-3 py-2.5"><b>취소요청 진행 중 {preview.cancelRequested.count}건</b><br /><span className="text-gray-600">→ 전액 환불로 처리 (위 결제 수단별 방식)</span></li>
                  <li className="px-1 text-xs text-gray-500">이미 취소 {preview.excluded.cancelled}건 · 환불완료 {preview.excluded.refundCompleted}건은 대상이 아닙니다.</li>
                </ul>
              )}

              <label className="mt-4 block text-sm font-bold">
                취소 사유 <span className="font-medium text-gray-500">(필수, {REASON_MAX}자 이하 · 문자에 들어갑니다)</span>
                <input value={reason} onChange={e => setReason(e.target.value.slice(0, REASON_MAX))} maxLength={REASON_MAX}
                  aria-label="취소 사유"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base md:text-sm focus:border-brand-point focus:ring-2 focus:ring-brand-point outline-none" />
                <span className="mt-0.5 block text-right text-xs text-gray-500 tabular-nums">{reason.trim().length}/{REASON_MAX}</span>
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} className="h-4 w-4" aria-label="신청자에게 문자 보내기" />
                신청자에게 문자 보내기
              </label>

              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-black text-danger">되돌릴 수 없습니다.</p>
                <p className="mt-1 text-gray-700 break-keep">실행하면 바로 신청·결제가 막히고 환불이 진행됩니다. 확인을 위해 파티 제목을 그대로 입력해주세요.</p>
                <input value={confirmTitle} onChange={e => setConfirmTitle(e.target.value)} placeholder={party.title}
                  aria-label="파티 제목 확인"
                  className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-base md:text-sm outline-none focus:ring-2 focus:ring-danger" />
              </div>
              {resultView}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 md:px-5">
              <button type="button" onClick={() => setOpen(false)} disabled={running}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 min-h-11 md:min-h-0">
                {result ? "닫기" : "그만두기"}
              </button>
              {!result && (
                <button type="button" onClick={() => run("cancel_party")} disabled={!titleOk || !reasonOk || running || !preview}
                  data-testid="party-cancel-run"
                  className="rounded-lg bg-danger px-4 py-2 text-sm font-black text-white hover:brightness-95 disabled:bg-gray-300 disabled:cursor-not-allowed min-h-11 md:min-h-0">
                  {running ? "처리 중…" : "파티 취소 실행"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** 수정 화면 상단 — 모집 상태 칩 + 버튼 */
export function RecruitBar({ party, onChanged }: { party: Party; onChanged?: () => void | Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5" data-testid="recruit-bar">
      <span className="text-xs font-black text-gray-500">모집 상태</span>
      <RecruitChip party={party} />
      <span className="ml-auto"><RecruitButtons party={party} onChanged={onChanged} /></span>
    </div>
  );
}
