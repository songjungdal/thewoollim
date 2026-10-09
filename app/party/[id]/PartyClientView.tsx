"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Heart, Clock, ShoppingBag, X, ClipboardList, Users as UsersIcon, ShieldCheck, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { partyStockStatus, withLiveCounts, dateOnly, partyTypeOf, PARTY_TYPE_LABELS, PARTIES as SEED_PARTIES, type PartyType } from "../../lib/data";
import PartyOptionPicker, { optionClosedFor } from "./PartyOptionPicker";
import { templateFor, normalizeDetail, type PartyDetail, type PartyDetailImage, type DetailImageSlot } from "../../lib/partyDetailTemplates";
import { useAuth } from "../../context/AuthContext";
import { useParties } from "../../lib/useParties";
import { checkEligibility, eligibilitySummary, calculateAge } from "../../lib/eligibility";

type Participant = {
  id: string;
  maskedName: string;
  ageBand: string;
  mbti: string;
  job: string;
  status?: "confirmed" | "pending_approval" | "completed" | "paid_pending_profile" | string;
  optionName?: string;   // 솔로파티 참가 구성 — 신청한 항목 이름
};

/** 상태 미니 배지 — 마이페이지 STATUS_DISPLAY 와 동일 색상/라벨, 사이즈만 컴팩트 */
function StatusMiniBadge({ status }: { status?: string }) {
  if (status === "paid_pending_profile") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
        결제완료(프로필 대기)
      </span>
    );
  }
  if (status === "confirmed") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
        참가확정
      </span>
    );
  }
  if (status === "pending_approval") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-[#F5F5DC] text-[#5D4037] whitespace-nowrap">
        확정 대기 중
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center text-xs font-black px-1.5 py-0.5 rounded-full bg-gray-200 text-black whitespace-nowrap">
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
        <span className={`ml-auto text-xs font-black px-2 py-0.5 rounded-full ${toneBadge}`}>
          {list.length}명
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-500 font-medium py-4 text-center">
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
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${toneBadge}`}>
                    {p.ageBand}
                  </span>
                )}
                {/* 상태 미니 배지 — 연령대 바로 우측 */}
                <StatusMiniBadge status={p.status} />
                {/* 솔로파티 참가 구성 — 신청한 항목 이름 (명세 10-2 기본안) */}
                {p.optionName && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 whitespace-nowrap">
                    {p.optionName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                {p.mbti && (
                  <span className="text-xs font-black text-brand-point-ink bg-brand-point/10 px-1.5 py-0.5 rounded-full">
                    {p.mbti}
                  </span>
                )}
                {p.job && (
                  <span className="text-xs font-medium text-gray-500 truncate max-w-[7rem]">
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
  // useParties()는 마운트 시 빌드타임 샘플(SEED_PARTIES)로 먼저 렌더된 뒤 실시간 데이터로 교체됨.
  // 참조가 SEED_PARTIES 그대로라는 건 "이 마운트에서 아직 실시간 데이터를 못 받은 상태"라는 뜻이므로,
  // 이 경우엔 "찾을 수 없음"으로 오판하지 않도록 별도 로딩 상태로 처리 (라우트 이동 때마다 새로 계산되어
  // 이전 페이지의 로딩 상태를 물려받지 않음 — 전역/모듈 상태 없이 이 컴포넌트 렌더에서만 판단).
  const partiesLoaded = PARTIES !== SEED_PARTIES;
  const baseItem = PARTIES.find(p => p.id === id);
  const router = useRouter();
  const { isLoggedIn, addToCart, profile, partyCounts, cart, bookings, verifySession } = useAuth();
  // 이미 신청한 파티 — cancelled 가 아닌 모든 booking 상태(결제완료/확정대기/참가확정)를 차단 사유로 간주
  const alreadyBooked = bookings.some(b => b.partyId === id && b.status !== "cancelled");

  // 행사 일시 경과 여부 — KST 기준 오늘 날짜 > calendarDate (YYYY-MM-DD) 면 종료
  const todayKST = typeof window !== "undefined"
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date())
    : "";
  const [showCartModal, setShowCartModal] = useState(false);
  // 솔로파티 참가 구성 — 고른 참가 항목 id (명세 8-1)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
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

  // 상세페이지 안내(detail) — /api/party-detail.php 로 따로 조회 (목록 API 에는 detail 이 없음).
  //   응답을 받기 전에는 편집 가능한 영역(사진 ①~⑤, 진행 안내, 소요시간)을 그리지 않는다 — 솔로파티에 매칭파티 안내가 잠깐 비치지 않도록.
  //   요청이 실패하면 종류별 기본 내용(템플릿)을 쓴다.
  const [detailRes, setDetailRes] = useState<{ id: string; partyType: PartyType | null; detail: PartyDetail | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/party-detail.php?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        const t = d?.ok && (d.partyType === "solo" || d.partyType === "matching") ? (d.partyType as PartyType) : null;
        setDetailRes({ id, partyType: t, detail: d?.ok ? normalizeDetail(d.detail) : null });
      })
      .catch(() => { if (!cancelled) setDetailRes({ id, partyType: null, detail: null }); });
    return () => { cancelled = true; };
  }, [id]);

  // 실시간 결제완료 인원만 노출 — DB 카운트가 없으면 0/12로 표시 (시드/테스트 데이터 무시)
  // 참가 구성 파티는 회차별 인원도 함께 (withLiveCounts)
  const detailItem = baseItem ? withLiveCounts(baseItem, partyCounts[id]) : undefined;

  if (!detailItem) {
    // 실시간 파티 데이터 최초 fetch가 아직 끝나지 않은 구간 — 빌드 시점 샘플 목록만 있어
    // 실제로는 존재하는 파티도 일시적으로 못 찾은 것처럼 보일 수 있으므로, fetch 완료 전까지는
    // "찾을 수 없음" 대신 로딩 상태를 보여줘 자연스럽게 진입되도록 함.
    if (!partiesLoaded) {
      return (
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 flex items-center justify-center px-4">
            <span
              role="status"
              aria-label="불러오는 중"
              className="block w-11 h-11 rounded-full border-[3px] border-gray-200 border-t-brand-point animate-spin"
            />
          </main>
          <Footer />
        </div>
      );
    }
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">파티를 찾을 수 없습니다.</h1>
            <Link href="/#apply" className="text-brand-point-ink underline">목록으로 돌아가기</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // 남은 자리·마감 — 메인 카드·일정 섹션과 같은 계산 (참가 구성 파티는 회차 기준, 명세 8-3)
  const stock = partyStockStatus(detailItem);
  // 회차별 남/여 인원/정원 한 묶음 (상세 상단 현황 — PC·모바일 같은 내용)
  const sessionCounts = (
    <div className="flex flex-wrap justify-end items-center gap-x-3 gap-y-0.5 bg-white/95 px-2.5 py-1 md:px-3 md:py-1.5 rounded-2xl shadow-lg text-xs font-bold border border-gray-100 md:border-0">
      {stock.sessions.map(s => (
        <span key={s.id} className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="session-count">
          <UsersIcon size={12} className="flex-shrink-0 text-gray-500" />
          <span className="text-brand-black">{s.name}</span>
          <span className="text-blue-400">남 {s.maleBooked ?? 0}/{s.maleStock}</span>
          <span className="text-gray-400">·</span>
          <span className="text-pink-400">여 {s.femaleBooked ?? 0}/{s.femaleStock}</span>
        </span>
      ))}
    </div>
  );
  // 고른 참가 항목 — 그사이 내 성별 기준으로 마감됐으면 고르지 않은 것으로 본다
  const selectedOption = stock.hasOptions
    ? stock.options.find(o => o.id === selectedOptionId && !optionClosedFor(o, profile?.gender)) ?? null
    : null;
  const partyType: PartyType = detailRes?.partyType ?? partyTypeOf(detailItem);
  const typeLabel = PARTY_TYPE_LABELS[partyType];
  // 화면에 그릴 안내 — detail ?? 종류별 템플릿. 응답 전(null)이면 편집 영역을 그리지 않는다.
  //   요청이 실패해 종류를 모르면 실시간 파티 목록을 받은 뒤에 그 종류로 템플릿을 고른다(빌드 시점 샘플로 오판 방지).
  const detailReady = !!detailRes && detailRes.id === id && (detailRes.detail !== null || detailRes.partyType !== null || partiesLoaded);
  const shownDetail: PartyDetail | null = detailReady && detailRes ? (detailRes.detail ?? templateFor(partyType)) : null;
  const renderDetailImage = (img: PartyDetailImage, i: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img key={`${img.url}-${i}`} src={img.url} alt={img.alt} className="block w-full h-auto object-contain" />
  );
  // 사진 ①·② — 감싸는 영역째 그리고, 사진이 0장이면 영역도 그리지 않는다(빈 여백 방지). 여러 장이면 ③처럼 세로로 나열.
  const renderWrappedSlot = (slot: DetailImageSlot, wrapClass: string) => {
    const imgs = shownDetail?.images[slot] ?? [];
    if (imgs.length === 0) return null;
    return (
      <div className={wrapClass}>
        <div className="max-w-4xl mx-auto space-y-10 md:space-y-24">
          {imgs.map(renderDetailImage)}
        </div>
      </div>
    );
  };
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
    if (confirm("이미 신청한 파티입니다. 마이페이지에서 확인하시겠습니까?")) {
      router.push("/mypage");
    }
    return true; // alreadyBooked 인 경우는 confirm 결과 무관 후속 로직 차단
  };

  // 참가 구성 파티 — 같은 파티가 다른 항목으로 장바구니에 있으면 항목을 바꿀지 묻는다 (장바구니는 파티당 한 줄)
  const confirmOptionChange = (oldOptionId: string | undefined, newName: string): boolean => {
    const oldName = stock.options.find(o => o.id === oldOptionId)?.name;
    return confirm(oldName
      ? `장바구니에 담긴 참가 항목(${oldName})을 ${newName}(으)로 바꿀까요?`
      : `장바구니에 담긴 이 파티의 참가 항목을 ${newName}(으)로 바꿀까요?`);
  };

  // 참가신청 — 카트에 담고 마이페이지로 이동 (중복 신청/카트 시 차단)
  const handleCheckout = async () => {
    // 세션 만료 방어 (v5.1) — 미로그인/만료 시 이후 로직(중복체크·카트·결제) 전부 차단
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/party/${id}/`)}`);
      return;
    }
    if (!(await verifySession())) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      router.push(`/login?redirect=${encodeURIComponent(`/party/${id}/`)}`);
      return;
    }
    if (handleAlreadyBookedPrompt()) return;
    if (!profile?.gender) {
      alert("프로필 정보(성별)가 필요합니다. 프로필을 먼저 완성해주세요.");
      router.push("/profile-setup/");
      return;
    }
    const blocked = checkBlockedReason();
    if (blocked) { alert(blocked); return; }
    if (stock.hasOptions && !selectedOption) { alert("참가 항목을 선택해주세요"); return; }

    const inCart = cart.find(c => c.partyId === id);
    if (inCart && !(selectedOption && inCart.optionId !== selectedOption.id)) {
      alert("이미 장바구니에 담겨 있습니다. 마이페이지에서 결제를 진행해주세요.");
      router.push("/mypage");
      return;
    }
    if (inCart && selectedOption && !confirmOptionChange(inCart.optionId, selectedOption.name)) return;
    addToCart(id, selectedOption?.id);
    router.push("/mypage");
  };

  // 장바구니 — 한 사용자는 같은 파티에 1회만 담을 수 있음 + 이미 신청한 파티 confirm 안내
  const handleAddToCart = async () => {
    // 세션 만료 방어 (v5.1) — 미로그인/만료 시 이후 로직 전부 차단
    if (!isLoggedIn) {
      router.push(`/login?redirect=${encodeURIComponent(`/party/${id}/`)}`);
      return;
    }
    if (!(await verifySession())) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      router.push(`/login?redirect=${encodeURIComponent(`/party/${id}/`)}`);
      return;
    }
    if (handleAlreadyBookedPrompt()) return;
    if (!profile?.gender) {
      alert("프로필 정보(성별)가 필요합니다. 프로필을 먼저 완성해주세요.");
      router.push("/profile-setup/");
      return;
    }
    const blocked = checkBlockedReason();
    if (blocked) { alert(blocked); return; }
    if (stock.hasOptions && !selectedOption) { alert("참가 항목을 선택해주세요"); return; }

    const inCart = cart.find(c => c.partyId === id);
    if (inCart && !(selectedOption && inCart.optionId !== selectedOption.id)) {
      alert("이미 장바구니에 담긴 파티입니다.");
      return;
    }
    if (inCart && selectedOption && !confirmOptionChange(inCart.optionId, selectedOption.name)) return;
    addToCart(id, selectedOption?.id);
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
          <div className="max-w-4xl mx-auto">
            <Link href="/#apply" className="inline-flex items-center gap-2 text-gray-500 hover:text-brand-black -mt-3 py-3 mb-4 md:mt-0 md:py-0 md:mb-12 font-bold transition-colors text-sm md:text-base">
              <ArrowLeft size={18} /> 목록으로 돌아가기
            </Link>
          </div>

          {/* TOP SECTION: MAIN INFO — 이미지 상단 → 제목 → 소제목 → 일시/장소/대상 → 참가비 → 남녀 인원 → 확인사항 → 참가대상 → 버튼,
               전부 max-w-4xl 단일 컬럼 (아래 다른 섹션들과 좌/우 폭 통일) */}
          <div className="max-w-4xl mx-auto mb-10 md:mb-16">
            {/* 최상단 이미지 — 관리자페이지의 "대표 이미지"(imageUrl)를 그대로 노출, 미등록 파티는 메인페이지와 동일한 공통 디폴트로 대체 */}
            <div className="relative mb-6 md:mb-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detailItem.imageUrl || "/images/party_card_default_banner.jpg"}
                alt={detailItem.title}
                className="block w-full h-auto"
              />
              {/* 상태 배지 — 우선순위: 행사일 경과(모집종료) > 정원 만석(모집마감) > 모집중 (기존 로직 그대로) */}
              {(() => {
                const status: "ended" | "full" | "open" =
                  isExpired ? "ended" : stock.allFull ? "full" : "open";
                const badge = {
                  ended: { label: "모집종료", cls: "bg-danger text-white" },
                  full:  { label: "모집마감", cls: "bg-gray-300 text-black" },
                  open:  { label: "모집중",   cls: "bg-brand-point text-black" },
                }[status];
                return (
                  <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 flex items-center gap-1.5 md:gap-2">
                    <div className={`font-bold px-3 py-1 md:px-4 md:py-1.5 rounded-full text-xs md:text-sm shadow-xl ${badge.cls}`}>
                      {badge.label}
                    </div>
                    {/* 파티 종류 배지 */}
                    <div className="font-bold px-3 py-1 md:px-4 md:py-1.5 rounded-full text-xs md:text-sm shadow-xl bg-gray-900 text-white">
                      {typeLabel}
                    </div>
                  </div>
                );
              })()}
              {/* 남녀 인원 — 이미지 우측 하단 오버레이 (아이콘 + 남성 파랑 / 여성 분홍), 가독성을 위해 흰색 pill 배경 */}
              {stock.hasOptions ? (
                // 참가 구성 파티 — 회차별 남/여 인원/정원 (명세 8-1). PC 는 이미지 오른쪽 아래, 모바일은 이미지 바로 아래(아래 sessionCounts)
                <div className="hidden md:flex absolute bottom-4 right-4 left-4 justify-end z-10 pointer-events-none" data-testid="session-counts">
                  {sessionCounts}
                </div>
              ) : (
              <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 flex items-center gap-2 bg-white/95 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full shadow-lg z-10 text-xs font-bold">
                <span className="flex items-center gap-1 text-blue-400">
                  <UsersIcon size={12} className="flex-shrink-0" />
                  남성 {detailItem.maleBooked}/{detailItem.maleStock}
                </span>
                <span className="flex items-center gap-1 text-pink-400">
                  <UsersIcon size={12} className="flex-shrink-0" />
                  여성 {detailItem.femaleBooked}/{detailItem.femaleStock}
                </span>
              </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            </div>
            {/* 참가 구성 파티 — 모바일 회차별 현황 (납작한 배너에서 왼쪽 위 배지와 겹치지 않게 이미지 아래) */}
            {stock.hasOptions && (
              <div className="md:hidden flex justify-end -mt-4 mb-5" data-testid="session-counts-mobile">
                {sessionCounts}
              </div>
            )}

            {/* 제목 — 중앙정렬 */}
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2 leading-snug text-center">{detailItem.title}</h1>
            {/* 내용(소개) — 관리자가 등록한 소개(description) 우선 노출, 없으면 기본 카피 — 중앙정렬 */}
            <p className="text-[13px] md:text-sm text-gray-500 mb-4 md:mb-5 font-medium leading-relaxed whitespace-pre-line break-keep text-center">
              {detailItem.description?.trim()
                ? detailItem.description
                : "단순한 만남을 넘어 감성을 향유하는 시간.\n어울림이 큐레이션한 프리미엄 네트워킹에 초대합니다."}
            </p>

            {/* Info rows — 일시/장소/대상 */}
            <div className="space-y-0 mb-4 md:mb-5">
              {[
                {
                  label: "일시 (Date)",
                  // 참가 구성 파티 — 날짜 + 회차 시간표 ("1부 19:00 · 2부 21:30")
                  value: stock.hasOptions ? (
                    <>
                      {dateOnly(detailItem.dateString)}
                      <span className="block text-xs md:text-sm text-gray-600 mt-0.5" data-testid="session-timetable">
                        {stock.sessions.map(s => `${s.name} ${s.startTime}`).join(" · ")}
                      </span>
                    </>
                  ) : detailItem.dateString,
                },
                { label: "장소 (Location)", value: detailItem.location },
                { label: "대상 (Target)", value: detailItem.target },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-200 text-xs md:text-sm gap-2">
                  <span className="text-gray-500 font-medium flex-shrink-0">{row.label}</span>
                  <span className={`font-bold text-right ${row.label === "일시 (Date)" ? "text-sm md:text-base" : ""}`}>{row.value}</span>
                </div>
              ))}
              {/* 참가비 — 참가 구성 파티는 항목별 남/여 가격 목록 */}
              {stock.hasOptions ? (
                <div className="py-2.5 border-b border-gray-200 text-xs md:text-sm" data-testid="option-prices">
                  <span className="text-gray-500 font-medium">참가비 (Price)</span>
                  <ul className="mt-1.5 space-y-1">
                    {stock.options.map(o => (
                      <li key={o.id} className="flex items-baseline justify-between gap-2">
                        <span className="font-bold break-keep">{o.name}</span>
                        <span className="font-black text-brand-black flex flex-wrap items-baseline justify-end gap-x-2 tabular-nums">
                          <span><span className="text-xs text-gray-500 font-bold">남성</span> ₩{o.priceMale.toLocaleString()}</span>
                          <span className="text-gray-500">/</span>
                          <span><span className="text-xs text-gray-500 font-bold">여성</span> ₩{o.priceFemale.toLocaleString()}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {/* 참가비 — 성별별 분리 표시 (남성 / 여성). 미설정 시 price 폴백 단일 표시 */}
              {!stock.hasOptions && (() => {
                const pm = (detailItem as { priceMale?: number }).priceMale;
                const pf = (detailItem as { priceFemale?: number }).priceFemale;
                const hasSplit = (pm && pm > 0) || (pf && pf > 0);
                const maleAmt   = pm && pm > 0 ? pm : detailItem.price;
                const femaleAmt = pf && pf > 0 ? pf : detailItem.price;
                return (
                  <div className="flex items-center justify-between py-2.5 border-b border-gray-200 text-xs md:text-sm gap-2">
                    <span className="text-gray-500 font-medium flex-shrink-0">참가비 (Price)</span>
                    {hasSplit ? (
                      <span className="font-black text-brand-black flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-xs text-gray-500 font-bold">남성</span>
                          <span className="text-base md:text-lg tabular-nums">₩{maleAmt.toLocaleString()}</span>
                        </span>
                        <span className="text-gray-500">/</span>
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-xs text-gray-500 font-bold">여성</span>
                          <span className="text-base md:text-lg tabular-nums">₩{femaleAmt.toLocaleString()}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="font-black text-base md:text-lg text-brand-black tabular-nums">₩{detailItem.price.toLocaleString()}</span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 신청 전 꼭 확인해주세요 */}
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 mb-3">
              <h4 className="font-bold mb-1.5 flex items-center gap-1.5 text-xs md:text-sm">
                <Heart size={14} className="text-brand-point-ink" /> 신청 전 꼭 확인해주세요.
              </h4>
              <p className="text-[13px] md:text-xs text-gray-500 leading-relaxed break-keep">
                어울림은 진정성 있는 만남을 위해 <strong className="font-bold text-brand-black">100% 사전 승인제</strong>로 운영됩니다.
                결제 후 프로필 정보를 입력해 주시면 <strong className="font-bold text-brand-black">[확정 대기 중]</strong> 상태가 되며,
                관리자의 꼼꼼한 확인을 거쳐 최종 <strong className="font-bold text-brand-black">[참가 확정]</strong>이 이루어집니다.
                참가 확정 및 안내 문자는 확정 시점에 맞춰 순차적으로 발송됩니다.
              </p>
            </div>

            {/* 참가 대상 표시 — 자격 제한이 설정된 경우 노출 (기존 로직 그대로) */}
            {eligibilityLabel && (
              <div className={`mb-4 px-3.5 py-2 rounded-xl text-xs font-bold border ${
                isLoggedIn && !eligibility.ok
                  ? "bg-red-50 border-red-100 text-red-700"
                  : "bg-brand-point/10 border-brand-point/20 text-brand-point-ink"
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

            {/* 참가 항목 선택 — 참가 구성 파티만, 모집 중일 때 (명세 8-1) */}
            {stock.hasOptions && !isExpired && (
              <PartyOptionPicker
                stock={stock}
                gender={isLoggedIn ? profile?.gender : null}
                selectedId={selectedOption?.id ?? null}
                onSelect={setSelectedOptionId}
              />
            )}

            {/* 참가하기 / 장바구니 버튼 — 조건/비활성화 로직은 기존 그대로, 기본 문구만 "참가신청"→"참가하기" */}
            {isExpired ? (
              <div
                role="status"
                aria-disabled="true"
                className="w-full px-5 py-3 rounded-xl text-sm font-bold shadow-xl text-center bg-danger text-white pointer-events-none select-none"
              >
                모집 종료된 파티
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
                        : "참가하기";
              return (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={hardDisabled}
                    className={`flex-[2] px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-xl ${
                      grayedOut
                        ? `bg-gray-200 text-gray-500 shadow-none ${alreadyBooked && !hardDisabled ? "cursor-pointer hover:bg-gray-300" : "cursor-not-allowed"}`
                        : "bg-brand-black text-white hover:bg-brand-point hover:text-black hover:shadow-brand-point/30"
                    }`}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={hardDisabled}
                    className={`flex-1 px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-xl ${
                      grayedOut
                        ? `bg-gray-200 text-gray-500 shadow-none ${alreadyBooked && !hardDisabled ? "cursor-pointer hover:bg-gray-300" : "cursor-not-allowed"}`
                        : "bg-brand-black text-white hover:bg-brand-point hover:text-black"
                    }`}
                  >
                    장바구니
                  </button>
                </div>
              );
            })()}
          </div>

          {/* PARTICIPANTS PANEL — 다른 섹션들(참가 신청 방법/Party Timeline 등)과 동일 폭 max-w-4xl */}
          {(participants.male.length > 0 || participants.female.length > 0) && (
            <div className="max-w-4xl mx-auto mb-10 md:mb-16">
              {/* 안내 헤드라인 — 청록 포인트 컬러 */}
              <div className="flex items-center gap-3 mb-5 md:mb-7">
                <UsersIcon size={20} className="text-brand-point-ink flex-shrink-0" />
                <h3 className="text-xl md:text-3xl font-bold tracking-tight break-keep">
                  <span className="text-brand-point-ink">{detailItem.title}</span>
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
                  <span className="text-xs font-black text-brand-point-ink bg-brand-point/10 px-2.5 py-1 rounded-full whitespace-nowrap">
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
                      toneAccent="text-info"
                      toneBadge="bg-[#E3F2FD] text-info"
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
                            <ShieldCheck size={20} className="text-brand-point-ink md:hidden" />
                            <ShieldCheck size={24} className="text-brand-point-ink hidden md:block" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-black tracking-[0.2em] text-brand-point-ink mb-1.5 md:mb-2 uppercase">
                            Singles Only
                          </p>
                          <p className="text-sm md:text-base text-gray-700 leading-relaxed break-keep">
                            해당 파티는 법적 혼인 이력이 없는 <strong className="font-black text-brand-black">&apos;싱글&apos;</strong> 회원님만을 대상으로 진행되는 {typeLabel}입니다.{" "}
                            <strong className="font-black text-brand-black">&apos;싱글&apos;</strong>이 아님이 확인될 경우, 즉시{" "}
                            <strong className="font-black text-brand-point-ink">회원탈퇴</strong>와 함께 블랙리스트 조치되며,
                            허위 정보 기재에 따른 민·형사상의{" "}
                            <strong className="font-black text-brand-point-ink">강력한 법적 책임</strong>을 물을 수 있음을 고지합니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-brand-point/5 border border-brand-point/25 rounded-2xl md:rounded-3xl p-5 md:p-7 shadow-sm">
                      <div className="flex gap-3 md:gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-brand-point/15 flex items-center justify-center">
                            <Info size={20} className="text-brand-point-ink md:hidden" />
                            <Info size={24} className="text-brand-point-ink hidden md:block" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-xs font-black tracking-[0.2em] text-brand-point-ink mb-1.5 md:mb-2 uppercase">
                            Open Matching
                          </p>
                          <p className="text-sm md:text-base text-gray-700 leading-relaxed break-keep">
                            해당 파티는 새로운 시작을 꿈꾸는 <strong className="font-black text-brand-black">&apos;돌싱&apos;</strong> 회원님까지 참여하실 수 있는{" "}
                            <strong className="font-black text-brand-point-ink">열린 {typeLabel}</strong>입니다.
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

          {/* 사진 ① 참가 신청 방법 위 — 컨테이너 폭(max-w-4xl) 1:1 매칭, 라운드 X, 비율 보존. 사진이 없으면 영역째 그리지 않음 */}
          {renderWrappedSlot("beforeApply", "mb-7 md:mb-10")}

          {/* HOW TO JOIN — Timeline-styled Application Guide */}
          <div className="mb-10 md:mb-24">
            <div className="max-w-4xl mx-auto">
              <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 md:gap-4 mb-7 md:mb-12">
                  <ClipboardList size={26} className="text-brand-point-ink md:hidden" />
                  <ClipboardList size={32} className="text-brand-point-ink hidden md:block" />
                  <h3 className="text-xl md:text-3xl font-bold tracking-tight">참가 신청 방법</h3>
                </div>

                <div className="space-y-7 md:space-y-12 relative before:absolute before:left-3.5 md:before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
                  {[
                    {
                      title: "파티 카드를 확인하고 결제하기",
                      desc: "파티 카드의 일시, 장소, 연령대를 확인하고 결제해주세요.",
                      note: null,
                    },
                    {
                      title: "프로필 카드 작성하기",
                      desc: "프로필 카드 작성을 완료해야 참가확정을 받으실 수 있습니다.",
                      note: "마이페이지의 내 예약 현황에서 현재 참가 확정 여부를 확인하실 수 있습니다.",
                    },
                    {
                      title: "파티 참가확정 확인 후 방문하기",
                      desc: "참가확정이 되어야만 참석 가능하오니 알림 문자나 참가 확정 여부를 꼭 확인해주세요!",
                      note: "성비가 맞지 않거나 주최측의 사정으로 파티가 취소될 경우 100% 환불이나 쿠폰 적립 후 다음 모임 선확정 중 선택하실 수 있습니다.",
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="relative pl-12 md:pl-14">
                      <div className="absolute left-0 top-0 w-7 h-7 md:w-8 md:h-8 bg-brand-point text-black rounded-full border-4 border-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                        {idx + 1}
                      </div>
                      <div className="text-brand-point-ink font-black text-xs md:text-sm tracking-[0.15em] mb-1 md:mb-1.5">STEP {idx + 1}</div>
                      <div className="font-bold text-base md:text-xl mb-1.5 md:mb-2 text-brand-black leading-snug">{item.title}</div>
                      <div className="text-gray-600 font-medium text-sm md:text-base leading-relaxed">{item.desc}</div>
                      {item.note && (
                        <div className="mt-2.5 md:mt-3 bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 md:pl-4 py-2 md:py-2.5 rounded-r-lg">
                          <p className="text-[13px] md:text-sm text-gray-600 leading-relaxed">{item.note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 사진 ② 참가 신청 방법 아래 — 컨테이너 폭(max-w-4xl) 1:1, 비율 보존 */}
          {renderWrappedSlot("afterApply", "mb-10 md:mb-24")}

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
                {/* 사진 ③ 진행 안내 위 — 여러 장이면 세로로 나열 (motion.div 의 space-y 간격을 그대로 받도록 직접 자식으로) */}
                {shownDetail?.images.beforeTimeline.map(renderDetailImage)}

                {/* Timeline / Schedule Section — STEP 방식 + 인원별 소요시간 표. 단계가 없으면 카드 전체를 숨김 */}
                {shownDetail && shownDetail.timeline.steps.length > 0 && (
                <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                    <Clock size={26} className="text-brand-point-ink md:hidden" />
                    <Clock size={32} className="text-brand-point-ink hidden md:block" />
                    <h3 className="text-xl md:text-3xl font-bold tracking-tight">{shownDetail.timeline.title}</h3>
                  </div>
                  {shownDetail.timeline.intro && (
                    <p className="text-sm md:text-base text-gray-500 font-medium mb-7 md:mb-12 leading-relaxed">
                      {shownDetail.timeline.intro}
                    </p>
                  )}

                  {/* STEP 카드 — 번호(01, 02…)는 순서대로 자동 */}
                  <div className="space-y-5 md:space-y-7">
                    {shownDetail.timeline.steps.map((item, idx) => (
                      <div
                        key={idx}
                        className="relative pl-12 md:pl-16 pb-5 md:pb-7 border-b border-gray-100 last:border-b-0 last:pb-0"
                      >
                        {/* STEP 번호 — 청록 #008080 (brand-point) */}
                        <div className="absolute left-0 top-0 w-9 h-9 md:w-11 md:h-11 rounded-full bg-brand-point text-black shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                          {String(idx + 1).padStart(2, "0")}
                        </div>
                        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mb-1.5 md:mb-2">
                          <span className="text-xs font-black tracking-[0.2em] text-brand-point-ink">
                            {`STEP ${String(idx + 1).padStart(2, "0")}`}
                          </span>
                          {item.time && (
                            <span className="inline-flex items-center text-xs font-bold text-brand-point-ink bg-brand-point/10 px-2 py-0.5 rounded-full">
                              {item.time}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-base md:text-xl mb-2 md:mb-2.5 text-brand-black leading-snug">
                          {item.title}
                        </div>
                        <p className="text-sm md:text-base text-gray-600 leading-relaxed break-keep whitespace-pre-line">
                          {item.desc}
                        </p>
                        {item.note && (
                          <p className="mt-2.5 md:mt-3 text-[13px] md:text-xs text-gray-500 italic bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 py-2 rounded-r-md leading-relaxed whitespace-pre-line">
                            &ldquo;{item.note}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 인원별 소요 시간 안내 표 — 줄이 없으면 이 블록만 숨김 */}
                  {shownDetail.durations.rows.length > 0 && (
                  <div className="mt-8 md:mt-12">
                    <h4 className="text-sm md:text-base font-black tracking-tight text-brand-black mb-3 md:mb-4 flex items-center gap-2">
                      <span className="w-1 h-4 bg-brand-point rounded-full" />
                      {shownDetail.durations.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {shownDetail.durations.rows.map((row, i) => (
                        <div
                          key={i}
                          className="bg-brand-point/5 border border-brand-point/15 rounded-xl px-5 py-4 flex items-center justify-between gap-3 md:flex-col md:justify-center md:text-center md:gap-1.5 md:py-6"
                        >
                          <div className="flex items-center gap-2 md:gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-point flex-shrink-0" />
                            <span className="font-black text-base text-brand-black break-keep">{row.label}</span>
                          </div>
                          <span className="font-black text-lg md:text-xl text-brand-point-ink tabular-nums break-keep">{row.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
                )}

                {/* 사진 ④ 필수 확인 사항 위 */}
                {shownDetail?.images.beforeNotice.map(renderDetailImage)}

                {/* ── 필수 확인 사항 — Final CTA 직전, 참가 신청 방법/Party Timeline 과 동일 톤 ── */}
                <div className="bg-white p-6 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                    <ShieldCheck size={26} className="text-brand-point-ink md:hidden" />
                    <ShieldCheck size={32} className="text-brand-point-ink hidden md:block" />
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
                        desc:  "파티는 정해진 성비를 맞추어 세심하게 준비됩니다. 당일 무단 불참(No-Show)은 다른 참가자분들의 소중한 기회를 저해하므로 신중한 참가신청을 부탁드립니다.",
                        warn:  "무단 불참 시 향후 모든 파티 참여가 제한될 수 있습니다.",
                      },
                      {
                        title: "현장 기록 및 마케팅 활용 안내",
                        desc:  "파티의 분위기를 기록하기 위해 현장 스케치 촬영이 진행될 수 있습니다. 촬영된 모든 사진은 참가자의 프라이버시 보호를 위해 얼굴 식별이 불가능하도록 블러/모자이크 처리 후 마케팅 자료로 활용됩니다.",
                        warn:  null,
                      },
                    ].map((item, idx) => (
                      <div key={idx} className="relative pl-12 md:pl-14">
                        <div className="absolute left-0 top-0 w-7 h-7 md:w-8 md:h-8 bg-brand-point text-black rounded-full border-4 border-white shadow-md flex items-center justify-center font-black text-xs md:text-sm">
                          {idx + 1}
                        </div>
                        <div className="font-bold text-base md:text-xl mb-1.5 md:mb-2 text-brand-black leading-snug">{item.title}</div>
                        <div className="text-gray-600 font-medium text-sm md:text-base leading-relaxed break-keep">{item.desc}</div>
                        {item.warn && (
                          <div className="mt-2.5 md:mt-3 bg-red-50 border-l-2 border-red-400/60 pl-3 md:pl-4 py-2 md:py-2.5 rounded-r-lg">
                            <p className="text-[13px] md:text-sm text-red-700 font-bold leading-relaxed break-keep">⚠ {item.warn}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 사진 ⑤ 필수 확인 사항 아래 */}
                {shownDetail?.images.afterNotice.map(renderDetailImage)}

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
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md p-7 md:p-9 relative max-h-[90vh] overflow-y-auto md:max-h-none md:overflow-visible"
            >
              <button
                type="button"
                onClick={() => setShowCartModal(false)}
                className="absolute top-4 right-4 -m-[11px] p-[11px] text-gray-500 hover:text-gray-600 transition-colors"
                aria-label="닫기"
              >
                <X size={22} />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-brand-point/10 rounded-full flex items-center justify-center mb-5">
                  <ShoppingBag size={32} className="text-brand-point-ink md:hidden" />
                  <ShoppingBag size={38} className="text-brand-point-ink hidden md:block" />
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
                    className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-sm md:text-base hover:bg-brand-point hover:text-black transition-all shadow-lg hover:shadow-brand-point/30 flex items-center justify-center gap-2"
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
