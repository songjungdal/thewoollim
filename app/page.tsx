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
import { PARTICIPANTS, FAQS, partyStockStatus } from "./lib/data";
import { useAuth } from "./context/AuthContext";
import { useParties } from "./lib/useParties";

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
    "absolute top-1/2 -translate-y-1/2 z-10 p-2 text-white hover:text-[#008080] " +
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
              className={`h-2 rounded-full transition-all ${
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
  const CALENDAR_EVENTS = PARTIES.map(p => ({
    id: p.id, title: p.title, date: p.calendarDate,
    extendedProps: { location: p.location, target: p.target, price: p.price },
  }));
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

  const sortedParties = useMemo(() => {
    return [...PARTIES]
      .filter(p => {
        if (!activeAxis || !filterValue) return true;
        return p[AXIS_FIELD[activeAxis]] === filterValue;
      })
      .sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAxis, filterValue, PARTIES]);

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
            src="/images/hero-bg.jpg"
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
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-brand-black text-white px-7 py-4 md:px-10 md:py-6 rounded-full text-base md:text-lg font-bold hover:bg-brand-point hover:-translate-y-1 transition-all shadow-xl hover:shadow-brand-point/30 cursor-pointer border border-white/20"
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
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">매칭파티 신청</h2>
              <p className="text-sm md:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed break-keep px-2">
                돌싱부터 싱글까지, 원하는 테마와 지역을 선택하여 새로운 연결을 시작해보세요.
              </p>
            </motion.div>

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
                          ? "bg-brand-point text-white shadow-md"
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
                            ? "bg-brand-point/10 text-brand-point border border-brand-point/30"
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
                                ? "bg-brand-point text-white shadow-md"
                                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-200"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {filterValue && (
                      <p className="text-center text-xs md:text-sm text-gray-400 font-medium mt-3">
                        {activeAxis} · <span className="text-brand-point font-bold">{filterValue}</span> · {sortedParties.length}건
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {sortedParties.length === 0 ? (
              <div className="bg-white border border-gray-100 rounded-2xl md:rounded-3xl p-10 md:p-16 text-center">
                <p className="text-gray-400 font-bold text-sm md:text-base">선택한 조건에 맞는 매칭파티가 없습니다.</p>
                <p className="text-xs md:text-sm text-gray-400 mt-2">다른 카테고리를 선택하거나 조건을 초기화해주세요.</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              <AnimatePresence mode="popLayout">
                {sortedParties.map(card => {
                  // 실시간 결제완료 인원만 노출 — 카운트 없으면 0으로 강제 (시드/테스트 데이터 무시)
                  const live = partyCounts[card.id];
                  const liveCard = {
                    ...card,
                    maleBooked:   live?.male   ?? 0,
                    femaleBooked: live?.female ?? 0,
                  };
                  const stock = partyStockStatus(liveCard);
                  return (
                  <motion.div
                    key={card.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, type: "spring", stiffness: 300, damping: 28 }}
                    className="bg-brand-lightgray border border-gray-100 p-5 md:p-8 rounded-2xl md:rounded-3xl hover:border-brand-point transition-all flex flex-col h-full group relative"
                  >
                    {/* 우측 상단 배지 영역 — 대상별(싱글/돌싱) + 모집마감 세로 스택 */}
                    <div className="absolute top-4 right-4 md:top-5 md:right-5 flex flex-col items-end gap-1.5 z-10">
                      {(card.targetGroup === "싱글" || card.targetGroup === "돌싱") && (
                        <span className="bg-brand-point text-black text-[11px] md:text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">
                          {card.targetGroup}
                        </span>
                      )}
                      {stock.allFull && (
                        <span className="bg-gray-900 text-white text-[11px] md:text-xs font-black px-2.5 py-1 rounded-full shadow-md whitespace-nowrap">
                          모집 마감
                        </span>
                      )}
                    </div>
                    {/* 제목 — 우측 상단 배지가 가리지 않도록 우측 패딩 확보 */}
                    <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-5 group-hover:text-brand-point transition-colors leading-snug pr-16 md:pr-20">{card.title}</h3>
                    <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6 text-gray-600 font-medium flex-1 text-sm md:text-base">
                      <div className="flex items-center gap-2.5"><Calendar size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.dateString}</div>
                      <div className="flex items-center gap-2.5"><MapPin size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.location}</div>
                      <div className="flex items-center gap-2.5"><Users size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.target}</div>
                    </div>

                    {/* Gender stock — minimal underline typography (실시간 동기화) */}
                    <div className="flex items-center border-b border-gray-300 pb-3 md:pb-4 mb-4 md:mb-5">
                      <div className="flex-1 flex items-baseline justify-center gap-2">
                        <span className="text-xs md:text-sm font-bold text-gray-400 tracking-wider">남성</span>
                        <span className={`text-base md:text-lg font-black tabular-nums ${stock.maleFull ? "text-gray-400" : "text-brand-black"}`}>
                          {liveCard.maleBooked}/{liveCard.maleStock}
                        </span>
                        {stock.maleFull && (
                          <span className="text-[10px] md:text-xs font-black text-gray-400 tracking-wider">마감</span>
                        )}
                      </div>
                      <div className="w-px h-5 md:h-6 bg-gray-200" />
                      <div className="flex-1 flex items-baseline justify-center gap-2">
                        <span className="text-xs md:text-sm font-bold text-gray-400 tracking-wider">여성</span>
                        <span className={`text-base md:text-lg font-black tabular-nums ${stock.femaleFull ? "text-gray-400" : "text-brand-black"}`}>
                          {liveCard.femaleBooked}/{liveCard.femaleStock}
                        </span>
                        {stock.femaleFull && (
                          <span className="text-[10px] md:text-xs font-black text-gray-400 tracking-wider">마감</span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/party/${card.id}`}
                      className={`w-full text-center font-bold py-3.5 md:py-4 text-sm md:text-base rounded-xl transition-colors duration-300 block ${
                        stock.allFull
                          ? "bg-gray-200 text-gray-500 hover:bg-gray-300"
                          : "bg-brand-black text-white hover:bg-brand-point"
                      }`}
                    >
                      {stock.allFull ? "모집 마감 · 상세보기" : "매칭파티 참여하기"}
                    </Link>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            )}
          </div>
        </section>

        {/* Gallery Section */}
        <section id="gallery" className="py-16 md:py-32 px-4 md:px-6 bg-brand-black text-white">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-10 md:mb-16">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">후기갤러리</h2>
              <p className="text-sm md:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed break-keep px-2">
                어울림에서 피어난 따뜻하고 감각적인 시간들.
              </p>
            </motion.div>
            
            {/* 슬라이더 — 페이지당 6장 (PC 2x3 / 모바일 3x2), 마우스 드래그 + 터치 스와이프 */}
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
        </section>

        {/* Matching Schedule Section (Calendar Implementation) */}
        <section id="schedule" className="py-16 md:py-32 px-4 md:px-6 bg-white shadow-[0_-20px_40px_rgba(0,0,0,0.02)]">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="text-center mb-10 md:mb-16">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">매칭파티 일정</h2>
              <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto">신청 가능한 매칭파티 일정을 확인하세요.</p>
            </motion.div>

            {/* Mobile: List View */}
            <div className="md:hidden space-y-3">
              {CALENDAR_EVENTS.length === 0 ? (
                <p className="text-center text-gray-400 py-12">등록된 일정이 없습니다.</p>
              ) : (
                [...CALENDAR_EVENTS].sort((a, b) => a.date.localeCompare(b.date)).map((event) => {
                  const party = PARTIES.find(p => p.id === event.id);
                  const dateObj = new Date(event.date + "T00:00:00");
                  const month = dateObj.getMonth() + 1;
                  const day = dateObj.getDate();
                  const dayName = ["일", "월", "화", "수", "목", "금", "토"][dateObj.getDay()];
                  return (
                    <button
                      key={event.id}
                      onClick={() => router.push(`/party/${event.id}`)}
                      className="w-full text-left bg-gray-50 border border-gray-100 rounded-2xl p-4 flex items-center gap-4 hover:border-brand-point hover:bg-white transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      <div className="flex-shrink-0 w-14 bg-[#40E0D0]/15 rounded-xl py-2 text-center">
                        <div className="text-[11px] font-bold text-[#008080]">{month}월</div>
                        <div className="text-2xl font-black text-brand-black leading-none">{day}</div>
                        <div className="text-[11px] text-gray-400 font-semibold">{dayName}요일</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[15px] text-brand-black mb-1 leading-snug">{event.title}</div>
                        <div className="text-sm text-gray-500">{party?.dateString}</div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{party?.location} · {party?.target}</div>
                      </div>
                      <ArrowRight size={16} className="flex-shrink-0 text-gray-300" />
                    </button>
                  );
                })
              )}
            </div>

            {/* Desktop: Calendar View */}
            <div className="hidden md:block bg-white p-10 rounded-3xl shadow-lg border border-gray-100">
              <div className="calendar-container w-full h-[1200px]">
                <style dangerouslySetInnerHTML={{__html: `
                  .fc-theme-standard .fc-scrollgrid { border-color: #f3f4f6; }
                  .fc-theme-standard th, .fc-theme-standard td { border-color: #f3f4f6; }
                  .fc-daygrid-day-frame { min-height: 160px !important; display: flex !important; flex-direction: column !important; }
                  .fc-daygrid-day-top { flex-direction: row !important; justify-content: flex-start !important; padding: 12px 14px 8px !important; }
                  .fc-daygrid-day-number { font-weight: 800; color: #111; padding: 0 !important; font-size: 1.2rem; opacity: 0.9; margin-bottom: 4px; }
                  .fc-daygrid-day-events { display: flex !important; flex-direction: column !important; gap: 5px !important; padding: 0 4px 8px 4px !important; }
                  .fc-event { cursor: pointer; border-radius: 4px !important; padding: 4px 8px !important; font-weight: 800; font-size: 0.85rem; border: none; background-color: #40E0D0; margin: 0 !important; border-left: 4px solid rgba(0,0,0,0.15) !important; transition: all 0.2s ease !important; box-shadow: 0 1px 3px rgba(0,0,0,0.05); width: 100% !important; box-sizing: border-box; }
                  .fc-event, .fc-event * { color: #000000 !important; }
                  .fc-event:hover { background-color: #38C8BA !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(64, 224, 208, 0.4); opacity: 1 !important; z-index: 5; position: relative; }
                  .fc-event:active { transform: translateY(0) scale(0.98); box-shadow: 0 1px 2px rgba(64, 224, 208, 0.2); }
                  .fc-event-title, .fc-event-main { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; padding: 0 !important; margin: 0 !important; background: transparent !important; }
                  .fc-toolbar-title { font-weight: 900; font-size: 1.85rem !important; letter-spacing: -0.02em; }
                  .fc-button-primary { background-color: #000 !important; border: none !important; border-radius: 12px !important; padding: 8px 16px !important; font-size: 0.9rem !important; display: flex !important; align-items: center !important; justify-content: center !important; transition: all 0.2s !important; }
                  .fc-button-primary:hover { background-color: #40E0D0 !important; transform: translateY(-1px); }
                  .fc-button-group { gap: 10px !important; }
                  .fc-button-group > .fc-button { border-radius: 12px !important; margin-left: 0 !important; }
                  .fc-toolbar-chunk { display: flex; align-items: center; }
                  .fc-toolbar { display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 2.5rem !important; }
                  .fc-icon { font-size: 1.2em !important; font-weight: bold; }
                  .fc-today-button { font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 0.05em !important; padding-left: 20px !important; padding-right: 20px !important; }
                  .fc-view-harness { background-color: #fff; }
                  .fc-col-header-cell { padding: 12px 0 !important; background-color: #fafafa; }
                  .fc-col-header-cell-cushion { color: #666; font-weight: 700; font-size: 0.9rem; }
                  .fc-daygrid-more-link { font-weight: 800; color: #40E0D0 !important; font-size: 0.8rem; margin-top: 2px; padding-left: 4px; }
                `}} />
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  initialDate={PARTIES[0]?.calendarDate}
                  locale="ko"
                  buttonText={{ today: 'TODAY' }}
                  events={CALENDAR_EVENTS}
                  eventClick={(info) => router.push(`/party/${info.event.id}`)}
                  eventTextColor="#000000"
                  height="100%"
                  headerToolbar={{
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                  }}
                  titleFormat={{ year: 'numeric', month: 'long' }}
                  dayMaxEvents={5}
                  dayCellContent={(arg) => arg.dayNumberText.replace('일', '')}
                />
              </div>
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

          <div className="relative flex">
            {/* Infinite Scroll Container */}
            <motion.div
              className="flex gap-4 md:gap-6 py-4"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
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
                    <p className="text-brand-point font-bold text-xs md:text-lg mb-3 md:mb-8 whitespace-nowrap">{p.age}</p>
                  )}
                  <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
                    {p.keywords.map((k, kIdx) => (
                      <span key={kIdx} className="bg-gray-50 text-gray-500 text-[10px] md:text-sm font-bold px-2.5 md:px-4 py-1 md:py-1.5 rounded-full border border-gray-100">#{k}</span>
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
                      <ChevronDown className={`transform transition-transform duration-300 text-brand-point ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="bg-brand-lightgray/50 px-5 md:px-8"
                        >
                          <p className="text-gray-600 font-medium leading-relaxed py-5 md:py-6 border-t border-gray-200/60 px-0 text-sm md:text-base whitespace-pre-line">
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
