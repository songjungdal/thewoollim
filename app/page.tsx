"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Users, Calendar, MapPin, X } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ReviewBoard from "./components/ReviewBoard";
import { PARTICIPANTS, FAQS, partyStockStatus, withLiveCounts, partyVisibility, categoryLabel, partyTypeOf, PARTY_TYPES, PARTY_TYPE_LABELS, type PartyType } from "./lib/data";
import { useAuth } from "./context/AuthContext";
import { useParties } from "./lib/useParties";

/* ── #schedule(파티 일정) 섹션 전용 — 일정 상태별 표시 스타일 ──────────────
 * 우선순위: 지난 일정 > 마감 > 마감임박 > 모집중 (계산은 컴포넌트의 scheduleStatus 참고) */
type ScheduleStatus = "open" | "soon" | "full" | "past";
const SCHEDULE_STATUS_ORDER: ScheduleStatus[] = ["open", "soon", "full", "past"];
const SCHEDULE_STATUS_STYLE: Record<ScheduleStatus, { label: string; tone: string; dot: string }> = {
  open: { label: "모집중",    tone: "bg-[#40E0D0]/15 text-brand-point-ink",             dot: "bg-brand-point" },
  soon: { label: "마감임박",  tone: "bg-amber-50 text-amber-800",                       dot: "bg-amber-500" },
  full: { label: "마감",      tone: "bg-gray-200 text-gray-600",                        dot: "bg-gray-500" },
  past: { label: "지난 일정", tone: "bg-gray-50 text-gray-400 border border-gray-200",  dot: "bg-gray-300" },
};
/** 일정 카드·패널의 파티 종류 배지 — 지난 일정은 다른 표시처럼 흐리게 */
const scheduleTypeBadgeTone = (isPast: boolean) => (isPast ? "bg-gray-200 text-gray-500" : "bg-gray-900 text-white");
const SCHEDULE_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** Date → 로컬 기준 "YYYY-MM-DD" */
const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/**
 * 후기 갤러리 가로 슬라이더 — 페이지당 6장 (PC 2x3 / 모바일 3x2).
 * 마우스 드래그 + 터치 스와이프로 페이지 전환. 클릭 vs 드래그 구분.
 */
type GalleryItem = { id: number; image_path: string; alt_text: string; sort_order: number };

function GallerySlider({
  source, currentPage, setCurrentPage, onImageClick,
}: {
  source: GalleryItem[];
  currentPage: number;
  setCurrentPage: (updater: (p: number) => number) => void;
  onImageClick: (path: string) => void;
}) {
  const PAGE_SIZE  = 6;
  const totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages - 1);

  // 컨테이너 폭 + 페이지 간 gap 을 픽셀 단위로 측정 → 정확한 위치로 슬라이드.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);
  const [pageGap,   setPageGap]   = useState(24); // 24px (PC) / 12px (모바일)

  useEffect(() => {
    const update = () => {
      setViewportW(viewportRef.current?.offsetWidth ?? 0);
      setPageGap(window.innerWidth >= 768 ? 24 : 12);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const pageStride = viewportW + pageGap;
  const goPrev = () => setCurrentPage(p => Math.max(0, p - 1));
  const goNext = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));

  // 화살표 공통 스타일 — 원형/사각형 박스 X, 화살표 기호만.
  // 이미지 위에 오버레이되므로 기본 흰색(밝은 가독성) + hover 시 brand-point 청록.
  const arrowBase =
    "absolute top-1/2 -translate-y-1/2 z-10 p-2 text-white hover:text-brand-point " +
    "transition-colors disabled:text-white/30 disabled:cursor-not-allowed " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080]/40 rounded-md " +
    "drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]";

  return (
    <div className="relative">
      {/* 슬라이드 윈도우 — 페이지 폭 전체를 사용 (max-w-7xl) */}
      <div ref={viewportRef} className="overflow-hidden">
        <motion.div
          className="flex"
          style={{ gap: `${pageGap}px`, willChange: "transform" }}
          animate={{ x: -safePage * pageStride }}
          transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.7 }}
        >
          {Array.from({ length: totalPages }).map((_, pageIdx) => {
            const pageItems = source.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);
            return (
              <div
                key={pageIdx}
                style={{ width: viewportW || undefined }}
                className="flex-shrink-0 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6"
              >
                {pageItems.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className="aspect-square bg-gray-800 rounded-2xl md:rounded-3xl relative overflow-hidden group cursor-pointer border border-white/5"
                    onClick={() => onImageClick(item.image_path)}
                  >
                    <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110 group-hover:brightness-110 pointer-events-none">
                      <Image
                        src={item.image_path}
                        alt={item.alt_text || `갤러리 이미지 ${idx + 1}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  </div>
                ))}
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* 좌/우 화살표 — 그리드 위에 겹쳐 배치 (이미지 가독성을 위해 drop-shadow) */}
      {totalPages > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={safePage === 0}
            aria-label="이전 갤러리"
            className={`${arrowBase} left-1 md:left-3`}
          >
            <ChevronLeft className="w-8 h-8 md:w-12 md:h-12" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={safePage === totalPages - 1}
            aria-label="다음 갤러리"
            className={`${arrowBase} right-1 md:right-3`}
          >
            <ChevronRight className="w-8 h-8 md:w-12 md:h-12" strokeWidth={3} />
          </button>
        </>
      )}

      {/* 페이지 인디케이터 (dots) */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6 md:mt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentPage(() => i)}
              aria-label={`갤러리 ${i + 1} 페이지`}
              className={`relative h-2 rounded-full transition-all before:absolute before:-inset-x-1 before:-inset-y-[18px] ${
                i === safePage ? "w-6 bg-[#008080]" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SmoothOnePage() {
  const [activeTab, setActiveTab] = useState("일정별");
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(null);
  const [currentGalleryPage, setCurrentGalleryPage] = useState(0);   // 6장씩 가로 슬라이드 페이지 인덱스
  // 후기 갤러리 — DB 라이브 fetch (관리자가 수정 시 BroadcastChannel + 폴링으로 즉시 반영)
  type GalleryItem = { id: number; image_path: string; alt_text: string; sort_order: number };
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [liveMembers, setLiveMembers] = useState<typeof PARTICIPANTS>([]);
  const { partyCounts } = useAuth();
  const PARTIES = useParties();
  const router = useRouter();

  // 후기 갤러리 fetch — 관리자 변경 시 BroadcastChannel('woollim_gallery') 으로 즉시 동기화
  useEffect(() => {
    let cancelled = false;
    const loadGallery = () => {
      fetch("/api/gallery.php", { cache: "no-store" })
        .then(r => r.ok ? r.json() : [])
        .then((data) => { if (!cancelled && Array.isArray(data)) setGalleryItems(data); })
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

  // 계층형 카테고리: 상위 축(대상별/테마별/지역별) 선택 후 세부 값 선택.
  // null = 미선택, "all" = 축 선택했지만 세부 미선택(전체 노출).
  type Axis = "대상별" | "테마별" | "지역별";
  const [activeAxis, setActiveAxis] = useState<Axis | null>(null);
  const [filterValue, setFilterValue] = useState<string | null>(null);

  const AXIS_OPTIONS: Record<Axis, readonly string[]> = {
    "대상별": ["싱글", "돌싱"],
    "테마별": ["티타임", "와인파티", "사케파티", "쿠킹클래스"],
    // '기타' 는 필터 버튼에서 노출 제외 — 기존 '기타' 파티는 전체보기에 그대로 노출됨
    // 표시 순서만: 인천 ↔ 용인 교체 (DB 값/매칭 로직 무영향)
    "지역별": ["서울", "성남", "수원", "용인", "인천"],
  };
  const AXIS_FIELD: Record<Axis, "targetGroup" | "theme" | "locationTag"> = {
    "대상별": "targetGroup", "테마별": "theme", "지역별": "locationTag",
  };

  // 파티 종류 탭 [전체 / 매칭파티 / 솔로파티] — 기존 대상·테마·지역 필터와 둘 다 만족하는 파티만 보여준다.
  //   /?type=solo#apply 로 들어오면 솔로파티 탭이 선택된 채 열리고, 탭을 바꾸면 주소만 바꾼다(history.replaceState).
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

  const pickAxis = (axis: Axis) => {
    if (axis === activeAxis) {
      // 같은 축 다시 클릭 → 전체로 복귀
      setActiveAxis(null);
      setFilterValue(null);
    } else {
      setActiveAxis(axis);
      setFilterValue(null); // 축 변경 시 세부 값 초기화
    }
  };

  // SSR/CSR 시간대 차이로 인한 hydration mismatch 방지 — now 는 mount 후에만 세팅,
  // 1분마다 갱신해 행사 종료 시점에 카드 UI 가 자연스럽게 전환되게 함
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // v8.0 하이드레이션 깜빡임 방지 — SSR/초기 hydration 단계에서는 seed(DEFAULT_PARTIES) 가 노출되므로,
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

  // 카테고리 탭(상위 축/세부 값) 전환 시 더보기 상태 초기화 → 새 탭은 항상 접힌 채 처음부터 노출
  useEffect(() => {
    setApplyMoreOpen(false);
  }, [activeAxis, filterValue, typeTab]);

  // 모바일 일정 섹션 — 마운트 1회, 현재 날짜 기준 연/월 초기화
  useEffect(() => {
    const d = new Date();
    setMobileYear(d.getFullYear());
    setMobileMonth(d.getMonth() + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedParties = useMemo(() => {
    const filtered = [...PARTIES].filter(p => {
      if (typeTab !== "all" && partyTypeOf(p) !== typeTab) return false;
      if (!activeAxis || !filterValue) return true;
      return p[AXIS_FIELD[activeAxis]] === filterValue;
    });

    // mount 전(SSR/초기 hydration) — 시간 의존 필터/정렬 생략, 기존 동작 유지
    if (!now) return filtered.sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));

    return filtered
      .filter(p => partyVisibility(p, now) !== "expired")        // 종료 21일 초과 → 노출 제외
      .sort((a, b) => {
        const ra = partyVisibility(a, now) === "active" ? 0 : 1; // active 우선, ended 후순위
        const rb = partyVisibility(b, now) === "active" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.calendarDate.localeCompare(b.calendarDate);     // 그룹 내부는 기존 날짜 오름차순 유지
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAxis, filterValue, typeTab, PARTIES, now]);

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

  // 일정 섹션(모바일 리스트 + 데스크탑 캘린더) — 행사 일시 경과한 이벤트에 'fc-event-ended' 클래스
  // 부여해 연한 회색 톤으로 표시. 다른 카테고리 탭/필터·데이터 쿼리에는 무영향.
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
      // 솔로파티는 fc-event-solo 클래스 + 칩 안 "솔로" 표시로 구분 (색은 상태 범례 그대로 — 지난 일정 표시가 우선)
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

  // #schedule 모바일 카드 — 기존 디자인 유지 + 오른쪽 위 상태 배지 + "남 N · 여 N 남음" 한 줄.
  // 지난 일정은 연한 회색, 누르면 기존처럼 /party/{id} 로 이동.
  const renderScheduleCard = (event: ScheduleEvent) => {
    const party = PARTIES.find(p => p.id === event.id);
    const xp = event.extendedProps;
    const status = xp.status;
    const isPast = status === "past";
    const dateObj = new Date(event.start.substring(0, 10) + "T00:00:00");
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const dayName = SCHEDULE_WEEKDAYS[dateObj.getDay()];
    return (
      <button
        key={event.id}
        type="button"
        onClick={() => router.push(`/party/${event.id}`)}
        className={`w-full text-left rounded-2xl p-4 flex items-center gap-4 transition-all shadow-sm active:scale-[0.98] cursor-pointer ${
          isPast
            ? "bg-gray-50 border border-gray-200 hover:bg-gray-100"
            : "bg-gray-50 border border-gray-100 hover:border-brand-point hover:bg-white"
        }`}
      >
        <div className={`flex-shrink-0 w-14 rounded-xl py-2 text-center ${isPast ? "bg-gray-100" : "bg-[#40E0D0]/15"}`}>
          <div className={`text-xs font-bold ${isPast ? "text-gray-400" : "text-brand-point-ink"}`}>{month}월</div>
          <div className={`text-2xl font-black leading-none ${isPast ? "text-gray-400" : "text-brand-black"}`}>{day}</div>
          <div className={`text-xs font-semibold ${isPast ? "text-gray-400" : "text-gray-500"}`}>{dayName}요일</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className={`font-bold text-[15px] leading-snug min-w-0 ${isPast ? "text-gray-400" : "text-brand-black"} ${status === "full" ? "line-through" : ""}`}>
              <span className={`inline-block align-middle mr-1.5 -mt-0.5 text-xs font-black px-1.5 py-0.5 rounded-full no-underline ${scheduleTypeBadgeTone(isPast)}`}>
                {PARTY_TYPE_LABELS[xp.partyType]}
              </span>
              {event.title}
            </div>
            {status && (
              <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${SCHEDULE_STATUS_STYLE[status].tone}`}>
                {SCHEDULE_STATUS_STYLE[status].label}
              </span>
            )}
          </div>
          <div className={`text-sm ${isPast ? "text-gray-400" : "text-gray-500"}`}>{party?.dateString}</div>
          <div className={`text-xs mt-0.5 truncate ${isPast ? "text-gray-400" : "text-gray-500"}`}>{party?.location} · {party?.target}</div>
          <div className={`text-xs mt-1 font-bold break-keep ${isPast ? "text-gray-400" : "text-gray-600"}`}>{xp.hasOptions ? `${xp.remainingLabel} 남음` : `남 ${xp.maleRemaining} · 여 ${xp.femaleRemaining} 남음`}</div>
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
        {/* Hero Section — 모바일/PC 통합 풀블리드 오버레이 구조 */}
        <section className="relative flex flex-col bg-brand-black overflow-hidden min-h-[70vh] md:h-[88vh] md:min-h-[700px]">

          {/* 풀블리드 배경 이미지 — 모바일/PC 공통, object-cover 로 잘림 허용 */}
          <Image
            src="/images/hero-bg.webp"
            alt=""
            fill
            priority
            className="object-cover object-[center_30%] pointer-events-none"
          />

          {/* Overlay — 모바일: 균일 다크, PC: 하단으로 진해지는 그라디언트 */}
          <div className="absolute inset-0 bg-black/40 md:hidden" />
          <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

          {/* Content — 두 환경 모두 하단 정렬 (mt-auto), fade-in 유지 */}
          <div className="relative z-10 mt-auto max-w-7xl mx-auto px-5 md:px-10 w-full text-white pb-12 md:pb-24 md:pt-[160px]">
            <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
              <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.15] mb-4 md:mb-10 drop-shadow-2xl">
                세상을 울리는<br />
                새로운 연결, <span className="text-brand-point">어울림</span>
              </h1>
              <p className="text-sm sm:text-lg md:text-2xl text-white/85 font-semibold max-w-3xl leading-relaxed mb-8 md:mb-14 flex flex-col gap-1 md:gap-2 drop-shadow-lg">
                <span>숫자와 스펙으로 재단되는 관계를 넘어,</span>
                <span>모든 인연과 깊게 마주하는 로테이션 매칭파티를 경험하세요.</span>
              </p>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-brand-black text-white px-7 py-4 md:px-10 md:py-6 rounded-full text-base md:text-lg font-bold hover:bg-brand-point hover:text-black hover:-translate-y-1 transition-all shadow-xl hover:shadow-brand-point/30 cursor-pointer border border-white/20"
              >
                어울림 매칭파티 신청하기 <ArrowRight size={20} />
              </button>
            </motion.div>
          </div>
        </section>

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

            {/* 파티 종류 탭 — 밑줄형 텍스트 탭. 선택: 검정 굵은 글씨 + 터쿼이즈 밑줄 2px / 미선택: 회색. 모바일 한 줄 */}
            <div className="flex justify-center gap-6 md:gap-10 mb-6 md:mb-8" role="tablist" aria-label="파티 종류">
              {(["all", ...PARTY_TYPES] as const).map(t => {
                const isActive = typeTab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => pickType(t)}
                    className={`pt-3 pb-1.5 text-base md:text-xl whitespace-nowrap border-b-2 transition-colors ${
                      isActive ? "text-brand-black font-black border-brand-point" : "text-gray-500 font-bold border-transparent hover:text-gray-700"
                    }`}
                  >
                    {t === "all" ? "전체" : PARTY_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>

            {/* 계층형 카테고리 — 중앙 정렬, 상위 축 클릭 → 세부 옵션 전개 */}
            <div className="mb-10 md:mb-16 border-b border-gray-100 pb-6 md:pb-8">
              {/* 1단계: 상위 축 (대상별 / 테마별 / 지역별) — 중앙 정렬 */}
              <div className="flex justify-center flex-wrap gap-2 md:gap-3">
                {(["대상별", "테마별", "지역별"] as const).map(axis => {
                  const isActive = activeAxis === axis;
                  return (
                    <button
                      key={axis}
                      type="button"
                      onClick={() => pickAxis(axis)}
                      className={`px-5 md:px-7 py-2.5 md:py-3 text-base md:text-lg font-black rounded-full transition-all whitespace-nowrap ${
                        isActive
                          ? "bg-brand-point text-black shadow-md"
                          : "bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      {axis}
                    </button>
                  );
                })}
              </div>

              {/* 2단계: 세부 카테고리 (active axis가 있을 때만 노출) — 중앙 정렬, 부드러운 reveal */}
              <AnimatePresence initial={false}>
                {activeAxis && (
                  <motion.div
                    key={activeAxis}
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="flex justify-center flex-wrap gap-2 md:gap-2.5 mt-5 md:mt-6">
                      <button
                        type="button"
                        onClick={() => setFilterValue(null)}
                        className={`px-3.5 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
                          !filterValue
                            ? "bg-brand-point/10 text-brand-point-ink border border-brand-point/30"
                            : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        전체
                      </button>
                      {AXIS_OPTIONS[activeAxis].map(opt => {
                        const isSelected = filterValue === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFilterValue(opt)}
                            className={`px-3.5 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-full transition-all ${
                              isSelected
                                ? "bg-brand-point text-black shadow-md"
                                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                            }`}
                          >
                            {categoryLabel(opt)}
                          </button>
                        );
                      })}
                    </div>
                    {filterValue && (
                      <p className="text-center text-xs md:text-sm text-gray-500 font-medium mt-3">
                        {activeAxis} · <span className="text-brand-point-ink font-bold">{categoryLabel(filterValue)}</span> · {sortedParties.length}건
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {sortedParties.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-10 md:p-16 text-center">
                <p className="text-gray-500 font-bold text-sm md:text-base">선택한 조건에 맞는 파티가 없습니다.</p>
                <p className="text-xs md:text-sm text-gray-500 mt-2">다른 카테고리를 선택하거나 조건을 초기화해주세요.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              <AnimatePresence mode="popLayout">
                {visibleParties.map(card => {
                  // 실시간 결제완료 인원만 노출 — 카운트 없으면 0으로 강제 (시드/테스트 데이터 무시)
                  // 모집 마감은 partyStockStatus 결과 (참가 구성 파티는 모든 항목이 마감일 때, 명세 8-3)
                  const stock = partyStockStatus(withLiveCounts(card, partyCounts[card.id]));
                  // 행사 일시 경과 → 모집 종료 카드 UI (배지/버튼 색·문구만 교체, 링크 동작은 유지)
                  const isEnded = now ? partyVisibility(card, now) === "ended" : false;
                  return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, type: "spring", stiffness: 300, damping: 28 }}
                    className="bg-brand-lightgray border border-gray-100 p-5 md:p-8 rounded-2xl md:rounded-3xl hover:border-brand-point transition-all flex flex-col h-full group relative overflow-hidden"
                  >
                    {/* 매칭파티 카드 상단 이미지 — 관리자페이지의 "대표 이미지"(imageUrl)를 그대로 노출, 미등록 파티는 공통 디폴트로 대체.
                         카드 좌/우/상단 끝까지 꽉 차게 — 폭을 calc()로 명시해 카드 패딩만큼 정확히 확장(음수 마진만으로는
                         우측이 살짝 안 맞는 경우가 있어 폭 자체를 계산). 이미지 자체는 라운드 처리하지 않고
                         부모의 overflow-hidden + rounded-2xl/3xl 에 의해 상단 모서리만 자연스럽게 잘려 보임.
                         싱글/돌싱/모집마감/모집종료 배지는 absolute 로 이미지 위에 그대로 겹쳐서 뜬다.
                         max-w-none 필수 — Tailwind preflight 의 'img{max-width:100%}' 가 없으면 calc() 확장폭을 다시 100%로 깎아버림 */}
                    <img
                      src={card.imageUrl || "/images/party_card_default_banner.jpg"}
                      alt=""
                      className="block max-w-none w-[calc(100%+2.5rem)] md:w-[calc(100%+4rem)] h-20 md:h-24 object-cover -ml-5 -mt-5 md:-ml-8 md:-mt-8 mb-4 md:mb-5"
                    />
                    {/* 좌측 상단 — 파티 종류 배지 (기존 배지와 같은 크기, 검정 배경·흰 글자, 모집 종료 카드에도 표시) */}
                    <div className="absolute top-4 left-4 md:top-5 md:left-5 z-10">
                      <span className="bg-gray-900 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">
                        {PARTY_TYPE_LABELS[partyTypeOf(card)]}
                      </span>
                    </div>
                    {/* 우측 상단 배지 영역 — 종료 시 [모집종료] 단일 배지, 아니면 대상(싱글/돌싱) + 모집마감 스택 */}
                    <div className="absolute top-4 right-4 md:top-5 md:right-5 flex flex-col items-end gap-1.5 z-10">
                      {isEnded ? (
                        <span className="bg-[#f8d8dd] text-danger text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap tracking-tight">
                          모집종료
                        </span>
                      ) : (
                        <>
                          {(card.targetGroup === "싱글" || card.targetGroup === "돌싱") && (
                            <span className={`${card.targetGroup === "돌싱" ? "bg-[#b4a7d6]" : "bg-brand-point"} text-black text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap`}>
                              {card.targetGroup}
                            </span>
                          )}
                          {stock.allFull && (
                            <span className="bg-gray-900 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">
                              모집 마감
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {/* 제목 → 내용(소개) → 일시 → 장소 순서, 전체적으로 폰트 축소 — 우측 상단 배지가 가리지 않도록 우측 패딩 확보 */}
                    <h3 className="text-base md:text-lg font-bold mb-1 group-hover:text-brand-point-ink transition-colors leading-snug pr-16 md:pr-20">{card.title}</h3>
                    {card.description && (
                      <p className="text-xs md:text-sm text-gray-500 font-medium mb-2.5 md:mb-3 line-clamp-2 break-keep">{card.description}</p>
                    )}
                    <div className="space-y-1.5 mb-4 md:mb-5 text-gray-600 font-medium flex-1 text-xs md:text-sm">
                      <div className="flex items-center gap-2"><Calendar size={13} className="text-gray-500 group-hover:text-brand-point-ink transition-colors flex-shrink-0" /> <span className="font-bold">{card.dateString}</span></div>
                      <div className="flex items-center gap-2"><MapPin size={13} className="text-gray-500 group-hover:text-brand-point-ink transition-colors flex-shrink-0" /> {card.location}</div>
                    </div>

                    {/* 대상 + 신청 버튼 — 한 줄에 좌(대상) · 우(버튼) 배치, 신청하기와 동일한 가로 레이아웃 유지 */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs md:text-sm text-gray-500 font-medium truncate min-w-0">{card.target}</span>

                      {/* 종료 카드는 파스텔 빨강(#f8d8dd) 버튼, disabled/pointer-events 적용 X (링크 정상 동작) */}
                      <Link
                        href={`/party/${card.id}`}
                        className={`relative flex-shrink-0 text-center font-bold px-4 py-2 text-xs md:text-sm rounded-xl transition-colors duration-300 whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1.5 ${
                          isEnded
                            ? "bg-[#f8d8dd] text-danger hover:bg-[#f4c5cd]"
                            : stock.allFull
                              ? "bg-gray-200 text-gray-500 hover:bg-gray-300"
                              : "bg-brand-black text-white hover:bg-brand-point hover:text-black"
                        }`}
                      >
                        {isEnded ? "모집 종료된 파티" : stock.allFull ? "모집 마감 · 상세보기" : "신청하기"}
                      </Link>
                    </div>
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
            
            {/* 슬라이더 — 페이지당 6장 (PC 2x3 / 모바일 3x2), 마우스 드래그 + 터치 스와이프 */}
            {/* v8.0 — 갤러리 이미지가 fetch 응답 후 swap 되며 발생하는 깜빡임을 mounted gate 로 차단 */}
            <div className={`transition-opacity duration-500 ease-out ${contentReady ? "opacity-100" : "opacity-0"}`}>
              <GallerySlider
                source={galleryItems.length > 0 ? galleryItems : [1,2,3,4,5,6,7,8,9].map(i => ({
                  id: -i,
                  image_path: `/images/gallery/g${i}.png`,
                  alt_text: `갤러리 이미지 ${i}`,
                  sort_order: i*10,
                }))}
                currentPage={currentGalleryPage}
                setCurrentPage={setCurrentGalleryPage}
                onImageClick={setSelectedGalleryImage}
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
              {/* 상태 범례 (한 줄) */}
              <ul aria-label="일정 상태 안내" className="mt-5 md:mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:gap-x-5 text-[13px] md:text-sm font-bold text-gray-600">
                {SCHEDULE_STATUS_ORDER.map(s => (
                  <li key={s} className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={`w-3 h-3 rounded-[4px] ring-1 ring-black/5 ${SCHEDULE_STATUS_STYLE[s].tone}`} />
                    {SCHEDULE_STATUS_STYLE[s].label}
                  </li>
                ))}
              </ul>
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

              {/* 작은 달력 — 일정 있는 날짜 아래 상태 색 점(최대 3개, 4개 이상이면 +) */}
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
                            isSelected ? "bg-brand-black text-white font-black"
                              : isToday ? "text-brand-point-ink font-black"
                              : "text-gray-800 font-bold"
                          }`}>
                            {day}
                          </span>
                          <span aria-hidden="true" className="h-2.5 flex items-center gap-0.5">
                            {dayEvents.slice(0, 3).map(e => (
                              <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${SCHEDULE_STATUS_STYLE[e.extendedProps.status ?? "open"].dot}`} />
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
                    /* 지난 일정 — 연한 회색 (예전 분홍 톤 대체) */
                    .fc-event.fc-event-ended .sch-chip { background-color: #f9fafb; color: #99a1af; border: 1px solid #e5e7eb; }
                    /* 선택한 날짜 — 검정 2px 테두리 */
                    .fc .sch-day-selected .fc-daygrid-day-frame { box-shadow: inset 0 0 0 2px #000; border-radius: 4px; }
                    .fc-daygrid-event-dot { display: none !important; }
                  `}} />
                  <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    // 초기 노출 월 = 접속한 사용자의 현재 날짜. initialDate 생략 시 FullCalendar 가
                    // init 시점(브라우저)에서 new Date() 를 사용 → 빌드 날짜 고정/하이드레이션 불일치 없음.
                    locale="ko"
                    buttonText={{ today: 'TODAY' }}
                    events={CALENDAR_EVENTS}
                    eventClick={(info) => router.push(`/party/${info.event.id}`)}
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
                    eventContent={(arg) => {
                      const xp = arg.event.extendedProps as { time?: string; theme?: string; status?: ScheduleStatus | null; partyType?: PartyType };
                      const tone = SCHEDULE_STATUS_STYLE[xp.status ?? "open"].tone;
                      return (
                        <div
                          title={`${xp.time ? xp.time + " " : ""}${arg.event.title}`}
                          className={`sch-chip w-full truncate rounded-md px-1 xl:px-1.5 py-1 text-xs font-bold leading-tight ${tone} ${xp.status === "full" ? "line-through" : ""}`}
                        >
                          {xp.partyType === "solo" && (
                            <span className={`mr-1 rounded px-1 ${scheduleTypeBadgeTone(xp.status === "past")}`}>솔로</span>
                          )}
                          {xp.time && <span className="tabular-nums mr-1">{xp.time}</span>}
                          {xp.theme ? categoryLabel(xp.theme) : arg.event.title}
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
                            onClick={() => router.push(`/party/${event.id}`)}
                            className={`group w-full text-left rounded-2xl p-4 flex items-center gap-3 border transition-all ${
                              isPast ? "bg-gray-50 border-gray-200 hover:bg-gray-100" : "bg-white border-gray-200 hover:border-brand-point hover:shadow-md"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${scheduleTypeBadgeTone(isPast)}`}>
                                  {PARTY_TYPE_LABELS[xp.partyType]}
                                </span>
                                {status && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${SCHEDULE_STATUS_STYLE[status].tone}`}>
                                    {SCHEDULE_STATUS_STYLE[status].label}
                                  </span>
                                )}
                                {[xp.theme && categoryLabel(xp.theme), xp.locationTag].filter(Boolean).map(tag => (
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
                              <div className={`text-sm mt-1 font-bold ${isPast ? "text-gray-400" : "text-gray-700"}`}>
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

        {/* Participants List Section (Infinite Carousel) */}
        <section id="participants" className="py-16 md:py-32 bg-brand-lightgray overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 md:px-6 mb-10 md:mb-16">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center">
              <h2 className="text-3xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">어떤 사람들이 오나요?</h2>
              <p className="text-sm md:text-lg text-gray-500">철저한 심사를 거친, 매력적인 참가자들이 기다리고 있습니다.</p>
            </motion.div>
          </div>

          {/* v8.0 — 참가자 캐러셀이 /api/participants.php 응답으로 늘어나며 발생하는 깜빡임 차단 */}
          <div className={`relative flex transition-opacity duration-500 ease-out ${contentReady ? "opacity-100" : "opacity-0"}`}>
            {/* Infinite Scroll Container */}
            <motion.div
              className="flex gap-4 md:gap-6 py-4"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ repeat: Infinity, duration: 75, ease: "linear" }}
              style={{ width: "fit-content" }}
            >
              {/* Combine participants twice for seamless loop */}
              {[...allParticipants, ...allParticipants].map((p, idx) => (
                <motion.div
                  key={`${p.id}-${idx}`}
                  whileHover={{ y: -12, scale: 1.04, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)" }}
                  className="bg-white p-5 md:p-10 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-gray-100 min-w-[200px] md:min-w-[320px] transition-shadow flex flex-col items-center text-center group cursor-pointer"
                >
                  <div className={`w-11 h-11 md:w-16 md:h-16 rounded-full mb-3 md:mb-5 flex items-center justify-center transition-transform group-hover:scale-110 ${p.gender === 'male' ? 'bg-[#E3F2FD]' : 'bg-[#FCE4EC]'}`}>
                    <Users size={16} className={`md:hidden ${p.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`} />
                    <Users size={22} className={`hidden md:block ${p.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`} />
                  </div>
                  <h3 className="text-sm md:text-2xl font-black mb-1.5 md:mb-3 text-gray-900 leading-tight">{p.job}</h3>
                  {p.age && (
                    <p className="text-brand-point-ink font-bold text-xs md:text-lg mb-3 md:mb-8 whitespace-nowrap">{p.age}</p>
                  )}
                  <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                    {p.keywords.map((k, kIdx) => (
                      <span key={kIdx} className="bg-gray-50 text-gray-500 text-xs md:text-sm font-bold px-2.5 md:px-4 py-1 md:py-1.5 rounded-full border border-gray-100">#{k}</span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <style jsx global>{`
            #participants .relative:hover .flex {
              animation-play-state: paused !important;
            }
          `}</style>
        </section>

        {/* FAQ Accordion Section */}
        <section id="faq" className="py-16 md:py-32 px-4 md:px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mb-10 md:mb-16">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">자주 묻는 질문</h2>
            </motion.div>

            <div className="space-y-4">
              {FAQS.map((faq, index) => {
                const isOpen = faqOpenIndex === index;
                return (
                  <div key={index} className="border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                    <button 
                      onClick={() => setFaqOpenIndex(isOpen ? null : index)}
                      className="w-full px-5 md:px-8 py-5 md:py-6 flex justify-between items-center text-left bg-white hover:bg-brand-lightgray transition-colors"
                    >
                      <span className="text-base md:text-lg font-bold pr-4">{faq.q}</span>
                      <ChevronDown className={`shrink-0 transform transition-transform duration-300 text-brand-point-ink ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="bg-brand-lightgray/50 px-5 md:px-8"
                        >
                          <p className="text-gray-600 font-medium leading-relaxed md:leading-relaxed py-5 md:py-6 border-t border-gray-200/60 px-0 text-sm md:text-base whitespace-pre-line break-keep">
                            {faq.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Gallery Lightbox Modal */}
      <AnimatePresence>
        {selectedGalleryImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedGalleryImage(null)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 cursor-pointer"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-5xl w-full h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={selectedGalleryImage} 
                alt="Gallery Preview" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              />
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedGalleryImage(null);
                }}
                className="absolute top-4 right-4 text-white hover:text-brand-point bg-black/50 p-4 rounded-full transition-all z-[110] hover:scale-110 active:scale-95"
                title="닫기"
              >
                <X size={28} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
