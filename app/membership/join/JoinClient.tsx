"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import MembershipNotice from "../MembershipNotice";
import { useAuth } from "../../context/AuthContext";
import {
  fetchMembershipState, formatYmd, isMembershipCurrent, loadTossBilling, won, type MembershipState,
} from "../../lib/membership";

const LOGIN_URL = "/login/?redirect=/membership/join/";

type AgreeKey = "terms" | "billing" | "refund";
const AGREEMENTS: { key: AgreeKey; label: string; href?: string }[] = [
  { key: "terms",   label: "[필수] 멤버십 이용약관 동의", href: "/terms/#membership" },
  { key: "billing", label: "[필수] 정기결제(자동결제) 동의" },
  { key: "refund",  label: "[필수] 환불 규정 동의", href: "/refund/#membership" },
];

export default function JoinClient() {
  const router = useRouter();
  const { mounted, isLoggedIn, verifySession, userEmail, profile } = useAuth();
  const [state, setState] = useState<MembershipState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [agree, setAgree] = useState<Record<AgreeKey, boolean>>({ terms: false, billing: false, refund: false });
  const [showBilling, setShowBilling] = useState(false);
  const [starting, setStarting] = useState(false);

  // 비로그인 → 로그인 후 이 페이지로 돌아온다
  useEffect(() => {
    if (!mounted) return;
    if (!isLoggedIn) { router.replace(LOGIN_URL); return; }
    let cancelled = false;
    (async () => {
      if (!(await verifySession())) { if (!cancelled) router.replace(LOGIN_URL); return; }
      const s = await fetchMembershipState(true);
      if (cancelled) return;
      if (s && !s.loggedIn) { router.replace(LOGIN_URL); return; }
      setState(s);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [mounted, isLoggedIn, verifySession, router]);

  const allAgreed = agree.terms && agree.billing && agree.refund;
  const current = isMembershipCurrent(state?.membership);
  const canStart = !!state?.ready && !!state.clientKey && !!state.customerKey && !current && allAgreed && !starting;

  const start = async () => {
    if (!canStart || !state?.clientKey || !state.customerKey) return;
    setStarting(true);
    const goFail = (code: string, message: string) =>
      router.push(`/membership/fail/?code=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`);
    try {
      const TossPayments = await loadTossBilling();
      if (!TossPayments) { goFail("SDK_LOAD_FAILED", "결제창을 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); return; }
      const payment = TossPayments(state.clientKey).payment({ customerKey: state.customerKey });
      const origin = window.location.origin;
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/membership/success/`,
        failUrl: `${origin}/membership/fail/`,
        ...(userEmail ? { customerEmail: userEmail } : {}),
        ...(profile?.name?.trim() ? { customerName: profile.name.trim() } : {}),
      });
    } catch (e) {
      // 결제창을 닫거나 오류가 나면 실패 화면으로
      const err = e as { code?: string; message?: string };
      goFail(err?.code || "PAY_PROCESS_CANCELED", err?.message || "");
    } finally {
      setStarting(false);
    }
  };

  if (!mounted || !isLoggedIn || !loaded) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center" aria-busy="true">
          <Loader2 className="animate-spin text-brand-point-ink" size={36} aria-label="불러오는 중" />
        </main>
      </div>
    );
  }

  const price = state?.price ?? 99000;

  return (
    <div className="flex flex-col min-h-screen bg-brand-lightgray">
      <Header />
      <main className="flex-1">
        <MembershipNotice state={state} loaded={loaded} />
        <div className="max-w-xl mx-auto px-4 py-8 md:py-14">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-1.5">어울림 멤버십 가입</h1>
          <p className="text-sm text-gray-600 mb-6 break-keep">카드를 등록하면 오늘 첫 결제가 이루어지고, 이후 매월 같은 날 자동결제됩니다.</p>

          {current && (
            <div className="bg-white rounded-2xl p-5 mb-5 border border-brand-point/40">
              <p className="font-black mb-1">이미 멤버십을 이용하고 있습니다.</p>
              <p className="text-sm text-gray-600 mb-3">이용 기간과 결제 내역은 마이페이지에서 확인할 수 있습니다.</p>
              <Link href="/mypage/" className="inline-block text-sm font-bold text-brand-point-ink underline">마이페이지로 가기</Link>
            </div>
          )}

          {/* 결제 정보 */}
          <section className="bg-white rounded-2xl p-5 md:p-6 mb-5">
            <dl className="divide-y divide-gray-100 text-sm md:text-base">
              <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">상품</dt><dd className="font-bold">어울림 멤버십 (월간)</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">결제 금액</dt><dd className="font-black text-lg" data-testid="join-price">{won(price)}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">오늘 결제</dt><dd className="font-bold" data-testid="join-today">{formatYmd(state?.today)}</dd></div>
              <div className="flex justify-between gap-4 py-3"><dt className="text-gray-600 whitespace-nowrap">다음 결제일</dt><dd className="font-bold" data-testid="join-next">{formatYmd(state?.nextBillingDate)}</dd></div>
            </dl>
            <p className="text-xs text-gray-500 mt-2 break-keep">국내에서 발급된 카드만 등록할 수 있습니다.</p>
          </section>

          {/* 필수 동의 3개 — 미리 체크하지 않는다 */}
          <section className="bg-white rounded-2xl p-5 md:p-6 mb-6">
            <ul className="space-y-1">
              {AGREEMENTS.map(a => (
                <li key={a.key}>
                  <div className="flex items-center justify-between gap-3 py-2">
                    <label className="flex items-center gap-3 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={agree[a.key]}
                        onChange={e => setAgree(prev => ({ ...prev, [a.key]: e.target.checked }))}
                        className="w-5 h-5 accent-[#00807A] flex-shrink-0"
                        data-testid={`agree-${a.key}`}
                      />
                      <span className="text-sm md:text-[15px] font-bold break-keep">{a.label}</span>
                    </label>
                    {a.href ? (
                      <a href={a.href} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 underline flex-shrink-0 py-1">보기</a>
                    ) : (
                      <button type="button" onClick={() => setShowBilling(v => !v)} aria-expanded={showBilling} className="text-xs text-gray-500 underline flex-shrink-0 py-1">보기</button>
                    )}
                  </div>
                  {a.key === "billing" && showBilling && (
                    <div className="bg-brand-lightgray rounded-xl p-4 mb-2 text-xs md:text-sm text-gray-700 leading-relaxed space-y-1.5 break-keep">
                      <p>· 결제 금액: 월 {won(price)}</p>
                      <p>· 결제일: 가입일에 첫 결제, 이후 매월 같은 날 등록한 카드로 자동결제 (그날이 없는 달은 말일)</p>
                      <p>· 해지: 마이페이지에서 언제든지. 해지하면 다음 결제부터 청구되지 않고, 이미 결제한 기간 끝까지 이용할 수 있습니다.</p>
                      <p>· 요금을 올리는 경우 미리 알리고 다시 동의를 받습니다.</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            data-testid="start-billing"
            className="w-full flex items-center justify-center gap-2 bg-brand-black text-white font-black text-base md:text-lg py-4 rounded-xl transition disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed hover:brightness-110"
          >
            {starting ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <CreditCard size={20} aria-hidden />}
            카드 등록하고 시작하기
          </button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-3">
            <ShieldCheck size={14} aria-hidden /> 카드 번호는 토스페이먼츠가 처리하며 어울림에 저장되지 않습니다.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
