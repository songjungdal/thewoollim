"use client";

/**
 * 관리자 [인증 심사] 탭 (docs/specs/photo-job-verification.md 4-1, 서버: api/admin/verifications.php).
 *  - [사진 심사 필수] 스위치: 켜면 승인 사진이 없는 회원은 결제할 수 없다(테스트 회원 제외). 기본 꺼짐.
 *    서버가 사진을 저장할 수 없는 상태면 켤 수 없다.
 *  - 목록: 심사 중 먼저, 오래된 순. 필터: 사진/직업, 상태
 *  - 상세: 사진 2장(이전 승인 사진이 있으면 나란히) · 직업 서류와 국세청 확인 결과 → [승인] / [반려]
 *    사진·서류는 api/admin/verification-file.php 로만 불러온다(열람은 활동 로그에 남는다).
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, Camera, CheckCircle2, Loader2, RefreshCw, ShieldAlert, X, XCircle } from "lucide-react";

const API = "/api/admin/verifications.php";
export const verificationFileUrl = (id: number, slot: 1 | 2) => `/api/admin/verification-file.php?id=${id}&slot=${slot}`;

type BizCheck = { result: "match" | "mismatch" | "unavailable"; message: string; status?: string | null; biz_no_masked?: string; open_date?: string; checked_at?: string };
type Row = {
  id: number; kind: "photo" | "job"; status: string; userId: number; email: string; name: string; gender: string;
  age: number | null; maritalStatus: string; joinedAt: string; attendCount: number; profileJob: string;
  createdAt: string; reviewedAt: string | null; reviewedBy: string | null; rejectReason: string | null;
  jobType: string | null; docKind: string | null; jobLabel: string | null; bizCheck: BizCheck | null;
  fileCount: number; filesDeletedAt: string | null; prevApprovedId: number | null;
};
type Settings = { photoRequired: boolean; switchOn: boolean; ready: boolean; reason: string; updatedBy: string | null; updatedAt: string | null };

const STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: "심사 중", tone: "bg-amber-100 text-amber-800" },
  approved: { label: "승인", tone: "bg-emerald-100 text-emerald-800" },
  reverify: { label: "재인증 필요", tone: "bg-orange-100 text-orange-800" },
  rejected: { label: "반려", tone: "bg-red-100 text-red-700" },
  superseded: { label: "대체됨", tone: "bg-gray-100 text-gray-600" },
};
const READY_REASON: Record<string, string> = {
  private_data_dir_missing: "웹 루트 밖 데이터 폴더가 없음",
  image_engine_missing: "서버 PHP 에 이미지 처리 기능(GD·Imagick)이 없음",
};
const OTHER = "__other__";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black transition-colors disabled:opacity-50 min-h-11 md:min-h-0 md:h-10";

function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, tone: "bg-gray-100 text-gray-600" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black ${m.tone}`}>{m.label}</span>;
}

/** 관리자 화면 공용 이미지 창 */
export function AdminModal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-0 md:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className={`flex h-[100dvh] w-full flex-col overflow-y-auto bg-white p-4 md:h-auto md:max-h-[92vh] md:rounded-3xl md:p-7 ${wide ? "md:max-w-4xl" : "md:max-w-lg"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-lg font-black text-brand-black md:text-xl break-keep">{title}</h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="-m-2 p-2 text-gray-500 hover:text-brand-black"><X size={22} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Shot({ src, label }: { src: string; label: string }) {
  const [err, setErr] = useState(false);
  return (
    <figure className="min-w-0">
      {err ? (
        <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-gray-100 text-xs font-bold text-gray-500">파일 없음</div>
      ) : (
        <a href={src} target="_blank" rel="noopener noreferrer" title="새 창에서 크게 보기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} onError={() => setErr(true)} className="aspect-[3/4] w-full rounded-xl bg-gray-100 object-contain" />
        </a>
      )}
      <figcaption className="mt-1 text-xs font-bold text-gray-500">{label}</figcaption>
    </figure>
  );
}

function ReviewDetail({ row, reasons, onDone, onClose }: {
  row: Row;
  reasons: { photo: string[]; job: string[] };
  onDone: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"" | "reject">("");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [label, setLabel] = useState(row.profileJob);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = row.status === "pending";
  const reasonList = row.kind === "photo" ? reasons.photo : reasons.job;

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const r = await fetch(API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (!d?.ok) { setError(String(d?.error || "처리하지 못했습니다.")); return; }
      onDone();
    } catch {
      setError("네트워크 오류로 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const approve = () => {
    if (row.kind === "job" && !label.trim()) { setError("표시 직업을 입력해주세요."); return; }
    if (!window.confirm(`${row.name}님의 ${row.kind === "photo" ? "사진 심사" : "직업 인증"}을 승인할까요?\n승인 문자가 발송됩니다.`)) return;
    send({ action: "approve", id: row.id, jobLabel: row.kind === "job" ? label.trim() : undefined });
  };
  const reject = () => {
    const r = reason === OTHER ? other.trim() : reason;
    if (!r) { setError("반려 사유를 선택하거나 입력해주세요."); return; }
    if (!window.confirm(`${row.name}님의 ${row.kind === "photo" ? "사진" : "직업 서류"}을 반려할까요?\n사유: ${r}\n반려 문자가 발송됩니다.`)) return;
    send({ action: "reject", id: row.id, reason: r });
  };

  return (
    <AdminModal title={`${row.kind === "photo" ? "사진 심사" : "직업 인증"} — ${row.name}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <Badge status={row.status} />
        <span>{row.gender || "-"} · {row.age ?? "-"}세 · {row.maritalStatus || "혼인여부 미입력"}</span>
        <span className="text-gray-500">제출 {row.createdAt}</span>
        {row.reviewedAt && <span className="text-gray-500">처리 {row.reviewedAt} ({row.reviewedBy})</span>}
      </div>
      {row.rejectReason && <p className="mt-2 text-sm font-bold text-red-700">반려 사유: {row.rejectReason}</p>}

      {row.kind === "photo" ? (
        <div className={`mt-4 grid gap-4 ${row.prevApprovedId ? "md:grid-cols-2" : ""}`}>
          <div>
            <p className="mb-2 text-sm font-black text-brand-black">{pending ? "심사할 사진" : "제출 사진"}</p>
            {row.fileCount > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <Shot src={verificationFileUrl(row.id, 1)} label="1. 얼굴 정면 사진" />
                <Shot src={verificationFileUrl(row.id, 2)} label="2. 자유 사진" />
              </div>
            ) : <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">파일이 삭제되었습니다 ({row.filesDeletedAt}).</p>}
          </div>
          {row.prevApprovedId && (
            <div>
              <p className="mb-2 text-sm font-black text-brand-black">지금 승인된 사진</p>
              <div className="grid grid-cols-2 gap-3">
                <Shot src={verificationFileUrl(row.prevApprovedId, 1)} label="1. 얼굴 정면 사진" />
                <Shot src={verificationFileUrl(row.prevApprovedId, 2)} label="2. 자유 사진" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            {row.fileCount > 0 ? (
              <a href={verificationFileUrl(row.id, 1)} target="_blank" rel="noopener noreferrer" title="새 창에서 크게 보기">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={verificationFileUrl(row.id, 1)} alt="직업 증빙 서류" className="max-h-[60vh] w-full rounded-xl bg-gray-100 object-contain" />
              </a>
            ) : <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">서류 파일은 처리와 함께 삭제되었습니다{row.filesDeletedAt ? ` (${row.filesDeletedAt})` : ""}.</p>}
          </div>
          <dl className="grid h-fit grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
            <dt className="text-gray-500">구분</dt><dd className="font-bold">{row.jobType ?? "-"}</dd>
            <dt className="text-gray-500">서류 종류</dt><dd className="font-bold">{row.docKind ?? "-"}</dd>
            <dt className="text-gray-500">프로필 직업</dt><dd className="font-bold break-keep">{row.profileJob || "-"}</dd>
            {row.jobLabel && <><dt className="text-gray-500">표시 직업</dt><dd className="font-bold">{row.jobLabel}</dd></>}
            {row.bizCheck && (
              <>
                <dt className="text-gray-500">국세청 확인</dt>
                <dd className={`font-bold break-keep ${row.bizCheck.result === "match" ? "text-emerald-700" : row.bizCheck.result === "mismatch" ? "text-red-700" : "text-gray-700"}`} data-testid="biz-check">
                  {row.bizCheck.message}
                  <span className="mt-0.5 block text-xs font-medium text-gray-500">사업자번호 {row.bizCheck.biz_no_masked || "-"} · 개업일 {row.bizCheck.open_date || "-"}</span>
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {pending && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          {row.kind === "job" && mode !== "reject" && (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-black text-brand-black">표시 직업 (필수 · 회사명은 넣지 않음)</span>
              <input type="text" value={label} maxLength={30} onChange={e => setLabel(e.target.value)} placeholder="예: IT 개발자"
                className="h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point md:text-sm" data-testid="job-label" />
            </label>
          )}
          {mode === "reject" && (
            <div className="mb-3 space-y-2">
              <p className="text-sm font-black text-brand-black">반려 사유</p>
              <div className="flex flex-wrap gap-2">
                {[...reasonList, OTHER].map(r => (
                  <label key={r} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-bold md:min-h-0 md:py-2 ${reason === r ? "border-brand-black bg-gray-50" : "border-gray-200"}`}>
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-brand-point" />
                    {r === OTHER ? "기타(직접 입력)" : r}
                  </label>
                ))}
              </div>
              {reason === OTHER && (
                <input type="text" value={other} maxLength={100} onChange={e => setOther(e.target.value)} placeholder="회원에게 문자로 보낼 사유"
                  className="h-11 w-full rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point md:text-sm" data-testid="reject-other" />
              )}
            </div>
          )}
          {error && <p className="mb-3 text-sm font-bold text-red-600" role="alert">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {mode === "reject" ? (
              <>
                <button type="button" onClick={() => { setMode(""); setError(""); }} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>돌아가기</button>
                <button type="button" onClick={reject} disabled={busy} className={`${btn} bg-red-600 text-white hover:bg-red-700`} data-testid="reject-confirm">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} 반려하기
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => { setMode("reject"); setError(""); }} disabled={busy} className={`${btn} border border-red-300 bg-white text-red-600 hover:bg-red-50`} data-testid="reject">
                  <XCircle size={16} /> 반려
                </button>
                <button type="button" onClick={approve} disabled={busy} className={`${btn} bg-brand-black text-white hover:bg-brand-point hover:text-black`} data-testid="approve">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} 승인
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </AdminModal>
  );
}

export default function VerificationReview({ onChanged }: { onChanged?: () => void }) {
  const [kind, setKind] = useState<"all" | "photo" | "job">("all");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [reasons, setReasons] = useState<{ photo: string[]; job: string[] }>({ photo: [], job: [] });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [switchBusy, setSwitchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}?kind=${kind}&status=${status}`, { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!d?.ok) { setError(String(d?.error || "불러오지 못했습니다.")); return; }
      setRows(d.rows as Row[]);
      setSettings(d.settings as Settings);
      setReasons(d.rejectReasons ?? { photo: [], job: [] });
      setPendingCount(Number(d.pendingCount) || 0);
    } catch {
      setError("네트워크 오류로 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => { void load(); }, [load]);

  const toggleRequired = async () => {
    if (!settings) return;
    const on = !settings.switchOn;
    if (!window.confirm(on
      ? "사진 심사 필수를 켤까요?\n켜면 사진이 승인되지 않은 회원은 파티를 결제할 수 없습니다(테스트 회원 제외).\n회원 공지 후 켜주세요."
      : "사진 심사 필수를 끌까요?\n끄면 사진 심사 없이 결제할 수 있습니다.")) return;
    setSwitchBusy(true);
    try {
      const r = await fetch(API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setRequired", on }) });
      const d = await r.json().catch(() => null);
      if (!d?.ok) { alert(d?.error || "저장하지 못했습니다."); return; }
      setSettings(d.settings as Settings);
    } finally {
      setSwitchBusy(false);
    }
  };

  const sel = "flex-1 md:flex-none px-3 py-2 rounded-lg border border-gray-200 text-base md:text-sm font-medium bg-white min-h-11 md:min-h-0 md:h-10";

  return (
    <section data-testid="verification-review">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-5">
        <div>
          <h2 className="text-xl font-black md:text-2xl">인증 심사</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">심사 대기 {pendingCount}건 · 표시 {rows.length}건</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 md:flex md:w-auto md:items-center md:gap-3">
          <label className="flex items-center gap-2">
            <span className="w-14 flex-shrink-0 text-[13px] font-bold text-gray-500 md:w-auto md:text-sm">구분</span>
            <select aria-label="구분 필터" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className={sel}>
              <option value="all">전체</option><option value="photo">사진</option><option value="job">직업</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-14 flex-shrink-0 text-[13px] font-bold text-gray-500 md:w-auto md:text-sm">상태</span>
            <select aria-label="상태 필터" value={status} onChange={e => setStatus(e.target.value as typeof status)} className={sel}>
              <option value="pending">심사 중</option><option value="approved">승인</option><option value="rejected">반려</option><option value="all">전체(대체됨 포함)</option>
            </select>
          </label>
          <button type="button" onClick={() => { void load(); onChanged?.(); }} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
            <RefreshCw size={14} /> 새로고침
          </button>
        </div>
      </div>

      {/* 사진 심사 필수 스위치 */}
      {settings && (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 md:p-5 ${settings.photoRequired ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}`} data-testid="photo-required-card">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-black text-brand-black">
              <ShieldAlert size={18} className="text-brand-point-ink" /> 사진 심사 필수
              <span className={`rounded-full px-2 py-0.5 text-xs font-black ${settings.photoRequired ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"}`} data-testid="photo-required-state">
                {settings.photoRequired ? "켜짐" : "꺼짐"}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-gray-600 break-keep">켜면 사진이 승인되지 않은 회원은 파티 결제(카드·무통장)가 막힙니다. 테스트 회원은 제외. 이미 결제된 예약에는 영향 없음.</p>
            {!settings.ready && (
              <p className="mt-1 text-[13px] font-bold text-red-700 break-keep">지금은 켤 수 없습니다 — {READY_REASON[settings.reason] ?? settings.reason}. 회원 사진 등록도 막혀 있습니다.</p>
            )}
            {settings.updatedAt && <p className="mt-1 text-xs text-gray-500">마지막 변경: {settings.updatedAt} ({settings.updatedBy})</p>}
          </div>
          <button type="button" onClick={toggleRequired} disabled={switchBusy || (!settings.switchOn && !settings.ready)}
            className={`${btn} ${settings.switchOn ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" : "bg-brand-black text-white hover:bg-brand-point hover:text-black"}`}
            data-testid="photo-required-toggle">
            {settings.switchOn ? "끄기" : "켜기"}
          </button>
        </div>
      )}

      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-point-ink" size={28} aria-label="불러오는 중" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">해당하는 기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2.5" data-testid="verification-rows">
          {rows.map(r => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)}
                className="flex w-full flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-brand-point md:flex-row md:items-center md:gap-4"
                data-testid="verification-row">
                <span className="flex items-center gap-2 md:w-36 md:flex-shrink-0">
                  {r.kind === "photo" ? <Camera size={16} className="text-brand-point-ink" /> : <BadgeCheck size={16} className="text-brand-point-ink" />}
                  <span className="text-sm font-black">{r.kind === "photo" ? "사진" : "직업"}</span>
                  <Badge status={r.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-base font-black text-brand-black">{r.name}</span>
                  <span className="ml-2 text-[13px] text-gray-600">{[r.gender, r.age != null ? `${r.age}세` : "", r.maritalStatus].filter(Boolean).join(" · ")}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">가입 {r.joinedAt || "-"} · 참가 이력 {r.attendCount}회{r.kind === "job" && r.docKind ? ` · ${r.jobType} / ${r.docKind}` : ""}</span>
                </span>
                <span className="text-xs text-gray-500 tabular-nums md:text-right">제출 {r.createdAt}{r.reviewedAt ? <span className="block">처리 {r.reviewedAt}</span> : null}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ReviewDetail row={open} reasons={reasons} onClose={() => setOpen(null)}
          onDone={() => { setOpen(null); void load(); onChanged?.(); }} />
      )}
    </section>
  );
}
