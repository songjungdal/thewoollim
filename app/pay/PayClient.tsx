"use client";

/**
 * 결제자 화면 /pay/?t=<링크 코드> (docs/specs/paylink.md 3장). 로그인 없이 결제한다.
 *  - 정보: GET /api/paylink/view.php?t= — 금액은 서버에 저장된 링크 금액만 쓴다
 *  - 결제: POST /api/paylink/prepare.php → 토스 결제위젯(비회원 customerKey: TossPayments.ANONYMOUS)
 *          → 성공 /api/paylink/success.php · 실패 /api/paylink/fail.php → 다시 이 화면(?done=1 / ?error=)
 *  - 완료·취소 화면에서는 결제자 이름·연락처를 다시 보여주지 않는다
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Loader2, XCircle } from "lucide-react";
import Footer from "../components/Footer";
import {
  PAYLINK_LIMITS, PAYLINK_PRIVACY_NOTE, PAYLINK_PRIVACY_TEXT, PAYLINK_REFUND_ROWS, PAYLINK_SUPPORT_EMAIL,
  formatDeadline, formatUseDate, isMobilePhone, won,
} from "../lib/paylink";
import { formatKST } from "../lib/datetime";

type View =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error"; message: string }
  | { status: "open"; title: string; amount: number; useDate: string; useInfo: string; expiresAt: string; notice: string; payerName: string }
  | { status: "paid" | "partial_cancelled" | "cancelled"; title: string; amount: number; paidAt: string; receiptUrl: string; cancelledAmount: number }
  | { status: "expired" | "stopped" };

// 토스 결제위젯 v2 (app/layout.tsx 의 js.tosspayments.com/v2/standard). 비회원 결제 customerKey 는 TossPayments.ANONYMOUS
type TossWidgets = {
  setAmount: (a: { currency: string; value: number }) => Promise<void>;
  renderPaymentMethods: (o: { selector: string; variantKey?: string }) => Promise<unknown>;
  renderAgreement: (o: { selector: string; variantKey?: string }) => Promise<unknown>;
  requestPayment: (o: {
    orderId: string; orderName: string; successUrl: string; failUrl: string;
    customerName?: string; customerMobilePhone?: string;
  }) => Promise<void>;
};
type TossFactory = ((clientKey: string) => { widgets: (o: { customerKey: string }) => TossWidgets }) & { ANONYMOUS?: string };

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";

async function waitToss(): Promise<TossFactory | null> {
  const w = window as unknown as { TossPayments?: TossFactory };
  for (let i = 0; i < 50 && !w.TossPayments; i++) await new Promise(r => setTimeout(r, 100));
  return w.TossPayments ?? null;
}

function TopBar() {
  return (
    <header className="bg-brand-black">
      <div className="mx-auto flex h-14 max-w-[480px] items-center px-4">
        <Image src="/images/logo_white.png" alt="어울림 로고" width={98} height={32} priority />
      </div>
    </header>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="flex-shrink-0 font-bold text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right font-bold text-brand-black break-keep">{children}</dd>
    </div>
  );
}

function Notice({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
      <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${tone}`}>{icon}</div>
      <p className="text-lg font-black text-brand-black break-keep">{title}</p>
      {children}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-gray-800">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-5 w-5 flex-shrink-0 accent-brand-point-ink" />
      <span className="min-w-0 break-keep">{children}</span>
    </label>
  );
}

export default function PayClient() {
  const sp = useSearchParams();
  const token = sp.get("t") || "";
  const errorParam = sp.get("error") || "";
  const done = sp.get("done") === "1";

  const [view, setView] = useState<View>({ status: "loading" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreeRefund, setAgreeRefund] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [widgetState, setWidgetState] = useState<"idle" | "ready" | "fail">("idle");
  const widgetsRef = useRef<TossWidgets | null>(null);

  const load = useCallback(async () => {
    if (!/^[a-f0-9]{32}$/.test(token)) { setView({ status: "not_found" }); return; }
    try {
      const r = await fetch(`/api/paylink/view.php?t=${token}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (r.status === 404 || j?.status === "not_found") { setView({ status: "not_found" }); return; }
      if (!r.ok || !j?.ok) { setView({ status: "error", message: j?.error || "정보를 불러오지 못했습니다." }); return; }
      setView(j as View);
      if (j.status === "open") setName(prev => prev || String(j.payerName || ""));
    } catch {
      setView({ status: "error", message: "정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." });
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  // ── 토스 결제위젯 (결제 대기 화면에서만)
  const openAmount = view.status === "open" ? view.amount : 0;
  useEffect(() => {
    if (!openAmount || widgetsRef.current) return;
    if (!TOSS_CLIENT_KEY) { console.warn("[pay] TOSS_CLIENT_KEY 누락"); return; }
    let cancelled = false;
    (async () => {
      const Toss = await waitToss();
      if (cancelled) return;
      if (!Toss) { setWidgetState("fail"); return; }
      try {
        const w = Toss(TOSS_CLIENT_KEY).widgets({ customerKey: Toss.ANONYMOUS ?? "@@ANONYMOUS" });
        widgetsRef.current = w;
        await w.setAmount({ currency: "KRW", value: openAmount });
        await w.renderPaymentMethods({ selector: "#pl-payment-method", variantKey: "DEFAULT" });
        await w.renderAgreement({ selector: "#pl-agreement", variantKey: "AGREEMENT" });
        if (!cancelled) setWidgetState("ready");
      } catch (e) {
        console.error("[pay] 토스 위젯 초기화 실패:", e);
        widgetsRef.current = null;
        if (!cancelled) setWidgetState("fail");
      }
    })();
    return () => { cancelled = true; };
  }, [openAmount]);

  const phoneOk = isMobilePhone(phone);
  const nameOk = name.trim() !== "" && name.trim().length <= PAYLINK_LIMITS.payerNameMax;
  const canPay = view.status === "open" && nameOk && phoneOk && agreeRefund && agreePrivacy && !paying && widgetState === "ready";

  const pay = async () => {
    if (!canPay || view.status !== "open") return;
    setPayError("");
    setPaying(true);
    try {
      const r = await fetch("/api/paylink/prepare.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ t: token, payerName: name.trim(), payerPhone: phone, agreeRefund, agreePrivacy }),
      });
      const o = await r.json().catch(() => null);
      if (!r.ok || !o?.ok) {
        setPaying(false);
        if (r.status === 409 || r.status === 404) { await load(); }
        setPayError(o?.error || "결제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      const w = widgetsRef.current;
      if (!w) { setPaying(false); setPayError("결제 모듈이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요."); return; }
      const origin = window.location.origin;
      await w.requestPayment({
        orderId: o.orderId,
        orderName: o.orderName,
        successUrl: `${origin}/api/paylink/success.php`,
        failUrl: `${origin}/api/paylink/fail.php`,
        customerName: o.customerName,
        customerMobilePhone: o.customerMobilePhone,
      });
    } catch (error: unknown) {
      setPaying(false);
      const e = error as { code?: string; message?: string };
      if (e?.code === "USER_CANCEL" || e?.code === "USER_CANCEL_PAYMENT") return;
      if (e?.code === "NEED_AGREEMENT_WITH_REQUIRED_TERMS") { setPayError("[필수] 결제 서비스 이용 약관에 동의해주세요."); return; }
      console.error("[pay] 결제 오류:", error);
      setPayError(e?.message || "결제 중 오류가 발생했습니다.");
    }
  };

  const status = view.status;
  const bannerError = errorParam && !done ? errorParam : "";

  return (
    <div className="flex min-h-screen flex-col bg-brand-lightgray">
      <TopBar />
      <main className="mx-auto w-full max-w-[480px] flex-1 px-4 pb-14 pt-6">
        <h1 className="mb-5 text-2xl font-black tracking-tight text-brand-black">어울림 결제 요청</h1>

        {bannerError && (status === "open" || status === "paid" || status === "partial_cancelled" || status === "cancelled") && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span className="break-keep">{bannerError}</span>
          </div>
        )}

        {status === "loading" && (
          <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" size={28} /></div>
        )}
        {status === "not_found" && <Notice icon={<XCircle size={28} />} tone="bg-gray-100 text-gray-500" title="잘못된 결제 링크입니다." />}
        {status === "error" && (
          <Notice icon={<AlertCircle size={28} />} tone="bg-red-50 text-red-500" title={view.message}>
            <button type="button" onClick={load} className="mt-5 min-h-11 rounded-xl bg-brand-black px-5 text-sm font-black text-white">다시 불러오기</button>
          </Notice>
        )}
        {status === "expired" && (
          <Notice icon={<Clock size={28} />} tone="bg-gray-100 text-gray-500" title="결제 기한이 지난 링크입니다. 담당자에게 문의해주세요." />
        )}
        {status === "stopped" && (
          <Notice icon={<AlertCircle size={28} />} tone="bg-gray-100 text-gray-500" title="현재 결제할 수 없는 링크입니다. 담당자에게 문의해주세요." />
        )}

        {(status === "paid" || status === "partial_cancelled") && (
          <Notice icon={<CheckCircle2 size={28} />} tone="bg-emerald-50 text-emerald-600"
            title={status === "paid" ? "결제가 완료되었습니다." : `${won(view.cancelledAmount)}이 취소되었습니다.`}>
            <dl className="mt-5 divide-y divide-gray-100 rounded-2xl bg-gray-50 px-4 text-left">
              <Row label="결제명">{view.title}</Row>
              <Row label="결제 금액">{won(view.amount)}</Row>
              {status === "partial_cancelled" && <Row label="취소 금액">{won(view.cancelledAmount)}</Row>}
              <Row label="결제 일시">{formatKST(view.paidAt).slice(0, 16)}</Row>
            </dl>
            {view.receiptUrl && (
              <a href={view.receiptUrl} target="_blank" rel="noopener noreferrer"
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-black px-5 text-sm font-black text-white">영수증 보기</a>
            )}
          </Notice>
        )}
        {status === "cancelled" && (
          <Notice icon={<XCircle size={28} />} tone="bg-red-50 text-red-500" title="취소된 결제입니다.">
            <dl className="mt-5 divide-y divide-gray-100 rounded-2xl bg-gray-50 px-4 text-left">
              <Row label="결제명">{view.title}</Row>
              <Row label="취소 금액">{won(view.cancelledAmount)}</Row>
            </dl>
          </Notice>
        )}

        {status === "open" && (
          <div className="space-y-4">
            {/* 1·2. 결제 내용 */}
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-base font-black text-brand-black break-keep">{view.title}</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-brand-black">{won(view.amount)}</p>
              <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                <Row label="이용일">{formatUseDate(view.useDate)}</Row>
                {view.useInfo && <Row label="이용 시간·장소">{view.useInfo}</Row>}
                <Row label="결제 기한">{formatDeadline(view.expiresAt)}까지</Row>
              </dl>
            </section>

            {/* 3. 결제자 정보 */}
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-black">결제자 정보</h2>
              <label className="mb-3 block">
                <span className="mb-1.5 block text-xs font-bold text-gray-500">이름</span>
                <input value={name} onChange={e => setName(e.target.value.slice(0, PAYLINK_LIMITS.payerNameMax))} autoComplete="name"
                  className="h-12 w-full rounded-xl border border-gray-200 px-3 text-base font-bold outline-none focus:border-brand-point-ink" placeholder="이름" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-gray-500">휴대폰 번호</span>
                <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" autoComplete="tel"
                  className="h-12 w-full rounded-xl border border-gray-200 px-3 text-base font-bold outline-none focus:border-brand-point-ink" placeholder="01012345678" />
                {phone !== "" && !phoneOk && <span className="mt-1.5 block text-xs font-bold text-red-600">01로 시작하는 10~11자리 숫자로 입력해주세요.</span>}
              </label>
            </section>

            {/* 4. 환불 규정 */}
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-base font-black">환불 규정</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2.5 text-left font-bold">취소 시점</th>
                    <th className="px-3 py-2.5 text-right font-bold">환불 비율</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYLINK_REFUND_ROWS.map(row => (
                    <tr key={row.when} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-bold text-gray-800">{row.when}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${row.tone}`}>{row.rate}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs font-medium leading-relaxed text-gray-500 break-keep">
                일수는 이용일 자정 기준으로 계산합니다. 취소 문의: <a href={`mailto:${PAYLINK_SUPPORT_EMAIL}`} className="font-bold underline">{PAYLINK_SUPPORT_EMAIL}</a>
              </p>
              {view.notice && (
                <p className="mt-3 whitespace-pre-line rounded-2xl bg-gray-50 p-4 text-sm font-medium leading-relaxed text-gray-700 break-keep">{view.notice}</p>
              )}
            </section>

            {/* 5. 동의 */}
            <section className="rounded-3xl bg-white p-5 shadow-sm">
              <Check checked={agreeRefund} onChange={setAgreeRefund}>[필수] 위 환불 규정을 확인했습니다</Check>
              <div className="flex items-center justify-between gap-2">
                <Check checked={agreePrivacy} onChange={setAgreePrivacy}>[필수] 결제자 정보(이름·휴대폰 번호) 수집·이용 동의</Check>
                <button type="button" onClick={() => setShowPrivacy(v => !v)} aria-expanded={showPrivacy}
                  className="min-h-11 flex-shrink-0 px-2 text-xs font-bold text-gray-500 underline">{showPrivacy ? "닫기" : "보기"}</button>
              </div>
              {showPrivacy && (
                <div className="mt-2 space-y-2 rounded-2xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
                  {PAYLINK_PRIVACY_TEXT.map(p => (
                    <p key={p.label}><span className="font-black">{p.label}:</span> {p.body}</p>
                  ))}
                  <p className="font-bold">{PAYLINK_PRIVACY_NOTE}</p>
                </div>
              )}
            </section>

            {/* 6. 토스 결제위젯 */}
            <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
              <div className="flex items-center gap-2 px-5 pt-5 text-base font-black"><CreditCard size={18} className="text-brand-point-ink" />결제 수단</div>
              <div id="pl-payment-method" className="min-h-[120px]" />
              <div id="pl-agreement" />
              {widgetState === "idle" && <p className="px-5 pb-5 text-xs font-bold text-gray-400">결제창을 불러오는 중입니다…</p>}
              {widgetState === "fail" && <p className="px-5 pb-5 text-sm font-bold text-red-600">결제창을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</p>}
            </section>

            {payError && (
              <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800 break-keep">{payError}</p>
            )}

            {/* 7. 결제 버튼 */}
            <button type="button" onClick={pay} disabled={!canPay}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-black text-base font-black text-white transition-colors disabled:bg-gray-300">
              {paying && <Loader2 size={18} className="animate-spin" />}
              {won(view.amount)} 결제하기
            </button>
            {!canPay && !paying && (
              <p className="text-center text-xs font-bold text-gray-500 break-keep">
                {!nameOk || !phoneOk ? "결제자 이름과 휴대폰 번호를 입력해주세요." : !agreeRefund || !agreePrivacy ? "필수 항목에 모두 동의해주세요." : widgetState !== "ready" ? "결제창을 불러오는 중입니다." : ""}
              </p>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

