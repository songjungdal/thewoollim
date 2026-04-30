"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, MapPin, AlertTriangle, CheckCircle2, XCircle, Info } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { useAuth } from "../../context/AuthContext";
import { useParties } from "../../lib/useParties";
import { calculateRefund, REFUND_TABLE } from "../../lib/refund";

export default function CancelRequestPage() {
  const { mounted, isLoggedIn, userEmail, bookings, refreshBookings } = useAuth();
  const PARTIES = useParties();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mounted && !isLoggedIn) router.push("/login?redirect=/mypage/cancel");
  }, [mounted, isLoggedIn, router]);

  // cancelled 외 모든 booking이 취소 대상 (status = paid_pending_profile / pending_approval / confirmed)
  const cancellable = useMemo(
    () => bookings.filter(b => b.status !== "cancelled"),
    [bookings]
  );

  const selected = selectedId ? cancellable.find(b => b.id === selectedId) ?? null : null;
  const selectedParty = selected ? PARTIES.find(p => p.id === selected.partyId) : null;
  const refund = (selected && selectedParty)
    ? calculateRefund(selected.total ?? selectedParty.price, selectedParty.calendarDate)
    : null;

  const handleCancel = async () => {
    if (!selected || !selectedParty || !refund) return;
    if (refund.rate === 0) {
      alert(
        `환불 가능 기간이 지났습니다.\n` +
        `(파티까지 ${refund.days < 0 ? "이미 종료" : `${refund.days}일`} — 2일 전 이후는 환불 불가)\n\n` +
        `취소가 불가능합니다.`
      );
      return;
    }
    const ok = confirm(
      `정말로 취소하시겠습니까?\n\n` +
      `대상: ${selectedParty.title}\n` +
      `파티 일정: ${selectedParty.dateString}\n` +
      `결제 금액: ₩${(selected.total ?? selectedParty.price).toLocaleString()}\n` +
      `환불 예정: ₩${refund.refund.toLocaleString()} (${refund.label})\n\n` +
      `취소 시 결제 카드사로 즉시 환불 처리됩니다.\n` +
      `이 작업은 되돌릴 수 없습니다.`
    );
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments/refund.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, bookingId: selected.id }),
      });
      const d = await res.json();
      if (d?.ok) {
        alert(`취소 완료 — ₩${(d.refundAmount ?? refund.refund).toLocaleString()}이 카드사로 환불 처리되었습니다.`);
        await refreshBookings();
        router.push("/mypage");
      } else {
        alert(d?.error || "취소 처리에 실패했습니다.");
        setSubmitting(false);
      }
    } catch {
      alert("네트워크 오류로 취소가 실패했습니다.");
      setSubmitting(false);
    }
  };

  if (!mounted || !isLoggedIn) {
    return (
      <div className="min-h-screen bg-brand-lightgray flex items-center justify-center">
        <p className="font-bold text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1 py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">

          <Link href="/mypage" className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-6 font-bold text-sm md:text-base transition-colors">
            <ArrowLeft size={16} /> 마이페이지로 돌아가기
          </Link>

          <h1 className="text-2xl md:text-4xl font-black tracking-tight mb-2 md:mb-3">예약 취소 요청</h1>
          <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-10">
            취소할 예약을 선택해주세요. 파티 일정에 따라 환불 비율이 달라집니다.
          </p>

          {/* === 상단: 결제된 예약 카드 리스트 === */}
          <section className="mb-8 md:mb-10">
            <h2 className="text-lg md:text-xl font-black mb-4 md:mb-5">현재 예약 현황</h2>
            {cancellable.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 md:p-14 text-center">
                <CheckCircle2 size={42} className="text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 font-bold text-sm md:text-base">취소 가능한 예약이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {cancellable.map(b => {
                  const party = PARTIES.find(p => p.id === b.partyId);
                  const isSelected = selectedId === b.id;
                  const r = party ? calculateRefund(b.total ?? party.price, party.calendarDate) : null;
                  return (
                    <motion.button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedId(b.id)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`w-full text-left bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 border-2 transition-colors ${
                        isSelected ? "border-brand-point shadow-md" : "border-gray-100 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* 라디오 인디케이터 */}
                        <div className={`flex-shrink-0 w-6 h-6 md:w-7 md:h-7 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                          isSelected ? "border-brand-point bg-brand-point" : "border-gray-300 bg-white"
                        }`}>
                          {isSelected && <CheckCircle2 size={16} className="text-white" strokeWidth={3} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="font-black text-base md:text-xl mb-2 leading-snug break-keep">
                            {party?.title ?? `파티 #${b.partyId}`}
                          </h3>
                          <div className="flex flex-col gap-1.5 text-sm md:text-base text-gray-600 font-medium mb-3">
                            {party && <span className="flex items-center gap-2"><Calendar size={14} className="text-brand-point flex-shrink-0" /> {party.dateString}</span>}
                            {party && <span className="flex items-center gap-2"><MapPin size={14} className="text-brand-point flex-shrink-0" /> {party.location}</span>}
                          </div>
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-xs md:text-sm font-bold text-gray-400">결제 금액 <span className="text-brand-black tabular-nums ml-1">₩{(b.total ?? party?.price ?? 0).toLocaleString()}</span></span>
                            {r && (
                              <span className={`text-xs md:text-sm font-black px-2.5 py-1 rounded-full ${
                                r.rate === 1   ? "bg-emerald-100 text-emerald-800" :
                                r.rate >= 0.5  ? "bg-amber-100 text-amber-800" :
                                                  "bg-red-100 text-red-700"
                              }`}>
                                현재 {r.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </section>

          {/* === 환불 미리보기 + 취소 버튼 === */}
          {selected && selectedParty && refund && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border-2 border-brand-point/40 shadow-md mb-8 md:mb-10"
            >
              <h3 className="font-black text-base md:text-lg mb-4">환불 예상 금액</h3>
              <dl className="space-y-2.5 text-sm md:text-base mb-5">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500 font-medium">결제 금액</dt>
                  <dd className="font-bold tabular-nums">₩{(selected.total ?? selectedParty.price).toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500 font-medium">파티까지 남은 일수</dt>
                  <dd className="font-bold">{refund.days < 0 ? "이미 종료" : `${refund.days}일`}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500 font-medium">환불 비율</dt>
                  <dd className={`font-black ${refund.rate === 0 ? "text-red-600" : "text-brand-point"}`}>{refund.label}</dd>
                </div>
                <div className="flex justify-between gap-3 pt-3 border-t border-gray-100">
                  <dt className="font-black text-base md:text-lg">환불 예정 금액</dt>
                  <dd className={`font-black text-xl md:text-2xl tabular-nums ${refund.rate === 0 ? "text-red-500" : "text-brand-point"}`}>
                    ₩{refund.refund.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting || refund.rate === 0}
                className={`w-full py-4 md:py-5 rounded-xl md:rounded-2xl font-black text-base md:text-lg transition-all flex items-center justify-center gap-2.5 ${
                  refund.rate === 0
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : submitting
                      ? "bg-gray-300 text-white cursor-wait"
                      : "bg-brand-black text-white hover:bg-brand-point shadow-xl hover:shadow-brand-point/30"
                }`}
              >
                {refund.rate === 0
                  ? <><XCircle size={20} /> 환불 가능 기간 경과</>
                  : submitting
                    ? "취소 처리 중..."
                    : <><AlertTriangle size={20} /> 취소 요청하기</>}
              </button>
              {refund.rate === 0 && (
                <p className="text-xs md:text-sm text-red-500 font-medium mt-3 text-center">
                  파티 2일 전부터는 환불이 불가능합니다.
                </p>
              )}
            </motion.section>
          )}

          {/* === 하단: 환불 규정 === */}
          <section className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-7 border border-gray-100">
            <div className="flex items-center gap-2 mb-4 md:mb-5">
              <Info size={18} className="text-brand-point" />
              <h2 className="text-base md:text-lg font-black">환불 안내</h2>
            </div>
            <p className="text-xs md:text-sm text-gray-500 font-medium mb-4 leading-relaxed">
              취소 요청은 파티 시작일 기준 일수에 따라 환불 비율이 자동 적용됩니다. 카드 결제 건은 결제 카드사로 즉시 환불 처리됩니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm md:text-base">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs md:text-sm">
                    <th className="text-left px-4 py-3 font-bold">취소 시점</th>
                    <th className="text-right px-4 py-3 font-bold">환불 비율</th>
                  </tr>
                </thead>
                <tbody>
                  {REFUND_TABLE.map(row => (
                    <tr key={row.when} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-bold text-gray-800">{row.when}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full font-black text-xs md:text-sm ${row.tone}`}>
                          {row.rate}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] md:text-xs text-gray-400 font-medium mt-4 leading-relaxed">
              * 일수는 자정(00:00) 기준이며, 어울림 운영팀이 인정하는 천재지변 등 불가피한 사유는 별도 검토 후 처리됩니다.
            </p>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
}
