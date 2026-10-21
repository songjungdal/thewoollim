"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2 } from "lucide-react";
import { fetchMembershipState, formatYmd, won, type MembershipView } from "../lib/membership";

const STATUS_LABEL: Record<string, string> = {
  active: "이용 중",
  pending: "결제 확인 중",
  canceled: "종료",
  expired: "기간 만료",
};

/**
 * 마이페이지 > 멤버십 (간단). 멤버십 기록이 있는 회원에게만 보인다
 * (멤버십은 아직 공개 메뉴에 연결하지 않은 상품이라 기록이 없는 회원에게는 아무것도 그리지 않는다).
 * 해지: 확인 1번 → 다음 결제부터 청구 안 함. 해지 취소 가능. 해지 버튼은 다른 버튼과 같은 크기로 같은 화면에 둔다.
 */
export default function MembershipSection() {
  const [m, setM] = useState<MembershipView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMembershipState().then(s => setM(s?.membership ?? null));
  }, []);

  if (!m) return null;

  const current = m.status === "active";
  const statusLabel = current && m.cancelAtPeriodEnd ? "해지 예약 (기간 끝까지 이용)" : (STATUS_LABEL[m.status] ?? m.status);

  const act = async (action: "cancel" | "resume") => {
    if (action === "cancel" && !window.confirm(`멤버십을 해지할까요?\n다음 결제부터 청구되지 않고, ${formatYmd(m.periodEnd)}까지 이용할 수 있습니다.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/membership/cancel.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json().catch(() => null);
      if (d?.ok && d.membership) setM(d.membership as MembershipView);
      else setError(String(d?.error || "처리하지 못했습니다. 잠시 후 다시 시도해주세요."));
    } catch {
      setError("처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="membership" className="scroll-mt-[156px]! lg:scroll-mt-28!" data-testid="mypage-membership">
      <h2 className="flex items-center gap-2 text-xl lg:text-2xl font-black tracking-tight mb-3 lg:mb-4">
        <BadgeCheck size={20} className="text-brand-point-ink" /> 멤버십
        {m.isTest && <span className="text-[11px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">테스트</span>}
      </h2>
      <div className="bg-white rounded-2xl p-5 lg:p-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm lg:text-base">
          <dt className="text-gray-500">상태</dt><dd className="font-bold" data-testid="membership-status">{statusLabel}</dd>
          <dt className="text-gray-500">이용 기간</dt><dd className="font-bold">{formatYmd(m.periodStart)} ~ {formatYmd(m.periodEnd)}</dd>
          <dt className="text-gray-500">다음 결제</dt>
          <dd className="font-bold" data-testid="membership-next">{current && m.nextBillingAt ? `${formatYmd(m.nextBillingAt)} · ${won(m.price)}` : "없음"}</dd>
          <dt className="text-gray-500">카드</dt><dd className="font-bold">{m.cardCompany ?? "-"} {m.cardLast4 ? `(끝 ${m.cardLast4})` : ""}</dd>
        </dl>

        {m.payments.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-black mb-2">결제 내역</h3>
            <ul className="divide-y divide-gray-100 text-sm">
              {m.payments.map(p => (
                <li key={p.orderId + p.status} className="flex justify-between gap-3 py-2">
                  <span className="text-gray-600">{p.cycleNo}회차 · {p.approvedAt ? formatYmd(p.approvedAt.slice(0, 10)) : "-"}</span>
                  <span className="font-bold">{won(p.amount)} {p.status === "success" ? "결제 완료" : p.status === "refunded" ? "환불" : "실패"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-danger mt-4" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Link href="/membership/" className="flex items-center justify-center h-12 rounded-xl border border-gray-300 font-bold text-sm">멤버십 안내</Link>
          {current && !m.cancelAtPeriodEnd && (
            <button type="button" disabled={busy} onClick={() => act("cancel")} data-testid="membership-cancel"
              className="flex items-center justify-center gap-1.5 h-12 rounded-xl border border-gray-300 font-bold text-sm disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} 해지하기
            </button>
          )}
          {current && m.cancelAtPeriodEnd && (
            <button type="button" disabled={busy} onClick={() => act("resume")} data-testid="membership-resume"
              className="flex items-center justify-center gap-1.5 h-12 rounded-xl border border-gray-300 font-bold text-sm disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} 해지 취소
            </button>
          )}
          {!current && (
            <Link href="/membership/join/" className="flex items-center justify-center h-12 rounded-xl border border-gray-300 font-bold text-sm">다시 가입하기</Link>
          )}
        </div>
      </div>
    </section>
  );
}
