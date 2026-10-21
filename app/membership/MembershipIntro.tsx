"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CalendarCheck, CreditCard, Ticket, Undo2 } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import MembershipNotice from "./MembershipNotice";
import { fetchMembershipState, MEMBERSHIP_PRICE, won, type MembershipState } from "../lib/membership";

// 현장 사진 (public/images/gallery — g5~g9 는 g1~g4 와 같은 사진이라 서로 다른 세 장만 쓴다)
const PHOTOS = [
  { src: "/images/gallery/g1.webp", alt: "야외 정원에서 대화하는 파티 참가자들" },
  { src: "/images/gallery/g2.webp", alt: "조명 아래에서 건배하는 파티 참가자들" },
  { src: "/images/gallery/g3.webp", alt: "와인 테이블에 둘러앉은 파티 참가자들" },
];

const SECTIONS = [
  {
    icon: Ticket,
    title: "이용 규칙",
    items: [
      "동시에 보유할 수 있는 멤버십 예약은 2건입니다.",
      "파티마다 멤버십으로 신청할 수 있는 좌석 수가 정해져 있습니다.",
      "파티 2일 전부터 예약을 취소하거나 참석하지 않으면 일정 기간 멤버십 예약이 제한될 수 있습니다.",
    ],
  },
  {
    icon: CreditCard,
    title: "결제 안내",
    items: [
      "가입한 날 첫 결제가 이루어집니다.",
      "이후 매월 같은 날 등록한 카드로 자동결제됩니다. 그날이 없는 달은 말일에 결제됩니다.",
      "국내에서 발급된 카드만 등록할 수 있습니다.",
    ],
  },
  {
    icon: Undo2,
    title: "해지·환불",
    items: [
      "마이페이지에서 언제든지 해지할 수 있습니다. 이미 결제한 기간이 끝날 때까지 이용할 수 있습니다.",
      "결제 후 7일 이내이고 그 기간에 멤버십으로 예약·참여한 적이 없으면 전액 환불합니다.",
    ],
  },
];

export default function MembershipIntro() {
  const [state, setState] = useState<MembershipState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchMembershipState().then(s => { setState(s); setLoaded(true); });
  }, []);

  const price = state?.price ?? MEMBERSHIP_PRICE;

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      <main className="flex-1">
        <MembershipNotice state={state} loaded={loaded} />

        {/* 첫 화면 — 상품명·가격 */}
        <section className="bg-brand-black text-white px-4 md:px-6 py-12 md:py-20">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <p className="text-brand-point text-sm md:text-base font-bold mb-3">매칭파티 · 솔로파티 정기 이용권</p>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4">어울림 멤버십</h1>
              <p className="text-3xl md:text-4xl font-black mb-5">
                월 <span className="text-brand-point" data-testid="membership-price">{price.toLocaleString("ko-KR")}</span>원
              </p>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed break-keep mb-7">
                매칭파티와 솔로파티 중 내 조건(나이·싱글/돌싱·성별 정원)에 맞는 파티를
                <span className="text-white font-bold"> 추가 참가비 없이</span> 신청할 수 있습니다.
              </p>
              <Link
                href="/membership/join/"
                className="inline-flex items-center justify-center gap-2 w-full md:w-auto bg-brand-point text-black font-black text-base md:text-lg px-8 py-4 rounded-xl hover:brightness-95 transition"
              >
                멤버십 시작하기 <ArrowRight size={20} aria-hidden />
              </Link>
            </div>
            <div className="relative aspect-square w-full max-w-md mx-auto md:max-w-none rounded-2xl overflow-hidden">
              <Image src={PHOTOS[0].src} alt={PHOTOS[0].alt} fill sizes="(min-width: 768px) 480px, 100vw" className="object-cover" priority />
            </div>
          </div>
        </section>

        {/* 이용 규칙 · 결제 · 해지/환불 요약 */}
        <section className="px-4 md:px-6 py-12 md:py-20">
          <div className="max-w-5xl mx-auto grid gap-5 md:grid-cols-3 md:gap-6">
            {SECTIONS.map(({ icon: Icon, title, items }) => (
              <div key={title} className="bg-brand-lightgray rounded-2xl p-6 md:p-7">
                <h2 className="flex items-center gap-2 text-lg md:text-xl font-black mb-4">
                  <Icon size={20} className="text-brand-point-ink" aria-hidden /> {title}
                </h2>
                <ul className="space-y-3 text-sm md:text-[15px] text-gray-700 leading-relaxed break-keep">
                  {items.map(t => (
                    <li key={t} className="flex gap-2"><span className="text-brand-point-ink font-black">·</span><span>{t}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 현장 사진 */}
        <section className="px-4 md:px-6 pb-12 md:pb-20">
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-5">
            {PHOTOS.slice(1).map(p => (
              <div key={p.src} className="relative aspect-square rounded-2xl overflow-hidden">
                <Image src={p.src} alt={p.alt} fill sizes="(min-width: 768px) 480px, 50vw" className="object-cover" />
              </div>
            ))}
          </div>
        </section>

        {/* 하단 시작 버튼 */}
        <section className="px-4 md:px-6 pb-16 md:pb-24">
          <div className="max-w-5xl mx-auto bg-brand-black text-white rounded-2xl p-6 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="flex items-center gap-2 text-brand-point font-bold text-sm mb-1.5"><CalendarCheck size={16} aria-hidden /> 오늘 시작하면 오늘 첫 결제</p>
              <p className="text-xl md:text-2xl font-black">월 {won(price)} · 언제든 해지</p>
            </div>
            <Link
              href="/membership/join/"
              className="inline-flex items-center justify-center gap-2 bg-brand-point text-black font-black text-base md:text-lg px-8 py-4 rounded-xl hover:brightness-95 transition"
            >
              멤버십 시작하기 <ArrowRight size={20} aria-hidden />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
