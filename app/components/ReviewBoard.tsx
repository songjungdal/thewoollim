"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Star, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

type Review = {
  id: number;
  gender: string;
  age_group: string;
  rating: number;
  content: string;
  created_at: string;
};

type MineReview = { id: number; rating: number; content: string; created_at: string };

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } },
};

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= rating ? "fill-brand-point text-brand-point" : "text-gray-200"} />
      ))}
    </span>
  );
}

/** 성별 아이콘 — 남성 파스텔블루 / 여성 파스텔핑크 (BookingTable 등 기존 성별 컬러 규칙 재사용) */
function GenderBadge({ gender }: { gender: string }) {
  const isMale = gender === "남성";
  return (
    <span
      className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs md:text-sm font-black ${
        isMale ? "bg-[#4facfe]/15 text-[#3a85d9]" : "bg-rose-100 text-rose-600"
      }`}
    >
      {isMale ? "남" : "여"}
    </span>
  );
}

export default function ReviewBoard() {
  const { isLoggedIn, mounted, verifySession } = useAuth();
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 메인페이지 후기 목록 — 10개씩 페이지 단위로 표시
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(reviews.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageReviews = reviews.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const goToPage = (p: number) => {
    const next = Math.max(0, Math.min(totalPages - 1, p));
    setPage(next);
    setExpandedId(null);
    // 페이지 전환 시 후기게시판 섹션 상단으로 자연스럽게 스크롤 고정
    // (Header.tsx 의 앵커 스크롤과 동일한 scrollIntoView 패턴 재사용)
    if (next !== safePage) {
      document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const [writeOpen, setWriteOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null); // null = 신규 작성, number = 해당 id 수정
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [myReviews, setMyReviews] = useState<MineReview[]>([]);

  const loadReviews = useCallback(() => {
    fetch("/api/reviews.php", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.ok && Array.isArray(d.reviews)) {
          setReviews(d.reviews);
          setPage(0); // 새로 작성/수정 후 최신순 1페이지부터 보이도록
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const openWriteBlank = () => {
    setEditId(null);
    setRating(5);
    setContent("");
    setWriteOpen(true);
  };

  const openWriteEdit = (r: MineReview) => {
    setEditId(r.id);
    setRating(r.rating);
    setContent(r.content);
    setPickerOpen(false);
    setWriteOpen(true);
  };

  const handleWriteClick = async () => {
    // 세션 만료 방어 — 페이지를 오래 열어둬 로그인이 끊긴 상태면 로그인 화면으로 전환
    // (PartyClientView 등 기존 화면과 동일한 verifySession + /login?redirect= 패턴 재사용)
    if (!(await verifySession())) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      router.push(`/login?redirect=${encodeURIComponent("/#reviews")}`);
      return;
    }
    try {
      const res = await fetch("/api/reviews.php?mine=1", { cache: "no-store", credentials: "include" });
      const d = await res.json();
      if (!d?.ok) {
        alert(d?.error || "조회에 실패했습니다.");
        return;
      }
      const validCount = Number(d.validCount) || 0;
      const mine: MineReview[] = Array.isArray(d.myReviews) ? d.myReviews : [];

      if (validCount <= 0) {
        alert("모임에 참가한 회원만 후기작성이 가능합니다.");
        return;
      }
      if (mine.length >= validCount) {
        alert("참가하신 모임 횟수만큼 후기 작성이 완료되었습니다. (작성하신 후기는 수정이 가능합니다.)");
        setMyReviews(mine);
        setPickerOpen(true);
        return;
      }
      openWriteBlank();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
  };

  const submit = async () => {
    if (content.trim() === "") {
      alert("후기 내용을 입력해주세요.");
      return;
    }
    // 작성 모달을 열어둔 채 오래 대기하다 세션이 끊긴 경우도 동일하게 방어
    if (!(await verifySession())) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
      setWriteOpen(false);
      router.push(`/login?redirect=${encodeURIComponent("/#reviews")}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editId
            ? { action: "update", id: editId, rating, content: content.trim() }
            : { action: "create", rating, content: content.trim() }
        ),
      });
      const d = await res.json();
      if (!d?.ok) {
        alert(d?.error || "저장에 실패했습니다.");
        return;
      }
      alert(editId ? "후기가 수정되었습니다." : "후기가 등록되었습니다.");
      setWriteOpen(false);
      loadReviews();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="reviews" className="py-16 md:py-32 px-4 md:px-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center mb-8 md:mb-12"
        >
          <h2 className="text-4xl md:text-6xl font-bold mb-4 md:mb-6 tracking-tight text-brand-black">후기게시판</h2>
          <p className="text-sm md:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed break-keep px-2">
            마음이 닿았던 시간, 실제로 참가했던 회원들이 남긴 생생한 후기
          </p>
        </motion.div>

        {reviews.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm md:text-base">등록된 후기가 없습니다.</div>
        ) : (
          <div className="space-y-2.5 md:space-y-3">
            {pageReviews.map(r => {
              const expanded = expandedId === r.id;
              return (
                <div key={r.id} className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    className="w-full flex items-center gap-2.5 md:gap-4 px-4 md:px-6 py-3.5 md:py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <GenderBadge gender={r.gender} />
                    <span className="text-[11px] md:text-xs font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 flex-shrink-0 whitespace-nowrap">
                      {r.age_group}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm md:text-base text-gray-700 font-medium">
                      {r.content}
                    </span>
                    <StarRow rating={r.rating} />
                    <ChevronDown
                      size={16}
                      className={`flex-shrink-0 text-gray-300 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 md:px-6 pb-4 pt-1 border-t border-gray-100">
                          <p className="text-sm md:text-base text-gray-600 leading-relaxed whitespace-pre-wrap break-words">
                            {r.content}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* 하단 바 — 모바일: 페이지네이션/버튼 세로로 쌓아 겹침 원천 차단
             데스크톱: 3열 그리드(빈칸/페이지네이션/버튼)로 페이지네이션은 정중앙, 버튼은 우측 —
             그리드 칸 경계 덕분에 페이지 수가 많아져도 서로 다른 칸을 침범하지 않음 */}
        {(totalPages > 1 || (mounted && isLoggedIn)) && (
          <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-3 md:items-center mt-6 md:mt-8">
            {totalPages > 1 && (
              <div className="md:col-start-2 flex items-center flex-wrap justify-center gap-1.5 md:gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage === 0}
                  aria-label="이전 페이지"
                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-brand-point hover:text-brand-point disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-gray-500 transition-colors flex-shrink-0"
                >
                  <ChevronLeft size={18} />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goToPage(i)}
                    aria-label={`${i + 1}페이지`}
                    className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full text-sm font-bold transition-colors flex-shrink-0 ${
                      i === safePage ? "bg-brand-black text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage === totalPages - 1}
                  aria-label="다음 페이지"
                  className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-brand-point hover:text-brand-point disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-gray-500 transition-colors flex-shrink-0"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            {mounted && isLoggedIn && (
              <button
                type="button"
                onClick={handleWriteClick}
                className="md:col-start-3 md:justify-self-end inline-flex items-center gap-1.5 bg-brand-black text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-brand-point hover:text-brand-black transition-colors flex-shrink-0"
              >
                후기작성
              </button>
            )}
          </div>
        )}
      </div>

      {/* 후기 작성/수정 모달 */}
      <AnimatePresence>
        {writeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !submitting && setWriteOpen(false)}
            className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 md:p-8"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-lg md:text-xl text-brand-black">{editId ? "후기 수정" : "후기 작성"}</h3>
                <button
                  type="button"
                  onClick={() => setWriteOpen(false)}
                  className="text-gray-400 hover:text-brand-black transition-colors"
                  aria-label="닫기"
                >
                  <X size={20} />
                </button>
              </div>

              <label className="block text-sm font-bold text-gray-700 mb-2">별점</label>
              <div className="flex items-center gap-1.5 mb-5">
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i}점`}>
                    <Star size={28} className={i <= rating ? "fill-brand-point text-brand-point" : "text-gray-200"} />
                  </button>
                ))}
              </div>

              <label className="block text-sm font-bold text-gray-700 mb-2">후기 내용</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="솔직한 후기를 남겨주세요. (작성자 실명은 공개되지 않아요)"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none resize-none"
              />
              <p className="text-right text-xs text-gray-400 mt-1 mb-5">{content.length}/1000</p>

              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="w-full bg-brand-black text-white py-3.5 rounded-xl font-black text-sm hover:bg-brand-point hover:text-brand-black transition-colors disabled:opacity-50"
              >
                {submitting ? "저장 중..." : editId ? "수정 완료" : "등록하기"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 수정할 후기 선택 모달 — 참가 횟수만큼 이미 다 작성한 경우 */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPickerOpen(false)}
            className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6 md:p-8"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg md:text-xl text-brand-black">수정할 후기 선택</h3>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="text-gray-400 hover:text-brand-black transition-colors"
                  aria-label="닫기"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {myReviews.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openWriteEdit(r)}
                    className="w-full text-left border border-gray-200 rounded-xl px-4 py-3 hover:border-brand-point transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <StarRow rating={r.rating} size={12} />
                      <span className="text-[11px] text-gray-400">{r.created_at?.slice(0, 10)}</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{r.content}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
