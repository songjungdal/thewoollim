"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, BadgeCheck, Camera, CheckCircle2, ChevronDown, Clock, ImagePlus, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../context/AuthContext";
import {
  DOC_KINDS, JOB_CONSENT, JOB_STATUS_LABEL, JOB_TYPES, PHOTO_CONSENT, PHOTO_STATUS_LABEL,
  fetchVerificationState, isSafeReturnPath, toUploadJpeg,
  type JobType, type VerificationState,
} from "../lib/verification";

const LOGIN_URL = "/login/?redirect=/verification/";

type Picked = { blob: Blob; url: string };

/** 고른 사진 → 브라우저에서 JPEG 로 변환. 실패하면 오류 문구 */
async function pickImage(file: File | undefined): Promise<Picked | string | null> {
  if (!file) return null;
  if (file.size > 30 * 1024 * 1024) return "사진이 너무 큽니다. 다른 사진을 골라주세요.";
  const blob = await toUploadJpeg(file);
  if (!blob) return "이 사진은 열 수 없어요. JPG로 저장해서 올려주세요.";
  if (blob.size > 10 * 1024 * 1024) return "사진은 10MB 이하만 올릴 수 있어요.";
  return { blob, url: URL.createObjectURL(blob) };
}

function StatusChip({ tone, children }: { tone: "gray" | "amber" | "green" | "red"; children: ReactNode }) {
  const cls = {
    gray: "bg-gray-100 text-gray-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-700",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-black ${cls}`}>{children}</span>;
}

function ConsentRow({ consent, checked, onChange, testId }: {
  consent: typeof PHOTO_CONSENT;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const required = consent.title.includes("필수");
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2.5 text-sm font-bold text-gray-800 break-keep">
          <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 flex-shrink-0 accent-brand-point" data-testid={testId} />
          <span><span className={required ? "text-brand-point-ink" : "text-gray-500"}>[{required ? "필수" : "선택"}]</span> {consent.title.replace(/ \((필수|선택)\)$/, "")}</span>
        </label>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="inline-flex min-h-11 flex-shrink-0 items-center gap-0.5 px-1 text-[13px] font-bold text-gray-500 underline-offset-2 hover:text-brand-black hover:underline">
          보기 <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="border-t border-gray-100 px-3.5 py-3 text-[13px] leading-relaxed text-gray-600">
          <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
            {consent.items.map(([k, v]) => (
              <div key={k} className="contents"><dt className="font-bold text-gray-700">{k}</dt><dd className="break-keep">{v}</dd></div>
            ))}
          </dl>
          <ul className="mt-2 space-y-1">
            {consent.notes.map(n => <li key={n} className="break-keep">· {n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 사진 한 칸 — 고른 사진 미리보기 또는 등록된 사진 */
function PhotoSlot({ n, title, desc, picked, disabled, onPick }: {
  n: 1 | 2;
  title: string;
  desc: string;
  picked: Picked | null;
  disabled: boolean;
  onPick: (f: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = picked?.url ?? null;
  return (
    <div className="min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="group relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-brand-point disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={`${n}번 ${title} ${src ? "바꾸기" : "선택"}`}
        data-testid={`photo-slot-${n}`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${n}번 ${title} 미리보기`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-2 text-center text-gray-500">
            <ImagePlus size={28} aria-hidden />
            <span className="text-xs font-bold">사진 선택</span>
          </span>
        )}
        {src && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">바꾸기</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
        data-testid={`photo-input-${n}`}
        onChange={e => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <p className="mt-2 text-sm font-black text-brand-black">{n}. {title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-gray-500 break-keep">{desc}</p>
    </div>
  );
}

export default function VerificationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from") ?? "";
  const from = isSafeReturnPath(fromParam) ? fromParam : "";
  const { mounted, isLoggedIn, verifySession } = useAuth();

  const [state, setState] = useState<VerificationState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [stamp, setStamp] = useState(0);   // 미리보기 주소 새로고침용

  // 사진
  const [p1, setP1] = useState<Picked | null>(null);
  const [p2, setP2] = useState<Picked | null>(null);
  const [agree, setAgree] = useState(false);
  const [photoReplace, setPhotoReplace] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoDone, setPhotoDone] = useState(false);

  // 직업
  const [jobType, setJobType] = useState<JobType | "">("");
  const [docKind, setDocKind] = useState("");
  const [doc, setDoc] = useState<Picked | null>(null);
  const [bizNo, setBizNo] = useState("");
  const [openDate, setOpenDate] = useState("");
  const [agreeJob, setAgreeJob] = useState(false);
  const [jobReplace, setJobReplace] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState("");
  const [jobDone, setJobDone] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  // 로그인 확인 → 상태 불러오기
  useEffect(() => {
    if (!mounted) return;
    if (!isLoggedIn) { router.replace(LOGIN_URL); return; }
    let cancelled = false;
    (async () => {
      if (!(await verifySession())) { if (!cancelled) router.replace(LOGIN_URL); return; }
      const s = await fetchVerificationState();
      if (cancelled) return;
      setState(s);
      setLoadError(!s);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [mounted, isLoggedIn, verifySession, router]);

  // 미리보기 주소 정리
  useEffect(() => () => { if (p1) URL.revokeObjectURL(p1.url); }, [p1]);
  useEffect(() => () => { if (p2) URL.revokeObjectURL(p2.url); }, [p2]);
  useEffect(() => () => { if (doc) URL.revokeObjectURL(doc.url); }, [doc]);

  const refresh = async () => {
    const s = await fetchVerificationState();
    if (s) setState(s);
    setStamp(Date.now());
  };

  const onPickPhoto = async (n: 1 | 2, f: File | undefined) => {
    setPhotoError("");
    const r = await pickImage(f);
    if (typeof r === "string") { setPhotoError(r); return; }
    if (r) (n === 1 ? setP1 : setP2)(r);
  };

  const onPickDoc = async (f: File | undefined) => {
    setJobError("");
    const r = await pickImage(f);
    if (typeof r === "string") { setJobError(r); return; }
    if (r) setDoc(r);
  };

  const submitPhoto = async () => {
    if (!p1 || !p2 || !agree || photoBusy) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const fd = new FormData();
      fd.append("photo1", p1.blob, "photo1.jpg");
      fd.append("photo2", p2.blob, "photo2.jpg");
      fd.append("agree", "1");
      const r = await fetch("/api/verification/photo.php", { method: "POST", body: fd, credentials: "include", cache: "no-store" });
      if (r.status === 401) { router.replace(LOGIN_URL); return; }
      const d = await r.json().catch(() => null);
      if (!d?.ok) { setPhotoError(String(d?.error || "등록하지 못했습니다. 잠시 후 다시 시도해주세요.")); return; }
      setP1(null); setP2(null); setAgree(false); setPhotoReplace(false); setPhotoDone(true);
      await refresh();
    } catch {
      setPhotoError("네트워크 오류로 등록하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const bizDigits = bizNo.replace(/\D/g, "");
  const jobFormValid = !!jobType && !!docKind && !!doc && agreeJob
    && (jobType !== "business" || (bizDigits.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(openDate)));

  const submitJob = async () => {
    if (!jobFormValid || jobBusy || !doc) return;
    setJobBusy(true);
    setJobError("");
    try {
      const fd = new FormData();
      fd.append("type", jobType);
      fd.append("docKind", docKind);
      fd.append("file", doc.blob, "document.jpg");
      fd.append("agree", "1");
      if (jobType === "business") { fd.append("bizNo", bizDigits); fd.append("openDate", openDate); }
      const r = await fetch("/api/verification/job.php", { method: "POST", body: fd, credentials: "include", cache: "no-store" });
      if (r.status === 401) { router.replace(LOGIN_URL); return; }
      const d = await r.json().catch(() => null);
      if (!d?.ok) { setJobError(String(d?.error || "등록하지 못했습니다. 잠시 후 다시 시도해주세요.")); return; }
      setDoc(null); setAgreeJob(false); setBizNo(""); setOpenDate(""); setJobReplace(false); setJobDone(true);
      await refresh();
    } catch {
      setJobError("네트워크 오류로 등록하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setJobBusy(false);
    }
  };

  if (!mounted || !isLoggedIn || !loaded) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center" aria-busy="true">
          <Loader2 className="animate-spin text-brand-point-ink" size={36} aria-label="불러오는 중" />
        </main>
      </div>
    );
  }

  const photo = state?.photo;
  const job = state?.job;
  const ready = !!state?.ready;
  const showPhotoForm = !!photo && (photo.status === "none" || photo.status === "rejected" || photoReplace);
  const showJobForm = !!job && (job.status === "none" || job.status === "rejected" || job.status === "reverify" || jobReplace);
  const previewWhich = photo?.status === "pending" ? "pending" : "approved";
  const canGoBack = !!from && (!!photo?.approved || !!state?.testUser || !state?.photoRequired);

  return (
    <div className="flex min-h-screen flex-col bg-brand-lightgray">
      <Header />
      <main className="flex-1 pb-12 pt-5 lg:pb-16 lg:pt-10">
        <div className="mx-auto max-w-6xl px-4 lg:px-6">
          <Link href={from || "/mypage/"} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-gray-600 no-underline hover:text-brand-black">
            <ArrowLeft size={16} aria-hidden /> {from ? "신청하던 화면으로" : "마이페이지로"}
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight lg:text-3xl">사진 심사 · 직업 인증</h1>
          <p className="mt-1.5 text-sm text-gray-600 break-keep lg:text-base">
            어울림은 사진 심사를 통과한 분들만 참여하는 검증된 파티입니다. 한 번만 등록하면 모든 파티를 신청할 수 있어요.
          </p>

          {loadError && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">인증 상태를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>
          )}
          {state && !ready && (
            <p className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 break-keep" role="status" data-testid="verification-not-ready">
              지금은 사진 등록을 준비하고 있습니다. 잠시 후 다시 이용해주세요.
            </p>
          )}
          {canGoBack && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-sm font-bold text-emerald-800 break-keep">사진 심사가 승인되어 파티를 신청할 수 있어요.</p>
              <Link href={from} className="inline-flex min-h-11 items-center rounded-xl bg-brand-black px-4 text-sm font-black text-white no-underline hover:bg-brand-point hover:text-black">
                신청하던 화면으로 돌아가기
              </Link>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
            {/* ① 사진 심사 (필수) */}
            <section className="rounded-2xl bg-white p-5 lg:p-7" data-testid="photo-section" aria-labelledby="photo-title">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="photo-title" className="flex items-center gap-2 text-xl font-black tracking-tight lg:text-2xl">
                  <Camera size={20} className="text-brand-point-ink" aria-hidden /> 사진 2장 등록
                </h2>
                {photo && (
                  <StatusChip tone={photo.status === "approved" ? "green" : photo.status === "pending" ? "amber" : photo.status === "rejected" ? "red" : "gray"}>
                    <span data-testid="photo-status">{PHOTO_STATUS_LABEL[photo.status]}</span>
                  </StatusChip>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500 break-keep">운영진만 확인하며, 다른 참가자에게는 공개되지 않습니다.</p>

              {photo?.status === "rejected" && photo.rejectReason && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 break-keep" data-testid="photo-reject-reason">
                  반려 사유: {photo.rejectReason}
                  {photo.approved && <span className="mt-1 block font-medium">이전에 승인된 사진으로 계속 신청할 수 있어요.</span>}
                </p>
              )}

              {photoDone && photo?.status === "pending" && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 break-keep" role="status" data-testid="photo-done">
                  <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0" aria-hidden /> 심사 요청이 접수되었어요. 결과는 문자로 알려드릴게요.
                </p>
              )}

              {!showPhotoForm && photo && (photo.status === "pending" || photo.status === "approved") && (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-gray-700">
                    {photo.status === "pending" ? <><Clock size={16} className="text-amber-600" aria-hidden /> 심사 중인 사진</> : <><ShieldCheck size={16} className="text-emerald-600" aria-hidden /> 승인된 사진</>}
                    <span className="text-xs font-medium text-gray-500">(본인만 볼 수 있어요)</span>
                  </p>
                  {photo.status === "pending" && photo.approved && (
                    <p className="mt-1 text-xs text-gray-500 break-keep">심사 중에도 이전에 승인된 사진으로 파티를 신청할 수 있어요.</p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {[1, 2].map(n => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={n} src={`/api/verification/my-photo.php?slot=${n}&which=${previewWhich}&t=${stamp}`} alt={`등록한 ${n}번 사진`}
                        className="aspect-[3/4] w-full rounded-2xl bg-gray-100 object-cover" data-testid={`my-photo-${n}`} />
                    ))}
                  </div>
                  <button type="button" onClick={() => { setPhotoReplace(true); setPhotoDone(false); }} disabled={!ready}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-black text-gray-700 transition-colors hover:border-brand-black hover:text-brand-black disabled:opacity-50"
                    data-testid="photo-replace">
                    <RotateCcw size={16} aria-hidden /> 사진 다시 등록
                  </button>
                </div>
              )}

              {showPhotoForm && (
                <div className="mt-4">
                  {photoReplace && photo?.approved && (
                    <p className="mb-3 text-xs text-gray-500 break-keep">새 사진은 다시 심사합니다. 심사 중에도 지금 승인된 사진으로 신청할 수 있고, 새 사진이 반려되면 지금 사진을 계속 씁니다.</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 lg:gap-4">
                    <PhotoSlot n={1} title="얼굴 정면 사진" desc="본인 혼자, 얼굴 전체가 선명하게 보이는 사진" picked={p1} disabled={!ready || photoBusy} onPick={f => onPickPhoto(1, f)} />
                    <PhotoSlot n={2} title="자유 사진" desc="본인 얼굴이 보이는 일상·전신 사진" picked={p2} disabled={!ready || photoBusy} onPick={f => onPickPhoto(2, f)} />
                  </div>
                  <ul className="mt-4 space-y-1 rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600 break-keep">
                    <li>· 선글라스·마스크·모자로 얼굴을 가리지 않은 사진</li>
                    <li>· 단체 사진, 과도한 보정·필터 사진은 반려될 수 있어요</li>
                    <li>· 최근 1년 이내 사진을 권장해요</li>
                    <li>· 파티 당일 신분증 확인 때 등록하신 사진과 대조합니다</li>
                  </ul>
                  <div className="mt-4">
                    <ConsentRow consent={PHOTO_CONSENT} checked={agree} onChange={setAgree} testId="photo-agree" />
                  </div>
                  {photoError && <p className="mt-3 text-sm font-bold text-red-600 break-keep" role="alert" data-testid="photo-error">{photoError}</p>}
                  <div className="mt-4 flex flex-col gap-2">
                    <button type="button" onClick={submitPhoto} disabled={!ready || !p1 || !p2 || !agree || photoBusy}
                      className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand-black px-4 text-base font-black text-white transition-all hover:bg-brand-point hover:text-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                      data-testid="photo-submit">
                      {photoBusy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> 올리는 중…</> : "심사 요청하기"}
                    </button>
                    {photoReplace && (
                      <button type="button" onClick={() => { setPhotoReplace(false); setP1(null); setP2(null); setPhotoError(""); }}
                        className="min-h-11 text-sm font-bold text-gray-500 hover:text-brand-black">취소</button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ② 직업 인증 (선택) */}
            <section className="rounded-2xl bg-white p-5 lg:p-7" data-testid="job-section" aria-labelledby="job-title">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="job-title" className="flex items-center gap-2 text-xl font-black tracking-tight lg:text-2xl">
                  <BadgeCheck size={20} className="text-brand-point-ink" aria-hidden /> 직업 인증 <span className="text-base font-bold text-gray-500">(선택)</span>
                </h2>
                {job && (
                  <StatusChip tone={job.status === "approved" ? "green" : job.status === "pending" ? "amber" : job.status === "rejected" || job.status === "reverify" ? "red" : "gray"}>
                    <span data-testid="job-status">{JOB_STATUS_LABEL[job.status]}</span>
                  </StatusChip>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500 break-keep">인증하면 파티 참여자 명단에 &apos;직업 인증&apos; 배지가 표시돼요. 제출 서류는 확인 후 바로 삭제합니다.</p>

              {job && (job.status === "approved" || job.status === "reverify") && job.label && (
                <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 break-keep">
                  인증된 직업: {job.label}
                  {job.status === "reverify" && <span className="mt-1 block font-medium text-red-700">프로필의 직업이 바뀌어 배지를 숨겼어요. 다시 인증해주세요.</span>}
                </p>
              )}
              {job?.status === "rejected" && job.rejectReason && (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 break-keep" data-testid="job-reject-reason">반려 사유: {job.rejectReason}</p>
              )}
              {job?.status === "pending" && !jobReplace && (
                <div className="mt-3">
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 break-keep" role="status" data-testid="job-pending">
                    <Clock size={18} className="mt-0.5 flex-shrink-0" aria-hidden />
                    {jobDone ? "직업 인증 요청이 접수되었어요. 결과는 문자로 알려드릴게요." : "직업 인증 심사 중이에요. 결과는 문자로 알려드릴게요."}
                  </p>
                  <button type="button" onClick={() => { setJobReplace(true); setJobDone(false); }} disabled={!ready}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-black text-gray-700 hover:border-brand-black hover:text-brand-black disabled:opacity-50">
                    <RotateCcw size={16} aria-hidden /> 서류 다시 제출
                  </button>
                </div>
              )}
              {job?.status === "approved" && !jobReplace && (
                <button type="button" onClick={() => setJobReplace(true)} disabled={!ready}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-black text-gray-700 hover:border-brand-black hover:text-brand-black disabled:opacity-50">
                  <RotateCcw size={16} aria-hidden /> 직업 다시 인증
                </button>
              )}

              {showJobForm && (
                <div className="mt-4 space-y-4">
                  <fieldset>
                    <legend className="mb-2 text-sm font-black text-brand-black">구분</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {JOB_TYPES.map(t => (
                        <button key={t.key} type="button" aria-pressed={jobType === t.key}
                          onClick={() => { setJobType(t.key); setDocKind(DOC_KINDS[t.key].length === 1 ? DOC_KINDS[t.key][0].key : ""); }}
                          className={`min-h-11 rounded-xl border-2 px-3 text-sm font-black transition-colors break-keep ${jobType === t.key ? "border-brand-black bg-brand-black text-white" : "border-gray-200 bg-white text-gray-700 hover:border-brand-black"}`}
                          data-testid={`job-type-${t.key}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {jobType && (
                    <fieldset>
                      <legend className="mb-2 text-sm font-black text-brand-black">{jobType === "business" ? "서류" : "서류 종류 (1개)"}</legend>
                      <div className="flex flex-wrap gap-2">
                        {DOC_KINDS[jobType].map(d => (
                          <label key={d.key} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold break-keep ${docKind === d.key ? "border-brand-point bg-brand-point/10 text-brand-black" : "border-gray-200 text-gray-700"}`}>
                            <input type="radio" name="docKind" value={d.key} checked={docKind === d.key} onChange={() => setDocKind(d.key)} className="accent-brand-point" data-testid={`doc-kind-${d.key}`} />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {jobType === "business" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-black text-brand-black">사업자등록번호 (10자리)</span>
                        <input type="text" inputMode="numeric" autoComplete="off" value={bizNo} maxLength={12} placeholder="1234567890"
                          onChange={e => setBizNo(e.target.value.replace(/[^\d-]/g, ""))}
                          className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point"
                          data-testid="biz-no" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-black text-brand-black">개업일자</span>
                        <input type="date" value={openDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setOpenDate(e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point"
                          data-testid="open-date" />
                      </label>
                      <p className="text-xs text-gray-500 break-keep sm:col-span-2">본인인증 이름이 대표자 이름과 같은지 국세청 정보로 함께 확인합니다.</p>
                    </div>
                  )}

                  {jobType && (
                    <div>
                      <p className="flex items-start gap-1.5 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-black text-red-600 break-keep" data-testid="rrn-warning">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
                        주민등록번호 뒷자리는 반드시 가리고 올려주세요. 가려지지 않은 서류는 반려 후 즉시 삭제됩니다.
                      </p>
                      <button type="button" onClick={() => docInputRef.current?.click()} disabled={!ready || jobBusy}
                        className="mt-3 flex min-h-[120px] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 transition-colors hover:border-brand-point disabled:opacity-60"
                        data-testid="doc-slot">
                        {doc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={doc.url} alt="올릴 서류 미리보기" className="max-h-64 w-auto object-contain" />
                        ) : (
                          <span className="flex flex-col items-center gap-1.5 text-gray-500"><ImagePlus size={28} aria-hidden /><span className="text-xs font-bold">서류 사진 선택</span></span>
                        )}
                      </button>
                      <input ref={docInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden data-testid="doc-input"
                        onChange={e => { onPickDoc(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                  )}

                  {jobType && <ConsentRow consent={JOB_CONSENT} checked={agreeJob} onChange={setAgreeJob} testId="job-agree" />}
                  {jobError && <p className="text-sm font-bold text-red-600 break-keep" role="alert" data-testid="job-error">{jobError}</p>}
                  {jobType && (
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={submitJob} disabled={!ready || !jobFormValid || jobBusy}
                        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand-black px-4 text-base font-black text-white transition-all hover:bg-brand-point hover:text-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                        data-testid="job-submit">
                        {jobBusy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> 올리는 중…</> : "직업 인증 요청하기"}
                      </button>
                      {jobReplace && (
                        <button type="button" onClick={() => { setJobReplace(false); setDoc(null); setJobError(""); }}
                          className="min-h-11 text-sm font-bold text-gray-500 hover:text-brand-black">취소</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
