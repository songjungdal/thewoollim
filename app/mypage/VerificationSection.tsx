"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Camera, ShieldCheck } from "lucide-react";
import {
  JOB_STATUS_LABEL, PHOTO_STATUS_LABEL, fetchVerificationState,
  type JobStatus, type PhotoStatus, type VerificationState,
} from "../lib/verification";

const PHOTO_TONE: Record<PhotoStatus, string> = {
  none: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};
const JOB_TONE: Record<JobStatus, string> = {
  none: "bg-gray-100 text-gray-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  reverify: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
};

/**
 * 마이페이지 > 인증 관리 (docs/specs/photo-job-verification.md 2-3).
 * 사진 심사 상태(미제출/심사 중/승인/반려+사유)와 직업 인증 상태(미인증/심사 중/인증 완료+표시 직업/재인증 필요/반려+사유).
 * 사진 교체·서류 제출은 /verification/ 에서 한다. 상태를 불러오지 못하면 그리지 않는다.
 */
export default function VerificationSection() {
  const [s, setS] = useState<VerificationState | null>(null);

  useEffect(() => {
    fetchVerificationState().then(setS);
  }, []);

  if (!s) return null;
  const { photo, job } = s;

  return (
    <section id="verification" className="scroll-mt-[156px]! lg:scroll-mt-28!" data-testid="mypage-verification">
      <h2 className="flex items-center gap-2 text-xl lg:text-2xl font-black tracking-tight mb-3 lg:mb-4">
        <ShieldCheck size={20} className="text-brand-point-ink" /> 인증 관리
      </h2>
      <div className="bg-white rounded-2xl p-5 lg:p-6">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 text-sm lg:text-base">
          <dt className="flex items-center gap-1.5 text-gray-500 whitespace-nowrap pt-0.5"><Camera size={16} aria-hidden /> 사진 심사</dt>
          <dd className="min-w-0">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-black ${PHOTO_TONE[photo.status]}`} data-testid="mypage-photo-status">
              {PHOTO_STATUS_LABEL[photo.status]}
            </span>
            {photo.status === "rejected" && photo.rejectReason && (
              <p className="mt-1 text-[13px] font-bold text-red-700 break-keep">사유: {photo.rejectReason}</p>
            )}
            {photo.status !== "approved" && photo.approved && (
              <p className="mt-1 text-[13px] text-gray-500 break-keep">이전에 승인된 사진으로 파티를 신청할 수 있어요.</p>
            )}
            {photo.status === "none" && s.photoRequired && !s.testUser && (
              <p className="mt-1 text-[13px] text-gray-500 break-keep">파티를 신청하려면 사진 심사가 필요해요.</p>
            )}
          </dd>
          <dt className="flex items-center gap-1.5 text-gray-500 whitespace-nowrap pt-0.5"><BadgeCheck size={16} aria-hidden /> 직업 인증</dt>
          <dd className="min-w-0">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-black ${JOB_TONE[job.status]}`} data-testid="mypage-job-status">
              {JOB_STATUS_LABEL[job.status]}
            </span>
            {(job.status === "approved" || job.status === "reverify") && job.label && (
              <span className="ml-1.5 font-bold text-brand-black break-keep">{job.label}</span>
            )}
            {job.status === "reverify" && (
              <p className="mt-1 text-[13px] font-bold text-red-700 break-keep">프로필 직업이 바뀌어 배지를 숨겼어요. 다시 인증해주세요.</p>
            )}
            {job.status === "rejected" && job.rejectReason && (
              <p className="mt-1 text-[13px] font-bold text-red-700 break-keep">사유: {job.rejectReason}</p>
            )}
          </dd>
        </dl>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/verification/" data-testid="mypage-photo-link"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-black px-4 text-sm font-black text-white no-underline transition-colors hover:bg-brand-point hover:text-black">
            <Camera size={16} aria-hidden /> {photo.status === "none" ? "사진 등록하기" : photo.status === "rejected" ? "사진 다시 등록" : "사진 확인 · 다시 등록"}
          </Link>
          <Link href="/verification/#job-title"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-black text-gray-700 no-underline transition-colors hover:border-brand-black hover:text-brand-black">
            <BadgeCheck size={16} aria-hidden /> {job.status === "none" ? "직업 인증하기" : "직업 인증 관리"}
          </Link>
        </div>
      </div>
    </section>
  );
}
