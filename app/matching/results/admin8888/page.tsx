"use client";

/**
 * 매칭투표 전용 투표관리 대시보드 (독립 페이지).
 *  - URL: /matching/results/admin8888
 *  - 인증: 기존 관리자 세션(WOOLLIM_ADMIN) 100% 연동 — /api/admin/login.php, me.php
 *  - 메인 라우팅과 세션 격리. 현장에서 사장님이 스마트폰 터치로 실시간 제어.
 *  - 컬러 규칙: 포인트(청록 #40E0D0)는 배경에만. 청록 배경 위 폰트는 무조건 검정(#000).
 *
 * 기능:
 *  - 파티별 카드: 제목 / 일자·시간 / 참가자 총 남·여 수
 *  - 실시간 투표 완료 현황 배지 (남 7/10 | 여 8/10) — 12초 폴링
 *  - 3대 제어: [투표시작] [투표종료] [초기화] (확인 알림창)
 *  - 종료 후: 통계 요약(참가자/커플/인기번호) + [결과보기] 상세 테이블
 *  - 데이터: /api/admin/parties.php (목록), /api/admin/matching.php (집계·제어)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Party = {
  id: string;
  title: string;
  dateString: string;
  calendarDate: string;   // 'YYYY-MM-DD' — 월별 필터 분류 기준
  voting_status: "closed" | "open" | "finalized";
  host_name?: string;
};

type MatchVote = {
  voter_number: number;
  gender: string;
  name: string;
  email: string;
  phone: string;
  picks: number[];
  updated_at: string;
};

type MatchPair = {
  a: { number: number; name: string; gender: string };
  b: { number: number; name: string; gender: string };
};

type Detail = {
  voting_status: "closed" | "open" | "finalized";
  participants: { male: number; female: number };
  startBlocking: number;   // cancelled/confirmed 외 미완료 참가자 수 — >0 이면 투표시작 차단
  votes: MatchVote[];
  matches: MatchPair[];
};

export default function MatchingAdminPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  // 로그인 폼
  const [adminId, setAdminId] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [parties, setParties] = useState<Party[]>([]);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null); // `${partyId}:${action}`
  const [loadingList, setLoadingList] = useState(false);

  // 월별 필터 — 진입 시 시스템 현재 월(new Date) 자동 선택 ('YYYY-MM')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // 폴링 tick 에서 최신 details 를 읽기 위한 ref (effect 재실행 없이 stale 방지)
  const detailsRef = useRef<Record<string, Detail>>({});
  useEffect(() => { detailsRef.current = details; }, [details]);

  // 월별 필터 가로 스크롤 컨테이너 — 좌/우 화살표로 부드럽게 이동
  const monthScrollRef = useRef<HTMLDivElement>(null);
  const scrollMonths = (dir: -1 | 1) => {
    monthScrollRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
  };

  // ── 세션 확인 ──
  useEffect(() => {
    fetch("/api/admin/me.php", { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then(d => setAuthed(!!d?.ok))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);

  const loadDetail = useCallback(async (partyId: string) => {
    try {
      const res = await fetch(`/api/admin/matching.php?partyId=${encodeURIComponent(partyId)}`,
        { cache: "no-store", credentials: "include" });
      const d = await res.json();
      if (d?.ok) {
        setDetails(prev => ({
          ...prev,
          [partyId]: {
            voting_status: d.voting_status ?? "closed",
            participants: d.participants ?? { male: 0, female: 0 },
            startBlocking: Number(d.start_blocking ?? 0),
            votes: Array.isArray(d.votes) ? d.votes : [],
            matches: Array.isArray(d.matches) ? d.matches : [],
          },
        }));
      }
    } catch { /* noop */ }
  }, []);

  const loadParties = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/parties.php", { cache: "no-store", credentials: "include" });
      const d = await res.json();
      const items: Party[] = Array.isArray(d?.items)
        ? d.items.map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ""),
            title: String(p.title ?? ""),
            dateString: String(p.dateString ?? ""),
            calendarDate: String(p.calendarDate ?? ""),
            voting_status: (String(p.voting_status ?? "closed") as Party["voting_status"]),
            host_name: String(p.host_name ?? ""),
          }))
        : [];
      setParties(items);
      await Promise.all(items.map(p => loadDetail(p.id)));
    } catch { /* noop */ } finally {
      setLoadingList(false);
    }
  }, [loadDetail]);

  useEffect(() => {
    if (authed) loadParties();
  }, [authed, loadParties]);

  // ── 실시간 폴링 (12초) — '투표 진행중(open)' 파티만 갱신 (미시작/종료는 정적이라 폴링 불필요) ──
  //    포커스 복귀 시엔 전체 1회 동기화. 다수 파티 환경에서 서버 부하를 최소화.
  useEffect(() => {
    if (!authed || parties.length === 0) return;
    const tick = () => {
      parties.forEach(p => {
        const st = detailsRef.current[p.id]?.voting_status ?? p.voting_status;
        if (st === "open") loadDetail(p.id);
      });
    };
    const t = setInterval(tick, 12000);
    const onFocus = () => { parties.forEach(p => loadDetail(p.id)); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [authed, parties, loadDetail]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminId || !adminPw) { alert("아이디와 비밀번호를 입력해주세요."); return; }
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: adminId.trim(), password: adminPw }),
      });
      const d = await res.json();
      if (d?.ok) { setAuthed(true); setAdminPw(""); }
      else alert(d?.error || "로그인에 실패했습니다.");
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try { await fetch("/api/admin/logout.php", { method: "POST", credentials: "include" }); } catch {}
    setAuthed(false);
    setParties([]); setDetails({});
  };

  const doAction = async (partyId: string, action: "start" | "end" | "reset") => {
    const confirmMsg = action === "start"
      ? "투표를 시작하시겠습니까?"
      : action === "end"
        ? "투표를 종료하시겠습니까?"
        : "정말 초기화를 진행하시겠습니까?";
    if (!window.confirm(confirmMsg)) return;
    setBusy(`${partyId}:${action}`);
    try {
      const res = await fetch("/api/admin/matching.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, partyId }),
      });
      const d = await res.json();
      if (!d?.ok) { alert(d?.error || "처리에 실패했습니다."); return; }
      // 상태 즉시 반영 + 상세 재조회
      setParties(prev => prev.map(p => p.id === partyId
        ? { ...p, voting_status: (d.voting_status ?? p.voting_status) }
        : p));
      await loadDetail(partyId);
      if (action === "reset") setExpanded(prev => ({ ...prev, [partyId]: false }));
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  // ── 통계 헬퍼 ──
  const votedCount = (votes: MatchVote[], gender: string) =>
    votes.filter(v => v.gender === gender).length;

  /** 인기번호 — 특정 성별 N번이 받은 표수 (반대 성별 voter 들의 picks 에 N 포함 횟수) */
  const popular = (votes: MatchVote[], targetGender: "남성" | "여성") => {
    const fromGender = targetGender === "남성" ? "여성" : "남성"; // 남자 표는 여자 voter 가 던짐
    const tally: Record<number, number> = {};
    votes.filter(v => v.gender === fromGender).forEach(v => {
      v.picks.forEach(n => { tally[n] = (tally[n] ?? 0) + 1; });
    });
    let bestNum = 0, bestCount = 0;
    Object.entries(tally).forEach(([n, c]) => {
      if (c > bestCount) { bestCount = c; bestNum = Number(n); }
    });
    return { number: bestNum, count: bestCount };
  };

  // ── 월별 필터 ──
  // 파티의 분류 월 키('YYYY-MM') — calendarDate 우선, 없으면 dateString('YYYY년 MM월') 파싱
  const monthKeyOf = (p: Party): string => {
    if (/^\d{4}-\d{2}/.test(p.calendarDate)) return p.calendarDate.slice(0, 7);
    const m = p.dateString.match(/(\d{4})년\s*(\d{1,2})월/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}` : "";
  };
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // 탭 후보: 데이터에 존재하는 월 ∪ 현재 월(항상 노출) — 오름차순
  const monthOptions = Array.from(
    new Set<string>([...parties.map(monthKeyOf).filter(Boolean), currentMonthKey])
  ).sort();
  // 항상 '연도+월' 포맷 (예: '2026년 5월') — 데이터 확장 시 연/월 직관 매핑
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return `${Number(y)}년 ${Number(m)}월`;
  };
  const visibleParties = parties.filter(p => monthKeyOf(p) === selectedMonth);

  // ─────────────────────────────────────────────────────────
  const Bg = (
    <div className="fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/images/hero-bg.jpg)" }} />
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
    </div>
  );

  const Header = (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-white/10">
      <div className="mx-auto px-5 h-[60px] flex items-center justify-between">
        <span className="inline-flex items-center pointer-events-none select-none cursor-default" aria-label="어울림">
          <Image src="/images/logo_white.png" alt="어울림" width={100} height={33} priority className="h-auto w-[100px] object-contain" />
        </span>
        {authed && (
          <button type="button" onClick={handleLogout} className="text-sm font-bold text-white/70 hover:text-white px-3 py-2">로그아웃</button>
        )}
      </div>
    </header>
  );

  if (checking) {
    return (
      <div className="min-h-screen flex flex-col">
        {Bg}{Header}
        <main className="flex-1 flex items-center justify-center px-4">
          <p className="text-white/70 font-bold">확인 중...</p>
        </main>
      </div>
    );
  }

  // ── 관리자 로그인 게이트 ──
  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col">
        <meta name="robots" content="noindex, nofollow" />
        {Bg}{Header}
        <main className="flex-1 flex items-start justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="text-center mb-7">
              <h1 className="text-2xl font-black text-white">투표 관리</h1>
              <p className="text-sm font-bold text-white/60 mt-2">관리자 전용</p>
            </div>
            <div className="bg-white/97 rounded-3xl shadow-2xl p-7">
              <h2 className="text-xl font-black text-black mb-5">관리자 로그인</h2>
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="text" value={adminId} onChange={e => setAdminId(e.target.value)}
                  placeholder="아이디" autoComplete="username" required
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#40E0D0] outline-none font-bold text-base"
                />
                <input
                  type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)}
                  placeholder="비밀번호" autoComplete="current-password" required
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#40E0D0] outline-none font-bold text-base"
                />
                <button
                  type="submit" disabled={loggingIn}
                  className="w-full bg-[#40E0D0] text-black py-4 rounded-2xl font-black text-lg active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loggingIn ? "로그인 중..." : "로그인"}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── 대시보드 ──
  return (
    <div className="min-h-screen flex flex-col">
      <meta name="robots" content="noindex, nofollow" />
      {Bg}{Header}
      <main className="flex-1 px-4 py-7">
        <div className="w-full max-w-md mx-auto space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-black text-white">투표 관리</h1>
            <p className="text-sm font-bold text-white/60 mt-2">파티별 매칭 투표 실시간 제어</p>
          </div>

          {/* 월별 필터 — 좌/우 화살표 + 가로 스크롤 슬라이드. 활성 탭은 청록 배경 + 검정 글자.
              탭이 늘어나도(예: 2027년 1월) 화살표로 부드럽게 탐색. 스크롤바는 숨김 처리. */}
          {parties.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollMonths(-1)}
                aria-label="이전 달 보기"
                className="flex-shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-90 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <div
                ref={monthScrollRef}
                className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex gap-2 w-max py-0.5">
                  {monthOptions.map(key => {
                    const active = key === selectedMonth;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedMonth(key)}
                        className={`flex-shrink-0 px-5 py-2.5 rounded-full font-black text-sm whitespace-nowrap active:scale-[0.97] transition-all ${
                          active ? "bg-[#40E0D0] text-black" : "bg-white/15 text-white/80"
                        }`}
                      >
                        {monthLabel(key)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => scrollMonths(1)}
                aria-label="다음 달 보기"
                className="flex-shrink-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center active:scale-90 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}

          {loadingList && parties.length === 0 ? (
            <div className="bg-white/97 rounded-3xl shadow-xl p-8 text-center">
              <p className="text-gray-500 font-bold">파티 불러오는 중...</p>
            </div>
          ) : parties.length === 0 ? (
            <div className="bg-white/97 rounded-3xl shadow-xl p-8 text-center">
              <p className="text-gray-500 font-bold">등록된 파티가 없습니다.</p>
            </div>
          ) : visibleParties.length === 0 ? (
            <div className="bg-white/97 rounded-3xl shadow-xl p-8 text-center">
              <p className="text-gray-500 font-bold">{monthLabel(selectedMonth)}에 예정된 파티가 없습니다.</p>
            </div>
          ) : (
            visibleParties.map(p => {
              const d = details[p.id];
              const status = d?.voting_status ?? p.voting_status;
              const part = d?.participants ?? { male: 0, female: 0 };
              const votedM = d ? votedCount(d.votes, "남성") : 0;
              const votedF = d ? votedCount(d.votes, "여성") : 0;
              const couples = d?.matches.length ?? 0;
              const popM = d ? popular(d.votes, "남성") : { number: 0, count: 0 };
              const popF = d ? popular(d.votes, "여성") : { number: 0, count: 0 };
              const isOpen = status === "open";
              const isFinal = status === "finalized";
              const statusLabel = isOpen ? "투표 진행중" : isFinal ? "투표 종료" : "투표 대기";
              const statusBg = isOpen ? "bg-[#40E0D0] text-black" : isFinal ? "bg-black text-white" : "bg-gray-200 text-gray-600";

              // 투표시작 가드 — cancelled/confirmed 외 미완료 참가자(취소요청·확정대기·결제완료)가
              // 1명이라도 있으면 차단. (start_blocking = 0 일 때만 시작 가능)
              const canStart = (d?.startBlocking ?? 0) === 0;
              const startInactive = isFinal || !canStart;   // 무배경 비활성 룩
              const handleStart = () => {
                if (!canStart) {
                  alert("관리페이지의 예약 / 신청 현황에서 '참가 확정 완료'를 완료해주세요.");
                  return;
                }
                doAction(p.id, "start");
              };

              return (
                <div key={p.id} className="bg-white/97 rounded-3xl shadow-xl p-6">
                  {/* 카드 헤더 */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-black text-black break-keep">{p.title}</h2>
                      <p className="text-sm font-bold text-gray-500 mt-0.5">{p.dateString}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-black px-3 py-1.5 rounded-full ${statusBg}`}>{statusLabel}</span>
                  </div>

                  {/* 참가자 총원 + 투표 완료 현황 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-2xl px-4 py-3 text-center">
                      <p className="text-xs font-bold text-gray-400 mb-1">참가자 (남/여)</p>
                      <p className="text-lg font-black text-black tabular-nums">{part.male} / {part.female}</p>
                    </div>
                    <div className="bg-gray-50 rounded-2xl px-4 py-3 text-center">
                      <p className="text-xs font-bold text-gray-400 mb-1">투표 완료</p>
                      <p className="text-base font-black text-black tabular-nums break-keep">
                        남 {votedM}/{part.male} · 여 {votedF}/{part.female}
                      </p>
                    </div>
                  </div>

                  {p.host_name ? (
                    <p className="text-xs font-bold text-gray-400 mb-4">담당자: {p.host_name}</p>
                  ) : null}

                  {/* 3대 제어 버튼 — 종료(finalized) 파티는 조건부 색상으로 마감 여부를 한눈에 강조.
                      · 투표시작: 종료 시 무채색 border(비활성 분리) / 그 외 청록 배경
                      · 투표종료: 종료 시 선명한 빨강 배경+흰 글자(하이라이트) / 그 외 검정 배경
                      진행중·대기 파티는 기존 색상 그대로 유지. */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={!!busy || isOpen || isFinal}
                      className={`px-2 py-4 rounded-2xl font-black text-sm active:scale-[0.97] transition-transform ${
                        startInactive
                          ? "bg-transparent border-2 border-gray-200 text-gray-400"
                          : "bg-[#40E0D0] text-black disabled:bg-gray-100 disabled:text-gray-300"
                      }`}
                    >
                      투표시작
                    </button>
                    <button
                      type="button"
                      onClick={() => doAction(p.id, "end")}
                      disabled={!!busy || !isOpen}
                      className={`px-2 py-4 rounded-2xl font-black text-sm active:scale-[0.97] transition-transform ${
                        isFinal
                          ? "bg-red-600 text-white"
                          : "bg-black text-white disabled:bg-gray-100 disabled:text-gray-300"
                      }`}
                    >
                      투표종료
                    </button>
                    <button
                      type="button"
                      onClick={() => doAction(p.id, "reset")}
                      disabled={!!busy}
                      className="px-2 py-4 rounded-2xl font-black text-sm bg-white border-2 border-gray-300 text-gray-700 active:scale-[0.97] transition-transform disabled:opacity-40"
                    >
                      초기화
                    </button>
                  </div>

                  {/* 종료 후 통계 요약 + 결과보기 */}
                  {isFinal && d && (
                    <div className="mt-5 pt-5 border-t border-gray-100">
                      <div className="bg-gray-50 rounded-2xl p-5 space-y-2 text-sm font-bold text-gray-700">
                        <p>투표 참가자 수 : 남 {part.male}명, 여 {part.female}명</p>
                        <p>매칭된 커플 수 : <span className="text-black font-black">{couples}쌍</span></p>
                        <p className="break-keep">
                          인기번호 : 남자 {popM.number || "-"}번 : {popM.count}표
                          <span className="text-gray-300 mx-1">|</span>
                          여자 {popF.number || "-"}번 : {popF.count}표
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className="w-full mt-3 py-3.5 rounded-2xl font-black text-base bg-black text-white active:scale-[0.98] transition-transform"
                      >
                        {expanded[p.id] ? "결과 닫기" : "결과보기"}
                      </button>

                      {expanded[p.id] && (
                        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
                          <table className="w-full text-xs whitespace-nowrap">
                            <thead className="bg-gray-100 text-gray-600 font-black">
                              <tr>
                                <th className="text-left px-3 py-2.5">성별</th>
                                <th className="text-left px-3 py-2.5">번호</th>
                                <th className="text-left px-3 py-2.5">이름</th>
                                <th className="text-left px-3 py-2.5">이메일</th>
                                <th className="text-left px-3 py-2.5">선택</th>
                                <th className="text-left px-3 py-2.5">연락처</th>
                                <th className="text-left px-3 py-2.5">투표시간</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.votes.length === 0 ? (
                                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400 font-bold">투표 내역이 없습니다.</td></tr>
                              ) : d.votes.map((v, i) => (
                                <tr key={i} className="border-t border-gray-100">
                                  <td className="px-3 py-2.5 font-bold">{v.gender}</td>
                                  <td className="px-3 py-2.5 font-black tabular-nums">{v.voter_number}번</td>
                                  <td className="px-3 py-2.5 font-bold">{v.name || "-"}</td>
                                  <td className="px-3 py-2.5 text-gray-500">{v.email}</td>
                                  <td className="px-3 py-2.5 font-black text-black tabular-nums">{v.picks.join(", ") || "-"}</td>
                                  <td className="px-3 py-2.5 tabular-nums">{v.phone || "-"}</td>
                                  <td className="px-3 py-2.5 text-gray-400 tabular-nums">{v.updated_at}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
