"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Camera, Clock, RotateCcw, X } from "lucide-react";
import { verificationHref, type PhotoGateCode } from "../lib/verification";

const COPY: Record<PhotoGateCode, { title: string; body: string; icon: typeof Camera; action: string | null }> = {
  PHOTO_REQUIRED: {
    title: "파티 신청 전, 사진 심사가 필요해요",
    body: "어울림은 사진 심사를 통과한 분들만 참여하는 검증된 파티입니다. 한 번만 등록하면 모든 파티를 신청할 수 있어요.",
    icon: Camera,
    action: "사진 등록하기",
  },
  PHOTO_PENDING: {
    title: "사진 심사 중이에요",
    body: "심사가 끝나면 문자로 알려드릴게요. 승인 후 바로 신청하실 수 있어요.",
    icon: Clock,
    action: null,
  },
  PHOTO_REJECTED: {
    title: "사진을 다시 등록해주세요",
    body: "",
    icon: RotateCcw,
    action: "다시 등록하기",
  },
};

/**
 * 결제 전 사진 심사 안내창 (docs/specs/photo-job-verification.md 2-1).
 *  from: 승인 뒤 돌아갈 주소(보던 파티 상세·결제 화면). onClose: 닫기·[확인]
 */
export default function PhotoGateModal({ code, rejectReason, from, onClose }: {
  code: PhotoGateCode | null;
  rejectReason?: string | null;
  from?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const c = code ? COPY[code] : null;
  const Icon = c?.icon ?? Camera;
  return (
    <AnimatePresence>
      {code && c && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="photo-gate-modal"
          data-code={code}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-gate-title"
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 -m-[11px] p-[11px] text-gray-500 hover:text-gray-600 transition-colors"
              aria-label="닫기"
            >
              <X size={22} />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point/10 rounded-full flex items-center justify-center mb-5">
                <Icon size={32} className="text-brand-point-ink" aria-hidden />
              </div>
              <h3 id="photo-gate-title" className="text-xl md:text-2xl font-black mb-2 tracking-tight break-keep">{c.title}</h3>
              {code === "PHOTO_REJECTED" ? (
                <div className="w-full mb-7 md:mb-8">
                  <p className="text-sm md:text-base text-gray-500 font-medium leading-relaxed break-keep">심사 결과 사진을 다시 등록해야 해요.</p>
                  {rejectReason && (
                    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 break-keep" data-testid="photo-gate-reason">
                      사유: {rejectReason}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-8 leading-relaxed break-keep">{c.body}</p>
              )}
              <div className="flex flex-col w-full gap-2.5">
                {c.action ? (
                  <button
                    type="button"
                    onClick={() => router.push(verificationHref(from))}
                    className="w-full min-h-[52px] bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-black transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Camera size={17} aria-hidden /> {c.action}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full min-h-[52px] bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-black transition-all shadow-lg"
                  >
                    확인
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
