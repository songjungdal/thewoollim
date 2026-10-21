"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShoppingBag, X, Users as UsersIcon, CalendarDays, MapPin, UserRound, ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { partyStockStatus, withLiveCounts, dateOnly, partyHasOptions, partyTypeOf, PARTY_TYPE_LABELS, type Party, type PartyType } from "../../lib/data";
import PartyOptionPicker, { optionClosedFor } from "./PartyOptionPicker";
import { PARTY_GUIDES, visibleNotices, markupToGuideText } from "../../lib/partyGuides";
import { templateFor, normalizeDetail, timelineTitleOf, DEFAULT_ABOUT_TITLE, DEFAULT_APPLY_TITLE, DEFAULT_NOTICE_TITLE, DEFAULT_BEFORE_APPLY_TITLE, type PartyDetail, type DetailImageSlot } from "../../lib/partyDetailTemplates";
import { useAuth } from "../../context/AuthContext";
import { useParties, PARTIES_NOT_LOADED } from "../../lib/useParties";
import { checkEligibility, calculateAge } from "../../lib/eligibility";
import { partyShortDate } from "../../lib/partySeo";
import { optionsMinPrice } from "../../lib/partyOptions";
import ParticipantsRoster, { type Participant, type GenderSeats, type RosterStatus } from "./ParticipantsRoster";
import PartyCtaButtons, { type PartyCtaState } from "./PartyCtaButtons";
import PartyBottomBar, { type BarFee } from "./PartyBottomBar";
import DetailPhotos from "./DetailPhotos";

/** 오늘 날짜(한국 시간) "YYYY-MM-DD" — useSyncExternalStore 용 (날짜가 바뀌어도 다시 구독할 필요는 없음) */
const todayKSTString = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const noSubscribe = () => () => {};
/** 지금 시각(한국 시간) "HH:MM" — 참가자 명단 "14:05 기준" */
const hhmmKST = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/** 본문 폭 — 모바일 좌우 16px / 태블릿 본문 720px(좌우 24px) / PC 본문 860px (docs/specs/party-detail-relayout.md F) */
const CONTAINER = "mx-auto w-full px-4 md:max-w-[768px] md:px-6 lg:max-w-[908px]";
/** 섹션 제목 — 모바일 20px / 태블릿 24px / PC 26px */
const SECTION_TITLE = "text-[20px] font-black leading-snug tracking-tight text-brand-black break-keep md:text-[24px] lg:text-[26px]";
/** 본문 글자 — 모바일 14px / 태블릿·PC 15px, 줄 간격 1.7 */
const BODY_TEXT = "text-[14px] leading-[1.7] md:text-[15px]";
const DEFAULT_IMAGE = "/images/party_card_default_banner.jpg";

/** 앵커 이동 때 섹션 제목과 sticky 탭 사이에 남길 여백(px) */
const ANCHOR_GAP = 16;
/** 앵커 탭 — 실시간 참가자 / 신청방법 / 진행방식 / 유의사항 (D-2, 신청방법을 진행방식 앞으로 — 2026-10-21 사용자 요청). 섹션이 없는 탭은 그리지 않는다 */
const ANCHOR_TABS = [
  { id: "participants", label: "실시간 참가자" },
  { id: "apply-guide",  label: "신청방법" },
  { id: "timeline",     label: "진행방식" },
  { id: "notice",       label: "유의사항" },
] as const;
type AnchorId = typeof ANCHOR_TABS[number]["id"];
const isAnchorId = (v: string): v is AnchorId => ANCHOR_TABS.some(t => t.id === v);

/**
 * initialParties: 빌드 시점에 받은 이 파티 1건 (page.tsx 가 넘김). 빌드 데이터에 이 id 가 없으면 넘기지 않는다.
 *   있으면 정적 HTML 에 파티 이름·일시·장소·대상·참가비가 들어가고, 화면이 열린 뒤 실시간 데이터로 바뀐다.
 * 화면 구성·반응형 기준: docs/specs/party-detail-relayout.md
 */
export default function PartyClientView({ id, initialParties }: { id: string; initialParties?: Party[] }) {
  const PARTIES = useParties(initialParties);
  // useParties()는 빌드 시점 데이터가 없으면 PARTIES_NOT_LOADED 로 먼저 렌더된 뒤 실시간 데이터로 교체됨.
  // 참조가 PARTIES_NOT_LOADED 그대로라는 건 "이 마운트에서 아직 파티 데이터를 못 받은 상태"라는 뜻이므로,
  // 이 경우엔 "찾을 수 없음"으로 오판하지 않도록 별도 로딩 상태로 처리 (라우트 이동 때마다 새로 계산되어
  // 이전 페이지의 로딩 상태를 물려받지 않음 — 전역/모듈 상태 없이 이 컴포넌트 렌더에서만 판단).
  const partiesLoaded = PARTIES !== PARTIES_NOT_LOADED;
  const baseItem = PARTIES.find(p => p.id === id);
  const router = useRouter();
  const { isLoggedIn, addToCart, profile, partyCounts, cart, bookings, verifySession } = useAuth();
  // 이미 신청한 파티 — cancelled 가 아닌 모든 booking 상태(결제완료/확정대기/참가확정)를 차단 사유로 간주
  const alreadyBooked = bookings.some(b => b.partyId === id && b.status !== "cancelled");

  // 행사 일시 경과 여부 — KST 기준 오늘 날짜 > calendarDate (YYYY-MM-DD) 면 종료
  //   정적 HTML(빌드)과 첫 화면이 같도록 서버·하이드레이션 단계에선 "" (종료 아님), 그 뒤 브라우저 날짜로 다시 그린다
  const todayKST = useSyncExternalStore(noSubscribe, todayKSTString, () => "");
  const [showCartModal, setShowCartModal] = useState(false);
  // 솔로파티 참가 구성 — 고른 참가 항목 id (명세 8-1)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<{ male: Participant[]; female: Participant[] }>({ male: [], female: [] });
  const [participantsAt, setParticipantsAt] = useState<string | null>(null);   // 명단을 마지막으로 받은 시각 "HH:MM"
  // 신청 전 꼭 확인해주세요 — 기본 접힘 (C-5)
  const [beforeApplyOpen, setBeforeApplyOpen] = useState(false);
  // 필수 확인 사항 아코디언 — 사용자가 직접 열고 닫은 항목만 저장 (나머지는 기본값: 첫 항목·대상별 안내만 펼침)
  const [noticeOpen, setNoticeOpen] = useState<Record<string, boolean>>({});
  // 앵커 탭 — 지금 보고 있는 섹션. 탭·인원 표시를 누르면 그 섹션에 닿을 때까지(최대 4초, 손으로 스크롤하면 해제) 지나치는 섹션으로 바꾸지 않는다
  const [activeTab, setActiveTab] = useState<AnchorId | null>(null);
  const tabLockRef = useRef<{ id: AnchorId; until: number } | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  // 섹션 제목이 sticky 탭에 가려지지 않게 하는 위쪽 여백 = 헤더 + 탭 실제 높이 (화면 폭마다 다시 잰다)
  const [anchorOffset, setAnchorOffset] = useState(121);
  // 주소에 #participants 등으로 들어온 경우 — 화면이 다 그려지면 그 위치로 이동 (사용자가 먼저 스크롤하면 취소)
  const pendingHashRef = useRef<AnchorId | null>(null);

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
          setParticipantsAt(hhmmKST(new Date()));
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
  const detailReady = !!detailRes && detailRes.id === id;

  // 실시간 결제완료 인원만 노출 — DB 카운트가 없으면 0/12로 표시 (시드/테스트 데이터 무시)
  // 참가 구성 파티는 회차별 인원도 함께 (withLiveCounts)
  const detailItem = baseItem ? withLiveCounts(baseItem, partyCounts[id]) : undefined;
  const hasItem = !!detailItem;

  // 헤더 + 앵커 탭 높이 — 앵커 이동 위치(scroll-margin-top)와 "지금 보는 섹션" 판단에 쓴다
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector("header");
      const h = header ? header.getBoundingClientRect().height : 73;
      const t = tabsRef.current?.offsetHeight ?? 48;
      setAnchorOffset(Math.round(h + t));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [partiesLoaded, hasItem]);

  // 앵커 탭 활성 표시 — sticky 탭 바로 아래를 지난 마지막 섹션. 맨 아래까지 내리면 마지막 섹션
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-party-anchor]"));
      if (els.length === 0 || !tabsRef.current) return;
      const tabsBottom = tabsRef.current.getBoundingClientRect().bottom;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const lock = tabLockRef.current;
      if (lock) {
        const target = document.getElementById(lock.id);
        const reached = !!target && Math.abs(target.getBoundingClientRect().top - (tabsBottom + ANCHOR_GAP)) < 4;
        if (!reached && !atBottom && Date.now() < lock.until) return;
        tabLockRef.current = null;
        if (reached || atBottom) { setActiveTab(lock.id); return; }
      }
      const line = tabsBottom + ANCHOR_GAP + 8;
      let cur: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= line) cur = el.id;
      if (atBottom && cur) cur = els[els.length - 1].id;
      setActiveTab(cur && isAnchorId(cur) ? cur : null);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const releaseLock = () => { tabLockRef.current = null; };   // 손으로 스크롤하면 바로 스크롤 위치 기준으로
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", releaseLock, { passive: true });
    window.addEventListener("touchstart", releaseLock, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", releaseLock);
      window.removeEventListener("touchstart", releaseLock);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 섹션으로 이동 — 이미지 인원 표시·앵커 탭 공통. 섹션의 scroll-margin-top(헤더+탭)만큼 띄워서 멈춘다
  const scrollToSection = useCallback((target: AnchorId, behavior: ScrollBehavior = "smooth") => {
    const el = document.getElementById(target);
    if (!el) return;
    tabLockRef.current = { id: target, until: Date.now() + 4000 };
    setActiveTab(target);
    el.scrollIntoView({ behavior, block: "start" });
    if (window.location.hash !== `#${target}`) window.history.replaceState(window.history.state, "", `#${target}`);
  }, []);

  const jumpToPendingHash = useCallback(() => {
    const target = pendingHashRef.current;
    if (target && document.getElementById(target)) scrollToSection(target, "instant");
  }, [scrollToSection]);

  // 주소의 #participants 등 — 첫 진입 때만. 사진·안내가 늦게 들어와 위치가 밀리면 다시 맞춘다(4초 안, 사용자가 움직이기 전까지)
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!isAnchorId(hash)) return;
    pendingHashRef.current = hash;
    const cancel = () => { pendingHashRef.current = null; };
    const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    events.forEach(e => window.addEventListener(e, cancel, { passive: true, once: true }));
    const timer = setTimeout(cancel, 4000);
    window.addEventListener("load", jumpToPendingHash);
    return () => {
      events.forEach(e => window.removeEventListener(e, cancel));
      clearTimeout(timer);
      window.removeEventListener("load", jumpToPendingHash);
    };
  }, [jumpToPendingHash]);
  useEffect(() => {
    if (partiesLoaded && hasItem && detailReady) requestAnimationFrame(jumpToPendingHash);
  }, [partiesLoaded, hasItem, detailReady, jumpToPendingHash]);

  // 파티 데이터를 아직 하나도 받지 못한 구간(빌드 시점 데이터에 이 id 가 없고 실시간 fetch 전) —
  // 실제로는 존재하는 파티도 못 찾은 것처럼 보이지 않도록 로딩 화면만 보여준다
  // (빌드 시점 데이터가 없는 id 의 정적 HTML 은 이 화면으로 만들어짐).
  // 로딩 화면엔 푸터를 그리지 않는다 — 화면 높이뿐인 짧은 화면이라 푸터가 첫 화면에 보였다가 본문이 뜨면 사라져 깜빡여 보임.
  if (!partiesLoaded) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4" aria-busy="true">
          <span
            role="status"
            aria-label="불러오는 중"
            className="block w-11 h-11 rounded-full border-[3px] border-gray-200 border-t-brand-point animate-spin"
          />
        </main>
      </div>
    );
  }

  if (!detailItem) {
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
  // 고른 참가 항목 — 그사이 내 성별 기준으로 마감됐으면 고르지 않은 것으로 본다
  const selectedOption = stock.hasOptions
    ? stock.options.find(o => o.id === selectedOptionId && !optionClosedFor(o, profile?.gender)) ?? null
    : null;
  const partyType: PartyType = detailRes?.partyType ?? partyTypeOf(detailItem);
  const typeLabel = PARTY_TYPE_LABELS[partyType];
  // 화면에 그릴 안내 — detail ?? 종류별 템플릿. 응답 전(null)이면 편집 영역을 그리지 않는다.
  //   요청이 실패해 종류를 모르면 실시간 파티 목록의 종류로 템플릿을 고른다 (여기까지 왔으면 실시간 목록은 이미 받은 상태).
  const shownDetail: PartyDetail | null = detailReady && detailRes ? (detailRes.detail ?? templateFor(partyType)) : null;
  // 고정 안내 문구(신청 전 확인·참가 신청 방법·필수 확인 사항) — 실시간 파티 목록으로 종류가 확인된 상태라 바로 그린다
  //   (빌드 시점 샘플 목록만 있을 때는 위의 로딩 화면에서 멈추므로 솔로파티에 매칭파티 문구가 비치지 않음). app/lib/partyGuides.ts
  const guide = PARTY_GUIDES[partyType];
  // 참가 신청 방법·필수 확인 사항 — 파티에 저장된 내용(detail.apply / notice)이 있으면 그것, 없으면 종류별 기본 문구.
  //   저장된 내용이 있을 수 있으므로 상세 안내 응답 뒤에 그린다 (기본 문구가 비쳤다가 바뀌지 않도록). docs/specs/party-guide-edit.md 3장
  const savedDetail = detailReady && detailRes ? detailRes.detail : null;
  const applyView = !detailReady || !guide ? null
    : savedDetail?.apply
      ? { title: savedDetail.apply.title.trim() || DEFAULT_APPLY_TITLE, steps: savedDetail.apply.steps.map(s => ({ ...s, note: s.note || null })) }
      : { title: DEFAULT_APPLY_TITLE, steps: guide.steps };
  const noticeView = !detailReady || !guide ? null
    : savedDetail?.notice
      ? { title: savedDetail.notice.title.trim() || DEFAULT_NOTICE_TITLE, intro: savedDetail.notice.intro, items: savedDetail.notice.items.map(n => ({ ...n, warn: n.warn || null })) }
      : { title: DEFAULT_NOTICE_TITLE, intro: guide.noticeIntro, items: visibleNotices(guide, partyHasOptions(detailItem)) };
  // 신청 전 꼭 확인해주세요 — 저장된 내용(detail.beforeApply)이 있으면 그것(**글자** 만 굵게), 없으면 종류별 기본 문구.
  //   저장된 내용이 있을 수 있으므로 상세 안내 응답 뒤에 그린다. 본문이 비면 숨김. docs/specs/party-box-sms.md 1장
  const beforeApplyView = !detailReady || !guide ? null
    : savedDetail?.beforeApply
      ? { title: savedDetail.beforeApply.title.trim() || DEFAULT_BEFORE_APPLY_TITLE, segs: markupToGuideText(savedDetail.beforeApply.body.trim()) }
      : { title: DEFAULT_BEFORE_APPLY_TITLE, segs: guide.beforeApply };
  // 진행 안내 형식 — numbered 가 없으면 번호 형식(지금 모양)
  const timelineNumbered = shownDetail?.timeline.numbered !== false;
  const slotImages = (slot: DetailImageSlot) => shownDetail?.images[slot] ?? [];
  // 행사 일시 경과 — todayKST > calendarDate 일 때 모집 종료. SSR 단계에선 false (window 없음)
  const isExpired = !!detailItem.calendarDate && todayKST !== "" && todayKST > detailItem.calendarDate;

  // 자격 검증 (로그인한 회원에 한해 평가) — 참가 대상 문구는 정보 패널의 "대상"으로 흡수, 자격이 맞지 않을 때 사유만 아래에 보여 준다
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

  // 참가하기 / 장바구니 버튼 상태 — 조건/비활성화 로직은 기존 그대로 (하단 고정 바에서만 쓴다)
  const ctaState: PartyCtaState = (() => {
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
    return { ended: isExpired, hardDisabled, grayedOut, clickableGray: alreadyBooked && !hardDisabled, label };
  })();

  // 참가비 — 성별별 분리 표시 (남성 / 여성). 미설정 시 price 폴백 단일 표시
  const pm = detailItem.priceMale;
  const pf = detailItem.priceFemale;
  const hasSplit = (!!pm && pm > 0) || (!!pf && pf > 0);
  const maleAmt   = pm && pm > 0 ? pm : detailItem.price;
  const femaleAmt = pf && pf > 0 ? pf : detailItem.price;

  // 하단 바 — 일시 "10월 17일(토) 15:00"(참가 구성 파티는 첫 회차 시작), 장소 = 짧은 장소명 → 지역 태그("기타" 제외) → 생략
  const barTime = (() => {
    const raw = stock.hasOptions ? (stock.sessions[0]?.startTime ?? "") : detailItem.dateString;
    const m = /(\d{1,2}):(\d{2})/.exec(raw);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
  })();
  const barWhen = [partyShortDate(detailItem), barTime].filter(Boolean).join(" ");
  const barPlace = detailItem.locationShort?.trim()
    || (detailItem.locationTag && detailItem.locationTag !== "기타" ? detailItem.locationTag : "");
  const barFee: BarFee = stock.hasOptions && detailItem.options
    ? { kind: "from", price: optionsMinPrice(detailItem.options) }
    : hasSplit ? { kind: "split", male: maleAmt, female: femaleAmt } : { kind: "single", price: detailItem.price };

  // 성별 자리 현황 — 머리 카드·명단 상태 문구. 참가 구성 파티는 회차 자리를 모두 더한다(1부+2부 신청은 두 자리)
  const seatsOf = (g: "male" | "female"): GenderSeats => {
    if (stock.hasOptions) {
      const sum = (f: (s: typeof stock.sessions[number]) => number) => stock.sessions.reduce((n, s) => n + f(s), 0);
      return g === "male"
        ? { booked: sum(s => s.maleBooked ?? 0), cap: sum(s => s.maleStock), remaining: sum(s => s.maleRemaining), full: stock.maleFull }
        : { booked: sum(s => s.femaleBooked ?? 0), cap: sum(s => s.femaleStock), remaining: sum(s => s.femaleRemaining), full: stock.femaleFull };
    }
    return g === "male"
      ? { booked: detailItem.maleBooked, cap: detailItem.maleStock, remaining: stock.maleRemaining, full: stock.maleFull }
      : { booked: detailItem.femaleBooked, cap: detailItem.femaleStock, remaining: stock.femaleRemaining, full: stock.femaleFull };
  };
  const maleSeats = seatsOf("male");
  const femaleSeats = seatsOf("female");
  const totalApplied = detailItem.maleBooked + detailItem.femaleBooked;
  const rosterStatus: RosterStatus = stock.allFull || isExpired
    ? { kind: "full" }
    : totalApplied === 0
      ? { kind: "empty" }
      : { kind: "open", total: totalApplied, cap: maleSeats.cap + femaleSeats.cap, remaining: maleSeats.remaining + femaleSeats.remaining };

  // 대상별 안내 (싱글/돌싱) — 필수 확인 사항 맨 끝 항목으로. 미지정·all 이면 없음 (노출 조건은 기존 그대로)
  const targetVariant: "single" | "divorced" | null = (() => {
    const tg = detailItem.targetGroup;
    const ams = detailItem.allowedMaritalStatus;
    return tg === "싱글" || ams === "싱글" ? "single" : tg === "돌싱" || ams === "돌싱" ? "divorced" : null;
  })();

  // 이미지 오른쪽 아래 인원 표시 — 누르면 실시간 참가자 명단으로 (C-1)
  const pillCls = "inline-flex items-center rounded-full bg-white/95 font-bold shadow-md text-[12px] max-[359px]:text-[11px] md:text-[14px] lg:text-[15px]";
  const pillIcon = "size-3 flex-shrink-0 max-[359px]:size-2.5 md:size-3.5";
  const genderCount = (seats: GenderSeats, label: string) => seats.full ? `${label} 마감` : `${label} ${seats.booked}/${seats.cap}`;
  const countsPill = stock.hasOptions ? (
    // 참가 구성 파티 — 회차별 남/여 인원/정원 (명세 8-1)
    <button
      type="button"
      onClick={() => scrollToSection("participants")}
      aria-label="실시간 참가자 명단 보기"
      className={`${pillCls} flex-wrap justify-end gap-x-3 gap-y-0.5 rounded-2xl px-2.5 py-1 md:px-3 md:py-1.5`}
      data-testid="session-counts"
    >
      {stock.sessions.map(s => (
        <span key={s.id} className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="session-count">
          <UsersIcon className={`${pillIcon} text-gray-500`} aria-hidden />
          <span className="text-brand-black">{s.name}</span>
          <span className="text-male">남 {s.maleBooked ?? 0}/{s.maleStock}</span>
          <span className="text-gray-400">·</span>
          <span className="text-female">여 {s.femaleBooked ?? 0}/{s.femaleStock}</span>
        </span>
      ))}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => scrollToSection("participants")}
      aria-label="실시간 참가자 명단 보기"
      className={`${pillCls} gap-2 px-2.5 py-1 md:gap-2.5 md:px-3.5 md:py-1.5`}
      data-testid="counts-pill"
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-male">
        <UsersIcon className={pillIcon} aria-hidden />{genderCount(maleSeats, "남성")}
      </span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-female">
        <UsersIcon className={pillIcon} aria-hidden />{genderCount(femaleSeats, "여성")}
      </span>
    </button>
  );
  // 참가 구성 파티 + 납작한 대표이미지(상단이미지 없음) — 모바일은 회차 표시를 이미지 바로 아래에 (왼쪽 위 배지와 겹치지 않게)
  const pillBelowOnMobile = stock.hasOptions && !detailItem.heroImageUrl;

  // 정보 패널 한 줄 — 아이콘 원 + (태블릿·PC만) 회색 라벨 + 값. 모바일 라벨은 화면 낭독기에만
  const infoRow = (key: string, icon: ReactNode, label: string, value: ReactNode, testId?: string) => (
    <div key={key} className="flex items-center gap-3 py-[11px] md:gap-4 md:py-[15px]" data-testid={testId}>
      <dt className="flex flex-shrink-0 items-center gap-4">
        <span className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-point/15 text-brand-point-ink md:size-[34px]" aria-hidden>
          {icon}
        </span>
        <span className="text-[14px] font-medium text-gray-500 max-md:sr-only md:w-[52px]">{label}</span>
      </dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
  const plainValue = "block truncate text-[14px] font-bold tracking-[-0.2px] text-brand-black max-[359px]:text-[13px] md:text-[16px] md:tracking-normal";
  const dateValue = "block truncate text-[16px] font-black tracking-[-0.3px] text-brand-black max-[359px]:text-[15px] md:text-[19px] lg:text-[20px]";
  const amountCls = "text-[18px] font-black tracking-[-0.3px] tabular-nums max-[359px]:text-[16px] md:text-[22px] lg:text-[24px]";
  const iconCls = "size-3.5 md:size-4";

  // 진행방식 "소요 시간" — 행 이름의 "8 : 8" 이 이 파티 정원(남:여)과 같으면 "이번 파티"
  const isThisPartyRow = (label: string) => {
    const m = /(\d+)\s*:\s*(\d+)/.exec(label);
    return !!m && Number(m[1]) === detailItem.maleStock && Number(m[2]) === detailItem.femaleStock;
  };

  // ── 본문 섹션 — 실시간 참가자 → 사진 ① → 참가 신청 방법 → 사진 ② → 사진 ③ → 진행방식·소요 시간 → 사진 ④ → 필수 확인 사항 → 사진 ⑤
  //    (명세 D-1 에서 신청방법을 진행방식 앞으로, 2026-10-21 사용자 요청). 사진과 섹션 사이는 24~40px, 섹션끼리는 48~64px ──
  type Block = { key: string; kind: "section" | "photo"; node: ReactNode };
  const blocks: Block[] = [];
  const pushPhotos = (slot: DetailImageSlot) => {
    const imgs = slotImages(slot);
    if (imgs.length > 0) blocks.push({ key: `photo-${slot}`, kind: "photo", node: <DetailPhotos images={imgs} /> });
  };
  const anchorProps = (anchor: AnchorId) => ({ id: anchor, "data-party-anchor": "", style: { scrollMarginTop: anchorOffset + ANCHOR_GAP } });

  // 실시간 참가자 명단 (D-4) — 신청자가 없어도 섹션은 항상 보인다
  blocks.push({
    key: "participants", kind: "section", node: (
      <section {...anchorProps("participants")} data-testid="participants">
        <ParticipantsRoster
          male={participants.male}
          female={participants.female}
          maleSeats={maleSeats}
          femaleSeats={femaleSeats}
          status={rosterStatus}
          updatedAt={participantsAt}
          hideProfile={partyType === "solo"}
          titleClassName={SECTION_TITLE}
        />
      </section>
    ),
  });

  // 사진 ① 참가 신청 방법 위
  pushPhotos("beforeApply");

  // 참가 신청 방법 (D-8) — 위에서 아래로 세로 카드. 단계가 없으면 숨김
  if (applyView && applyView.steps.length > 0) {
    blocks.push({
      key: "apply", kind: "section", node: (
        <section {...anchorProps("apply-guide")} data-testid="guide-steps">
          <h2 className={SECTION_TITLE}>{applyView.title}</h2>
          <ol className="mt-5 space-y-3 md:mt-6">
            {applyView.steps.map((item, idx) => (
              <li key={idx} className="flex gap-3 rounded-2xl bg-brand-lightgray p-4 md:gap-4 md:p-5">
                <span className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-black text-[13px] font-black text-white md:size-[34px] md:text-[15px] lg:size-9">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 md:pt-0.5">
                  <p className="text-[11px] font-bold tracking-[0.15em] text-gray-500 md:text-xs">STEP {idx + 1}</p>
                  <h3 className="mt-0.5 text-[15px] font-bold leading-snug text-brand-black md:text-[17px]">{item.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-[1.65] text-gray-600 whitespace-pre-line break-keep md:text-[15px]">{item.desc}</p>
                  {item.note && (
                    <p className="mt-3 max-w-[640px] rounded-lg bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-600 whitespace-pre-line break-keep md:text-[14px]">
                      {item.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ),
    });
  }

  // 사진 ② 참가 신청 방법 아래
  pushPhotos("afterApply");

  // 사진 ③ 진행 안내 위
  pushPhotos("beforeTimeline");

  // 진행방식 (D-6) + 소요 시간 (D-7) — 단계가 없으면 섹션 전체를 숨김 (기존 규칙)
  if (shownDetail && shownDetail.timeline.steps.length > 0) {
    const steps = shownDetail.timeline.steps;
    const rows = shownDetail.durations.rows;
    blocks.push({
      key: "timeline", kind: "section", node: (
        <section {...anchorProps("timeline")} data-testid="party-timeline">
          <h2 className={SECTION_TITLE}>{timelineTitleOf(shownDetail.timeline.title)}</h2>
          {shownDetail.timeline.intro && (
            <p className={`mt-2 ${BODY_TEXT} text-gray-500`}>{shownDetail.timeline.intro}</p>
          )}
          {timelineNumbered ? (
            // 세로 타임라인 — 청록 원형 번호를 세로선으로 잇는다. 단계별 소요시간(step.time)은 보여 주지 않는다(데이터는 그대로)
            <ol className="mt-6 md:mt-8">
              {steps.map((item, idx) => {
                const no = String(idx + 1).padStart(2, "0");
                return (
                  <li key={idx} className="relative flex gap-4 pb-8 last:pb-0 md:gap-5 md:pb-10" data-testid="timeline-step">
                    {idx < steps.length - 1 && (
                      <span className="absolute bottom-0 left-[13.5px] top-7 w-px bg-brand-point/50 md:left-[17.5px] md:top-9 lg:left-[19.5px] lg:top-10" aria-hidden />
                    )}
                    <span className="relative flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-point text-[12px] font-black text-black md:size-9 md:text-[13px] lg:size-10 lg:text-[14px]">
                      {no}
                    </span>
                    <div className="min-w-0 flex-1 md:pt-1 lg:pt-1.5">
                      <p className="text-[11px] font-black tracking-[0.2em] text-brand-point-ink md:text-xs">STEP {no}</p>
                      <h3 className="mt-1 text-[16px] font-bold leading-snug text-brand-black md:text-[18px] lg:text-[19px]">{item.title}</h3>
                      <p className={`mt-1.5 max-w-[640px] ${BODY_TEXT} text-gray-600 whitespace-pre-line break-keep`}>{item.desc}</p>
                      {item.note && (
                        <p className="mt-3 max-w-[640px] rounded-lg bg-brand-point/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-700 whitespace-pre-line break-keep md:text-[14px]">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            // 자유 형식 — 번호·STEP 없이 제목·문구만
            <div className="mt-5 md:mt-7">
              {steps.map((item, idx) => (
                <div key={idx} className="border-b border-gray-100 py-5 first:pt-0 last:border-b-0 last:pb-0 md:py-7" data-testid="timeline-free-block">
                  {item.title && <h3 className="mb-2 text-[16px] font-bold leading-snug text-brand-black md:text-[18px] lg:text-[19px]">{item.title}</h3>}
                  {item.desc && <p className={`${BODY_TEXT} text-gray-600 whitespace-pre-line break-keep`}>{item.desc}</p>}
                </div>
              ))}
            </div>
          )}
          {/* 인원별 소요 시간 — 카드 가로 나열(3개까지 한 줄). 줄이 없으면 이 블록만 숨김 */}
          {rows.length > 0 && (
            <div className="mt-10 md:mt-12" data-testid="party-durations">
              <h3 className="text-[16px] font-black tracking-tight text-brand-black md:text-[18px]">{shownDetail.durations.title}</h3>
              <div className={`mt-3 grid gap-2 md:gap-3 ${rows.length === 1 ? "grid-cols-1" : rows.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                {rows.map((row, i) => {
                  const mine = isThisPartyRow(row.label);
                  return (
                    <div key={i} className={`flex flex-col items-center justify-center rounded-xl border-2 px-2 py-3 text-center md:px-4 md:py-5 ${mine ? "border-brand-point bg-brand-point/5" : "border-gray-100 bg-white"}`}>
                      {mine && <span className="mb-1.5 rounded-full bg-brand-point px-2 py-0.5 text-[11px] font-black text-black">이번 파티</span>}
                      <span className="text-[13px] font-bold text-brand-black break-keep md:text-[15px]">{row.label}</span>
                      <span className="mt-0.5 text-[14px] font-black tabular-nums text-brand-point-ink break-keep md:text-[17px]">{row.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ),
    });
  }

  // 사진 ④ 필수 확인 사항 위
  pushPhotos("beforeNotice");

  // 필수 확인 사항 (D-9) — 머리말 + 아코디언. 첫 항목과 대상별 안내(싱글 전용 등)는 기본 펼침
  if (noticeView && (noticeView.items.length > 0 || targetVariant)) {
    const isOpen = (key: string) => noticeOpen[key] ?? (key === "0" || key === "target");
    const toggle = (key: string) => setNoticeOpen(prev => ({ ...prev, [key]: !isOpen(key) }));
    const accordionItem = (key: string, title: ReactNode, body: ReactNode) => {
      const open = isOpen(key);
      return (
        <li key={key} className="border-b border-gray-200" data-testid="notice-item">
          <button
            type="button"
            onClick={() => toggle(key)}
            aria-expanded={open}
            aria-controls={`notice-panel-${key}`}
            className="flex w-full items-center gap-3 py-4 text-left md:py-5"
          >
            <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-brand-black break-keep md:text-[17px]">{title}</span>
            <ChevronDown className={`size-5 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <div id={`notice-panel-${key}`} hidden={!open} className="pb-5 md:pb-6">{body}</div>
        </li>
      );
    };
    blocks.push({
      key: "notice", kind: "section", node: (
        <section {...anchorProps("notice")} data-testid="guide-notices">
          <h2 className={SECTION_TITLE}>{noticeView.title}</h2>
          {noticeView.intro && <p className={`mt-2 ${BODY_TEXT} text-gray-500`}>{noticeView.intro}</p>}
          <ul className="mt-4 border-t border-gray-200 md:mt-6">
            {noticeView.items.map((item, idx) => accordionItem(String(idx), item.title, (
              <>
                <p className={`${BODY_TEXT} text-gray-600 whitespace-pre-line break-keep`}>{item.desc}</p>
                {item.warn && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3.5 py-3 text-[13px] font-bold leading-relaxed text-red-700 whitespace-pre-line break-keep md:text-[14px]">
                    ⚠ {item.warn}
                  </p>
                )}
              </>
            )))}
            {/* 대상별 안내 (싱글/돌싱) — 예전 상단 안내 상자. 문구 속 파티 이름은 종류명(매칭파티/솔로파티) */}
            {targetVariant === "single" && accordionItem("target", "싱글 전용 파티 안내 (SINGLES ONLY)", (
              <p className="rounded-lg bg-red-50 px-3.5 py-3 text-[14px] leading-[1.7] text-red-700 break-keep md:text-[15px]" data-testid="singles-only-notice">
                해당 파티는 법적 혼인 이력이 없는 <strong className="font-black">&apos;싱글&apos;</strong> 회원님만을 대상으로 진행되는 {typeLabel}입니다.{" "}
                <strong className="font-black">&apos;싱글&apos;</strong>이 아님이 확인될 경우, 즉시{" "}
                <strong className="font-black">회원탈퇴</strong>와 함께 블랙리스트 조치되며,
                허위 정보 기재에 따른 민·형사상의{" "}
                <strong className="font-black">강력한 법적 책임</strong>을 물을 수 있음을 고지합니다.
              </p>
            ))}
            {targetVariant === "divorced" && accordionItem("target", <span className="uppercase">Open Matching</span>, (
              <p className={`${BODY_TEXT} text-gray-600 break-keep`} data-testid="open-matching-notice">
                해당 파티는 새로운 시작을 꿈꾸는 <strong className="font-black text-brand-black">&apos;돌싱&apos;</strong> 회원님까지 참여하실 수 있는{" "}
                <strong className="font-black text-brand-point-ink">열린 {typeLabel}</strong>입니다.
                물론 <strong className="font-black text-brand-black">&apos;싱글&apos;</strong> 회원님도 제한 없이 자유롭게 신청 및 참여가 가능하오니,
                넓은 마음으로 소중한 인연을 만나보세요.
              </p>
            ))}
          </ul>
        </section>
      ),
    });
  }

  // 사진 ⑤ 필수 확인 사항 아래
  pushPhotos("afterNotice");

  const shownTabs = ANCHOR_TABS.filter(t => blocks.some(b => b.key === (t.id === "apply-guide" ? "apply" : t.id)));

  return (
    // 하단 고정 바 높이(모바일 68 / 태블릿 76 / PC 88px + 위 테두리 1px + 아이폰 홈 표시줄)만큼 아래 여백 — 마지막 내용·푸터가 바에 가리지 않게
    <div className="flex min-h-screen flex-col pb-[calc(69px_+_env(safe-area-inset-bottom))] text-brand-black selection:bg-brand-point selection:text-white md:pb-[calc(77px_+_env(safe-area-inset-bottom))] lg:pb-[calc(89px_+_env(safe-area-inset-bottom))]">
      <Header />

      <main className="flex-1 bg-white">
        {/* 나타날 때 흐림만 (위치 이동 없음) — 주소의 #participants 로 바로 이동할 때 자리가 밀리지 않게 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="pb-16 pt-3 md:pb-20 md:pt-8 lg:pb-24 lg:pt-10"
        >
          {/* ── 상단: 상단이미지 → 제목·소개 → 정보 패널 → 사전 승인제 한 줄 → 참가 항목 선택 → 소개글 (E-1, 가운데 한 단) ── */}
          <div className={CONTAINER}>
            <Link href="/#apply" className="mb-3 inline-flex items-center gap-2 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-brand-black md:mb-5 md:text-base">
              <ArrowLeft size={18} /> 목록으로 돌아가기
            </Link>

            {/* 상단이미지 — 관리자 "상단이미지"(heroImageUrl, 16:9) 우선. 없으면 "대표이미지"(imageUrl, 파티 카드 이미지)를 자르지 않고 원본 비율, 둘 다 없으면 공통 기본 배너(원본 비율) */}
            <div className="relative overflow-hidden rounded-2xl bg-gray-100">
              {detailItem.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detailItem.heroImageUrl} alt={detailItem.title} onLoad={jumpToPendingHash} className="block aspect-video w-full object-cover" data-testid="party-hero-image" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detailItem.imageUrl || DEFAULT_IMAGE} alt={detailItem.title} onLoad={jumpToPendingHash} className="block h-auto w-full max-w-full" data-testid="party-main-image" />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
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
                  <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 md:left-4 md:top-4 md:gap-2">
                    <div className={`rounded-full px-3 py-1 text-xs font-bold shadow-xl md:px-4 md:py-1.5 md:text-sm ${badge.cls}`}>
                      {badge.label}
                    </div>
                    {/* 파티 종류 배지 */}
                    <div className="rounded-full bg-gray-900 px-3 py-1 text-xs font-bold text-white shadow-xl md:px-4 md:py-1.5 md:text-sm">
                      {typeLabel}
                    </div>
                  </div>
                );
              })()}
              {/* 남녀 인원 — 이미지 오른쪽 아래 (누르면 실시간 참가자 명단으로) */}
              <div className={`absolute bottom-3 left-3 right-3 z-10 flex justify-end md:bottom-4 md:left-4 md:right-4 ${pillBelowOnMobile ? "max-md:hidden" : ""}`}>
                {countsPill}
              </div>
            </div>
            {pillBelowOnMobile && (
              <div className="mt-2 flex justify-end md:hidden" data-testid="session-counts-mobile">{countsPill}</div>
            )}

            {/* 제목 + 한 줄 소개 — 관리자가 등록한 소개(description) 우선, 없으면 기본 카피 (가운데 정렬) */}
            <h1 className="mt-5 text-center text-[24px] font-black leading-snug tracking-tight break-keep md:mt-7 md:text-[30px] lg:text-[36px]">{detailItem.title}</h1>
            <p className="mt-2 text-center text-[13px] font-medium leading-relaxed text-gray-500 whitespace-pre-line break-keep md:text-[15px]">
              {detailItem.description?.trim()
                ? detailItem.description
                : "단순한 만남을 넘어 감성을 향유하는 시간.\n어울림이 큐레이션한 프리미엄 네트워킹에 초대합니다."}
            </p>

            {/* 핵심정보 — 정보 패널 (C-3): 일시·장소·대상·참가비 한 줄씩 */}
            <dl className="mt-5 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white px-4 md:mt-7 md:rounded-[20px] md:px-6" data-testid="party-info-panel">
              {infoRow("date", <CalendarDays className={iconCls} />, "일시", stock.hasOptions ? (
                // 참가 구성 파티 — 날짜 + 회차 시간표 ("1부 19:00 · 2부 21:30")
                <>
                  <span className={dateValue}>{dateOnly(detailItem.dateString)}</span>
                  <span className="mt-0.5 block text-[13px] font-bold text-gray-600 break-keep md:text-[14px]" data-testid="session-timetable">
                    {stock.sessions.map(s => `${s.name} ${s.startTime}`).join(" · ")}
                  </span>
                </>
              ) : <span className={dateValue} title={detailItem.dateString}>{detailItem.dateString}</span>)}
              {infoRow("place", <MapPin className={iconCls} />, "장소", <span className={plainValue} title={detailItem.location}>{detailItem.location}</span>)}
              {infoRow("target", <UserRound className={iconCls} />, "대상", <span className={plainValue} title={detailItem.target}>{detailItem.target}</span>)}
              {infoRow("price", <span className="text-[13px] font-black leading-none md:text-[15px]">₩</span>, "참가비", stock.hasOptions ? (
                // 참가 구성 파티 — 항목별 남/여 가격
                <ul className="space-y-1" data-testid="option-prices">
                  {stock.options.map(o => (
                    <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-[13px] font-bold break-keep md:text-[15px]">{o.name}</span>
                      <span className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                        <span className="text-[12px] font-bold text-male">남성</span>
                        <span className="text-[15px] font-black md:text-[18px]">₩{o.priceMale.toLocaleString()}</span>
                        <span className="font-normal text-gray-300">/</span>
                        <span className="text-[12px] font-bold text-female">여성</span>
                        <span className="text-[15px] font-black md:text-[18px]">₩{o.priceFemale.toLocaleString()}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : hasSplit ? (
                <span className="flex flex-nowrap items-baseline gap-x-1.5 gap-y-0.5 md:flex-wrap md:gap-x-2">
                  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-[12px] font-bold text-male md:text-[13px]">남성</span>
                    <span className={amountCls}>₩{maleAmt.toLocaleString()}</span>
                  </span>
                  <span className="font-normal text-gray-300">/</span>
                  <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-[12px] font-bold text-female md:text-[13px]">여성</span>
                    <span className={amountCls}>₩{femaleAmt.toLocaleString()}</span>
                  </span>
                </span>
              ) : (
                <span className={amountCls}>₩{detailItem.price.toLocaleString()}</span>
              ))}
            </dl>
            {/* 참가 자격이 맞지 않는 로그인 회원 — 사유 (나이 때문이면 현재 나이) */}
            {isLoggedIn && !eligibility.ok && (
              <p className="mt-2 px-1 text-[13px] font-bold text-red-600" data-testid="eligibility-message">
                {eligibility.message}
                {userAge !== null && eligibility.reason === "ageOutOfRange" && ` (현재 만 ${userAge}세)`}
              </p>
            )}

            {/* 신청 전 꼭 확인해주세요 — 한 줄 요약 + 펼치기 (기본 접힘, 펼치면 저장 문구 전문). 본문이 비면 숨김 */}
            {beforeApplyView && beforeApplyView.segs.length > 0 && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-white" data-testid="guide-before-apply">
                <button
                  type="button"
                  onClick={() => setBeforeApplyOpen(v => !v)}
                  aria-expanded={beforeApplyOpen}
                  aria-controls="before-apply-panel"
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left md:px-5 md:py-3.5"
                >
                  <ShieldCheck className="size-4 flex-shrink-0 text-brand-point-ink" aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] text-gray-700 break-keep md:text-[15px]">
                    <strong className="font-black text-brand-point-ink">사전 승인제 운영</strong>
                    {" · "}
                    {/* 솔로파티는 프로필 카드를 받지 않으므로 "운영진 확인" (2026-10-21 사용자 결정) */}
                    <span className="md:hidden">결제 후 {partyType === "solo" ? "운영진" : "프로필"} 확인을 거쳐 참가확정</span>
                    <span className="hidden md:inline">결제 후 {partyType === "solo" ? "운영진" : "프로필"} 확인을 거쳐 참가가 확정됩니다.</span>
                  </span>
                  <ChevronDown className={`size-4 flex-shrink-0 text-gray-400 transition-transform ${beforeApplyOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                <div id="before-apply-panel" hidden={!beforeApplyOpen} className="border-t border-gray-100 px-4 pb-4 pt-3 md:px-5">
                  <h3 className="mb-1.5 text-[13px] font-bold md:text-sm">{beforeApplyView.title}</h3>
                  <p className="text-[13px] leading-relaxed text-gray-600 whitespace-pre-line break-keep md:text-sm">
                    {beforeApplyView.segs.map((seg, i) => seg.strong
                      ? <strong key={i} className="font-bold text-brand-black">{seg.text}</strong>
                      : <span key={i}>{seg.text}</span>)}
                  </p>
                </div>
              </div>
            )}

            {/* 참가 항목 선택 — 참가 구성 파티만, 모집 중일 때 (명세 8-1) */}
            {stock.hasOptions && !isExpired && (
              <div className="mt-5 md:mt-6">
                <PartyOptionPicker
                  stock={stock}
                  gender={isLoggedIn ? profile?.gender : null}
                  selectedId={selectedOption?.id ?? null}
                  onSelect={setSelectedOptionId}
                />
              </div>
            )}

            {/* 소개글 — 앵커 탭 위 (D-3). 묶음이 0개면 영역 전체를 그리지 않는다. 본문은 글자 그대로(줄바꿈 유지) */}
            {shownDetail && shownDetail.about.sections.length > 0 && (
              <section className="mt-12 md:mt-14 lg:mt-16" data-testid="party-about">
                <h2 className={SECTION_TITLE}>{shownDetail.about.title.trim() || DEFAULT_ABOUT_TITLE}</h2>
                <div className="mt-5 space-y-10 md:mt-6 md:space-y-12">
                  {shownDetail.about.sections.map((sec, i) => (
                    <div key={i} data-testid="party-about-section">
                      {sec.heading && <h3 className="text-[17px] font-black leading-snug text-brand-black break-keep md:text-[20px] lg:text-[22px]">{sec.heading}</h3>}
                      {sec.body && <p className={`${sec.heading ? "mt-2 md:mt-3" : ""} ${BODY_TEXT} text-gray-700 whitespace-pre-line break-keep`}>{sec.body}</p>}
                      <DetailPhotos images={sec.images} className={sec.heading || sec.body ? "mt-4 md:mt-6" : ""} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── 앵커 탭 + 본문 — 탭은 화면 전체 폭 흰 띠, 헤더 바로 아래에 붙는다(헤더 높이 72+1 / PC 96+1px, Header.tsx) ── */}
          <div className="mt-10 md:mt-12">
            <nav
              ref={tabsRef}
              aria-label="상세 정보 바로가기"
              className="sticky top-[73px] z-30 border-b border-gray-200 bg-white lg:top-[97px]"
            >
              <div className="mx-auto flex h-12 md:max-w-[768px] md:justify-center md:gap-8 md:px-6 lg:h-[52px] lg:max-w-[908px] lg:gap-10">
                {shownTabs.map(t => {
                  const active = activeTab === t.id;
                  return (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      onClick={e => { e.preventDefault(); scrollToSection(t.id); }}
                      aria-current={active ? "location" : undefined}
                      className={`relative flex h-full flex-1 items-center justify-center whitespace-nowrap px-1 text-[14px] transition-colors max-[359px]:flex-auto max-[359px]:px-0.5 max-[359px]:text-[13px] md:flex-none md:px-2 md:text-[15px] ${
                        active
                          ? "font-black text-brand-black after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-brand-black md:after:inset-x-0"
                          : "font-medium text-gray-500 hover:text-brand-black"
                      }`}
                    >
                      {t.label}
                    </a>
                  );
                })}
              </div>
            </nav>

            <div className={`${CONTAINER} pt-8 md:pt-10`}>
              {blocks.map((b, i) => (
                <div
                  key={b.key}
                  className={i === 0 ? "" : b.kind === "photo" || blocks[i - 1].kind === "photo" ? "mt-6 md:mt-8 lg:mt-10" : "mt-12 md:mt-14 lg:mt-16"}
                >
                  {b.node}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>

      <Footer />

      {/* 하단 고정 바 — 참가하기·장바구니는 여기서만 (C-7, E-2) */}
      <PartyBottomBar title={detailItem.title} when={barWhen} place={barPlace} fee={barFee}>
        <PartyCtaButtons state={ctaState} onCheckout={handleCheckout} onAddToCart={handleAddToCart} />
      </PartyBottomBar>

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
