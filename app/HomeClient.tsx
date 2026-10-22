"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Calendar, MapPin } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "./components/Header";
import HeroSlider from "./components/HeroSlider";
import Footer from "./components/Footer";
import ReviewBoard from "./components/ReviewBoard";
import GalleryGrid from "./components/gallery/GalleryGrid";
import GalleryAllSheet from "./components/gallery/GalleryAllSheet";
import GalleryLightbox from "./components/gallery/GalleryLightbox";
import type { GalleryItem } from "./components/gallery/types";
import { PARTICIPANTS, FAQS, partyStockStatus, withLiveCounts, partyVisibility, categoryLabel, partyTypeOf, PARTY_TYPES, PARTY_TYPE_LABELS, type Party, type PartyType } from "./lib/data";
import { useAuth } from "./context/AuthContext";
import { useParties, PARTIES_NOT_LOADED } from "./lib/useParties";
import { daysUntil } from "./lib/refund";
import { cameBackHere } from "./lib/navHistory";

/* ── #schedule(파티 일정) 섹션 전용 — 일정 상태별 표시 스타일 ──────────────
 * 우선순위: 지난 일정 > 마감 > 마감임박 > 모집중 (계산은 컴포넌트의 scheduleStatus 참고) */
type ScheduleStatus = "open" | "soon" | "full" | "past";
/* 상태색 — 초록 = 모집중, 빨강 = 마감임박, 검정 = 마감, 점선 회색 = 지난 일정 */
const SCHEDULE_STATUS_STYLE: Record<ScheduleStatus, { label: string; tone: string }> = {
  open: { label: "모집중",    tone: "bg-[#DCFCE7] text-[#166534]" },
  soon: { label: "마감임박",  tone: "bg-[#DC2626] text-white" },
  full: { label: "마감",      tone: "bg-[#111111] text-white" },
  past: { label: "지난 일정", tone: "bg-white text-[#6B7280] border border-dashed border-[#D1D5DB]" },
};
/* 파티 종류색 — solid: 진한 배지·점 / soft: 연한 배경(달력 칩·날짜 블록) / ink: 연한 배경 위 글자.
 * 솔로파티 그라데이션(solo-grad, solo-grad-soft)은 app/globals.css */
const SCHEDULE_TYPE_STYLE: Record<PartyType, { label: string; solid: string; soft: string; ink: string }> = {
  matching: { label: PARTY_TYPE_LABELS.matching, solid: "bg-[#40E0D0] text-[#003B37]", soft: "bg-[#E6FAF8]",   ink: "text-[#00756F]" },
  solo:     { label: PARTY_TYPE_LABELS.solo,     solid: "solo-grad",                  soft: "solo-grad-soft", ink: "text-[#9D1C8A]" },
};
/** 파티 종류 배지 — 모집중·마감임박은 진하게, 마감은 연하게, 지난 일정은 회색 (상태 계산 전에는 모집중처럼) */
const scheduleTypeBadgeTone = (partyType: PartyType, status: ScheduleStatus | null | undefined) => {
  const t = SCHEDULE_TYPE_STYLE[partyType];
  if (status === "past") return "bg-[#F3F4F6] text-[#9CA3AF]";
  if (status === "full") return `${t.soft} ${t.ink}`;
  return t.solid;
};
/** 모바일 작은 달력의 날짜 아래 점 — 모집중·마감임박은 종류색(임박은 빨간 테두리), 마감은 검정, 지난 일정은 점선 회색처럼 흰 점 */
const scheduleDotTone = (partyType: PartyType, status: ScheduleStatus | null | undefined) => {
  if (status === "past") return "bg-white border-[1.5px] border-[#D1D5DB]";
  if (status === "full") return "bg-[#111111]";
  const solid = SCHEDULE_TYPE_STYLE[partyType].solid;
  return status === "soon" ? `${solid} ring-[1.5px] ring-[#EF4444]` : solid;
};
/** 일정 카드(모바일 리스트·PC 패널) 테두리·배경 — 청록 hover 강조는 모집중·마감임박만 */
const SCHEDULE_CARD_TONE: Record<ScheduleStatus, string> = {
  open: "bg-white border border-gray-200 hover:border-brand-point",
  soon: "bg-white border-[1.5px] border-[#FCA5A5] hover:border-brand-point",
  full: "bg-[#F9FAFB] border border-gray-200 hover:bg-gray-100",
  past: "bg-[#F9FAFB] border border-dashed border-[#D1D5DB] hover:bg-gray-100",
};
/** "남 N · 여 N 남음" 글자색 — 기본색(모집중)은 카드마다 달라 null */
const scheduleRemainTone = (status: ScheduleStatus | null | undefined) =>
  status === "soon" ? "text-[#DC2626]" : status === "full" || status === "past" ? "text-[#9CA3AF]" : null;
const SCHEDULE_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 참가자 마키 — 카드 1장이 지나가는 시간(초). 한 바퀴 = 카드 수 × 이 값이라 인원이 늘어도 흐르는 속도가 같다 */
const PARTICIPANT_SEC_PER_CARD = 2;
/** 참가자 카드 키워드 칩 — 한 줄에 놓을 개수 */
const KEYWORDS_PER_ROW = 3;
/**
 * 기본 현장스케치 이미지(/images/gallery/g1~g9.png)는 같은 이름의 .webp 로 바꿔 보여준다 (용량 절감).
 * 관리자가 예전에 등록한 DB 항목이 .png 경로를 가리켜도 그대로 동작하도록 원본 .png 파일은 남겨 둔다.
 */
const STATIC_GALLERY_PNG = /^\/images\/gallery\/g[1-9]\.png$/;
const withWebpGallery = <T extends { image_path: string }>(item: T): T =>
  STATIC_GALLERY_PNG.test(item.image_path) ? { ...item, image_path: item.image_path.replace(/\.png$/, ".webp") } : item;
/** Date → 로컬 기준 "YYYY-MM-DD" */
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** 파티 상세로 갈 때 저장하는 메인 화면 상태 (sessionStorage) — 뒤로 돌아오면 되살린다 (HomeClient saveHomeReturn) */
const HOME_RETURN_KEY = "woollim_home_return";
/** "YYYY-MM-DD" → "10.17 토" */
const scheduleShortLabel = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00");
  return `${d.getMonth() + 1}.${d.getDate()} ${SCHEDULE_WEEKDAYS[d.getDay()]}`;
};
/** "YYYY-MM-DD" → "10월 17일 (토)" */
const scheduleLongLabel = (ymd: string) => {
  const d = new Date(ymd + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${SCHEDULE_WEEKDAYS[d.getDay()]})`;
};

/** 관리자가 올린 현장스케치가 없을 때 보여줄 기본 이미지 9장 */
const GALLERY_FALLBACK: GalleryItem[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => ({
  id: -i,
  image_path: `/images/gallery/g${i}.webp`,
  alt_text: `갤러리 이미지 ${i}`,
  sort_order: i * 10,
}));

/**
 * 메인 화면 (화면이 열린 뒤 동작하는 부분). app/page.tsx(서버)가 빌드 시점 실제 파티를 initialParties 로 넘긴다.
 * 빌드 시점 조회에 실패하면 initialParties 가 없고, 파티 영역은 "불러오는 중"으로 시작한다.
 * endedAtBuild: 빌드 시점에 이미 시작한 파티 id — 마운트 전(정적 HTML·하이드레이션)에만 "종료" 판단에 쓰고,
 *   마운트 뒤에는 지금처럼 브라우저 시각(now)으로 실시간 판단한다.
 */
export default function HomeClient({ initialParties, endedAtBuild }: { initialParties?: Party[]; endedAtBuild?: string[] }) {
  const [activeTab, setActiveTab] = useState("일정별");
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);   // FAQ — 처음엔 모두 접어 둔다
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState<number | null>(null);   // 라이트박스로 크게 보는 사진 순번
  const [galleryAllOpen, setGalleryAllOpen] = useState(false);   // 현장스케치 "전체 사진 보기" 시트
  const [currentGalleryPage, setCurrentGalleryPage] = useState(0);   // 6장씩 가로 슬라이드 페이지 인덱스
  // 후기 갤러리 — DB 라이브 fetch (관리자가 수정 시 BroadcastChannel + 폴링으로 즉시 반영)
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  // 화면에 보여줄 사진 — 관리자 사진이 없으면 기본 이미지 (그리드·전체보기·라이트박스 공통)
  const galleryShown = galleryItems.length > 0 ? galleryItems : GALLERY_FALLBACK;
  const [liveMembers, setLiveMembers] = useState<typeof PARTICIPANTS>([]);
  const { partyCounts } = useAuth();
  const PARTIES = useParties(initialParties);
  const partiesLoaded = PARTIES !== PARTIES_NOT_LOADED;
  const router = useRouter();

  // 후기 갤러리 fetch — 관리자 변경 시 BroadcastChannel('woollim_gallery') 으로 즉시 동기화
  useEffect(() => {
    let cancelled = false;
    const loadGallery = () => {
      fetch("/api/gallery.php", { cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
        .then((data) => { if (!cancelled && Array.isArray(data)) setGalleryItems(data.map(withWebpGallery)); })
        .catch(() => {});
    };
    loadGallery();

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("woollim_gallery");
      channel.addEventListener("message", loadGallery);
    } catch {}
    const onVis = () => { if (document.visibilityState === "visible") loadGallery(); };
    window.addEventListener("focus", loadGallery);
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(loadGallery, 30000);

    return () => {
      cancelled = true;
      channel?.removeEventListener("message", loadGallery);
      channel?.close();
      window.removeEventListener("focus", loadGallery);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, []);

  // 실시간 신규 가입자 fetch (DB users 테이블 기반)
  useEffect(() => {
    let cancelled = false;
    const fetchParticipants = () => {
      fetch("/api/participants.php", { cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
        .then((data) => { if (!cancelled && Array.isArray(data)) setLiveMembers(data); })
        .catch(() => {});
    };
    fetchParticipants();

    // 관리자 회원 삭제 → 즉시 명단에서 제외 (캐시 무효화)
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("woollim_users");
      channel.addEventListener("message", fetchParticipants);
    } catch {}
    const onVisibility = () => { if (document.visibilityState === "visible") fetchParticipants(); };
    window.addEventListener("focus", fetchParticipants);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      channel?.removeEventListener("message", fetchParticipants);
      channel?.close();
      window.removeEventListener("focus", fetchParticipants);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 실시간 가입자(최신) + 큐레이션 mock 데이터를 결합
  const allParticipants = useMemo(
    () => [...liveMembers, ...PARTICIPANTS],
    [liveMembers]
  );

  // 4축 필터 [종류 / 대상 / 테마 / 지역] — 축마다 값을 하나씩 골라 겹쳐(AND) 거른다.
  //   openAxis = 세부 옵션 줄이 열린 축(1개 또는 null), selections = 대상·테마·지역 선택값(없으면 null).
  //   종류 축의 선택값은 아래 typeTab(?type= 주소 연동)을 그대로 쓴다.
  type Axis = "type" | "targetGroup" | "theme" | "locationTag";
  type CategoryAxis = Exclude<Axis, "type">;
  const AXES: { key: Axis; label: string }[] = [
    { key: "type", label: "종류" }, { key: "targetGroup", label: "대상" },
    { key: "theme", label: "테마" }, { key: "locationTag", label: "지역" },
  ];
  const CATEGORY_AXES: CategoryAxis[] = ["targetGroup", "theme", "locationTag"];
  const AXIS_OPTIONS: Record<Axis, readonly string[]> = {
    type: PARTY_TYPES,
    targetGroup: ["싱글", "돌싱"],
    theme: ["티타임", "와인파티", "사케파티", "쿠킹클래스"],
    // '기타' 는 필터 버튼에서 노출 제외 — 기존 '기타' 파티는 전체보기에 그대로 노출됨
    // 표시 순서만: 인천 ↔ 용인 교체 (DB 값/매칭 로직 무영향)
    locationTag: ["서울", "성남", "수원", "용인", "인천"],
  };
  // 화면 표시 라벨 — 종류는 매칭파티/솔로파티, 나머지는 categoryLabel (테마 "쿠킹클래스" → "세션")
  const optionLabel = (axis: Axis, value: string) =>
    axis === "type" ? PARTY_TYPE_LABELS[value as PartyType] : categoryLabel(value);
  const [openAxis, setOpenAxis] = useState<Axis | null>(null);
  // 지금 열린 축 — 닫히는 애니메이션(0.22초) 동안 화면에 남은 옵션 줄의 클릭을 걸러내는 데 쓴다 (pickOption)
  const openAxisRef = useRef<Axis | null>(null);
  useEffect(() => { openAxisRef.current = openAxis; }, [openAxis]);
  const [selections, setSelections] = useState<Record<CategoryAxis, string | null>>({ targetGroup: null, theme: null, locationTag: null });

  // 종류 축 선택값 — /?type=solo#apply 로 들어오면 솔로파티가 선택된 채 열리고, 바꾸면 주소만 바꾼다(history.replaceState).
  const [typeTab, setTypeTab] = useState<"all" | PartyType>("all");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    if (t && (PARTY_TYPES as readonly string[]).includes(t)) setTypeTab(t as PartyType);
  }, []);
  const pickType = (t: "all" | PartyType) => {
    setTypeTab(t);
    try {
      const url = new URL(window.location.href);
      if (t === "all") url.searchParams.delete("type"); else url.searchParams.set("type", t);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* 주소 갱신 실패는 무시 */ }
  };

  const selectedOf = (axis: Axis): string | null =>
    axis === "type" ? (typeTab === "all" ? null : typeTab) : selections[axis];
  // 축 버튼 = 그 축의 옵션 줄 열기/닫기 (다른 축 선택값은 유지)
  const toggleAxis = (axis: Axis) => setOpenAxis(cur => (cur === axis ? null : axis));
  // 옵션 클릭 = 그 축 값 선택(null = "전체", 선택 해제) + 옵션 줄 닫기
  const pickOption = (axis: Axis, value: string | null) => {
    // 닫히는 중인(사라지는) 옵션 줄은 반응하지 않는다 — 지금 열린 축의 줄만 선택 가능
    if (openAxisRef.current !== axis) return;
    if (axis === "type") pickType((value as PartyType | null) ?? "all");
    else setSelections(s => ({ ...s, [axis]: value }));
    setOpenAxis(null);
  };
  const resetFilters = () => {
    setSelections({ targetGroup: null, theme: null, locationTag: null });
    pickType("all");
    setOpenAxis(null);
  };
  const selectedLabels = AXES.flatMap(({ key }) => {
    const v = selectedOf(key);
    return v ? [optionLabel(key, v)] : [];
  });

  // SSR/CSR 시간대 차이로 인한 hydration mismatch 방지 — now 는 mount 후에만 세팅,
  // 1분마다 갱신해 행사 종료 시점에 카드 UI 가 자연스럽게 전환되게 함
  const [now, setNow] = useState<Date | null>(null);
  // 마운트 전 "종료" 판단 — 서버가 넘긴 값만 써서 정적 HTML 과 하이드레이션 첫 화면이 같게
  const endedAtBuildSet = useMemo(() => new Set(endedAtBuild ?? []), [endedAtBuild]);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // v8.0 하이드레이션 깜빡임 방지 — SSR/초기 hydration 단계에서는 빌드 시점 데이터가 노출되므로,
  // 컴포넌트 마운트 후 useParties / gallery / participants 의 1차 라이브 fetch 가 충분히 settle 될 때까지
  // 동적 콘텐츠를 opacity-0 으로 숨기고 그 후 부드럽게 fade-in.
  // (정적 컨테이너/레이아웃은 그대로 노출되어 layout shift 없이 스켈레톤 역할 수행)
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    // 250ms 는 useParties.ts no-store fetch 의 평균 응답시간 (LAN/광대역 기준).
    // 빠르게 finish 한 경우에도 자연스러운 fade-in 을 위해 최소 1프레임 보장.
    const t = window.setTimeout(() => setContentReady(true), 250);
    return () => window.clearTimeout(t);
  }, []);

  // v9.2 — [더보기] 페이징. 기존 필터/정렬/재고/배지/실시간 카운트 로직은 불변,
  //         "최종 정렬·필터 완료 배열"을 렌더 직전 slice 하는 영역에만 결합한다.
  const APPLY_LIMIT_DESKTOP   = 12; // 신청 섹션 PC(lg 이상) 초기 노출
  const APPLY_LIMIT_MOBILE    = 10; // 신청 섹션 모바일(lg 미만) 초기 노출
  const SCHEDULE_LIMIT_MOBILE = 10; // 일정 섹션 모바일 초기 노출
  const [isDesktop, setIsDesktop] = useState(false);               // lg(1024px) 이상 여부
  const [applyMoreOpen, setApplyMoreOpen] = useState(false);       // 신청 섹션 더보기 펼침
  const [scheduleMoreOpen, setScheduleMoreOpen] = useState(false); // 일정(모바일) 더보기 펼침
  const [mobileYear, setMobileYear]   = useState(0);  // 모바일 일정 선택 연도 (0=미초기화)
  const [mobileMonth, setMobileMonth] = useState(0);  // 모바일 일정 선택 월  (0=미초기화)
  const [scheduleSelected, setScheduleSelected] = useState<string | null>(null);     // PC·태블릿 달력에서 고른 날짜 (null=기본값)
  const [mobilePicked, setMobilePicked] = useState<string | null>(null);             // 모바일 작은 달력에서 고른 날짜
  const [mobileListMode, setMobileListMode] = useState<"day" | "month" | null>(null); // 모바일 리스트 보기 (null=자동)

  // 해상도 → 초기 노출 개수(12/10) 실시간 동기화
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 필터(종류·대상·테마·지역) 변경 시 더보기 상태 초기화 → 새 결과는 항상 접힌 채 처음부터 노출.
  // 단, 뒤로 돌아와 필터를 되살린 직후 한 번은 건너뛴다(되살린 더보기 상태 유지 — restoredFiltersRef)
  const restoredFiltersRef = useRef<string | null>(null);
  useEffect(() => {
    const restored = restoredFiltersRef.current;
    restoredFiltersRef.current = null;
    if (restored !== null && restored === JSON.stringify([selections, typeTab])) return;
    setApplyMoreOpen(false);
  }, [selections, typeTab]);

  // 모바일 일정 섹션 — 마운트 1회, 현재 날짜 기준 연/월 초기화
  useEffect(() => {
    const d = new Date();
    setMobileYear(d.getFullYear());
    setMobileMonth(d.getMonth() + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 파티 상세 → [이전으로 돌아가기]·뒤로가기 시 메인 화면 되살리기 ──────────────
   * 일정(달력·리스트)이나 파티 카드에서 상세로 갈 때 그때 상태를 sessionStorage 에 저장(saveHomeReturn)하고,
   * 메인이 다시 열릴 때 꺼내 지운다. 뒤로가기로 돌아온 경우(cameBackHere)에만 되살린다 — 로고 등 링크로 오면 처음 화면.
   * 스크롤은 섹션(#schedule·#apply) 위치 기준으로 저장해, 위쪽 내용(후기·현장스케치)이 늦게 불러와져 높이가 바뀌어도 같은 자리. */
  const calendarRef = useRef<FullCalendar>(null);
  type HomeReturn = {
    anchor: "schedule" | "apply";
    offset: number;                       // 섹션 맨 위에서 화면 맨 위까지 거리(px)
    calendarDate: string | null;          // PC 달력에서 보던 달 (YYYY-MM-DD)
    scheduleSelected: string | null;
    mobileYear: number;
    mobileMonth: number;
    mobilePicked: string | null;
    mobileListMode: "day" | "month" | null;
    scheduleMoreOpen: boolean;
    applyMoreOpen: boolean;
    selections: Record<CategoryAxis, string | null>;
    typeTab: "all" | PartyType;
  };
  const saveHomeReturn = (anchor: HomeReturn["anchor"]) => {
    const el = document.getElementById(anchor);
    const snap: HomeReturn = {
      anchor,
      offset: el ? -el.getBoundingClientRect().top : 0,
      calendarDate: calendarRef.current ? toYmd(calendarRef.current.getApi().getDate()) : null,
      scheduleSelected, mobileYear, mobileMonth, mobilePicked, mobileListMode, scheduleMoreOpen,
      applyMoreOpen, selections, typeTab,
    };
    try { sessionStorage.setItem(HOME_RETURN_KEY, JSON.stringify(snap)); } catch { /* 저장 실패 시 되살리기만 생략 */ }
  };
  /** 일정(달력 칩·PC 패널·모바일 카드)에서 파티 상세로 */
  const openScheduleParty = (id: string) => {
    saveHomeReturn("schedule");
    router.push(`/party/${id}`);
  };
  // 꺼낸 상태 — ref 에 두어 개발 모드(Strict Mode)에서 effect 가 두 번 실행돼도 같은 값으로 되살린다
  const homeReturnRef = useRef<HomeReturn | null | undefined>(undefined);
  useEffect(() => {
    if (homeReturnRef.current === undefined) {
      let saved: HomeReturn | null = null;
      try {
        saved = JSON.parse(sessionStorage.getItem(HOME_RETURN_KEY) || "null") as HomeReturn | null;
        sessionStorage.removeItem(HOME_RETURN_KEY);
      } catch { /* 못 읽으면 되살리지 않음 */ }
      homeReturnRef.current = saved && cameBackHere() ? saved : null;
    }
    const snap = homeReturnRef.current;
    if (!snap) return;

    // 일정 섹션 — 보던 달·고른 날짜·모바일 리스트 상태 (위 모바일 연/월 초기화보다 뒤에 실행되어 덮어쓴다)
    if (snap.calendarDate) calendarRef.current?.getApi().gotoDate(snap.calendarDate);
    setScheduleSelected(snap.scheduleSelected);
    if (snap.mobileYear) { setMobileYear(snap.mobileYear); setMobileMonth(snap.mobileMonth); }
    setMobilePicked(snap.mobilePicked);
    setMobileListMode(snap.mobileListMode);
    setScheduleMoreOpen(snap.scheduleMoreOpen);
    // 신청 섹션 — 필터·더보기
    restoredFiltersRef.current = JSON.stringify([snap.selections, snap.typeTab]);
    setSelections(snap.selections);
    setTypeTab(snap.typeTab);
    setApplyMoreOpen(snap.applyMoreOpen);

    // 스크롤 — 섹션 위치 + 저장한 거리. 2초 동안 높이가 바뀌면 다시 맞추고, 사용자가 스크롤·터치·키 입력을 하면 멈춘다
    const { anchor, offset } = snap;
    const scrollToSaved = () => {
      const el = document.getElementById(anchor);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: "instant" });
    };
    const USER_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    const ro = new ResizeObserver(scrollToSaved);
    const timers: number[] = [];
    const stop = () => {
      ro.disconnect();
      timers.forEach(t => window.clearTimeout(t));
      USER_EVENTS.forEach(ev => window.removeEventListener(ev, stop));
    };
    ro.observe(document.body);
    USER_EVENTS.forEach(ev => window.addEventListener(ev, stop, { passive: true }));
    timers.push(window.setTimeout(scrollToSaved, 0), window.setTimeout(scrollToSaved, 300), window.setTimeout(stop, 2000));
    return stop;
  }, []);

  const sortedParties = useMemo(() => {
    // 선택된 모든 축을 동시에 만족(AND)하는 파티만
    const filtered = [...PARTIES].filter(p => {
      if (typeTab !== "all" && partyTypeOf(p) !== typeTab) return false;
      return CATEGORY_AXES.every(ax => !selections[ax] || p[ax] === selections[ax]);
    });

    // mount 전(SSR/초기 hydration) — 시간 의존 필터/정렬 생략, 기존 동작 유지
    // (빌드 시점에 지난 파티는 뒤로 — 마운트 뒤 active 우선 정렬과 같은 순서)
    if (!now) return filtered.sort((a, b) => {
      const ra = endedAtBuildSet.has(a.id) ? 1 : 0;
      const rb = endedAtBuildSet.has(b.id) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return a.calendarDate.localeCompare(b.calendarDate);
    });

    return filtered
      .filter(p => partyVisibility(p, now) !== "expired")        // 종료 21일 초과 → 노출 제외
      .sort((a, b) => {
        const ra = partyVisibility(a, now) === "active" ? 0 : 1; // active 우선, ended 후순위
        const rb = partyVisibility(b, now) === "active" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.calendarDate.localeCompare(b.calendarDate);     // 그룹 내부는 기존 날짜 오름차순 유지
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, typeTab, PARTIES, now, endedAtBuildSet]);

  // 신청 섹션 렌더용 slice — 위 sortedParties(필터/정렬 완료)를 가로채 노출 개수만 제한
  const applyLimit = isDesktop ? APPLY_LIMIT_DESKTOP : APPLY_LIMIT_MOBILE;
  const visibleParties = applyMoreOpen ? sortedParties : sortedParties.slice(0, applyLimit);
  const showApplyMore = !applyMoreOpen && sortedParties.length > applyLimit;

  // #schedule 전용 — 파티별 일정 상태(지난 일정 > 마감 > 마감임박 > 모집중)와 남은 자리.
  // 남은 자리는 신청 카드와 같은 실시간 결제 인원(partyCounts, 없으면 0)으로 계산.
  // 마감·마감임박·남은 자리는 partyStockStatus 결과 그대로 (참가 구성 파티는 회차 기준, 명세 8-3).
  // now 가 없으면(마운트 전) 상태 계산을 건너뜀 → 하이드레이션 안전 (기존 방식과 동일).
  const scheduleStatus = useMemo(() => {
    const map: Record<string, { status: ScheduleStatus | null; maleRemaining: number; femaleRemaining: number; hasOptions: boolean; remainingLabel: string }> = {};
    PARTIES.forEach(p => {
      const stock = partyStockStatus(withLiveCounts(p, partyCounts[p.id]));
      let status: ScheduleStatus | null = null;
      if (now) {
        if (partyVisibility(p, now) !== "active") status = "past";
        else if (stock.allFull) status = "full";
        else if (stock.nearlyFull) status = "soon";
        else status = "open";
      }
      map[p.id] = { status, maleRemaining: stock.maleRemaining, femaleRemaining: stock.femaleRemaining, hasOptions: stock.hasOptions, remainingLabel: stock.remainingLabel };
    });
    return map;
  }, [PARTIES, partyCounts, now]);

  // 일정 섹션(모바일 리스트 + 데스크탑 캘린더) — 행사 일시 경과한 이벤트에 'fc-event-ended' 클래스 부여.
  // 칩 색은 eventContent 가 상태(extendedProps.status)로 정한다. 다른 카테고리 탭/필터·데이터 쿼리에는 무영향.
  const CALENDAR_EVENTS = useMemo(() => PARTIES.map(p => {
    const past = now ? partyVisibility(p, now) !== "active" : false;
    const m = (p.dateString ?? "").match(/(\d{1,2}):(\d{2})/);
    const start = m
      ? `${p.calendarDate}T${m[1].padStart(2, "0")}:${m[2]}:00`
      : p.calendarDate;
    const info = scheduleStatus[p.id];
    return {
      id: p.id,
      title: p.title,
      start,
      // 솔로파티는 fc-event-solo 클래스. 칩 안에는 종류(매칭/솔로) 표시가 항상 붙는다 (eventContent)
      classNames: [...(past ? ["fc-event-ended"] : []), ...(partyTypeOf(p) === "solo" ? ["fc-event-solo"] : [])],
      extendedProps: {
        location: p.location, target: p.target, price: p.price,
        // #schedule 상태 표시용 (추가 필드)
        status: info?.status ?? null,
        maleRemaining: info?.maleRemaining ?? 0,
        femaleRemaining: info?.femaleRemaining ?? 0,
        hasOptions: info?.hasOptions ?? false,          // 참가 구성 파티 — 남은 자리를 회차별로
        remainingLabel: info?.remainingLabel ?? "",
        time: m ? `${m[1].padStart(2, "0")}:${m[2]}` : "",
        targetGroup: p.targetGroup ?? "",
        theme: p.theme ?? "",
        locationTag: p.locationTag ?? "",
        partyType: partyTypeOf(p),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [PARTIES, now, scheduleStatus]);

  // 일정 섹션 모바일 리스트용 정렬 배열 (PC 캘린더는 CALENDAR_EVENTS 를 그대로 사용 — 무영향)
  // start 가 ISO datetime(YYYY-MM-DDThh:mm:ss)이므로 그대로 비교하면 날짜·시간 모두 오름차순
  const sortedSchedule = useMemo(
    () => [...CALENDAR_EVENTS].sort((a, b) => a.start.localeCompare(b.start)),
    [CALENDAR_EVENTS]
  );

  // 모바일 일정 — 월 내비게이션 핸들러 (이전/다음 달 전환 + 더보기 접기)
  const goPrevMonth = () => {
    setScheduleMoreOpen(false);
    setMobileYear(y => mobileMonth === 1 ? y - 1 : y);
    setMobileMonth(m => m === 1 ? 12 : m - 1);
  };
  const goNextMonth = () => {
    setScheduleMoreOpen(false);
    setMobileYear(y => mobileMonth === 12 ? y + 1 : y);
    setMobileMonth(m => m === 12 ? 1 : m + 1);
  };

  // 선택 연/월에 해당하는 일정만 추출 (sortedSchedule 이미 시간 오름차순)
  const mobileSchedule = useMemo(() => {
    if (!mobileYear) return [];
    return sortedSchedule.filter(e => {
      const d = new Date(e.start.substring(0, 10) + "T00:00:00");
      return d.getFullYear() === mobileYear && d.getMonth() + 1 === mobileMonth;
    });
  }, [sortedSchedule, mobileYear, mobileMonth]);

  const showScheduleMore = !scheduleMoreOpen && mobileSchedule.length > SCHEDULE_LIMIT_MOBILE;

  // #schedule — 날짜 선택. 기본값은 "오늘 이후 가장 가까운 일정 날짜" (now 전에는 계산 생략)
  type ScheduleEvent = (typeof CALENDAR_EVENTS)[number];
  const isUpcoming = (e: ScheduleEvent) => !!e.extendedProps.status && e.extendedProps.status !== "past";
  const todayYmd = now ? toYmd(now) : null;
  const nextScheduleDate = sortedSchedule.find(isUpcoming)?.start.slice(0, 10) ?? null;
  // PC·태블릿: 달력에서 고른 날짜 → 없으면 가장 가까운 일정 날짜 → 없으면 오늘
  const pcSelectedDate = scheduleSelected ?? nextScheduleDate ?? todayYmd;
  const pcSelectedEvents = pcSelectedDate ? sortedSchedule.filter(e => e.start.startsWith(pcSelectedDate)) : [];
  // 모바일: 보고 있는 달 안에서 고른 날짜 → 없으면 그 달의 가장 가까운 일정 날짜 → 없으면 "이번 달 전체"
  const monthPrefix = mobileYear ? `${mobileYear}-${String(mobileMonth).padStart(2, "0")}` : "";
  const mobileDate = mobilePicked && monthPrefix && mobilePicked.startsWith(monthPrefix)
    ? mobilePicked
    : mobileSchedule.find(isUpcoming)?.start.slice(0, 10) ?? null;
  const mobileMode: "day" | "month" = mobileListMode === "month" || !mobileDate ? "month" : "day";
  const mobileDayEvents = mobileDate ? mobileSchedule.filter(e => e.start.startsWith(mobileDate)) : [];
  const mobileEventsByDay: Record<string, ScheduleEvent[]> = {};
  mobileSchedule.forEach(e => { (mobileEventsByDay[e.start.slice(0, 10)] ??= []).push(e); });
  const mobileFirstDow = mobileYear ? new Date(mobileYear, mobileMonth - 1, 1).getDay() : 0;
  const mobileDaysInMonth = mobileYear ? new Date(mobileYear, mobileMonth, 0).getDate() : 0;
  // "이번 달 전체" — 기존 더보기(SCHEDULE_LIMIT_MOBILE) 적용 후 날짜별로 묶음
  const mobileMonthGroups: [string, ScheduleEvent[]][] = [];
  (scheduleMoreOpen ? mobileSchedule : mobileSchedule.slice(0, SCHEDULE_LIMIT_MOBILE)).forEach(e => {
    const ymd = e.start.slice(0, 10);
    const last = mobileMonthGroups[mobileMonthGroups.length - 1];
    if (last && last[0] === ymd) last[1].push(e);
    else mobileMonthGroups.push([ymd, [e]]);
  });

  // #schedule 모바일 카드 — 날짜 블록 + 제목 위 배지 줄(종류·상태·대상) + "남 N · 여 N 남음" 한 줄.
  // 색은 상태별(SCHEDULE_CARD_TONE 등), 누르면 기존처럼 /party/{id} 로 이동.
  const renderScheduleCard = (event: ScheduleEvent) => {
    const party = PARTIES.find(p => p.id === event.id);
    const xp = event.extendedProps;
    const status = xp.status;
    const isPast = status === "past";
    const isClosed = status === "full" || isPast;   // 마감·지난 일정 — 날짜 블록을 회색으로
    const typeStyle = SCHEDULE_TYPE_STYLE[xp.partyType];
    const dateObj = new Date(event.start.substring(0, 10) + "T00:00:00");
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const dayName = SCHEDULE_WEEKDAYS[dateObj.getDay()];
    return (
      <button
        key={event.id}
        type="button"
        onClick={() => openScheduleParty(event.id)}
        className={`w-full text-left rounded-2xl p-4 flex items-center gap-4 transition-all shadow-sm active:scale-[0.98] cursor-pointer ${SCHEDULE_CARD_TONE[status ?? "open"]}`}
      >
        <div className={`flex-shrink-0 w-14 rounded-xl py-2 text-center ${isClosed ? "bg-[#F3F4F6] text-[#9CA3AF]" : typeStyle.soft}`}>
          <div className={`text-xs font-bold ${isClosed ? "" : typeStyle.ink}`}>{month}월</div>
          <div className={`text-2xl font-black leading-none ${isClosed ? "" : "text-brand-black"}`}>{day}</div>
          <div className={`text-xs font-semibold ${isClosed ? "" : typeStyle.ink}`}>{dayName}요일</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            <span className={`text-xs font-black px-1.5 py-0.5 rounded-md whitespace-nowrap ${scheduleTypeBadgeTone(xp.partyType, status)}`}>
              {typeStyle.label}
            </span>
            {status && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${SCHEDULE_STATUS_STYLE[status].tone}`}>
                {SCHEDULE_STATUS_STYLE[status].label}
              </span>
            )}
            {xp.targetGroup && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-gray-100 ${isPast ? "text-gray-400" : "text-gray-600"}`}>
                {xp.targetGroup}
              </span>
            )}
          </div>
          <div className={`font-bold text-[15px] leading-snug mb-1 ${isPast ? "text-gray-400" : "text-brand-black"} ${status === "full" ? "line-through" : ""}`}>
            {event.title}
          </div>
          <div className={`text-sm ${isPast ? "text-gray-400" : "text-gray-500"}`}>{party?.dateString}</div>
          <div className={`text-xs mt-0.5 truncate ${isPast ? "text-gray-400" : "text-gray-500"}`}>{party?.location} · {party?.target}</div>
          <div className={`text-xs mt-1 font-bold break-keep ${scheduleRemainTone(status) ?? "text-gray-600"}`}>{xp.hasOptions ? `${xp.remainingLabel} 남음` : `남 ${xp.maleRemaining} · 여 ${xp.femaleRemaining} 남음`}</div>
        </div>
        <ArrowRight size={16} className={`flex-shrink-0 ${isPast ? "text-gray-400" : "text-gray-500"}`} />
      </button>
    );
  };

  void activeTab; // 기존 useState는 호환을 위해 유지 (warning 회피용 reference)

  const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  return (
    <div className="flex flex-col min-h-screen text-brand-black pb-0">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section — 롤링 히어로 (1번 브랜드 + 모집중 파티 최대 3장, app/components/HeroSlider.tsx) */}
        <HeroSlider />

        {/* 참여하기 (Apply Cards) Section */}
        <section id="apply" className="py-16 md:py-32 px-4 md:px-6 bg-white rounded-t-3xl md:rounded-t-[3rem] shadow-[0_-20px_40px_rgba(0,0,0,0.02)]">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-10 md:mb-16">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">파티 신청</h2>
              <p className="text-sm md:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed break-keep px-2">
                돌싱부터 싱글까지, 원하는 테마와 지역을 선택하여 새로운 연결을 시작해보세요.
              </p>
            </motion.div>

            {/* v8.0 — 카테고리 필터 + 카드 그리드 영역을 mounted 게이트 + opacity 트랜지션으로 감싸서
                seed → live 데이터 swap 깜빡임 방지. 컨테이너 레이아웃은 유지되어 layout shift 없음. */}
            <div className={`transition-opacity duration-500 ease-out ${contentReady ? "opacity-100" : "opacity-0"}`}>

            {/* 4축 필터 [종류 / 대상 / 테마 / 지역] — 축 버튼 = 옵션 줄 열기/닫기, 옵션 = 그 축 값 선택(AND)
                모바일은 4칸 그리드 한 줄(320px 에서도 "솔로파티 ▾"가 한 줄), md 이상은 가운데 정렬 */}
            <div className="mb-10 md:mb-16 border-b border-gray-100 pb-6 md:pb-8">
              <div className="grid grid-cols-4 gap-1.5 md:flex md:justify-center md:gap-3">
                {AXES.map(({ key, label }) => {
                  const isOpen = openAxis === key;
                  const sel = selectedOf(key);
                  const text = sel ? optionLabel(key, sel) : label;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleAxis(key)}
                      aria-expanded={isOpen}
                      aria-controls="apply-filter-options"
                      aria-label={sel ? `${label}: ${text}` : label}
                      className={`py-2 px-1 md:px-7 md:py-3 text-[12px] min-[360px]:text-[13px] md:text-lg font-black rounded-full transition-all whitespace-nowrap truncate ${
                        isOpen
                          ? "bg-brand-point text-black shadow-md border-2 border-brand-point"
                          : sel
                            ? "bg-white text-brand-black border-2 border-brand-point"
                            : "bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      {text} <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
                    </button>
                  );
                })}
              </div>

              {/* 세부 옵션 줄 (열린 축이 있을 때만) — 맨 앞 "전체" = 그 축 선택 해제. 고르면 줄이 닫힌다 */}
              <AnimatePresence initial={false}>
                {openAxis && (
                  <motion.div
                    key={openAxis}
                    id="apply-filter-options"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-center flex-wrap gap-2 md:gap-2.5 mt-5 md:mt-6">
                      <button
                        type="button"
                        onClick={() => pickOption(openAxis, null)}
                        className={`px-3.5 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
                          !selectedOf(openAxis)
                            ? "bg-brand-point/10 text-brand-point-ink border border-brand-point/30"
                            : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        전체
                      </button>
                      {AXIS_OPTIONS[openAxis].map(opt => {
                        const isSelected = selectedOf(openAxis) === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => pickOption(openAxis, opt)}
                            className={`px-3.5 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
                              isSelected
                                ? "bg-brand-point text-black shadow-md"
                                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                            }`}
                          >
                            {optionLabel(openAxis, opt)}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 요약 줄 — 선택이 있을 때만: "솔로파티 · 싱글 · 와인파티 · N건  초기화" */}
              {selectedLabels.length > 0 && (
                <div className="flex flex-wrap justify-center items-baseline gap-x-2 gap-y-1 mt-4 text-xs md:text-sm text-gray-500 font-medium">
                  <span>
                    <span className="text-brand-point-ink font-bold">{selectedLabels.join(" · ")}</span> · {sortedParties.length}건
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="py-3 -my-3 px-1 text-gray-500 font-bold underline underline-offset-2 hover:text-brand-black"
                  >
                    초기화
                  </button>
                </div>
              )}
            </div>

            {!partiesLoaded ? (
              // 빌드 시점 데이터가 없고 실시간 데이터도 아직 받기 전 — 예시 파티 대신 불러오는 중 표시
              <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-10 md:p-16 text-center" aria-busy="true">
                <p role="status" className="text-gray-500 font-bold text-sm md:text-base">파티 일정을 불러오는 중입니다.</p>
              </div>
            ) : sortedParties.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-10 md:p-16 text-center">
                <p className="text-gray-500 font-bold text-sm md:text-base">선택한 조건에 맞는 파티가 없습니다.</p>
                <p className="text-xs md:text-sm text-gray-500 mt-2">다른 카테고리를 선택하거나 조건을 초기화해주세요.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
              {/* 카드 목록 — 모바일 1열(간격 20px), md 이상 2열(간격 32px) */}
              <AnimatePresence mode="popLayout">
                {visibleParties.map(card => {
                  // 실시간 결제완료 인원만 노출 — 카운트 없으면 0으로 강제 (시드/테스트 데이터 무시)
                  // 모집 마감은 partyStockStatus 결과 (참가 구성 파티는 모든 항목이 마감일 때, 명세 8-3)
                  const stock = partyStockStatus(withLiveCounts(card, partyCounts[card.id]));
                  // 행사 일시 경과 → 모집 종료 카드 UI (배너 흐리게, [모집 종료된 파티] 표시). 카드는 다른 카드처럼 상세페이지로 이동
                  // 마운트 뒤: 브라우저 시각으로 실시간 판단 / 마운트 전(정적 HTML): 빌드 시점 판단
                  const isEnded = now ? partyVisibility(card, now) === "ended" : endedAtBuildSet.has(card.id);
                  // 모집 중 = 종료 전이고 마감 아님 — D-day 배지·솔로파티 사이키 테두리는 이때만
                  const recruiting = !isEnded && !stock.allFull;
                  const days = now && recruiting ? daysUntil(card.calendarDate, now) : null;
                  const dDay = days === null || days < 0 ? null : days === 0 ? "D-DAY" : `D-${days}`;
                  const psyche = recruiting && partyTypeOf(card) === "solo";
                  const badgeCls = "text-[11px] md:text-xs font-bold leading-none px-2.5 py-1.5 md:px-[11px] md:py-[7px] rounded-full whitespace-nowrap";
                  return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, type: "spring", stiffness: 300, damping: 28 }}
                    className="h-full"
                  >
                    {/* 카드 전체가 상세페이지 링크(모집 중·마감·종료 모두 같은 URL). 배경은 투명(솔로파티 사이키 글로우가 카드 뒤에 깔림), 배너·본문에 각각 배경.
                         hover·키보드 포커스: 들어올림은 md 이상만, 청록 강조는 모집 종료 카드 제외 — 전환 시간은 globals.css .party-card.
                         motion.div 가 transform 을 쓰므로 안쪽 요소에 준다 */}
                    <Link
                      href={`/party/${card.id}`}
                      onClick={() => saveHomeReturn("apply")}
                      className={`party-card group h-full flex flex-col rounded-2xl md:rounded-[20px] border border-[#E6E8EC] shadow-[0_2px_8px_rgba(0,0,0,0.04)] md:hover:-translate-y-1 md:hover:shadow-[0_10px_24px_rgba(0,0,0,0.08)] md:focus-visible:-translate-y-1 md:focus-visible:shadow-[0_10px_24px_rgba(0,0,0,0.08)] ${
                        isEnded ? "" : "hover:border-brand-point focus-visible:border-brand-point"
                      } ${psyche ? "card--psyche" : ""}`}
                    >
                      {/* 배너 9:2 — 관리자 "대표이미지"(imageUrl), 없으면 공통 기본 배너. 배너에만 overflow-hidden + 상단 radius */}
                      <div className="relative aspect-[9/2] overflow-hidden rounded-t-[15px] md:rounded-t-[19px] bg-[#F4F5F7]">
                        <img
                          src={card.imageUrl || "/images/party_card_default_banner.jpg"}
                          alt={card.title}
                          className={`absolute inset-0 w-full h-full object-cover ${isEnded ? "grayscale-60 opacity-70 transition-[filter,opacity] duration-[250ms] group-hover:grayscale-30 group-hover:opacity-85 group-focus-visible:grayscale-30 group-focus-visible:opacity-85" : ""}`}
                        />
                        {/* 배지 대비용 오버레이 */}
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.25)_0%,rgba(0,0,0,0)_45%,rgba(0,0,0,0.2)_100%)]" />
                        {/* 좌상단 — 파티 종류 */}
                        <span className="absolute top-2.5 left-2.5 md:top-3.5 md:left-3.5 z-10 bg-[rgba(17,17,17,0.85)] text-white text-[11px] md:text-xs font-bold leading-none px-2.5 py-1.5 md:px-[11px] md:py-[7px] rounded-full whitespace-nowrap">
                          {PARTY_TYPE_LABELS[partyTypeOf(card)]}
                        </span>
                        {/* 우상단 — D-day(모집 중일 때만) → 대상(싱글/돌싱)·모집 마감 / 종료 시 [모집종료] 하나 */}
                        <div className="absolute top-2.5 right-2.5 md:top-3.5 md:right-3.5 z-10 flex items-center justify-end gap-1.5">
                          {isEnded ? (
                            <span className={`${badgeCls} bg-white text-[#6B7280] border border-dashed border-[#D1D5DB]`}>모집종료</span>
                          ) : (
                            <>
                              {dDay && <span className={`${badgeCls} bg-white text-[#D61F45] tabular-nums`}>{dDay}</span>}
                              {card.targetGroup === "싱글" && <span className={`${badgeCls} bg-[#3EE0C5] text-[#0B3B34]`}>싱글</span>}
                              {card.targetGroup === "돌싱" && <span className={`${badgeCls} bg-[#b4a7d6] text-black`}>돌싱</span>}
                              {stock.allFull && <span className={`${badgeCls} bg-gray-900 text-white`}>모집 마감</span>}
                            </>
                          )}
                        </div>
                      </div>

                      {/* 본문 — 제목 → 소개 → 일시·장소 → (구분선) 참가조건 + 버튼 */}
                      <div className="flex-1 flex flex-col bg-[#F4F5F7] rounded-b-[15px] md:rounded-b-[19px] px-4 pt-[18px] pb-4 md:px-7 md:pt-6 md:pb-[22px]">
                        <h3 className={`text-lg md:text-xl font-bold leading-snug truncate ${isEnded ? "text-[#6B7280]" : "text-[#111]"}`}>{card.title}</h3>
                        {card.description && (
                          <p className="mt-1 text-[13px] md:text-sm text-[#6B7280] truncate">{card.description}</p>
                        )}
                        <div className="mt-3.5 md:mt-4 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-[#9CA3AF] flex-shrink-0" />
                            <span className="text-sm md:text-[15px] font-bold text-[#111]">{card.dateString}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-[#9CA3AF] flex-shrink-0" />
                            <span className="min-w-0 text-[13px] md:text-sm leading-[1.45] text-[#4B5563] line-clamp-2 break-keep">{card.location}</span>
                          </div>
                        </div>

                        {/* 하단 — 참가조건(왼쪽) · 버튼(오른쪽), 위 구분선 */}
                        <div className="mt-auto pt-3.5 md:pt-4">
                          <div className="flex items-center justify-between gap-3 pt-3.5 md:pt-4 border-t border-[#E6E8EC]">
                            <span className="min-w-0 text-xs md:text-[13px] text-[#6B7280] break-keep md:truncate">{card.target}</span>
                            {/* 버튼 모양 표시 — 카드 전체가 링크라서 안쪽은 링크·버튼이 아닌 span. 색은 카드 hover·포커스 때 바뀜 */}
                            {isEnded ? (
                              <span className="flex-shrink-0 inline-flex items-center h-10 px-[18px] rounded-[10px] bg-[#FDE2E4] text-[#C81E33] text-sm font-bold whitespace-nowrap">
                                모집 종료된 파티
                              </span>
                            ) : (
                              <span
                                className={`apply-btn relative flex-shrink-0 inline-flex items-center h-10 px-[18px] rounded-[10px] text-sm font-bold whitespace-nowrap transition-colors duration-300 ${
                                  stock.allFull
                                    ? "bg-gray-200 text-gray-500 group-hover:bg-gray-300 group-focus-visible:bg-gray-300"
                                    : "bg-[#111] text-white group-hover:bg-brand-point group-focus-visible:bg-brand-point"
                                }`}
                              >
                                {stock.allFull ? "모집 마감 · 상세보기" : "신청하기"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            )}

            {/* v9.2 — [더보기] 버튼: 필터된 개수가 제한치(PC 12 / 모바일 10) 초과 + 아직 안 펼쳤을 때만 노출 */}
            {showApplyMore && (
              <div className="mt-8 md:mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => setApplyMoreOpen(true)}
                  className="inline-flex items-center justify-center gap-2 h-12 px-8 md:px-10 rounded-full border border-gray-300 text-gray-700 font-bold text-sm md:text-base hover:border-brand-point hover:text-brand-point-ink transition-colors"
                >
                  더보기 <ChevronDown size={18} />
                </button>
              </div>
            )}

            </div>{/* v8.0 mounted gate wrapper close (apply 섹션 동적 콘텐츠) */}
          </div>
        </section>

        {/* Gallery Section */}
        <section id="gallery" className="py-16 md:py-32 px-4 md:px-6 bg-brand-black text-white">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-10 md:mb-16">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">현장스케치</h2>
              <p className="text-sm md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed break-keep px-2">
                설렘과 온기가 가득했던 생생한 순간들
              </p>
            </motion.div>
            
            {/* 그리드 — 페이지당 6장 (PC 3x2 / 모바일 2x3), 화살표·점·스와이프·마우스 드래그 + 아래 컨트롤 바. app/components/gallery/ */}
            {/* v8.0 — 갤러리 이미지가 fetch 응답 후 swap 되며 발생하는 깜빡임을 mounted gate 로 차단 */}
            <div className={`transition-opacity duration-500 ease-out ${contentReady ? "opacity-100" : "opacity-0"}`}>
              <GalleryGrid
                items={galleryShown}
                page={currentGalleryPage}
                setPage={setCurrentGalleryPage}
                onOpen={setSelectedGalleryIndex}
                onOpenAll={() => setGalleryAllOpen(true)}
              />
            </div>
          </div>
        </section>

        <ReviewBoard />

        {/* Matching Schedule Section — PC(lg↑): 달력 + 오른쪽 상세 패널 / 태블릿(md~lg): 달력 + 아래 패널 / 모바일: 작은 달력 + 날짜별 리스트 */}
        <section id="schedule" className="py-16 md:py-32 px-4 md:px-6 bg-white shadow-[0_-20px_40px_rgba(0,0,0,0.02)]">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-8 md:mb-12">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">파티 일정</h2>
              <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto">신청 가능한 파티 일정을 확인하세요.</p>
            </motion.div>

            {/* Mobile: 연/월 내비게이션 + 작은 달력 + 날짜별 리스트 */}
            <div className="md:hidden">

              {/* 연도·월 내비게이션 바 */}
              <div className="flex items-center justify-between mb-5 px-1">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="이전 달"
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 text-brand-black hover:bg-brand-point hover:text-black active:scale-95 transition-all"
                >
                  <ChevronLeft size={22} strokeWidth={2.5} />
                </button>
                <span className="font-black text-xl tracking-tight text-brand-black">
                  {mobileYear > 0 ? `${mobileYear}년 ${mobileMonth}월` : ""}
                </span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="다음 달"
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 text-brand-black hover:bg-brand-point hover:text-black active:scale-95 transition-all"
                >
                  <ChevronRight size={22} strokeWidth={2.5} />
                </button>
              </div>

              {/* 작은 달력 — 일정 있는 날짜 아래 종류·상태 점(최대 3개, 4개 이상이면 +, scheduleDotTone) */}
              {mobileYear > 0 && (
                <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
                  <div className="grid grid-cols-7">
                    {SCHEDULE_WEEKDAYS.map(w => (
                      <div key={w} className="h-8 flex items-center justify-center text-xs font-bold text-gray-500">{w}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {Array.from({ length: mobileFirstDow }).map((_, i) => <div key={`blank-${i}`} aria-hidden="true" />)}
                    {Array.from({ length: mobileDaysInMonth }, (_, i) => {
                      const day = i + 1;
                      const ymd = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                      const dayEvents = mobileEventsByDay[ymd] ?? [];
                      const isSelected = mobileMode === "day" && ymd === mobileDate;
                      const isToday = ymd === todayYmd;
                      return (
                        <button
                          key={ymd}
                          type="button"
                          onClick={() => { setMobilePicked(ymd); setMobileListMode("day"); }}
                          aria-pressed={isSelected}
                          aria-label={`${mobileMonth}월 ${day}일${dayEvents.length ? `, 일정 ${dayEvents.length}개` : ""}`}
                          className="h-12 flex flex-col items-center justify-start gap-0.5 pt-1 rounded-xl active:bg-gray-100 transition-colors"
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                            isSelected ? "bg-brand-point text-[#003B37] font-black"
                              : isToday ? "bg-[#E9FBF9] text-brand-point-ink font-black"
                              : "text-gray-800 font-bold"
                          }`}>
                            {day}
                          </span>
                          <span aria-hidden="true" className="h-2.5 flex items-center gap-1">
                            {dayEvents.slice(0, 3).map(e => (
                              <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${scheduleDotTone(e.extendedProps.partyType, e.extendedProps.status)}`} />
                            ))}
                            {dayEvents.length > 3 && <span className="text-xs leading-none font-black text-gray-500">+</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 보기 전환 — 선택한 날짜 | 이번 달 전체 */}
              <div role="group" aria-label="일정 보기 방식" className="flex items-center gap-2 mb-4">
                {([
                  { mode: "day" as const,   label: "선택한 날짜" },
                  { mode: "month" as const, label: "이번 달 전체" },
                ]).map(opt => (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setMobileListMode(opt.mode)}
                    disabled={opt.mode === "day" && !mobileDate}
                    aria-pressed={mobileMode === opt.mode}
                    className={`h-11 px-4 rounded-full text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      mobileMode === opt.mode ? "bg-brand-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:hover:bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* 일정 리스트 */}
              <div className="space-y-3">
                {mobileMode === "day" && mobileDate ? (
                  <>
                    <p className="px-1 text-sm font-black text-gray-500">{scheduleShortLabel(mobileDate)}</p>
                    {mobileDayEvents.length === 0 ? (
                      <p className="text-center text-gray-500 py-10">선택한 날짜에는 일정이 없습니다.</p>
                    ) : (
                      mobileDayEvents.map(event => renderScheduleCard(event))
                    )}
                  </>
                ) : mobileSchedule.length === 0 ? (
                  <p className="text-center text-gray-500 py-12">
                    {mobileYear > 0 ? `${mobileMonth}월에 등록된 일정이 없습니다.` : ""}
                  </p>
                ) : (
                  mobileMonthGroups.map(([ymd, events]) => (
                    <div key={ymd} className="space-y-3">
                      <p className="px-1 pt-2 text-sm font-black text-gray-500">{scheduleShortLabel(ymd)}</p>
                      {events.map(event => renderScheduleCard(event))}
                    </div>
                  ))
                )}

                {/* 더보기 — "이번 달 전체"에서 선택 월 일정이 10개 초과 시 (PC 캘린더 무영향) */}
                {mobileMode === "month" && showScheduleMore && (
                  <button
                    type="button"
                    onClick={() => setScheduleMoreOpen(true)}
                    className="mt-2 w-full h-12 inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 text-gray-700 font-bold text-sm hover:border-brand-point hover:text-brand-point-ink transition-colors"
                  >
                    더보기 <ChevronDown size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* PC·태블릿: 달력 + 상세 패널 (lg 이상 2열 65:35 / md~lg 는 달력 아래에 패널) */}
            <div className="hidden md:grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-6 xl:gap-8 items-start">
              <div className="min-w-0 bg-white p-6 lg:p-5 xl:p-6 rounded-3xl shadow-lg border border-gray-100">
                <div className="calendar-container w-full">
                  <style dangerouslySetInnerHTML={{__html: `
                    .fc-theme-standard .fc-scrollgrid { border-color: #f3f4f6; }
                    .fc-theme-standard th, .fc-theme-standard td { border-color: #f3f4f6; }
                    .fc-daygrid-day-frame { min-height: 120px !important; display: flex !important; flex-direction: column !important; cursor: pointer; }
                    .fc-daygrid-day-top { flex-direction: row !important; justify-content: flex-start !important; padding: 10px 10px 6px !important; }
                    .fc-daygrid-day-number { font-weight: 800; color: #111; padding: 0 !important; font-size: 1.1rem; opacity: 0.9; margin-bottom: 2px; }
                    .fc-daygrid-day-events { display: flex !important; flex-direction: column !important; gap: 4px !important; padding: 0 3px 6px 3px !important; }
                    /* 일정 칩 — 색은 eventContent 의 상태별 클래스가 담당 (왼쪽 굵은 테두리 없음) */
                    .fc-event { cursor: pointer; border: none !important; background: transparent !important; box-shadow: none; padding: 0 !important; margin: 0 !important; width: 100% !important; box-sizing: border-box; transition: transform 0.2s ease !important; }
                    .fc-event:hover { transform: translateY(-1px); opacity: 1 !important; z-index: 5; position: relative; }
                    .fc-event:hover .sch-chip { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); }
                    .fc-event:active { transform: translateY(0) scale(0.98); }
                    .fc-event-title, .fc-event-main { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; padding: 0 !important; margin: 0 !important; background: transparent !important; }
                    .fc-toolbar-title { font-weight: 900; font-size: 1.85rem !important; letter-spacing: -0.02em; }
                    .fc-button-primary { background-color: #000 !important; border: none !important; border-radius: 12px !important; padding: 8px 16px !important; font-size: 0.9rem !important; display: flex !important; align-items: center !important; justify-content: center !important; transition: all 0.2s !important; }
                    .fc-button-primary:hover { background-color: #40E0D0 !important; color: #000 !important; transform: translateY(-1px); }
                    .fc-button-group { gap: 10px !important; }
                    .fc-button-group > .fc-button { border-radius: 12px !important; margin-left: 0 !important; }
                    .fc-toolbar-chunk { display: flex; align-items: center; }
                    .fc-toolbar { display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 2rem !important; }
                    .fc-icon { font-size: 1.2em !important; font-weight: bold; }
                    .fc-today-button { font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; padding-left: 20px !important; padding-right: 20px !important; }
                    .fc-view-harness { background-color: #fff; }
                    .fc-col-header-cell { padding: 12px 0 !important; background-color: #fafafa; }
                    .fc-col-header-cell-cushion { color: #666; font-weight: 700; font-size: 0.9rem; }
                    .fc-daygrid-more-link { font-weight: 800; color: #00807A !important; font-size: 0.8rem; margin-top: 2px; padding-left: 4px; }
                    /* 오늘 칸 — 연한 청록 배경 + 진한 청록 날짜. 오늘 칸 안의 매칭 칩(모집중·마감임박)은 배경에 묻히지 않게 흰색
                       (마감·지난 칩은 eventContent 의 상태별 색 그대로) */
                    .fc .fc-daygrid-day.fc-day-today { background-color: #E9FBF9 !important; }
                    .fc .fc-day-today .fc-daygrid-day-number { color: #00756F; font-weight: 900; }
                    .fc .fc-day-today .sch-chip-match:is(.sch-chip-open, .sch-chip-soon) { background: #FFFFFF; }
                    /* 선택한 날짜 — 검정 2px 테두리 */
                    /* (칸 안쪽 상자가 아니라 칸 전체에 그린다 — 안쪽 상자는 최소 높이(120px)라, 같은 줄의 다른 날짜에 일정이 많아 줄이 높아지면 테두리가 칸보다 짧아짐) */
                    .fc .fc-daygrid-day.sch-day-selected { position: relative; }
                    .fc .fc-daygrid-day.sch-day-selected::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 2px #000; border-radius: 4px; pointer-events: none; z-index: 5; }
                    .fc-daygrid-event-dot { display: none !important; }
                  `}} />
                  <FullCalendar
                    ref={calendarRef}
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    // 초기 노출 월 = 접속한 사용자의 현재 날짜. initialDate 생략 시 FullCalendar 가
                    // init 시점(브라우저)에서 new Date() 를 사용 → 빌드 날짜 고정/하이드레이션 불일치 없음.
                    locale="ko"
                    buttonText={{ today: 'TODAY' }}
                    events={CALENDAR_EVENTS}
                    eventClick={(info) => openScheduleParty(info.event.id)}
                    height="auto"
                    headerToolbar={{
                      left: 'prev,next',
                      center: 'title',
                      right: 'today'
                    }}
                    titleFormat={{ year: 'numeric', month: 'long' }}
                    dayMaxEvents={3}
                    moreLinkText={(n) => `+${n}개`}
                    displayEventTime={false}
                    // 늦은 밤(예: 23:30) 일정이 기본 1시간 길이 때문에 다음 날 칸까지 이어지지 않도록
                    nextDayThreshold="06:00:00"
                    dayCellContent={(arg) => arg.dayNumberText.replace('일', '')}
                    // 날짜 칸 클릭 → 그날 선택 (오른쪽 패널에 그날 일정)
                    dateClick={(info) => setScheduleSelected(info.dateStr)}
                    // "+N개" → 팝오버 없이 날짜만 선택. 함수가 아무것도 반환하지 않으면 FullCalendar 가
                    // 팝오버를 열기 때문에 현재 보기(dayGridMonth)를 반환 → 같은 달 그대로 유지.
                    moreLinkClick={(info) => { setScheduleSelected(toYmd(info.date)); return "dayGridMonth"; }}
                    dayCellClassNames={(arg) => (toYmd(arg.date) === pcSelectedDate ? ["sch-day-selected"] : [])}
                    // 칩 — 종류 태그(매칭파티/솔로파티, 시간과 같은 12px 굵게) + 시간(보통 굵기·회색). 칸이 좁아 테마·"임박"/"마감" 글자 태그는 넣지 않는다
                    // (시간이 없는 일정만 시간 자리에 테마). 여백(칩·태그 3px)은 1263px(윈도우 150% 배율) 화면에서도 한 줄에 들어가게 맞춘 값.
                    // 그보다 좁으면(1024px 화면·태블릿) 시간이 다음 줄로.
                    // 상태는 색으로만 구분: 모집중 = 종류 연한 색, 마감임박 = 종류 연한 색 + 빨간 테두리, 마감 = 회색, 지난 일정 = 흰색 점선
                    eventContent={(arg) => {
                      const xp = arg.event.extendedProps as { time?: string; theme?: string; status?: ScheduleStatus | null; partyType?: PartyType };
                      const status = xp.status ?? "open";
                      const partyType = xp.partyType ?? "matching";
                      const soft = SCHEDULE_TYPE_STYLE[partyType].soft;
                      const chipTone = {
                        open: `${soft} border-transparent text-gray-600`,
                        soon: `${soft} border-[#F87171] text-gray-600`,
                        full: "bg-[#F3F4F6] border-transparent text-gray-400",
                        past: "bg-white border-dashed border-[#E5E7EB] text-[#9CA3AF]",
                      }[status];
                      return (
                        <div
                          title={`${xp.time ? xp.time + " " : ""}${arg.event.title}`}
                          className={`sch-chip ${partyType === "solo" ? "sch-chip-solo" : "sch-chip-match"} sch-chip-${status} w-full flex flex-wrap items-center gap-y-0.5 overflow-hidden rounded-md border px-[3px] py-1 text-xs font-medium leading-tight ${chipTone}`}
                        >
                          <span className={`flex-shrink-0 mr-[3px] rounded px-[3px] py-px text-xs font-bold tracking-tight whitespace-nowrap ${scheduleTypeBadgeTone(partyType, status)}`}>
                            {SCHEDULE_TYPE_STYLE[partyType].label}
                          </span>
                          {xp.time ? (
                            <span className="flex-shrink-0 tabular-nums">{xp.time}</span>
                          ) : (
                            <span className={`min-w-0 flex-1 truncate ${status === "full" ? "line-through" : ""}`}>{xp.theme ? categoryLabel(xp.theme) : arg.event.title}</span>
                          )}
                        </div>
                      );
                    }}
                  />
                </div>
              </div>

              {/* 선택한 날짜의 일정 패널 (lg 이상은 오른쪽에 고정) */}
              <aside aria-live="polite" className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 xl:p-7 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h3 className="text-xl font-black tracking-tight text-brand-black">
                    {pcSelectedDate ? scheduleLongLabel(pcSelectedDate) : "날짜를 선택하세요"}
                  </h3>
                  {pcSelectedDate && <span className="text-sm font-bold text-gray-500 whitespace-nowrap">일정 {pcSelectedEvents.length}개</span>}
                </div>
                {pcSelectedEvents.length === 0 ? (
                  <p className="py-10 text-center text-gray-500">
                    이 날짜에는 일정이 없습니다.
                    <span className="block mt-1 text-sm">달력에서 일정이 있는 날짜를 눌러 보세요.</span>
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {pcSelectedEvents.map(event => {
                      const xp = event.extendedProps;
                      const status = xp.status;
                      const isPast = status === "past";
                      return (
                        <li key={event.id}>
                          <button
                            type="button"
                            onClick={() => openScheduleParty(event.id)}
                            className={`group w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-all ${SCHEDULE_CARD_TONE[status ?? "open"]} ${
                              status === "full" || isPast ? "" : "hover:shadow-md"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md whitespace-nowrap ${scheduleTypeBadgeTone(xp.partyType, status)}`}>
                                  {SCHEDULE_TYPE_STYLE[xp.partyType].label}
                                </span>
                                {status && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${SCHEDULE_STATUS_STYLE[status].tone}`}>
                                    {SCHEDULE_STATUS_STYLE[status].label}
                                  </span>
                                )}
                                {[xp.targetGroup, xp.theme && categoryLabel(xp.theme), xp.locationTag].filter(Boolean).map(tag => (
                                  <span key={tag as string} className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 ${isPast ? "text-gray-400" : "text-gray-600"}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <div className={`font-black text-base leading-snug ${isPast ? "text-gray-400" : "text-brand-black"} ${status === "full" ? "line-through" : ""}`}>
                                {xp.time && <span className="tabular-nums mr-1.5">{xp.time}</span>}
                                {event.title}
                              </div>
                              <div className={`text-sm mt-1 truncate ${isPast ? "text-gray-400" : "text-gray-500"}`}>
                                {xp.location} · {xp.target}
                              </div>
                              <div className={`text-sm mt-1 font-bold ${scheduleRemainTone(status) ?? "text-gray-700"}`}>
                                {xp.hasOptions ? `${xp.remainingLabel} 남음` : `남 ${xp.maleRemaining}석 · 여 ${xp.femaleRemaining}석 남음`}
                              </div>
                            </div>
                            <ArrowRight size={18} className={`flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${isPast ? "text-gray-400" : "text-gray-500"}`} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>
            </div>
          </div>
        </section>

        {/* Participants List Section — 한 줄 마키(app/globals.css .participants-track / .participants-row) */}
        <section id="participants" className="py-16 md:py-24 bg-brand-lightgray overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 mb-8 md:mb-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E1F5EE] px-2.5 py-1 text-xs text-brand-point-ink mb-3 md:mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-point" aria-hidden="true" />
                실시간 업데이트
              </span>
              <h2 className="text-3xl md:text-5xl font-bold mb-4 md:mb-6 tracking-tight">어떤 사람들이 오나요?</h2>
              <p className="text-sm md:text-lg text-gray-500">철저한 심사를 거친, 매력적인 참가자들이 기다리고 있습니다.</p>
            </motion.div>
          </div>

          {/* v8.0 — 참가자 캐러셀이 /api/participants.php 응답으로 늘어나며 발생하는 깜빡임 차단 */}
          <div className={`participants-track transition-opacity duration-500 ease-out ${contentReady ? "opacity-100" : "opacity-0"}`}>
            {/* 같은 목록을 2번 이어 붙여 -50% 이동으로 끊김 없이 반복. pr = gap → 절반 지점이 정확히 카드 경계 */}
            <div
              className="participants-row flex items-stretch gap-3 md:gap-4 pr-3 md:pr-4 w-max"
              style={{ animationDuration: `${allParticipants.length * PARTICIPANT_SEC_PER_CARD}s` }}
            >
              {[...allParticipants, ...allParticipants].map((p, idx) => {
                const isCopy = idx >= allParticipants.length;
                const isMale = p.gender === "male";
                return (
                  /* 카드 폭 = 내용(직업 줄·키워드 첫 줄 중 긴 쪽)에 맞춤 → 오른쪽이 비지 않음. 최대 폭을 넘는 직업만 말줄임 */
                  <div
                    key={`${p.id}-${idx}`}
                    aria-hidden={isCopy || undefined}
                    className={`participants-card w-max max-w-[280px] md:max-w-[360px] flex-shrink-0 p-3.5 md:p-5 rounded-2xl bg-white border border-gray-100 transition-colors hover:border-brand-point${isCopy ? " participants-copy" : ""}`}
                  >
                    <div className="flex items-center gap-2.5 md:gap-3">
                      <div className={`w-[38px] h-[38px] md:w-12 md:h-12 flex-shrink-0 rounded-full flex items-center justify-center text-[13px] md:text-[15px] font-bold ${isMale ? "bg-[#E6F1FB] text-[#0C447C]" : "bg-[#FCE4EC] text-[#72243E]"}`}>
                        {isMale ? "남" : "여"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] md:text-lg font-bold text-gray-900 leading-snug truncate">{p.job}</h3>
                        {p.age && (
                          <p className="text-[13px] md:text-[15px] font-bold text-brand-point-ink leading-snug">{p.age}</p>
                        )}
                      </div>
                    </div>
                    {p.keywords.length > 0 && (
                      /* 키워드는 3개씩 끊어 줄을 나눈다(5개 → 3+2). 한 줄이 넘칠 때만 그 줄 안에서 줄바꿈 */
                      <div className="mt-2.5 md:mt-3 space-y-1.5">
                        {Array.from({ length: Math.ceil(p.keywords.length / KEYWORDS_PER_ROW) }, (_, rIdx) =>
                          p.keywords.slice(rIdx * KEYWORDS_PER_ROW, (rIdx + 1) * KEYWORDS_PER_ROW)
                        ).map((row, rIdx) => (
                          <div key={rIdx} className="flex flex-wrap gap-1.5">
                            {row.map((k, kIdx) => (
                              <span key={kIdx} className="bg-gray-50 text-gray-600 border border-gray-100 text-xs md:text-[13px] px-2.5 md:px-3 py-0.5 md:py-1 rounded-full whitespace-nowrap">#{k}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ Accordion Section — 가운데 1단. 데이터·추가 블록은 app/lib/data.ts FAQS */}
        <section id="faq" className="py-16 md:py-32 px-4 md:px-6 bg-white">
          <div className="max-w-[820px] mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-10 md:mb-14">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">자주 묻는 질문</h2>
              <p className="mt-3 md:mt-4 text-sm md:text-lg text-gray-600 break-keep">참가 전 가장 많이 물어보시는 내용을 모았어요.</p>
            </motion.div>

            <div className="border-t-2 border-black">
              {FAQS.map((faq, index) => {
                const isOpen = faqOpenIndex === index;
                const qId = `faq-q-${faq.id}`;
                const aId = `faq-a-${faq.id}`;
                return (
                  <div key={faq.id} className="border-b border-gray-200">
                    <h3>
                      <button
                        type="button"
                        id={qId}
                        aria-expanded={isOpen}
                        aria-controls={aId}
                        onClick={() => setFaqOpenIndex(isOpen ? null : index)}
                        className="group w-full min-h-[72px] py-4 flex items-center gap-3 md:gap-4 text-left"
                      >
                        <span aria-hidden="true" className="w-6 md:w-7 shrink-0 text-lg md:text-xl font-extrabold text-brand-point-ink">Q</span>
                        <span className={`flex-1 text-base md:text-lg leading-snug break-keep transition-colors ${isOpen ? "font-bold text-black" : "font-medium text-gray-800 group-hover:text-black"}`}>
                          {faq.q}
                        </span>
                        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-300 ${isOpen ? "bg-black text-white" : "bg-brand-lightgray text-gray-700 group-hover:bg-gray-200"}`}>
                          <ChevronDown size={18} aria-hidden="true" className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                      </button>
                    </h3>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          id={aId}
                          role="region"
                          aria-labelledby={qId}
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {/* 왼쪽 들여쓰기 = Q 너비 + 간격 (w-6+gap-3 / md:w-7+gap-4) */}
                          <div className="pl-9 md:pl-11 pb-5 md:pb-6">
                            <div className="bg-brand-lightgray rounded-2xl p-5 md:p-6">
                              <p className="font-bold text-black text-[15px] md:text-base leading-relaxed break-keep">{faq.lead}</p>
                              {faq.body && (
                                <p className="mt-2 text-sm md:text-[15px] text-gray-600 leading-relaxed break-keep whitespace-pre-line">{faq.body}</p>
                              )}

                              {faq.steps && (
                                <ol className="mt-4 flex flex-wrap gap-2.5">
                                  {faq.steps.map((step, sIdx, all) => {
                                    const isLast = sIdx === all.length - 1;
                                    return (
                                      <li key={step.label} className={`grow basis-[150px] bg-white rounded-xl p-3.5 border ${isLast ? "border-brand-point-ink" : "border-transparent"}`}>
                                        <div className="flex items-center gap-2">
                                          <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white ${isLast ? "bg-brand-point-ink" : "bg-black"}`}>{sIdx + 1}</span>
                                          <span className="text-sm font-bold text-black">{step.label}</span>
                                        </div>
                                        <p className="mt-2 text-[13px] text-gray-600 leading-relaxed break-keep">{step.desc}</p>
                                      </li>
                                    );
                                  })}
                                </ol>
                              )}

                              {faq.refund && (
                                <ul className="mt-4 bg-white rounded-xl p-4 md:p-5 space-y-3">
                                  {faq.refund.map(r => (
                                    <li key={r.when} className="flex items-center gap-2.5 md:gap-3">
                                      <span className="w-[116px] shrink-0 text-[13px] md:text-sm font-medium text-gray-700 break-keep">{r.when}</span>
                                      <span aria-hidden="true" className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <span className="block h-full rounded-full bg-brand-point" style={{ width: `${r.value}%` }} />
                                      </span>
                                      <span className={`w-[60px] shrink-0 text-right text-[13px] md:text-sm font-bold ${r.value === 0 ? "text-red-700" : "text-black"}`}>{r.pct}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {faq.chips && (
                                <ul className="mt-4 flex flex-wrap gap-2">
                                  {faq.chips.map(chip => (
                                    <li key={chip} className="inline-flex items-center gap-1.5 bg-white rounded-full px-3.5 py-1.5 text-[13px] md:text-sm font-medium text-gray-800">
                                      <Check size={15} strokeWidth={2.5} aria-hidden="true" className="text-brand-point-ink" />
                                      {chip}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {faq.link && (
                                <Link
                                  href={faq.link.href}
                                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-black px-4 py-2 text-sm font-bold text-black hover:bg-black hover:text-white transition-colors"
                                >
                                  {faq.link.label}
                                  <ArrowRight size={16} aria-hidden="true" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* 문의 카드 — 모바일은 flex-wrap 으로 버튼이 아래 줄로 */}
            <div className="mt-10 md:mt-14 bg-black text-white rounded-[20px] p-6 md:p-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
              <div>
                <p className="font-bold text-lg md:text-xl">원하는 답을 찾지 못하셨나요?</p>
                <p className="mt-1 text-sm md:text-base text-gray-300 break-keep">고객센터로 남겨주시면 확인 후 답변드릴게요.</p>
              </div>
              <Link
                href="/report"
                className="inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-full bg-brand-point text-black text-sm md:text-base font-bold hover:bg-white transition-colors"
              >
                고객센터 문의하기
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* 현장스케치 전체 사진 보기 시트 → 사진을 누르면 그 위에 라이트박스 */}
      <GalleryAllSheet
        open={galleryAllOpen}
        items={galleryShown}
        onClose={() => setGalleryAllOpen(false)}
        onSelect={setSelectedGalleryIndex}
      />
      <GalleryLightbox
        items={galleryShown}
        index={selectedGalleryIndex}
        onClose={() => setSelectedGalleryIndex(null)}
        onIndexChange={setSelectedGalleryIndex}
      />
    </div>
  );
}
