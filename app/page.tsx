"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { ArrowRight, ChevronDown, Users, Calendar, MapPin, X } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { PARTIES, CALENDAR_EVENTS, PARTICIPANTS, FAQS } from "./lib/data";

export default function SmoothOnePage() {
  const [activeTab, setActiveTab] = useState("주제별");
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(null);
  const [isGalleryExpanded, setIsGalleryExpanded] = useState(false);
  const router = useRouter();

  const TABS = ["주제별", "지역별", "일정별"];

  const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  return (
    <div className="flex flex-col min-h-screen text-brand-black pb-0">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative flex flex-col md:h-[88vh] md:min-h-[700px] md:justify-center bg-brand-black overflow-hidden">

          {/* Mobile: 이미지를 자연 비율(1904×829)로 상단에 전체 표시 — 크롭 없음 */}
          <div className="relative w-full md:hidden" style={{ aspectRatio: "1904 / 829" }}>
            <Image
              src="/images/hero-bg.jpg"
              alt=""
              fill
              priority
              className="object-cover"
            />
            {/* 이미지 하단을 배경과 자연스럽게 연결하는 페이드 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black" />
          </div>

          {/* Desktop: 기존 full-bleed 커버 유지 */}
          <Image
            src="/images/hero-bg.jpg"
            alt=""
            fill
            priority
            className="hidden md:block object-cover object-[center_30%] pointer-events-none"
          />
          <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />

          {/* Content — 모바일: 이미지 바로 아래 / 데스크탑: 섹션 하단 고정 */}
          <div className="relative z-10 max-w-7xl mx-auto px-5 md:px-10 w-full text-white pt-8 pb-12 md:mt-auto md:pb-24 md:pt-[160px]">
            <motion.div initial="hidden" animate="visible" variants={fadeInUp}>
              <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[1.15] mb-4 md:mb-10 drop-shadow-2xl">
                세상을 울리는<br />
                새로운 연결, <span className="text-brand-point">어울림</span>
              </h1>
              <p className="text-sm sm:text-lg md:text-2xl text-white/85 font-semibold max-w-3xl leading-relaxed mb-8 md:mb-14 flex flex-col gap-1 md:gap-2 drop-shadow-lg">
                <span>숫자와 스펙으로 재단되는 관계를 넘어,</span>
                <span className="hidden sm:inline">진정으로 마음을 울리는 감성적인 오프라인 네트워킹을 경험하세요.</span>
                <span className="sm:hidden">진심이 통하는 오프라인 네트워킹을 경험하세요.</span>
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
              <p className="text-base md:text-lg text-gray-500 max-w-2xl mx-auto">원하는 테마와 일정을 선택하여 어울림의 감성을 만나보세요.</p>
            </motion.div>

            <div className="flex justify-center gap-2 md:gap-4 mb-10 md:mb-16 border-b border-gray-100 pb-2 overflow-x-auto">
              {TABS.map(tab => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 md:px-6 py-2.5 md:py-3 text-base md:text-lg font-bold rounded-full transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-brand-point text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
              <AnimatePresence>
                {PARTIES.filter(card => activeTab === '일정별' || card.tag === activeTab).map(card => (
                  <motion.div
                    key={card.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }}
                    className="bg-brand-lightgray border border-gray-100 p-5 md:p-8 rounded-2xl md:rounded-3xl hover:border-brand-point transition-all flex flex-col h-full group"
                  >
                    <h3 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 group-hover:text-brand-point transition-colors leading-snug">{card.title}</h3>
                    <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-8 text-gray-600 font-medium flex-1 text-sm md:text-base">
                      <div className="flex items-center gap-2.5"><Calendar size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.dateString}</div>
                      <div className="flex items-center gap-2.5"><MapPin size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.location}</div>
                      <div className="flex items-center gap-2.5"><Users size={16} className="text-gray-400 group-hover:text-brand-point transition-colors flex-shrink-0" /> {card.target}</div>
                    </div>
                    <Link
                      href={`/party/${card.id}`}
                      className="w-full text-center bg-brand-black text-white font-bold py-3.5 md:py-4 text-sm md:text-base rounded-xl hover:bg-brand-point transition-colors duration-300 block"
                    >
                      매칭파티 참여하기
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* Gallery Section */}
        <section id="gallery" className="py-16 md:py-32 px-4 md:px-6 bg-brand-black text-white">
          <div className="max-w-7xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="mb-10 md:mb-20">
              <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight">후기갤러리</h2>
              <p className="text-base md:text-xl text-gray-400">어울림에서 피어난 따뜻하고 감각적인 시간들.</p>
            </motion.div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 px-4 md:px-0 transition-all duration-700">
              <AnimatePresence mode="popLayout">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7].slice(0, isGalleryExpanded ? 16 : (typeof window !== 'undefined' && window.innerWidth < 768 ? 4 : 6)).map((imgId, idx) => (
                  <motion.div 
                    key={`${imgId}-${idx}`} 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    layout
                    variants={fadeInUp}
                    className="aspect-square bg-gray-800 rounded-2xl md:rounded-3xl relative overflow-hidden group cursor-pointer border border-white/5"
                  >
                    <div 
                      onClick={() => setSelectedGalleryImage(`/images/gallery/g${imgId}.png`)}
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110 group-hover:brightness-110"
                      style={{ backgroundImage: `url('/images/gallery/g${imgId}.png')` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} className="mt-20 flex justify-center">
              <div 
                role="button"
                tabIndex={0}
                onClick={() => {
                  setIsGalleryExpanded(!isGalleryExpanded);
                  if (isGalleryExpanded) {
                    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="group inline-flex items-center gap-3 bg-[#008080] text-white px-8 py-3.5 rounded-xl border border-[#008080] font-semibold transition-all duration-300 hover:bg-[#006666] hover:-translate-y-[2px] hover:shadow-[0_8px_20px_rgba(0,128,128,0.3)] active:scale-95 active:translate-y-0 shadow-lg cursor-pointer"
              >
                <span className="text-base tracking-widest">{isGalleryExpanded ? "접기" : "더보기"}</span>
                <ChevronDown className={`transition-transform duration-300 ${isGalleryExpanded ? 'rotate-180' : 'group-hover:translate-y-1'}`} />
              </div>
            </motion.div>
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
                CALENDAR_EVENTS.map((event) => {
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
              {[...PARTICIPANTS, ...PARTICIPANTS].map((p, idx) => (
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
                  <p className="text-brand-point font-bold text-xs md:text-lg mb-3 md:mb-8">{p.age}</p>
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
                          <p className="text-gray-600 font-medium leading-relaxed py-5 md:py-6 border-t border-gray-200/60 px-0 text-sm md:text-base">
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
