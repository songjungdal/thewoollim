"use client";

/**
 * 독립 매칭 투표 / 결과 확인 페이지 (모바일 전용 개편 v6.4).
 *  - URL: /matching/results
 *  - 독립 레이아웃 (메인 라우팅과 세션 격리 — 흐름이 이 페이지 안에서 완결)
 *  - 배경: 메인 hero-bg + 상시 backdrop-blur + 어두운 오버레이 (차분한 톤)
 *  - 로고: 클릭 불가 (pointer-events-none)
 *  - 컬러 규칙: 포인트(청록 #40E0D0)는 '배경'에만. 청록 배경 위 폰트는 무조건 검정(#000).
 *  - 로그인 게이트 → 프로필 → 파티 선택 → 상태별(미시작/투표중/종료) 분기
 *
 * 성별 분리 모델(v4.1): voter 는 본인 성별, picks 는 반대 성별의 번호.
 * 동일 숫자라도 성별 namespace 가 달라 '남자 1번' 과 '여자 1번' 은 별개 참가자.
 */

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import Footer from "../../components/Footer";
import { useAuth } from "../../context/AuthContext";

/**
 * 행사 일시 파싱 — dateString '2026년 05월 29일 (금) 19:00' 에서
 *  - monthKey: 'YYYY-MM' (월별 필터 분류 기준)
 *  - sortKey : 'YYYY-MM-DD HH:MM' (행사 일시 오름차순 정렬용)
 * API(state.php) 는 calendarDate 를 내려주지 않으므로 클라이언트에서 dateString 만으로 도출 (API 무변경).
 */
function parseEventDate(ds: string): { monthKey: string; sortKey: string } {
  const md = ds.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const tm = ds.match(/(\d{1,2}):(\d{2})/);
  const pad = (s: string) => s.padStart(2, "0");
  if (!md) return { monthKey: "", sortKey: "9999-99-99 99:99" };
  const [, y, mo, d] = md;
  const time = tm ? `${pad(tm[1])}:${tm[2]}` : "00:00";
  return { monthKey: `${y}-${pad(mo)}`, sortKey: `${y}-${pad(mo)}-${pad(d)} ${time}` };
}

type PartyState = {
  id: string;
  title: string;
  dateString: string;
  voting_status: "closed" | "open" | "finalized";
  my_vote?: { voter_number: number; picks: number[] };
};

type StateResp = {
  ok: boolean;
  user?: { email: string; name: string; gender: string; phone: string; birth_date: string };
  parties?: PartyState[];
};

type ResultResp = {
  ok: boolean;
  voting_status: "closed" | "open" | "finalized";
  matched: boolean;
  matches?: { name: string; gender: string; voter_number: number; birth_date?: string; phone: string }[];
};

export default function MatchingResultsPage() {
  const { mounted, isLoggedIn, login } = useAuth();
  const [data, setData] = useState<StateResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  // 월별 필터 — 진입 시 '오늘 날짜'가 속한 이번 달 자동 선택 ('YYYY-MM')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });

  // 로그인 폼
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // 투표 입력
  const [myNumber, setMyNumber] = useState<string>("");
  const [pick1, setPick1] = useState<string>("");
  const [pick2, setPick2] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false); // true=폼, false=완료 안내

  // 결과
  const [result, setResult] = useState<ResultResp | null>(null);

  // ⚠️ deps [] 로 고정 — selectedPartyId 를 deps 에 두면 (월 동기화 effect 가) 선택을 바꿀 때마다
  //    loadState 정체성이 바뀌어 아래 로드 effect 가 재실행 → setLoading(true) 로 콘텐츠 위에 스피너가
  //    다시 깜빡이는 현상이 발생. 기본 선택은 월별 동기화 effect 가 단독으로 담당하므로 여기선 제거.
  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/matching/state.php", { cache: "no-store", credentials: "include" });
      const d: StateResp = await res.json();
      setData(d);
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isLoggedIn) loadState();
    else setLoading(false);
  }, [mounted, isLoggedIn, loadState]);

  // 파티 전환 → 본인 vote prefill + 완료 안내 뷰부터
  useEffect(() => {
    if (!data?.parties || !selectedPartyId) return;
    const p = data.parties.find(x => x.id === selectedPartyId);
    if (p?.my_vote) {
      setMyNumber(String(p.my_vote.voter_number));
      setPick1(p.my_vote.picks[0] ? String(p.my_vote.picks[0]) : "");
      setPick2(p.my_vote.picks[1] ? String(p.my_vote.picks[1]) : "");
    } else {
      setMyNumber("");
      setPick1("");
      setPick2("");
    }
    setEditing(false);
  }, [selectedPartyId, data]);

  // 선택 파티를 현재 월(selectedMonth) 의 파티로 동기화 — 월 전환 시 끊김 없이 첫 파티 자동 선택.
  // 함수형 업데이트로 selectedPartyId 의존성 제거 (재실행 루프 방지).
  useEffect(() => {
    if (!data?.parties) return;
    const vis = data.parties.filter(p => parseEventDate(p.dateString).monthKey === selectedMonth);
    setSelectedPartyId(prev => {
      if (vis.length === 0) return null;
      if (prev && vis.some(p => p.id === prev)) return prev;
      return vis[0].id;
    });
  }, [selectedMonth, data]);

  // 결과 fetch — finalized, 또는 closed+본인 vote 보존
  useEffect(() => {
    if (!selectedPartyId || !data?.parties) return;
    const p = data.parties.find(x => x.id === selectedPartyId);
    const shouldFetchResult =
      p?.voting_status === "finalized" ||
      (p?.voting_status === "closed" && !!p?.my_vote);
    if (!shouldFetchResult) { setResult(null); return; }
    fetch(`/api/matching/results.php?partyId=${encodeURIComponent(selectedPartyId)}`,
      { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then((d: ResultResp) => setResult(d))
      .catch(() => setResult(null));
  }, [selectedPartyId, data]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) { alert("이메일과 비밀번호를 입력해주세요."); return; }
    setLoggingIn(true);
    try {
      const ok = await login(loginEmail.trim(), loginPassword);
      if (!ok) { alert("이메일 또는 비밀번호가 올바르지 않습니다."); return; }
      // 로그인 성공 — 메인으로 튕기지 않고 이 페이지 안에서 데이터만 다시 로드
      await loadState();
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) return;
    const n = parseInt(myNumber, 10);
    if (!n || n < 1 || n > 99) { alert("내 매칭번호를 1~99 사이로 입력해주세요."); return; }
    const p1 = parseInt(pick1, 10);
    const p2 = parseInt(pick2, 10);
    const picks: number[] = [];
    if (p1) picks.push(p1);
    if (p2) picks.push(p2);
    if (picks.length === 0) { alert("마음에 드는 이성의 번호를 최소 1명 입력해주세요."); return; }
    if (picks.length === 2 && p1 === p2) { alert("두 번호가 같습니다. 다른 번호를 입력해주세요."); return; }

    setSubmitting(true);
    try {
      // 성별 식별자 동봉 — 서버가 세션 회원의 성별과 대조 ('남자 N번' / '여자 N번' 분리)
      const voterGender = data?.user?.gender || "";
      const voterPrefix = voterGender === "남성" ? "M" : voterGender === "여성" ? "F" : "?";
      const oppositeGender = voterGender === "남성" ? "여성" : voterGender === "여성" ? "남성" : "";
      const oppositePrefix = voterGender === "남성" ? "F" : voterGender === "여성" ? "M" : "?";
      const picksDetailed = picks.map(p => ({
        target_number: p,
        target_gender: oppositeGender,
        target_id: `${oppositePrefix}-${p}`,
      }));
      const res = await fetch("/api/matching/vote.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId: selectedPartyId,
          voter_number: n,
          voter_gender: voterGender,
          voter_id: `${voterPrefix}-${n}`,
          picks,
          picks_detailed: picksDetailed,
        }),
      });
      const d = await res.json();
      if (!d?.ok) { alert(d?.error || "투표 저장에 실패했습니다."); return; }
      alert("투표가 완료되었습니다! 소중한 인연이 닿기를 더 울림이 응원합니다.");
      setEditing(false);
      await loadState();
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedParty = data?.parties?.find(p => p.id === selectedPartyId);
  const userGender = data?.user?.gender || "";
  const genderKor    = userGender === "남성" ? "남자" : userGender === "여성" ? "여자" : "";
  const oppositeKor  = userGender === "남성" ? "여자" : userGender === "여성" ? "남자" : "이성";
  // 성별 칩/번호 배경 — 남:파스텔 블루 / 여:파스텔 핑크 (세련된 톤, 흰 글자 bold)
  const genderChip   = userGender === "남성"
    ? { bg: "bg-blue-400",  text: "text-white" }
    : userGender === "여성"
      ? { bg: "bg-pink-400", text: "text-white" }
      : { bg: "bg-gray-300", text: "text-gray-700" };

  // ── 년도월별 필터 파생값 ──
  const allParties = data?.parties ?? [];
  const nowD = new Date();
  const currentMonthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  // 탭 후보: 데이터에 존재하는 월 ∪ 현재 월(항상 포함) — 오름차순
  const monthOptions = Array.from(
    new Set<string>([...allParties.map(p => parseEventDate(p.dateString).monthKey).filter(Boolean), currentMonthKey])
  ).sort();
  const monthLabel = (key: string) => { const [y, m] = key.split("-"); return `${Number(y)}년 ${Number(m)}월`; };
  // 현재 월의 파티 — 행사 일시(빠른 순) 오름차순 정렬
  const visibleParties = allParties
    .filter(p => parseEventDate(p.dateString).monthKey === selectedMonth)
    .sort((a, b) => parseEventDate(a.dateString).sortKey.localeCompare(parseEventDate(b.dateString).sortKey));
  const monthIdx = monthOptions.indexOf(selectedMonth);
  const stepMonth = (dir: -1 | 1) => {
    const ni = monthIdx + dir;
    if (ni >= 0 && ni < monthOptions.length) setSelectedMonth(monthOptions[ni]);
  };

  return (
    <div className="min-h-dvh flex flex-col relative">
      {/* 배경 — 메인 hero 이미지 + 상시 블러 + 어두운 오버레이 */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/hero-bg.webp)" }}
        />
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
      </div>

      {/* 헤더 — 로고 클릭 불가 (투표 흐름 이탈 방지) */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm border-b border-white/10">
        <div className="mx-auto px-5 h-[60px] flex items-center justify-center">
          <span className="inline-flex items-center pointer-events-none select-none cursor-default" aria-label="어울림">
            <Image
              src="/images/logo_white.png"
              alt="어울림"
              width={108}
              height={36}
              priority
              className="h-auto w-[108px] max-w-full object-contain"
            />
          </span>
        </div>
      </header>

      {/* 본문 — 로딩/하이드레이션 중엔 풀스크린 미니멀 스피너로 레이아웃 시프트 원천 차단.
          마운트(useAuth.mounted)+데이터 fetch 완료 후에만 실제 콘텐츠 렌더. */}
      {(!mounted || loading || (isLoggedIn && data === null)) ? (
        <main className="flex-1 flex flex-col items-center justify-center px-4 gap-5" aria-busy="true">
          <span
            role="status"
            aria-label="불러오는 중"
            className="block w-11 h-11 rounded-full border-[3px] border-white/15 border-t-[#40E0D0] animate-spin"
          />
          <p className="text-white/55 font-bold text-sm tracking-wide">투표 정보를 불러오는 중입니다</p>
        </main>
      ) : (
      <main className="flex-1 flex items-start justify-center px-4 py-7">
        <div className="w-full max-w-md">
          {/* 타이틀 */}
          <div className="text-center mb-7">
            <h1 className="text-2xl font-black text-white tracking-tight">매칭 투표 · 결과</h1>
            <p className="text-sm font-bold text-white/60 mt-2">마음의 울림을 번호에 담아주세요</p>
          </div>

          {!isLoggedIn ? (
            // ─── 로그인 게이트 ───
            <div className="bg-white/97 rounded-3xl shadow-2xl p-7">
              {/* 안내 문구 — 중앙 정렬, 모바일 비율 맞춤 여백 */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-black text-black mb-2">투표 로그인</h2>
                <p className="text-[15px] text-gray-600 font-bold leading-relaxed break-keep">
                  마음의 울림을 전할 시간,<br />투표를 위해 로그인을 해주세요.
                </p>
              </div>
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="이메일"
                  autoComplete="username"
                  required
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#40E0D0] outline-none font-bold text-base"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  required
                  className="w-full px-5 py-4 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-[#40E0D0] outline-none font-bold text-base"
                />
                {/* 청록 배경 버튼 → 글자는 검정 (#000) */}
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full bg-[#40E0D0] text-black py-4 rounded-2xl font-black text-lg active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {loggingIn ? "로그인 중..." : "로그인"}
                </button>
              </form>
              {/* 하단 링크 — 기존 로그인 화면과 동일 (아이디/비밀번호 찾기) */}
              <div className="flex justify-center items-center gap-5 mt-6 text-sm font-bold">
                <Link href="/login/" className="text-gray-500 hover:text-black transition-colors">아이디 찾기</Link>
                <span className="text-gray-300" aria-hidden="true">|</span>
                <Link href="/login/" className="text-gray-500 hover:text-black transition-colors">비밀번호 찾기</Link>
              </div>
            </div>
          ) : !data?.ok || !data.parties || data.parties.length === 0 ? (
            // ─── confirmed 파티 없음 ───
            <div className="bg-white/97 rounded-3xl shadow-2xl p-8 text-center">
              <h2 className="text-xl font-black text-black mb-3">참가확정된 파티가 없습니다</h2>
              <p className="text-[15px] text-gray-600 font-bold mb-7 leading-relaxed break-keep">
                매칭 투표는 참가확정 회원만 참여할 수 있어요.<br />참가확정 후 다시 방문해주세요.
              </p>
              <Link href="/" className="inline-block bg-[#40E0D0] text-black px-8 py-4 rounded-2xl font-black active:scale-[0.98] transition-transform">
                홈페이지로 돌아가기
              </Link>
            </div>
          ) : (
            // ─── 메인 흐름 ───
            <div className="space-y-5">
              {/* 나의 프로필 정보 */}
              <div className="bg-white/97 rounded-3xl shadow-xl p-6">
                <h3 className="text-lg font-black text-black mb-4">나의 프로필 정보</h3>
                <div className="grid grid-cols-2 gap-4 text-base">
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1">이름</p>
                    <p className="font-black text-black">{data.user?.name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1">성별</p>
                    <p className="font-black text-black">{data.user?.gender || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1">생년월일</p>
                    <p className="font-bold text-gray-700 tabular-nums">{data.user?.birth_date || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-bold mb-1">연락처</p>
                    <p className="font-bold text-gray-700 tabular-nums">{data.user?.phone || "-"}</p>
                  </div>
                </div>
              </div>

              {/* 년도월별 필터 + 참가 파티 선택 — 파티가 1개라도 항상 노출 */}
              {data.parties.length > 0 && (
                <div className="bg-white/97 rounded-3xl shadow-xl p-6">
                  {/* 년도월별 스텝 필터 — 중앙 'YYYY년 MM월' 배지 + 좌우 화살표.
                      활성 배지·내비 버튼 = 시그니처 청록(#40E0D0) 배경 + 검정 글자. */}
                  <div className="flex items-center justify-center gap-3 mb-5">
                    <button
                      type="button"
                      onClick={() => stepMonth(-1)}
                      disabled={monthIdx <= 0}
                      aria-label="이전 달"
                      className="flex-shrink-0 w-11 h-11 rounded-full bg-[#40E0D0] text-black flex items-center justify-center active:scale-90 transition-all disabled:bg-gray-200 disabled:text-gray-300"
                    >
                      <ChevronLeft size={22} strokeWidth={2.5} />
                    </button>
                    <div className="min-w-[150px] text-center px-5 py-3 rounded-2xl bg-[#40E0D0] text-black font-black text-lg tabular-nums">
                      {monthLabel(selectedMonth)}
                    </div>
                    <button
                      type="button"
                      onClick={() => stepMonth(1)}
                      disabled={monthIdx >= monthOptions.length - 1}
                      aria-label="다음 달"
                      className="flex-shrink-0 w-11 h-11 rounded-full bg-[#40E0D0] text-black flex items-center justify-center active:scale-90 transition-all disabled:bg-gray-200 disabled:text-gray-300"
                    >
                      <ChevronRight size={22} strokeWidth={2.5} />
                    </button>
                  </div>

                  <p className="text-base font-black text-black mb-4">참가 파티 선택</p>
                  {visibleParties.length === 0 ? (
                    <p className="text-center text-gray-500 font-bold py-6 break-keep">
                      {monthLabel(selectedMonth)}에는 참가 파티가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {visibleParties.map(p => {
                        const active = p.id === selectedPartyId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPartyId(p.id)}
                            className={`w-full text-left px-6 py-5 rounded-2xl border-2 transition-all active:scale-[0.99] ${
                              active ? "bg-[#40E0D0] border-[#40E0D0]" : "bg-gray-50 border-gray-200"
                            }`}
                          >
                            {/* 선택 카드(청록 배경) → 글자 검정 */}
                            <p className="font-black text-lg text-black break-keep">{p.title}</p>
                            <p className={`text-sm font-bold mt-1 ${active ? "text-black/70" : "text-gray-500"}`}>{p.dateString}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 투표/결과 영역 — 상태별 분기.
                  파티 제목·날짜는 위 선택 카드에 이미 노출되므로 여기선 재노출 X (레이아웃 정리). */}
              {selectedParty && (
                <div className="bg-white/97 rounded-3xl shadow-xl p-6">
                  {/* [상태 1] 미시작 — closed + 본인 vote 없음 */}
                  {selectedParty.voting_status === "closed" && !selectedParty.my_vote && (
                    <div className="text-center py-10">
                      <p className="text-lg font-black text-black mb-3 break-keep">
                        아직 매칭 투표가<br />시작되지 않았습니다.
                      </p>
                      <p className="text-[15px] text-gray-500 font-bold leading-relaxed break-keep">
                        파티 종료 후 관리자가 투표를<br />활성화하면 안내해 드릴게요.
                      </p>
                    </div>
                  )}

                  {/* [상태 2-A] 투표중 + 완료 안내 뷰 (vote 보유 & 수정모드 아님) */}
                  {selectedParty.voting_status === "open" && selectedParty.my_vote && !editing && (
                    <div>
                      <div className="text-center py-7 px-5 bg-gray-100 rounded-2xl mb-5">
                        {/* 옅은 회색 배경 → 글자 검정 (청록 배경에서 변경) */}
                        <p className="text-xl font-black text-black mb-2 break-keep">투표가 완료되었습니다.</p>
                        <p className="text-sm font-bold text-gray-500 break-keep">
                          마감 전까지는 투표 내용을<br />자유롭게 수정하실 수 있습니다.
                        </p>
                      </div>
                      {/* 내 투표 요약 */}
                      <div className="bg-gray-50 rounded-2xl p-6 mb-5 space-y-6">
                        <div className="text-center">
                          <p className="text-sm font-black text-gray-500 mb-3">내 매칭번호</p>
                          {/* 완료 화면 번호 칩 — 가입 성별에 맞춘 파스텔 블루/핑크 (가독성 위해 흰 글자 bold) */}
                          <span className={`inline-flex items-center justify-center px-7 py-4 rounded-2xl font-black text-2xl ${genderChip.bg} ${genderChip.text}`}>
                            {genderKor || "성별"} {selectedParty.my_vote.voter_number}번
                          </span>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-black text-gray-500 mb-3">내가 선택한 {oppositeKor} 번호</p>
                          <div className="flex flex-wrap gap-3 justify-center">
                            {selectedParty.my_vote.picks.map((p, idx) => (
                              <span key={idx} className="inline-flex items-center px-7 py-4 rounded-2xl bg-white border-2 border-[#40E0D0] font-black text-2xl text-black">
                                {p}번
                              </span>
                            ))}
                            {selectedParty.my_vote.picks.length === 0 && (
                              <span className="text-base text-gray-400 font-bold">선택 정보 없음</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* [투표 수정하기] — 청록 배경 + 검정 글자 */}
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="w-full bg-[#40E0D0] text-black py-4 rounded-2xl font-black text-lg active:scale-[0.98] transition-transform"
                      >
                        투표 수정하기
                      </button>
                    </div>
                  )}

                  {/* [상태 2-B] 투표중 + 입력 폼 (vote 없음 or 수정모드) */}
                  {selectedParty.voting_status === "open" && (!selectedParty.my_vote || editing) && (
                    <form onSubmit={handleSubmitVote} className="space-y-6">
                      <div>
                        <label className="block text-base font-black text-black mb-1">내 매칭번호</label>
                        <p className="text-sm text-gray-500 font-bold mb-3 break-keep">
                          파티에서 배정받은 {genderKor && `${genderKor} `}번호 숫자만 입력해주세요. (예: 3)
                        </p>
                        {/* 성별 배지 + 입력창 — items-stretch 로 배지 높이를 입력창과 1:1 일치 */}
                        <div className="flex items-stretch gap-2">
                          <span className={`flex-shrink-0 inline-flex items-center justify-center px-5 rounded-2xl font-black text-lg ${genderChip.bg} ${genderChip.text}`}>
                            {genderKor || "성별"}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={myNumber}
                            onChange={e => setMyNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
                            placeholder="예: 3"
                            aria-label="내 매칭번호"
                            className="flex-1 min-w-0 px-6 py-5 rounded-2xl border-2 border-gray-200 focus:border-[#40E0D0] outline-none font-black text-2xl tabular-nums text-center"
                            required
                          />
                        </div>
                      </div>

                      {myNumber && (
                        <div>
                          {/* 라벨/안내문 — 소프트 그레이 + 모바일 한 단계 축소(짤림 방지, 한 줄 유지) */}
                          <label className="block text-[13px] sm:text-base font-black text-gray-500 mb-1 break-keep">마음에 드는 이성의 번호</label>
                          <p className="text-[11px] sm:text-sm text-gray-400 font-bold mb-3 break-keep">
                            이성의 번호는 최소 1명에서 최대 2명까지 입력 가능합니다.
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="number" min={1} max={99}
                              value={pick1}
                              onChange={e => setPick1(e.target.value.replace(/\D/g, "").slice(0, 2))}
                              placeholder="첫번째"
                              className="min-w-0 px-5 py-5 rounded-2xl border-2 border-gray-200 focus:border-[#40E0D0] outline-none font-black text-xl tabular-nums text-center"
                            />
                            <input
                              type="number" min={1} max={99}
                              value={pick2}
                              onChange={e => setPick2(e.target.value.replace(/\D/g, "").slice(0, 2))}
                              placeholder="두번째"
                              className="min-w-0 px-5 py-5 rounded-2xl border-2 border-gray-200 focus:border-[#40E0D0] outline-none font-black text-xl tabular-nums text-center"
                            />
                          </div>
                        </div>
                      )}

                      {/* [투표 완료하기] — 청록 배경 + 검정 글자, 터치 크게 */}
                      <button
                        type="submit"
                        disabled={submitting || !myNumber}
                        className="w-full bg-[#40E0D0] text-black py-5 rounded-2xl font-black text-xl active:scale-[0.98] transition-transform disabled:bg-gray-200 disabled:text-gray-400"
                      >
                        {submitting ? "저장 중..." : "투표 완료하기"}
                      </button>
                      {selectedParty.my_vote && (
                        <button
                          type="button"
                          onClick={() => {
                            const mv = selectedParty.my_vote;
                            if (mv) {
                              setMyNumber(String(mv.voter_number));
                              setPick1(mv.picks[0] ? String(mv.picks[0]) : "");
                              setPick2(mv.picks[1] ? String(mv.picks[1]) : "");
                            }
                            setEditing(false);
                          }}
                          className="block mx-auto text-sm text-gray-500 font-bold underline-offset-4 hover:underline"
                        >
                          수정 취소 — 이전 투표로 돌아가기
                        </button>
                      )}
                    </form>
                  )}

                  {/* [상태 3] 종료 — 결과 노출 (finalized, 또는 closed+vote 보존) */}
                  {(selectedParty.voting_status === "finalized" ||
                    (selectedParty.voting_status === "closed" && !!selectedParty.my_vote)) && (
                    <div>
                      {!result ? (
                        <p className="text-center py-8 text-base text-gray-500 font-bold">결과 불러오는 중...</p>
                      ) : result.matched && result.matches && result.matches.length > 0 ? (
                        // === 매칭 성공 ===
                        <div className="space-y-6">
                          {result.matches.map((m, idx) => (
                            <div key={idx}>
                              {/* 축하 헤더 — 청록 배경 → 글자 검정 */}
                              <div className="text-center py-6 px-5 bg-[#40E0D0] rounded-2xl mb-4">
                                <p className="text-sm font-black text-black/70 mb-1">[어울림] 축하합니다! 상호 매칭 성공</p>
                                <p className="text-xl font-black text-black break-keep">
                                  {m.gender} {m.voter_number}번과<br />매칭이 되었습니다!
                                </p>
                              </div>
                              {/* 나 ♥ 상대 */}
                              <div className="text-center mb-4">
                                <p className="text-base font-black text-black break-keep leading-relaxed">
                                  {data.user?.name} ({data.user?.gender} {selectedParty.my_vote?.voter_number}번)
                                  <span className="text-[#ff5a8a] mx-1.5">♥</span>
                                  {m.name} ({m.gender} {m.voter_number}번)
                                </p>
                              </div>
                              {/* 상대 카드 — 이름 + 연락처 */}
                              <div className="bg-gray-50 border-2 border-[#40E0D0] rounded-2xl p-6">
                                <p className="text-xs font-black text-gray-400 mb-1">매칭된 회원의 이름</p>
                                <h3 className="text-2xl font-black text-black mb-4 break-keep">{m.name}</h3>
                                <p className="text-xs font-black text-gray-400 mb-1">연락처</p>
                                <a href={`tel:${m.phone}`} className="font-black text-black text-2xl tabular-nums break-all underline-offset-4 hover:underline">
                                  {m.phone || "-"}
                                </a>
                              </div>
                            </div>
                          ))}
                          <div className="flex flex-col gap-3 pt-1">
                            <Link href="/" className="text-center bg-black text-white px-7 py-4 rounded-2xl font-black active:scale-[0.98] transition-transform">
                              홈페이지로 돌아가기
                            </Link>
                          </div>
                        </div>
                      ) : (
                        // === 매칭 실패 ===
                        <div className="text-center py-8">
                          <p className="text-lg font-black text-black mb-3 leading-relaxed break-keep">
                            아쉽게도 이번 파티에서는<br />인연이 닿지 않았습니다.
                          </p>
                          <p className="text-[15px] text-gray-600 font-bold mb-7 leading-relaxed break-keep">
                            오늘의 즐거웠던 기억이 조만간 더 멋진<br />인연으로 이어질 발판이 되시기를 바랍니다.
                          </p>
                          <div className="flex flex-col gap-3">
                            <Link href="/" className="bg-black text-white px-7 py-4 rounded-2xl font-black active:scale-[0.98] transition-transform">
                              홈페이지로 돌아가기
                            </Link>
                            <Link href="/#apply" className="bg-[#40E0D0] text-black px-7 py-4 rounded-2xl font-black active:scale-[0.98] transition-transform">
                              다음 파티 보기
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      )}

      <Footer />
    </div>
  );
}
