"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Star, Heart, Clock, ShoppingBag, X, ClipboardList, Users as UsersIcon, ShieldCheck, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { partyStockStatus } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";
import { useParties } from "../../lib/useParties";
import { checkEligibility, eligibilitySummary, calculateAge } from "../../lib/eligibility";

type Participant = {
  id: string;
  maskedName: string;
  ageBand: string;
  mbti: string;
  job: string;
  status?: "confirmed" | "pending_approval" | "completed" | string;
};

/** 상태 미니 배지 — 마이페이지 STATUS_DISPLAY 와 동일 색상/라벨, 사이즈만 컴팩트 */
function StatusMiniBadge({ status }: { status?: string }) {
  if (status === "confirmed") {
    return (
      <span className="inline-flex items-center text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
        참가확정
      </span>
    );
  }
  if (status === "pending_approval") {
    return (
      <span className="inline-flex items-center text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#F5F5DC] text-[#5D4037] whitespace-nowrap">
        확정 대기 중
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded-full bg-gray-200 text-black whitespace-nowrap">
        모임종료
      </span>
    );
  }
  return null;
}

/** 성별별 참가자 컬럼 — 칩 카드 형태로 정렬 */
function ParticipantColumn({
  label, list, toneBg, toneAccent, toneBadge,
}: {
  label: string;
  list: Participant[];
  toneBg: string;
  toneAccent: string;
  toneBadge: string;
}) {
  return (
    <div className="p-4 md:p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-7 h-7 rounded-full ${toneBg} flex items-center justify-center`}>
          <UsersIcon size={13} className={toneAccent} />
        </span>
        <span className={`font-black text-sm ${toneAccent}`}>{label}</span>
        <span className={`ml-auto text-[10px] md:text-[11px] font-black px-2 py-0.5 rounded-full ${toneBadge}`}>
          {list.length}명
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-400 font-medium py-4 text-center">
          아직 신청한 {label} 참가자가 없습니다.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {list.map(p => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 flex-wrap"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className={`font-black text-sm ${toneAccent}`}>{p.maskedName}</span>
                {p.ageBand && (
                  <span className={`text-[10px] md:text-[11px] font-bold px-1.5 py-0.5 rounded-full ${toneBadge}`}>
                    {p.ageBand}
                  </span>
                )}
                {/* 상태 미니 배지 — 연령대 바로 우측 */}
                <StatusMiniBadge status={p.status} />
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                {p.mbti && (
                  <span className="text-[10px] md:text-[11px] font-black text-brand-point bg-brand-point/10 px-1.5 py-0.5 rounded-full">
                    {p.mbti}
                  </span>
                )}
                {p.job && (
                  <span className="text-[11px] md:text-xs font-medium text-gray-500 truncate max-w-[7rem]">
                    {p.job}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PartyClientView({ id }: { id: string }) {
  const PARTIES = useParties();
  const baseItem = PARTIES.find(p => p.id === id);
  const router = useRouter();
  const { isLoggedIn, addToCart, profile, partyCounts, cart, bookings } = useAuth();
  // 이미 신청한 파티 — cancelled 가 아닌 모든 booking 상태(결제완료/확정대기/참가확정)를 차단 사유로 간주
  const alreadyBooked = bookings.some(b => b.partyId === id && b.status !== "cancelled");

  // 행사 일시 경과 여부 — KST 기준 오늘 날짜 > calendarDate (YYYY-MM-DD) 면 종료
  const todayKST = typeof window !== "undefined"
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
    : "";
  const [showCartModal, setShowCartModal] = useState(false);
  const [participants, setParticipants] = useState<{ male: Participant[]; female: Participant[] }>({ male: [], female: [] });

  // 참가 확정자 fetch — 마운트 + 30초 폴링 + focus 갱신
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/party-participants.php?partyId=${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (cancelled || !d?.ok) return;
          setParticipants({
            male:   Array.isArray(d.male)   ? d.male   : [],
            female: Array.isArray(d.female) ? d.female : [],
          });
        })
        .catch(() => {});
    };
    load();
    const onFocus = () => load();
    const onVisibility = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [id]);

  // 실시간 결제완료 인원만 노출 — DB 카운트가 없으면 0/12로 표시 (시드/테스트 데이터 무시)
  const live = partyCounts[id];
  const detailItem = baseItem
    ? {
        ...baseItem,
        maleBooked:   live?.male   ?? 0,
        femaleBooked: live?.female ?? 0,
      }
    : undefined;

  if (!detailItem) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">파티를 찾을 수 없습니다.</h1>
            <Link href="/#apply" className="text-brand-point underline">목록으로 돌아가기</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const stock = partyStockStatus(detailItem);
  // 행사 일시 경과 — todayKST > calendarDate 일 때 모집 종료. SSR 단계에선 false (window 없음)
  const isExpired = !!detailItem.calendarDate && todayKST !== "" && todayKST > detailItem.calendarDate;

  // 자격 요약 + 검증 (로그인한 회원에 한해 평가)
  const eligibilityLabel = eligibilitySummary(detailItem);
  const eligibility = isLoggedIn && profile
    ? checkEligibility(detailItem, { birthDate: profile.birthDate, maritalStatus: profile.maritalStatus })
    : { ok: true };
  const userAge = profile?.birthDate ? calculateAge(profile.birthDate) : null;

  const checkGenderAvailability = (): string | null => {
    if (stock.allFull) return "모집이 마감되었습니다.";
    const g = profile?.gender;
    if (g === "남성" && stock.maleFull)   return "남성 참가 인원이 마감되었습니다. 다른 파티를 확인해주세요.";
    if (g === "여성" && stock.femaleFull) return "여성 참가 인원이 마감되었습니다. 다른 파티를 확인해주세요.";
    return null;
  };

  const checkBlockedReason = (): string | null => {
    const stockBlocked = checkGenderAvailability();
    if (stockBlocked) return stockBlocked;
    if (!eligibility.ok) return eligibility.message ?? "참가 자격이 일치하지 않습니다.";
    return null;
  };

  // 이미 신청한 파티 안내 — confirm 후 마이페이지 이동 / 취소 시 차단.
  // (alreadyBooked 가 true 일 때 양 핸들러 최상단에서 호출 — 이후 로직 모두 차단)
  const handleAlreadyBookedPrompt = (): boolean => {
    if (!alreadyBooked) return false;
    if (confirm("이미 신청한 매칭파티 입니다. 마이페이지에서 확인하시겠습니까?")) {
      router.push("/mypage");
    }
    return true; // alreadyBooked 인 경우는 confirm 결과 무관 후속 로직 차단
  };

  // 참가신청 — 카트에 담고 마이페이지로 이동 (중복 신청/카트 시 차단)
  const handleCheckout = () => {
    if (handleAlreadyBookedPrompt()) return;
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/party/${id}/`)}`);
      return;
    }
    if (!profile?.gender) {
      alert("프로필 정보(성별)가 필요합니다. 프로필을 먼저 완성해주세요.");
      router.push("/profile-setup/");
      return;
    }
    const blocked = checkBlockedReason();
    if (blocked) { alert(blocked); return; }

    if (cart.some(c => c.partyId === id)) {
      alert("이미 장바구니에 담겨 있습니다. 마이페이지에서 결제를 진행해주세요.");
      router.push("/mypage");
      return;
    }
    addToCart(id);
    router.push("/mypage");
  };

  // 장바구니 — 한 사용자는 같은 파티에 1회만 담을 수 있음 + 이미 신청한 파티 confirm 안내
  const handleAddToCart = () => {
    if (handleAlreadyBookedPrompt()) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (!profile?.gender) {
      alert("프로필 정보(성별)가 필요합니다. 프로필을 먼저 완성해주세요.");
      router.push("/profile-setup/");
      return;
    }
    const blocked = checkBlockedReason();
    if (blocked) { alert(blocked); return; }

    if (cart.some(c => c.partyId === id)) {
      alert("이미 장바구니에 담긴 파티입니다.");
      return;
    }
    addToCart(id);
    setShowCartModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen text-brand-black selection:bg-brand-point selection:text-white pb-0">
      <Header />

      <main className="flex-1 bg-brand-lightgray">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-24 min-h-[85vh]"
        >
          <Link href="/#apply" className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black mb-7 md:mb-12 font-bold transition-colors text-sm md:text-base">
            <ArrowLeft size={18} /> 목록으로 돌아가기
          </Link>

          {/* TOP SECTION: MAIN INFO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 md:gap-16 mb-10 md:mb-24">
            {/* Left: 대표 이미지 — 관리자가 등록한 imageUrl을 동적 렌더링, 없으면 placeholder */}
            <div className="aspect-[5/3] lg:aspect-auto lg:h-full lg:min-h-[520px] bg-neutral-900 rounded-2xl md:rounded-[2rem] flex items-center justify-center relative overflow-hidden group">
              {detailItem.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detailItem.imageUrl}
                  alt={detailItem.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-neutral-800 flex items-center justify-center opacity-40">
                  <Star size={48} className="text-gray-400" />
                </div>
              )}
              {/* 상태 배지 — 우선순위: 행사일 경과(모집종료) > 정원 만석(모집마감) > 모집중 */}
              {(() => {
                const status: "ended" | "full" | "open" =
                  isExpired ? "ended" : stock.allFull ? "full" : "open";
                const badge = {
                  ended: { label: "모집종료", cls: "bg-[#FF0000] text-white" },
                  full:  { label: "모집마감", cls: "bg-gray-300 text-black" },
                  open:  { label: "모집중",   cls: "bg-brand-point text-black" },
                }[status];
                return (
                  <div className={`absolute top-4 left-4 md:top-6 md:left-6 font-bold px-4 py-1.5 md:px-5 md:py-2 rounded-full text-xs md:text-sm shadow-xl z-10 ${badge.cls}`}>
                    {badge.label}
                  </div>
                );
              })()}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            </div>

            {/* Right: Info & Checkout */}
            <div className="flex flex-col justify-between min-h-0">
              <div>
                {/* 모바일/태블릿(md) 가독성 유지 — PC(lg+) 만 5xl→4xl 축소 (~25%) + 자간 -0.015em */}
                <h1 className="text-3xl md:text-5xl lg:text-4xl font-black tracking-[-0.015em] mb-3 md:mb-4 leading-snug">{detailItem.title}</h1>
                {/* 관리자가 등록한 소개(description) 우선 노출 — 없으면 기본 카피 */}
                <p className="text-sm md:text-lg text-gray-500 mb-5 md:mb-8 font-medium leading-relaxed whitespace-pre-line break-keep">
                  {detailItem.description?.trim()
                    ? detailItem.description
                    : "단순한 만남을 넘어 감성을 향유하는 시간.\n어울림이 큐레이션한 프리미엄 네트워킹에 초대합니다."}
                </p>

                {/* Info rows — 라벨/값 폰트 한 단계 확대, 행간 미세 증가 */}
                <div className="space-y-0 mb-5 md:mb-8">
                  {[
                    { label: "일시 (Date)", value: detailItem.dateString },
                    { label: "장소 (Location)", value: detailItem.location },
                    { label: "대상 (Target)", value: detailItem.target },
                  ].map((row) => (
                    <div key={row.label} className="flex flex-col md:flex-row md:justify-between md:items-center py-3.5 md:py-4 border-b border-gray-200 gap-0.5 md:gap-0">
                      <span className="text-sm md:text-lg text-gray-400 md:text-gray-500 font-medium md:w-40">{row.label}</span>
                      <span className="font-bold text-base md:text-lg md:text-right">{row.value}</span>
                    </div>
                  ))}
                  {/* 참가비 — 성별별 분리 표시 (남성 / 여성). 미설정 시 price 폴백 단일 표시 */}
                  {(() => {
                    const pm = (detailItem as { priceMale?: number }).priceMale;
                    const pf = (detailItem as { priceFemale?: number }).priceFemale;
                    const hasSplit = (pm && pm > 0) || (pf && pf > 0);
                    const maleAmt   = pm && pm > 0 ? pm : detailItem.price;
                    const femaleAmt = pf && pf > 0 ? pf : detailItem.price;
                    return (
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center py-3.5 md:py-4 border-b border-gray-200 gap-1 md:gap-0">
                        <span className="text-sm md:text-lg text-gray-400 md:text-gray-500 font-medium md:w-40 flex-shrink-0">참가비 (Price)</span>
                        {hasSplit ? (
                          <span className="font-black text-brand-black md:text-right flex flex-wrap items-baseline justify-end gap-x-2 md:gap-x-3 gap-y-1">
                            <span className="inline-flex items-baseline gap-1">
                              <span className="text-xs md:text-sm text-gray-500 font-bold">남성</span>
                              <span className="text-2xl md:text-3xl tabular-nums">₩{maleAmt.toLocaleString()}</span>
                            </span>
                            <span className="text-gray-300 text-base md:text-xl">/</span>
                            <span className="inline-flex items-baseline gap-1">
                              <span className="text-xs md:text-sm text-gray-500 font-bold">여성</span>
                              <span className="text-2xl md:text-3xl tabular-nums">₩{femaleAmt.toLocaleString()}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="font-black text-2xl md:text-3xl text-brand-black tabular-nums">₩{detailItem.price.toLocaleString()}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Gender stock — minimal underline typography */}
                <div className="flex items-center border-t border-b border-gray-300 py-4 md:py-5 mb-5 md:mb-6">
                  <div className="flex-1 flex items-baseline justify-center gap-2.5 md:gap-3">
                    <span className="text-sm md:text-base font-bold text-gray-400 tracking-wider">남성</span>
                    <span className={`text-xl md:text-2xl font-black tabular-nums ${stock.maleFull ? "text-gray-400" : "text-brand-black"}`}>
                      {detailItem.maleBooked}/{detailItem.maleStock}
                    </span>
                    {stock.maleFull && (
                      <span className="text-[11px] md:text-xs font-black text-gray-400 tracking-wider">마감</span>
                    )}
                  </div>
                  <div className="w-px h-7 md:h-8 bg-gray-300" />
                  <div className="flex-1 flex items-baseline justify-center gap-2.5 md:gap-3">
                    <span className="text-sm md:text-base font-bold text-gray-400 tracking-wider">여성</span>
                    <span className={`text-xl md:text-2xl font-black tabular-nums ${stock.femaleFull ? "text-gray-400" : "text-brand-black"}`}>
                      {detailItem.femaleBooked}/{detailItem.femaleStock}
                    </span>
                    {stock.femaleFull && (
                      <span className="text-[11px] md:text-xs font-black text-gray-400 tracking-wider">마감</span>
                    )}
                  </div>
                </div>

                {/* Notice — 신청 전 확인사항 (좌측 이미지와 하단 라인 맞추기 위해 패딩/마진 미세 조정) */}
                <div className="bg-white p-3.5 md:p-4 rounded-xl md:rounded-2xl border border-gray-200 mb-4 md:mb-4">
                  <h4 className="font-bold mb-1.5 flex items-center gap-2 text-sm md:text-base">
                    <Heart size={15} className="text-brand-point" /> 신청 전 꼭 확인해주세요.
                  </h4>
                  <p className="text-xs md:text-sm text-gray-500 leading-relaxed break-keep">
                    어울림은 진정성 있는 만남을 위해 <strong className="font-bold text-brand-black">100% 사전 승인제</strong>로 운영됩니다.
                    결제 후 프로필 정보를 입력해 주시면 <strong className="font-bold text-brand-black">[확정 대기 중]</strong> 상태가 되며,
                    관리자의 꼼꼼한 확인을 거쳐 최종 <strong className="font-bold text-brand-black">[참가 확정]</strong>이 이루어집니다.
                    참가 확정 및 안내 문자는 확정 시점에 맞춰 순차적으로 발송됩니다.
                  </p>
                </div>
              </div>

              {/* 참가 자격 안내 — 자격 제한이 설정된 경우 노출 */}
              {eligibilityLabel && (
                <div className={`mb-4 md:mb-5 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold border ${
                  isLoggedIn && !eligibility.ok
                    ? "bg-red-50 border-red-100 text-red-700"
                    : "bg-brand-point/10 border-brand-point/20 text-brand-point"
                }`}>
                  <span className="font-black">참가 대상</span> · {eligibilityLabel}
                  {isLoggedIn && !eligibility.ok && (
                    <span className="block mt-1 font-medium text-red-600">
                      {eligibility.message}
                      {userAge !== null && eligibility.reason === "ageOutOfRange" && ` (현재 만 ${userAge}세)`}
                    </span>
                  )}
                </div>
              )}

              {/* CTA Buttons — pinned to bottom */}
              {/* 행사 종료된 파티 — 단일 빨간 버튼으로 교체 (클릭 불가) */}
              {isExpired ? (
                <div className="mt-auto">
                  <div
                    role="status"
                    aria-disabled="true"
                    className="w-full px-5 md:px-8 py-4 md:py-5 rounded-xl md:rounded-2xl text-base md:text-xl font-bold shadow-xl text-center bg-[#FF0000] text-white pointer-events-none select-none"
                  >
                    모집 종료된 파티
                  </div>
                </div>
              ) : (() => {
                const userGender = profile?.gender;
                const userSideFull =
                  (userGender === "남성" && stock.maleFull) ||
                  (userGender === "여성" && stock.femaleFull);
                const eligibilityBlocked = isLoggedIn && !eligibility.ok;
                // 실제 disabled 는 정원/자격 사유만 — alreadyBooked 는 클릭 가능 (confirm 으로 안내)
                const hardDisabled = stock.allFull || userSideFull || eligibilityBlocked;
                // 회색 스타일 적용 조건 — 시각적으로 비활성처럼 보이지만 alreadyBooked 는 클릭 가능
                const grayedOut = alreadyBooked || hardDisabled;
                const label = alreadyBooked
                  ? "이미 신청된 파티"
                  : stock.allFull
                    ? "모집 마감"
                    : userGender === "남성" && stock.maleFull
                      ? "남성 마감"
                      : userGender === "여성" && stock.femaleFull
                        ? "여성 마감"
                        : eligibilityBlocked
                          ? "참가 대상 아님"
                          : "참가신청";
                return (
                  <div className="flex gap-3 md:gap-4 mt-auto">
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={hardDisabled}
                      className={`flex-[2] px-5 md:px-8 py-4 md:py-5 rounded-xl md:rounded-2xl text-base md:text-xl font-bold transition-all shadow-xl ${
                        grayedOut
                          ? `bg-gray-200 text-gray-400 shadow-none ${alreadyBooked && !hardDisabled ? "cursor-pointer hover:bg-gray-300" : "cursor-not-allowed"}`
                          : "bg-brand-black text-white hover:bg-brand-point hover:shadow-brand-point/30"
                      }`}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      disabled={hardDisabled}
                      className={`flex-1 px-5 md:px-8 py-4 md:py-5 rounded-xl md:rounded-2xl text-base md:text-xl font-bold transition-all shadow-xl ${
                        grayedOut
                          ? `bg-gray-200 text-gray-400 shadow-none ${alreadyBooked && !hardDisabled ? "cursor-pointer hover:bg-gray-300" : "cursor-not-allowed"}`
                          : "bg-brand-black text-white hover:bg-brand-point"
                      }`}
                    >
                      장바구니
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* PARTICIPANTS PANEL — 다른 섹션들(참가 신청 방법/Party Timeline 등)과 동일 폭 max-w-4xl */}
          {(participants.male.length > 0 || participants.female.length > 0) && (
            <div className="max-w-4xl mx-auto mb-10 md:mb-16">
              {/* 안내 헤드라인 — 청록 포인트 컬러 */}
              <div className="flex items-center gap-3 mb-5 md:mb-7">
                <UsersIcon size={20} className="text-brand-point flex-shrink-0" />
                <h3 className="text-xl md:text-3xl font-bold tracking-tight break-keep">
                  <span className="text-brand-point">{detailItem.title}</span>
                  <span className="text-brand-black">의 실시간 참가 인원</span>
                </h3>
              </div>

              <section className="bg-white rounded-2xl md:rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                <header className="bg-brand-point/5 px-4 md:px-6 py-3 md:py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-xs md:text-sm font-bold text-gray-500 tracking-wider break-keep">
                    {(() => {
                      // 페이지 렌더 시점 KST — 30s polling 시마다 자동 갱신됨
                      const parts = new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Seoul",
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit", hour12: false,
                      }).formatToParts(new Date());
                      const get = (t: string) => parts.find(x => x.type === t)?.value || "";
                      return `${get("year")}년 ${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")} 실시간 참가자 명단`;
                    })()}
                  </span>
                  <span className="text-[11px] md:text-xs font-black text-brand-point bg-brand-point/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                    총 {participants.male.length + participants.female.length}명
                  </span>
                </header>
                {/* 모바일: 세로 적층 / 데스크톱: 좌우 분할 */}
                <div className="flex flex-col md:flex-row md:divide-x divide-y md:divide-y-0 divide-gray-100">
                  <div className="flex-1">
                    <ParticipantColumn
                      label="남성"
                      list={participants.male}
                      toneBg="bg-[#E3F2FD]"
                      toneAccent="text-[#3a85d9]"
                      toneBadge="bg-[#E3F2FD] text-[#3a85d9]"
                    />
                  </div>
                  <div className="flex-1">
                    <ParticipantColumn
                      label="여성"
                      list={participants.female}
                      toneBg="bg-[#FCE4EC]"
                      toneAccent="text-rose-500"
                      toneBadge="bg-rose-100 text-rose-700"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* (제거됨) Private Matching Party INTRO — 상단 h1 과 제목 중복 → 사용자 요청으로 삭제 */}

          {/* PARTICIPATION GUIDE NOTICE — 대상별 맞춤 안내 (싱글/돌싱). 미지정·all일 때 숨김. */}
          {(() => {
            const tg = detailItem.targetGroup;
            const ams = detailItem.allowedMaritalStatus;
            const variant: "single" | "divorced" | null =
              tg === "싱글" || ams === "싱글"
                ? "single"
                : tg === "돌싱" || ams === "돌싱"
                  ? "divorced"
                  : null;
            if (!variant) return null;

            return (
              <div className="mb-7 md:mb-10">
                <div className="max-w-4xl mx-auto">
                  {variant === "single" ? (
                    /* Singles Only — Open Matching 과 동일 톤(brand-point 청록)으로 통일.
                       문구 출력 로직(variant), ShieldCheck 아이콘, 패딩/라운드/shadow 모두 보존. */
                    <div className="bg-brand-point/5 border border-brand-point/25 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-sm">
                      <div className="flex gap-3 md:gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-brand-point/15 flex items-center justify-center">
                            <ShieldCheck size={20} className="text-brand-point md:hidden" />
                            <ShieldCheck size={24} className="text-brand-point hidden md:block" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-[11px] md:text-xs font-black tracking-[0.2em] text-brand-point mb-1.5 md:mb-2 uppercase">
                            Singles Only
                          </p>
                          <p className="text-sm md:text-base text-gray-700 leading-relaxed break-keep">
                            해당 파티는 법적 혼인 이력이 없는 <strong className="font-black text-brand-black">&apos;싱글&apos;</strong> 회원님만을 대상으로 진행되는 매칭 파티입니다.{" "}
                            <strong className="font-black text-brand-black">&apos;싱글&apos;</strong>이 아님이 확인될 경우, 즉시{" "}
                            <strong className="font-black text-brand-point">회원탈퇴</strong>와 함께 블랙리스트 조치되며,
                            허위 정보 기재에 따른 민·형사상의{" "}
                            <strong className="font-black text-brand-point">강력한 법적 책임</strong>을 물을 수 있음을 고지합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-brand-point/5 border border-brand-point/25 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-sm">
                      <div className="flex gap-3 md:gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-brand-point/15 flex items-center justify-center">
                            <Info size={20} className="text-brand-point md:hidden" />
                            <Info size={24} className="text-brand-point hidden md:block" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-[11px] md:text-xs font-black tracking-[0.2em] text-brand-point mb-1.5 md:mb-2 uppercase">
                            Open Matching
                          </p>
                          <p className="text-sm md:text-base text-gray-700 leading-relaxed break-keep">
                            해당 파티는 새로운 시작을 꿈꾸는 <strong className="font-black text-brand-black">&apos;돌싱&apos;</strong> 회원님까지 참여하실 수 있는{" "}
                            <strong className="font-black text-brand-point">열린 매칭 파티</strong>입니다.
                            물론 <strong className="font-black text-brand-black">&apos;싱글&apos;</strong> 회원님도 제한 없이 자유롭게 신청 및 참여가 가능하오니,
                            넓은 마음으로 소중한 인연을 만나보세요.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 참가 신청 방법 안내 헤드 이미지 — 컨테이너 폭(max-w-4xl) 1:1 매칭, 라운드 X, 비율 보존 */}
          <div className="mb-7 md:mb-10">
            <div className="max-w-4xl mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/party_apply_guide_head.png"
                alt="참가 신청 안내"
                className="block w-full h-auto object-contain"
              />
            </div>
          </div>

          {/* HOW TO JOIN — Timeline-styled Application Guide */}
          <div className="mb-10 md:mb-24">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 md:gap-4 mb-7 md:mb-12">
                  <ClipboardList size={26} className="text-brand-point md:hidden" />
                  <ClipboardList size={32} className="text-brand-point hidden md:block" />
                  <h3 className="text-xl md:text-3xl font-bold tracking-tight">참가 신청 방법</h3>
                </div>

                <div className="space-y-7 md:space-y-12 relative before:absolute before:left-3.5 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                  {[
                    {
                      title: "매칭파티 카드를 확인하고 결제하기",
                      desc: "매칭파티 카드의 일시, 장소, 연령대를 확인하고 결제해주세요.",
                      note: null,
                    },
                    {
                      title: "매칭 프로필 카드 작성하기",
                      desc: "매칭파티 프로필 카드 작성을 완료해야 참가확정을 받으실 수 있습니다.",
                      note: "마이페이지의 내 예약 현황에서 현재 참가 확정 여부를 확인하실 수 있습니다.",
                    },
                    {
                      title: "매칭파티 참가확정 확인 후 방문하기",
                      desc: "참가확정이 되어야만 참석 가능하오니 알림 문자나 참가 확정 여부를 꼭 확인해주세요!",
                      note: "성비가 맞지 않거나 주최측의 사정으로 파티가 취소될 경우 100% 환불이나 쿠폰 적립 후 다음 모임 선확정 중 선택하실 수 있습니다.",
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="relative pl-12 md:pl-14">
                      <div className="absolute left-0 top-0 w-7 h-7 md:w-8 md:h-8 bg-brand-point text-white rounded-full border-4 border-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                        {idx + 1}
                      </div>
                      <div className="text-brand-point font-black text-xs md:text-sm tracking-[0.15em] mb-1 md:mb-1.5">STEP {idx + 1}</div>
                      <div className="font-bold text-base md:text-xl mb-1.5 md:mb-2 text-brand-black leading-snug">{item.title}</div>
                      <div className="text-gray-600 font-medium text-sm md:text-base leading-relaxed">{item.desc}</div>
                      {item.note && (
                        <div className="mt-2.5 md:mt-3 bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 md:pl-4 py-2 md:py-2.5 rounded-r-lg">
                          <p className="text-xs md:text-sm text-gray-600 leading-relaxed">{item.note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: DETAIL NARRATIVE — 참가 신청 방법의 mb-24 가 이미 충분한 간격을
              제공하므로 border-t/pt-* 제거. 다른 섹션 사이 간격(mb-10 md:mb-24)과 동일 톤. */}
          <div>
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1 }}
                className="space-y-10 md:space-y-24"
              >
                {/* OUR EXPERIENCE — 이미지로 교체 (라운드 X, 1:1 컨테이너 폭, 비율 보존) */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/party_our_experience.png"
                  alt="OUR EXPERIENCE"
                  className="block w-full h-auto rounded-none select-none pointer-events-none"
                  draggable={false}
                />

                {/* Emotional Image 1 */}
                <div className="relative group overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl">
                  <img
                    src="/images/party_vibe_1.png"
                    alt="Premium networking vibe"
                    className="w-full h-auto object-cover transform transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>

                {/* Timeline / Schedule Section — STEP 방식 + 인원별 소요시간 표 */}
                <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                    <Clock size={26} className="text-brand-point md:hidden" />
                    <Clock size={32} className="text-brand-point hidden md:block" />
                    <h3 className="text-xl md:text-3xl font-bold tracking-tight">Party Timeline</h3>
                  </div>
                  <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-12 leading-relaxed">
                    편안한 분위기 속에서, 자연스럽게 이어지는 인연의 시작
                  </p>

                  {/* STEP 카드 4종 */}
                  <div className="space-y-5 md:space-y-7">
                    {[
                      {
                        step: "STEP 01",
                        title: "설레는 첫 만남과 입장",
                        time: "10분",
                        desc: "프라이빗한 만남을 위한 간단한 확인 후 입장이 진행됩니다. 웰컴 드링크와 함께 여유롭게 긴장을 풀고, 오늘의 만남을 편안하게 시작해 보세요.",
                      },
                      {
                        step: "STEP 02",
                        title: "나를 표현하는 매칭 카드 작성",
                        time: "10분",
                        desc: "나의 취향과 가치관을 담은 프로필을 작성합니다. 부담 없이 서로를 이해하고 자연스럽게 대화를 시작할 수 있는 준비 시간입니다.",
                      },
                      {
                        step: "STEP 03",
                        title: "1:1 로테이션 대화",
                        time: null,
                        desc: "모든 참가자와 한 분씩 돌아가며 1:1 대화를 나눕니다. 각 테마에 맞춰 큐레이션된 스페셜 페어링(티, 와인, 사케 등)이 대화의 즐거움을 더해줍니다.",
                        note: "대화 시간은 인원 구성에 따라 1인당 10~15분 내외로 유연하게 운영됩니다.",
                      },
                      {
                        step: "STEP 04",
                        title: "최종 매칭 및 종료",
                        time: "20분",
                        desc: "모든 대화가 끝난 후, 가장 인상 깊었던 분을 선택하는 시간입니다. 서로의 마음이 닿은 커플에게는 인연을 이어갈 수 있는 연락처를 조심스럽게 전달해 드립니다.",
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="relative pl-12 md:pl-16 pb-5 md:pb-7 border-b border-gray-100 last:border-b-0 last:pb-0"
                      >
                        {/* STEP 번호 — 청록 #008080 (brand-point) */}
                        <div className="absolute left-0 top-0 w-9 h-9 md:w-11 md:h-11 rounded-full bg-brand-point text-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                          {String(idx + 1).padStart(2, "0")}
                        </div>
                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-1.5 md:mb-2">
                          <span className="text-[11px] md:text-xs font-black tracking-[0.2em] text-brand-point">
                            {item.step}
                          </span>
                          {item.time && (
                            <span className="inline-flex items-center text-[11px] md:text-xs font-bold text-brand-point bg-brand-point/10 px-2 py-0.5 rounded-full">
                              {item.time}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-base md:text-xl mb-2 md:mb-2.5 text-brand-black leading-snug">
                          {item.title}
                        </div>
                        <p className="text-sm md:text-base text-gray-600 leading-relaxed break-keep">
                          {item.desc}
                        </p>
                        {item.note && (
                          <p className="mt-2.5 md:mt-3 text-[11px] md:text-xs text-gray-500 italic bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 py-2 rounded-r-md leading-relaxed">
                            &ldquo;{item.note}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 인원별 소요 시간 안내 표 */}
                  <div className="mt-8 md:mt-12">
                    <h4 className="text-sm md:text-base font-black tracking-tight text-brand-black mb-3 md:mb-4 flex items-center gap-2">
                      <span className="w-1 h-4 bg-brand-point rounded-full" />
                      인원별 소요 시간 안내
                    </h4>
                    {/* 모바일: 카드 뷰 (수직 쌓기 + bullet + 여유 간격) / 데스크톱: 테이블 */}
                    <div className="md:hidden space-y-3">
                      {[
                        { kind: "8 : 8 파티",   total: "약 2시간 30분", type: "대화 시간 여유로운 편" },
                        { kind: "10 : 10 파티", total: "약 3시간",      type: "표준 로테이션" },
                        { kind: "12 : 12 파티", total: "약 3시간 30분", type: "가장 많은 만남" },
                      ].map((row, i) => (
                        <div key={i} className="bg-brand-point/5 border border-brand-point/15 rounded-xl p-4 leading-relaxed">
                          {/* kind 라벨 — brand-point 청록 bullet 으로 항목 구분 강화 */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-point flex-shrink-0" />
                            <span className="font-black text-base text-brand-black">{row.kind}</span>
                          </div>
                          {/* 시간 행 — flex-wrap 으로 좁은 화면에서도 안전 줄바꿈 */}
                          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 text-sm pl-4">
                            <span className="text-gray-500 font-medium">총</span>
                            <span className="font-bold text-brand-point break-keep">{row.total}</span>
                          </div>
                          <p className="text-xs text-gray-500 font-medium mt-2 pl-4 break-keep leading-relaxed">{row.type}</p>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block overflow-hidden rounded-xl border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-brand-point/10 text-gray-600">
                          <tr>
                            <th className="px-5 py-3 text-left font-black tracking-wider text-brand-point uppercase text-xs">구분</th>
                            <th className="px-5 py-3 text-left font-black tracking-wider text-brand-point uppercase text-xs">총 소요 시간</th>
                            <th className="px-5 py-3 text-left font-black tracking-wider text-brand-point uppercase text-xs">유형</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {[
                            { kind: "8 : 8 파티",   total: "약 2시간 30분", type: "대화 시간 여유로운 편" },
                            { kind: "10 : 10 파티", total: "약 3시간",      type: "표준 로테이션" },
                            { kind: "12 : 12 파티", total: "약 3시간 30분", type: "가장 많은 만남" },
                          ].map((row, i) => (
                            <tr key={i} className="bg-white hover:bg-brand-point/5 transition-colors">
                              <td className="px-5 py-3.5 font-bold text-brand-black">{row.kind}</td>
                              <td className="px-5 py-3.5 font-black text-brand-point tabular-nums">{row.total}</td>
                              <td className="px-5 py-3.5 text-gray-600">{row.type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Emotional Image 2 */}
                <div className="relative group overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl">
                  <img
                    src="/images/party_vibe_2.png"
                    alt="Luxury lounge interior"
                    className="w-full h-auto object-cover transform transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>

                {/* ── 필수 확인 사항 — Final CTA 직전, 참가 신청 방법/Party Timeline 과 동일 톤 ── */}
                <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                    <ShieldCheck size={26} className="text-brand-point md:hidden" />
                    <ShieldCheck size={32} className="text-brand-point hidden md:block" />
                    <h3 className="text-xl md:text-3xl font-bold tracking-tight">필수 확인 사항</h3>
                  </div>
                  <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-12 leading-relaxed">
                    편안하고 신뢰할 수 있는 만남을 위해 아래 내용을 꼭 확인해 주세요.
                  </p>

                  <div className="space-y-7 md:space-y-12 relative before:absolute before:left-3.5 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                    {[
                      {
                        title: "본인 확인을 위한 신분증 지참",
                        desc:  "안전하고 투명한 만남을 위해 사전 인증이 완료된 분들만 참여 가능합니다. 현장에서 본인 확인 절차가 진행되오니, 신분증(주민등록증, 운전면허증 등)을 반드시 지참해 주세요.",
                        warn:  "미지참 시 입장이 제한될 수 있으며, 이로 인한 환불은 불가합니다.",
                      },
                      {
                        title: "드레스코드 — 깔끔하고 단정한 차림",
                        desc:  "첫인상은 소중한 인연의 시작입니다. 상대방에 대한 예의를 갖춘 깔끔한 소개팅 복장(셔츠, 슬랙스, 원피스 등)을 권장합니다.",
                        warn:  "트레이닝복, 슬리퍼 등 과하게 편안한 복장은 입장이 제한될 수 있습니다.",
                      },
                      {
                        title: "성숙한 매너와 배려",
                        desc:  "서로를 존중하는 따뜻한 분위기를 지향합니다. 과도한 음주, 무례한 언행 등 타인에게 불편을 주는 경우 운영진의 판단에 따라 즉시 퇴장 조치될 수 있으며 참가비는 환불되지 않습니다.",
                        warn:  null,
                      },
                      {
                        title: "신중한 참가 신청",
                        desc:  "매칭파티는 정해진 성비를 맞추어 세심하게 준비됩니다. 당일 무단 불참(No-Show)은 다른 참가자분들의 소중한 기회를 저해하므로 신중한 참가신청을 부탁드립니다.",
                        warn:  "무단 불참 시 향후 모든 매칭파티 참여가 제한될 수 있습니다.",
                      },
                      {
                        title: "현장 기록 및 마케팅 활용 안내",
                        desc:  "파티의 분위기를 기록하기 위해 현장 스케치 촬영이 진행될 수 있습니다. 촬영된 모든 사진은 참가자의 프라이버시 보호를 위해 얼굴 식별이 불가능하도록 블러/모자이크 처리 후 마케팅 자료로 활용됩니다.",
                        warn:  null,
                      },
                    ].map((item, idx) => (
                      <div key={idx} className="relative pl-12 md:pl-14">
                        <div className="absolute left-0 top-0 w-7 h-7 md:w-8 md:h-8 bg-brand-point text-white rounded-full border-4 border-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                          {idx + 1}
                        </div>
                        <div className="font-bold text-base md:text-xl mb-1.5 md:mb-2 text-brand-black leading-snug">{item.title}</div>
                        <div className="text-gray-600 font-medium text-sm md:text-base leading-relaxed break-keep">{item.desc}</div>
                        {item.warn && (
                          <div className="mt-2.5 md:mt-3 bg-red-50 border-l-2 border-red-400/60 pl-3 md:pl-4 py-2 md:py-2.5 rounded-r-lg">
                            <p className="text-xs md:text-sm text-red-700 font-bold leading-relaxed break-keep">⚠ {item.warn}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 필수확인사항 하단 안내 이미지 — 라운드 X, 컨테이너 폭 1:1, 비율 보존 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/party_required_notice_bottom.png"
                  alt="필수 확인 사항 안내"
                  className="block w-full h-auto object-contain"
                />

              </motion.div>
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />

      {/* Cart confirmation modal */}
      <AnimatePresence>
        {showCartModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCartModal(false)}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative"
            >
              <button
                type="button"
                onClick={() => setShowCartModal(false)}
                className="absolute top-4 right-4 text-gray-300 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point/10 rounded-full flex items-center justify-center mb-5">
                  <ShoppingBag size={32} className="text-brand-point md:hidden" />
                  <ShoppingBag size={38} className="text-brand-point hidden md:block" />
                </div>

                <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight">
                  장바구니에 담겼습니다
                </h3>
                <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-8 leading-relaxed">
                  {detailItem.title}
                </p>

                <div className="flex flex-col w-full gap-2.5">
                  <button
                    type="button"
                    onClick={() => router.push("/mypage")}
                    className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point transition-all shadow-lg hover:shadow-brand-point/30 flex items-center justify-center gap-2"
                  >
                    <ShoppingBag size={17} /> 장바구니로 가기
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCartModal(false)}
                    className="w-full bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-xl font-bold text-sm md:text-base hover:border-brand-black hover:text-brand-black transition-all"
                  >
                    목록 계속보기
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
