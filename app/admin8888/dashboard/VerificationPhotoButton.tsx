"use client";

/**
 * 예약 / 신청 현황 — 신청자 이름 옆 [사진] (docs/specs/photo-job-verification.md 4-2).
 * 현장 본인 확인용으로 승인된 사진 2장을 보여 준다. 사진은 관리자 API 로만 불러오고, 열람은 활동 로그에 남는다.
 */

import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { AdminModal, verificationFileUrl } from "./VerificationReview";

export default function VerificationPhotoButton({ email, name }: { email: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const show = async () => {
    setOpen(true); setLoading(true); setError(""); setRecordId(null);
    try {
      const r = await fetch(`/api/admin/verifications.php?approvedPhotoFor=${encodeURIComponent(email)}`, { credentials: "include", cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!d?.ok) setError(String(d?.error || "불러오지 못했습니다."));
      else setRecordId(typeof d.recordId === "number" ? d.recordId : null);
    } catch {
      setError("네트워크 오류로 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={show}
        className="ml-1.5 inline-flex items-center gap-0.5 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 align-middle text-[11px] font-black text-gray-600 hover:border-brand-black hover:text-brand-black min-h-8 md:min-h-0"
        aria-label={`${name} 승인 사진 보기`} data-testid="roster-photo-button">
        <Camera size={11} aria-hidden /> 사진
      </button>
      {open && (
        <AdminModal title={`${name} — 승인 사진 (현장 본인 확인)`} onClose={() => setOpen(false)}>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-point-ink" size={28} aria-label="불러오는 중" /></div>
          ) : error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
          ) : recordId === null ? (
            <p className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-500">승인된 사진이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {([1, 2] as const).map(slot => (
                <a key={slot} href={verificationFileUrl(recordId, slot)} target="_blank" rel="noopener noreferrer" title="새 창에서 크게 보기">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={verificationFileUrl(recordId, slot)} alt={`${name} 승인 사진 ${slot}`} className="aspect-[3/4] w-full rounded-xl bg-gray-100 object-contain" />
                </a>
              ))}
            </div>
          )}
        </AdminModal>
      )}
    </>
  );
}
