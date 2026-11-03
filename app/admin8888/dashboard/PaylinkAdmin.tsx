"use client";

/**
 * 관리자 [결제 링크] 탭 — 대관료 개인 결제 링크 (docs/specs/paylink.md 2장, 서버: api/admin/paylinks.php).
 *  - 목록(최근 만든 순) · 상태/월 필터 · 이번 달 요약
 *  - [새 결제 링크 만들기] / [수정] — 입력 규칙은 app/lib/paylink.ts PAYLINK_LIMITS (최종 판단은 서버)
 *  - 상세: [링크 복사] · [문자로 보내기] · [링크 중지]/[다시 열기] · [전액 취소]/[부분 취소]
 *    취소 창에는 오늘 기준 규정 금액(서버 refundQuote — 파티와 같은 규정)을 보여주고 부분 취소 금액 칸에 미리 채운다.
 *  - 삭제 기능은 없다(결제 기록 보존). 결제 전 링크는 [링크 중지]로 정리
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Link2, Loader2, MessageSquare, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { AdminModal } from "./VerificationReview";
import { formatPhoneKR } from "../../lib/phone";
import {
  PAYLINK_LIMITS, PAYLINK_STATE_META, defaultDeadlineInput, deadlineToInput, formatUseDate, localDate, quoteLabel,
  shortDateTime, won, type PaylinkState,
} from "../../lib/paylink";

const API = "/api/admin/paylinks.php";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black transition-colors disabled:opacity-50 min-h-11 md:min-h-0 md:h-10";
const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold outline-none focus:border-brand-point-ink min-h-11 md:min-h-0 md:h-10";

type Row = { id: number; title: string; amount: number; state: PaylinkState; useDate: string; expiresAt: string; createdAt: string; paidAt: string; cancelledAmount: number };
type CancelRow = { at: string; amount: number; reason: string; adminId: string; note?: string };
type Detail = Row & {
  url: string; useInfo: string; notice: string; adminMemo: string; payerName: string; payerPhone: string;
  payment: { method: string; approvedAt: string; receiptUrl: string; payerName: string; payerPhone: string; amount: number } | null;
  refundPolicy: { when: string; rate: number; label: string }[] | null;
  cancels: CancelRow[]; remaining: number; quote: { days: number; rate: number; amount: number } | null;
  inProgress: boolean; canReopen: boolean; smsLog: { at: string; adminId: string; ok: boolean }[]; payerSms: string;
  createdBy: string; updatedBy: string; updatedAt: string;
};
type Summary = { month: string; paidCount: number; paidAmount: number; cancelAmount: number };
type Form = { title: string; amount: string; useDate: string; useInfo: string; payerName: string; payerPhone: string; notice: string; expiresAt: string; adminMemo: string };

const STATUS_FILTERS: { key: string; label: string; states: PaylinkState[] | null }[] = [
  { key: "all", label: "전체", states: null },
  { key: "open", label: "결제 대기", states: ["open"] },
  { key: "paid", label: "결제 완료", states: ["paid"] },
  { key: "cancel", label: "취소", states: ["partial_cancelled", "cancelled"] },
  { key: "closed", label: "만료·중지", states: ["expired", "stopped"] },
];

function Badge({ state }: { state: PaylinkState }) {
  const m = PAYLINK_STATE_META[state] ?? { label: state, tone: "bg-gray-100 text-gray-600" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black ${m.tone}`}>{m.label}</span>;
}

async function api<T = Record<string, unknown>>(body?: Record<string, unknown>, query = ""): Promise<{ ok: boolean; status: number; data: T & { ok?: boolean; error?: string } }> {
  try {
    const r = await fetch(API + query, body
      ? { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { credentials: "include", cache: "no-store" });
    const data = await r.json().catch(() => ({ ok: false, error: "응답을 읽지 못했습니다." }));
    return { ok: r.ok && data?.ok !== false, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { ok: false, error: "서버에 연결하지 못했습니다." } as T & { ok?: boolean; error?: string } };
  }
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래 대체 방법 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** 화면 입력 검사 — 서버(api/paylink/_lib.php paylinkValidateInput)와 같은 규칙. 문제가 없으면 "" */
function validateForm(f: Form): string {
  const L = PAYLINK_LIMITS;
  const title = f.title.trim().replace(/\s+/g, " ");
  if (title.length < L.titleMin || title.length > L.titleMax) return `결제명은 ${L.titleMin}~${L.titleMax}자로 입력해주세요.`;
  const amt = f.amount.replace(/,/g, "").trim();
  if (!/^\d{1,9}$/.test(amt)) return "금액은 원 단위 숫자로 입력해주세요.";
  const n = Number(amt);
  if (n < L.amountMin || n > L.amountMax) return `금액은 ${won(L.amountMin)} ~ ${won(L.amountMax)}으로 입력해주세요.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.useDate)) return "이용일을 선택해주세요.";
  if (f.useDate < localDate()) return "이용일은 오늘 이후로 정해주세요.";
  if (f.useInfo.trim().length > L.useInfoMax) return `이용 시간·장소는 ${L.useInfoMax}자 이내로 입력해주세요.`;
  if (f.payerName.trim().length > L.payerNameMax) return `결제자 이름은 ${L.payerNameMax}자 이내로 입력해주세요.`;
  const ph = f.payerPhone.replace(/\D/g, "");
  if (ph !== "" && !/^01\d{8,9}$/.test(ph)) return "결제자 연락처는 01로 시작하는 휴대폰 번호 10~11자리로 입력해주세요.";
  if (f.notice.length > L.noticeMax) return `추가 안내는 ${L.noticeMax}자 이내로 입력해주세요.`;
  if (f.adminMemo.length > L.memoMax) return `관리자 메모는 ${L.memoMax}자 이내로 입력해주세요.`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.expiresAt)) return "결제 기한을 날짜와 시각으로 입력해주세요.";
  const exp = new Date(f.expiresAt + ":59");
  if (exp.getTime() <= Date.now()) return "결제 기한은 지금 이후로 정해주세요.";
  if (f.expiresAt.slice(0, 10) > localDate(L.deadlineDays)) return `결제 기한은 오늘부터 최대 ${L.deadlineDays}일까지 정할 수 있습니다.`;
  if (f.expiresAt.slice(0, 10) > f.useDate) return "결제 기한은 이용일보다 늦을 수 없습니다.";
  return "";
}

const emptyForm = (): Form => {
  const useDate = localDate(PAYLINK_LIMITS.defaultDays);
  return { title: "", amount: "", useDate, useInfo: "", payerName: "", payerPhone: "", notice: "", expiresAt: defaultDeadlineInput(useDate), adminMemo: "" };
};

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-gray-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-medium text-gray-500 break-keep">{hint}</span>}
    </label>
  );
}

function LinkForm({ initial, editId, onClose, onSaved }: { initial: Form; editId: number | null; onClose: () => void; onSaved: (d: Detail) => void }) {
  const [f, setF] = useState<Form>(initial);
  const [deadlineTouched, setDeadlineTouched] = useState(editId !== null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Form, v: string) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (k === "useDate" && !deadlineTouched) next.expiresAt = defaultDeadlineInput(v);
    return next;
  });

  const save = async () => {
    const msg = validateForm(f);
    if (msg) { setErr(msg); return; }
    setErr(""); setSaving(true);
    const r = await api<{ link: Detail }>({
      action: editId === null ? "create" : "update", id: editId ?? undefined,
      ...f, amount: f.amount.replace(/,/g, "").trim(), payerPhone: f.payerPhone.replace(/\D/g, ""),
    });
    setSaving(false);
    if (!r.ok) { setErr(r.data.error || "저장하지 못했습니다."); return; }
    onSaved(r.data.link);
  };

  const amountNum = Number(f.amount.replace(/,/g, ""));
  return (
    <AdminModal title={editId === null ? "새 결제 링크 만들기" : `결제 링크 #${editId} 수정`} onClose={onClose}>
      <div className="space-y-3.5">
        <Field label="결제명" required hint="결제명은 결제자에게 보이며 운영자 텔레그램 알림에도 표시됩니다.">
          <input className={input} value={f.title} maxLength={PAYLINK_LIMITS.titleMax} onChange={e => set("title", e.target.value)} placeholder="11/20(목) 대관 및 파티 진행" />
        </Field>
        <Field label="금액 (원)" required hint={`${won(PAYLINK_LIMITS.amountMin)} ~ ${won(PAYLINK_LIMITS.amountMax)}${amountNum > 0 ? ` · ${won(amountNum)}` : ""}`}>
          <input className={input} value={f.amount} inputMode="numeric" onChange={e => set("amount", e.target.value.replace(/[^\d,]/g, ""))} placeholder="300000" />
        </Field>
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="이용일" required hint="환불 규정 계산 기준일">
            <input type="date" className={input} value={f.useDate} min={localDate()} onChange={e => set("useDate", e.target.value)} />
          </Field>
          <Field label="결제 기한" required hint={`최대 ${PAYLINK_LIMITS.deadlineDays}일, 이용일보다 늦을 수 없음`}>
            <input type="datetime-local" className={input} value={f.expiresAt} onChange={e => { setDeadlineTouched(true); set("expiresAt", e.target.value); }} />
          </Field>
        </div>
        <Field label="이용 시간·장소" hint={`${PAYLINK_LIMITS.useInfoMax}자 이내`}>
          <input className={input} value={f.useInfo} maxLength={PAYLINK_LIMITS.useInfoMax} onChange={e => set("useInfo", e.target.value)} placeholder="19:00~23:00 · 미금역 어울림 라운지" />
        </Field>
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="결제자 이름" hint="결제 페이지 이름 칸에 미리 채움">
            <input className={input} value={f.payerName} maxLength={PAYLINK_LIMITS.payerNameMax} onChange={e => set("payerName", e.target.value)} />
          </Field>
          <Field label="결제자 연락처" hint="[문자로 보내기]에 사용">
            <input className={input} value={f.payerPhone} inputMode="numeric" onChange={e => set("payerPhone", e.target.value.replace(/[^\d-]/g, "").slice(0, 13))} placeholder="01012345678" />
          </Field>
        </div>
        <Field label="추가 안내" hint={`환불 규정 아래에 표시 · ${f.notice.length}/${PAYLINK_LIMITS.noticeMax}자`}>
          <textarea className={`${input} min-h-24 md:h-auto`} rows={3} value={f.notice} maxLength={PAYLINK_LIMITS.noticeMax} onChange={e => set("notice", e.target.value)} placeholder="인원·준비물 등" />
        </Field>
        <Field label="관리자 메모" hint="관리자만 봄">
          <textarea className={`${input} min-h-20 md:h-auto`} rows={2} value={f.adminMemo} maxLength={PAYLINK_LIMITS.memoMax} onChange={e => set("adminMemo", e.target.value)} />
        </Field>
        <p className="rounded-xl bg-gray-50 p-3 text-xs font-medium text-gray-600 break-keep">환불 규정은 입력하지 않습니다. 결제 페이지에 파티 환불 규정(이용일 5일 전 100% / 4일 전 80% / 3일 전 50% / 2일 전~당일 불가)이 그대로 표시됩니다.</p>
        {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 break-keep">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>닫기</button>
          <button type="button" onClick={save} disabled={saving} className={`${btn} bg-brand-black text-white hover:bg-gray-800`}>
            {saving && <Loader2 size={16} className="animate-spin" />}{editId === null ? "링크 만들기" : "저장"}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-2 text-sm">
      <dt className="font-bold text-gray-500">{label}</dt>
      <dd className="min-w-0 font-bold text-brand-black break-words">{children}</dd>
    </div>
  );
}

function CancelPanel({ d, full, onDone, onClose }: { d: Detail; full: boolean; onDone: (d: Detail) => void; onClose: () => void }) {
  const q = d.quote;
  const [amount, setAmount] = useState(full ? String(d.remaining) : String(q ? q.amount : d.remaining));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const amt = Number(amount.replace(/,/g, "")) || 0;
  const differs = q !== null && amt !== q.amount;

  const run = async () => {
    if (!reason.trim()) { setErr("취소 사유를 입력해주세요."); return; }
    if (!full && (!Number.isInteger(amt) || amt < 1 || amt > d.remaining)) { setErr(`취소 금액은 1원 ~ 남은 결제 금액(${won(d.remaining)})으로 입력해주세요.`); return; }
    const value = full ? d.remaining : amt;
    if (!window.confirm(`${won(value)}을 취소할까요? 결제자 카드로 환불됩니다.`)) return;
    setErr(""); setBusy(true);
    const r = await api<{ link: Detail }>({ action: "cancel", id: d.id, full, amount: full ? undefined : value, reason: reason.trim() });
    setBusy(false);
    if (!r.ok) { setErr(r.data.error || "취소하지 못했습니다."); return; }
    onDone(r.data.link);
  };

  return (
    <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/50 p-4">
      <p className="mb-3 text-sm font-black text-red-800">{full ? "전액 취소" : "부분 취소"} · 남은 결제 금액 {won(d.remaining)}</p>
      {q ? (
        <p className="mb-3 rounded-xl bg-white p-3 text-sm font-black text-brand-black break-keep">오늘 기준 규정: {quoteLabel(q)} → {won(q.amount)}</p>
      ) : (
        <p className="mb-3 rounded-xl bg-white p-3 text-sm font-bold text-gray-600">이용일을 알 수 없어 규정 금액을 계산하지 못했습니다.</p>
      )}
      {!full && (
        <Field label="취소 금액 (원)" required>
          <input className={input} value={amount} inputMode="numeric" onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
      )}
      <div className="mt-3">
        <Field label="취소 사유" required hint={(full ? d.remaining !== q?.amount : differs) && q ? "규정 금액과 다르게 취소합니다. 사유에 그 이유를 적어주세요." : undefined}>
          <input className={input} value={reason} maxLength={PAYLINK_LIMITS.cancelReasonMax} onChange={e => setReason(e.target.value)} placeholder="예: 이용일 4일 전 취소 요청 (규정 80%)" />
        </Field>
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-800 break-keep">{err}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${btn} bg-white text-gray-700 hover:bg-gray-100`}>닫기</button>
        <button type="button" onClick={run} disabled={busy} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
          {busy && <Loader2 size={16} className="animate-spin" />}{won(full ? d.remaining : amt)} 취소하기
        </button>
      </div>
    </div>
  );
}

function DetailModal({ id, onClose, onChanged, onEdit, justCreated }: { id: number; onClose: () => void; onChanged: () => void; onEdit: (d: Detail) => void; justCreated: boolean }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(justCreated ? "결제 링크를 만들었습니다. [링크 복사]로 결제자에게 보내주세요." : "");
  const [busy, setBusy] = useState("");
  const [cancelMode, setCancelMode] = useState<"" | "full" | "partial">("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api<{ link: Detail }>(undefined, `?id=${id}`);
      if (!alive) return;
      if (r.ok) setD(r.data.link); else setErr(r.data.error || "불러오지 못했습니다.");
    })();
    return () => { alive = false; };
  }, [id]);

  const update = (next: Detail, note = "") => { setD(next); setMsg(note); onChanged(); };
  const act = async (action: string, confirmText?: string) => {
    if (!d) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action); setErr(""); setMsg("");
    const r = await api<{ link: Detail }>({ action, id: d.id });
    setBusy("");
    if (!r.ok) { setErr(r.data.error || "처리하지 못했습니다."); return; }
    update(r.data.link, action === "send_sms" ? "결제 요청 문자를 보냈습니다." : action === "stop" ? "링크를 중지했습니다." : "링크를 다시 열었습니다.");
  };
  const copy = async () => {
    if (!d) return;
    setMsg((await copyText(d.url)) ? "링크를 복사했습니다." : "복사하지 못했습니다. 주소를 직접 선택해 복사해주세요.");
  };

  return (
    <AdminModal title={d ? `결제 링크 #${d.id}` : "결제 링크"} onClose={onClose} wide>
      {!d && !err && <div className="flex justify-center py-12 text-gray-400"><Loader2 className="animate-spin" /></div>}
      {err && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 break-keep">{err}</p>}
      {d && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge state={d.state} />
            <span className="text-base font-black text-brand-black break-keep">{d.title}</span>
            <span className="text-base font-black text-brand-black">{won(d.amount)}</span>
          </div>
          {msg && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 break-keep">{msg}</p>}

          <div className="mb-4 rounded-2xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-black text-gray-500">결제 링크</p>
            <p className="mb-2 select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-gray-700">{d.url}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copy} className={`${btn} bg-brand-black text-white hover:bg-gray-800`}><Copy size={15} />링크 복사</button>
              {d.state === "open" && d.payerPhone && (
                <button type="button" disabled={busy !== ""} onClick={() => act("send_sms", `${formatPhoneKR(d.payerPhone)}로 결제 요청 문자를 보낼까요? (실제 문자가 발송됩니다)`)}
                  className={`${btn} bg-white text-brand-black ring-1 ring-gray-200 hover:bg-gray-100`}>
                  {busy === "send_sms" ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}문자로 보내기
                </button>
              )}
              {d.state === "open" && (
                <>
                  <button type="button" disabled={busy !== "" || d.inProgress} onClick={() => onEdit(d)} className={`${btn} bg-white text-brand-black ring-1 ring-gray-200 hover:bg-gray-100`}><Pencil size={15} />수정</button>
                  <button type="button" disabled={busy !== ""} onClick={() => act("stop", "이 링크로는 결제할 수 없게 됩니다. 중지할까요?")} className={`${btn} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100`}><Pause size={15} />링크 중지</button>
                </>
              )}
              {d.state === "stopped" && (
                <button type="button" disabled={busy !== "" || !d.canReopen} onClick={() => act("reopen")}
                  className={`${btn} bg-white text-brand-black ring-1 ring-gray-200 hover:bg-gray-100`}><Play size={15} />다시 열기</button>
              )}
              {(d.state === "paid" || d.state === "partial_cancelled") && (
                <>
                  <button type="button" onClick={() => setCancelMode("full")} className={`${btn} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}><RotateCcw size={15} />전액 취소</button>
                  <button type="button" onClick={() => setCancelMode("partial")} className={`${btn} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}>부분 취소</button>
                </>
              )}
            </div>
            {d.state === "open" && d.inProgress && <p className="mt-2 text-xs font-bold text-amber-700">결제가 진행 중이라 지금은 수정할 수 없습니다 (최대 10분).</p>}
            {d.state === "stopped" && !d.canReopen && <p className="mt-2 text-xs font-bold text-gray-500">결제 기한이 지나 다시 열 수 없습니다. 새 링크를 만들어주세요.</p>}
            {d.state === "open" && !d.payerPhone && <p className="mt-2 text-xs font-bold text-gray-500">결제자 연락처를 넣으면 [문자로 보내기]를 쓸 수 있습니다.</p>}
          </div>

          {cancelMode && (
            <CancelPanel key={cancelMode} d={d} full={cancelMode === "full"} onClose={() => setCancelMode("")}
              onDone={next => { setCancelMode(""); update(next, "취소했습니다. 결제자 카드로 환불됩니다."); }} />
          )}

          <dl className="divide-y divide-gray-100">
            <InfoRow label="이용일">{formatUseDate(d.useDate)}</InfoRow>
            <InfoRow label="이용 시간·장소">{d.useInfo || "-"}</InfoRow>
            <InfoRow label="결제 기한">{shortDateTime(d.expiresAt)}</InfoRow>
            <InfoRow label="미리 채운 결제자">{d.payerName || "-"}{d.payerPhone ? ` · ${formatPhoneKR(d.payerPhone)}` : ""}</InfoRow>
            <InfoRow label="추가 안내"><span className="whitespace-pre-line">{d.notice || "-"}</span></InfoRow>
            <InfoRow label="관리자 메모"><span className="whitespace-pre-line">{d.adminMemo || "-"}</span></InfoRow>
            <InfoRow label="만든 사람">{d.createdBy} · {shortDateTime(d.createdAt)}{d.updatedAt && d.updatedAt !== d.createdAt ? ` (고침 ${d.updatedBy} · ${shortDateTime(d.updatedAt)})` : ""}</InfoRow>
            {d.smsLog.length > 0 && (
              <InfoRow label="요청 문자">{d.smsLog.slice(-3).map((s, i) => <span key={i} className="block">{shortDateTime(s.at)} · {s.adminId} · {s.ok ? "발송" : "실패"}</span>)}</InfoRow>
            )}
          </dl>

          {d.payment && (
            <div className="mt-4 rounded-2xl border border-gray-100 p-4">
              <p className="mb-1 text-sm font-black">결제 정보</p>
              <dl className="divide-y divide-gray-100">
                <InfoRow label="결제 수단">{d.payment.method}</InfoRow>
                <InfoRow label="승인 일시">{shortDateTime(d.payment.approvedAt)}</InfoRow>
                <InfoRow label="결제자">{d.payment.payerName} · {formatPhoneKR(d.payment.payerPhone)}</InfoRow>
                <InfoRow label="결제 금액">{won(d.payment.amount)}{d.cancelledAmount > 0 ? ` (취소 ${won(d.cancelledAmount)} · 남은 금액 ${won(d.remaining)})` : ""}</InfoRow>
                <InfoRow label="결제 완료 문자">{d.payerSms === "sent" ? "발송" : d.payerSms === "fail" ? "실패" : "-"}</InfoRow>
                {d.payment.receiptUrl && (
                  <InfoRow label="영수증"><a href={d.payment.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-brand-point-ink underline">영수증 보기</a></InfoRow>
                )}
                {d.refundPolicy && (
                  <InfoRow label="동의한 환불 규정">{d.refundPolicy.map(p => `${p.when} ${p.label}`).join(" / ")}</InfoRow>
                )}
              </dl>
            </div>
          )}

          {d.cancels.length > 0 && (
            <div className="mt-4 rounded-2xl border border-gray-100 p-4">
              <p className="mb-2 text-sm font-black">취소 이력</p>
              <ul className="space-y-2 text-sm">
                {d.cancels.map((c, i) => (
                  <li key={i} className="rounded-xl bg-gray-50 p-3">
                    <p className="font-black">{won(c.amount)} · {shortDateTime(c.at)} · {c.adminId}</p>
                    <p className="font-medium text-gray-600 break-keep">{c.reason}{c.note ? ` (${c.note})` : ""}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AdminModal>
  );
}

export default function PaylinkAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState(true);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [month, setMonth] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [form, setForm] = useState<{ initial: Form; editId: number | null } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api<{ links: Row[]; summary: Summary; ready: boolean; reason: string }>();
      if (!alive) return;
      setLoading(false);
      if (!r.ok) { setErr(r.data.error || "목록을 불러오지 못했습니다."); return; }
      setErr("");
      setRows(r.data.links); setSummary(r.data.summary); setReady(r.data.ready); setReason(r.data.reason);
    })();
    return () => { alive = false; };
  }, [tick]);

  const months = useMemo(() => Array.from(new Set(rows.map(r => r.createdAt.slice(0, 7)))).sort().reverse(), [rows]);
  const filtered = rows.filter(r => {
    const f = STATUS_FILTERS.find(x => x.key === statusFilter);
    if (f?.states && !f.states.includes(r.state)) return false;
    if (month !== "all" && !r.createdAt.startsWith(month)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 size={20} className="text-brand-point-ink" />
          <h2 className="text-lg font-black md:text-xl">결제 링크</h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className={`${btn} bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100`} aria-label="새로고침"><RefreshCw size={15} /></button>
          <button type="button" disabled={!ready} onClick={() => setForm({ initial: emptyForm(), editId: null })} className={`${btn} bg-brand-black text-white hover:bg-gray-800`}>
            <Plus size={16} />새 결제 링크 만들기
          </button>
        </div>
      </div>

      {!ready && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 break-keep">
          <ShieldAlert size={18} className="mt-0.5 flex-shrink-0" />{reason || "결제 링크를 만들 수 없는 상태입니다."}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-500">이번 달 결제 완료</p>
            <p className="mt-1 text-lg font-black">{summary.paidCount}건</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-500">이번 달 결제 금액</p>
            <p className="mt-1 text-lg font-black">{won(summary.paidAmount)}</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-white p-4 shadow-sm md:col-span-1">
            <p className="text-xs font-bold text-gray-500">이번 달 취소 금액</p>
            <p className="mt-1 text-lg font-black text-red-600">{won(summary.cancelAmount)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} type="button" onClick={() => setStatusFilter(f.key)}
              className={`min-h-11 rounded-full px-3 text-xs font-black md:min-h-0 md:h-8 ${statusFilter === f.key ? "bg-brand-black text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}>{f.label}</button>
          ))}
        </div>
        <select value={month} onChange={e => setMonth(e.target.value)} aria-label="만든 달"
          className="min-h-11 rounded-lg border border-gray-200 bg-white px-2 text-xs font-bold md:min-h-0 md:h-8">
          <option value="all">전체 기간</option>
          {months.map(m => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}
        </select>
      </div>

      {loading && <div className="flex justify-center py-10 text-gray-400"><Loader2 className="animate-spin" /></div>}
      {err && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{err}</p>}
      {!loading && !err && filtered.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-sm font-bold text-gray-500">결제 링크가 없습니다.</p>}

      {filtered.length > 0 && (
        <>
          {/* PC 표 */}
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {["번호", "결제명", "금액", "상태", "결제 기한", "만든 날짜", "결제 일시"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} onClick={() => { setJustCreated(false); setOpenId(r.id); }} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-black text-gray-500">#{r.id}</td>
                    <td className="max-w-[18rem] truncate px-3 py-2.5 font-black">{r.title}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold">{won(r.amount)}{r.cancelledAmount > 0 && <span className="block text-xs text-red-600">취소 {won(r.cancelledAmount)}</span>}</td>
                    <td className="px-3 py-2.5"><Badge state={r.state} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{shortDateTime(r.expiresAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{r.createdAt.slice(0, 10)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{r.paidAt ? shortDateTime(r.paidAt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 모바일 카드 */}
          <ul className="space-y-2 md:hidden">
            {filtered.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => { setJustCreated(false); setOpenId(r.id); }} className="w-full rounded-2xl bg-white p-4 text-left shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-gray-500">#{r.id}</span>
                    <Badge state={r.state} />
                  </div>
                  <p className="font-black break-keep">{r.title}</p>
                  <p className="mt-1 text-base font-black">{won(r.amount)}{r.cancelledAmount > 0 && <span className="ml-2 text-xs text-red-600">취소 {won(r.cancelledAmount)}</span>}</p>
                  <p className="mt-1 text-xs font-bold text-gray-500">기한 {shortDateTime(r.expiresAt)} · 만든 날 {r.createdAt.slice(0, 10)}{r.paidAt ? ` · 결제 ${shortDateTime(r.paidAt)}` : ""}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {form && (
        <LinkForm initial={form.initial} editId={form.editId} onClose={() => setForm(null)}
          onSaved={d => { const created = form.editId === null; setForm(null); reload(); setJustCreated(created); setOpenId(d.id); }} />
      )}
      {openId !== null && !form && (
        <DetailModal key={openId} id={openId} justCreated={justCreated} onClose={() => { setOpenId(null); setJustCreated(false); }} onChanged={reload}
          onEdit={d => setForm({
            editId: d.id,
            initial: {
              title: d.title, amount: String(d.amount), useDate: d.useDate, useInfo: d.useInfo, payerName: d.payerName,
              payerPhone: d.payerPhone, notice: d.notice, expiresAt: deadlineToInput(d.expiresAt), adminMemo: d.adminMemo,
            },
          })} />
      )}
    </div>
  );
}
