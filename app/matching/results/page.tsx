"use client";

/**
 * 독립 매칭 투표 / 결과 확인 페이지.
 *  - URL: /matching/results
 *  - 헤더 없음 (독립 레이아웃) — 로그인/투표/결과 흐름에만 집중
 *  - 배경: 메인 hero-bg + 어두운 오버레이
 *  - 푸터: 기존 사이트 Footer 재사용
 *  - 로그인 게이트: 로그인 안 됐으면 인라인 로그인 폼
 *  - 로그인 후: 본인 confirmed 파티 선택 → 투표 또는 결과 확인
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import Footer from "../../components/Footer";
import { useAuth } from "../../context/AuthContext";

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
  // v4.5: voter_number 추가 — 결과 헤드라인 동적 노출 ("축하합니다! 여성 3번과 매칭이 되었습니다!")
  matches?: { name: string; gender: string; voter_number: number; birth_date?: string; phone: string }[];
};

export default function MatchingResultsPage() {
  const { mounted, isLoggedIn, login } = useAuth();
  const [data, setData] = useState<StateResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);

  // 로그인 폼 state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // 투표 state
  const [myNumber, setMyNumber] = useState<string>("");
  const [pick1, setPick1] = useState<string>("");
  const [pick2, setPick2] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // 투표 완료 후 수정 모드 — true 면 form 노출, false 면 '투표 완료' 안내 + [수정하기] 버튼 노출
  const [editing, setEditing] = useState(false);

  // 결과 state
  const [result, setResult] = useState<ResultResp | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/matching/state.php", { cache: "no-store", credentials: "include" });
      const d: StateResp = await res.json();
      setData(d);
      if (d.ok && d.parties && d.parties.length > 0 && !selectedPartyId) {
        setSelectedPartyId(d.parties[0].id);
      }
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, [selectedPartyId]);

  useEffect(() => {
    if (!mounted) return;
    if (isLoggedIn) loadState();
    else setLoading(false);
  }, [mounted, isLoggedIn, loadState]);

  // 선택된 파티 변경 → 본인 vote 가 있으면 input prefill + 편집 모드 초기화
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
    // 파티 전환 시 항상 완료 안내 뷰부터 노출 (투표 이력 있는 파티) → 사용자가 [수정하기] 로 진입
    setEditing(false);
  }, [selectedPartyId, data]);

  // 결과 fetch — 'finalized' 일 때만
  useEffect(() => {
    if (!selectedPartyId || !data?.parties) return;
    const p = data.parties.find(x => x.id === selectedPartyId);
    if (p?.voting_status !== "finalized") { setResult(null); return; }
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
      // 로그인 성공 — 페이지는 그대로, 데이터만 다시 로드 (홈으로 튕기지 않음)
      await loadState();
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSubmitVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) return;
    const n = parseInt(myNumber, 10);
    if (!n || n < 1 || n > 99) { alert("본인 번호를 1~99 사이로 입력해주세요."); return; }
    const p1 = parseInt(pick1, 10);
    const p2 = parseInt(pick2, 10);
    const picks: number[] = [];
    if (p1) picks.push(p1);
    if (p2) picks.push(p2);
    if (picks.length === 0) { alert("최소 1명을 선택해주세요."); return; }
    if (picks.length === 2 && p1 === p2) { alert("두 번호가 같습니다. 다른 번호를 선택해주세요."); return; }
    // v4.1 성별 분리 모델: voter 는 본인 성별(M-N), picks 는 반대 성별(F-N) 의 식별자.
    // 동일 숫자라도 성별 namespace 가 다르므로 '남자 8번 → 여자 8번' 은 본인 선택이 아님 → 자기 번호 차단 검사 삭제.

    setSubmitting(true);
    try {
      // 성별 식별자를 함께 전송 → 서버에서 세션 회원의 성별과 대조해 '남자 N번' / '여자 N번' 을 명확히 분리.
      // voter_gender 는 DB match_votes.voter_gender 컬럼과 1:1 매핑. voter_id ("M-3" / "F-3") 는 디버깅/로그용 보조 식별자.
      const voterGender = data?.user?.gender || "";
      const voterPrefix = voterGender === "남성" ? "M" : voterGender === "여성" ? "F" : "?";
      // picks_detailed — 각 선택 대상에 반대 성별 식별자를 명시. '남자 1번' 이 '1' 을 골랐을 때
      // 내부적으로 'F-1'(여자 1번) 로 매핑돼 동일 숫자 다른 성별의 엉뚱한 매칭을 사전 차단.
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
      if (!d?.ok) { alert(d?.error || "투표 저장 실패"); return; }
      alert("투표가 저장되었습니다!");
      setEditing(false);            // 저장 성공 → 완료 안내 뷰로 복귀
      await loadState();
    } catch {
      alert("네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedParty = data?.parties?.find(p => p.id === selectedPartyId);
  // 성별 표기 헬퍼 — Step 1/2 라벨, placeholder, 배지 색상에 사용
  const userGender = data?.user?.gender || "";
  const genderKor    = userGender === "남성" ? "남자" : userGender === "여성" ? "여자" : "";
  const oppositeKor  = userGender === "남성" ? "여자" : userGender === "여성" ? "남자" : "이성";
  const genderBadge  = userGender === "남성"
    ? { bg: "bg-[#E3F2FD]", text: "text-[#3a85d9]",  ring: "ring-[#4facfe]/30" }
    : userGender === "여성"
      ? { bg: "bg-rose-100",  text: "text-rose-600",   ring: "ring-rose-300/40" }
      : { bg: "bg-gray-100",  text: "text-gray-500",   ring: "ring-gray-200" };

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* 배경 — 메인 hero 이미지 + 어두운 오버레이 */}
      <div className="fixed inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/hero-bg.jpg)" }}
        />
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      </div>

      {/*
        헤더 — 메인 페이지 디자인 스타일 동기화 (검정 배경 + 하단 보더)
        nav 메뉴는 spec 따라 제거 (투표 프로세스 집중용 독립 구조)
        로고: /images/logo_white.png — 메인(120×39) 대비 8% 축소 (110×36)
              - 수직 중앙 정렬: items-center
              - 모바일 안전: object-contain (Image className) + 여백 조절
      */}
      <header className="sticky top-0 z-40 bg-black border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-[64px] md:h-[88px] flex items-center justify-center md:justify-start">
          {/* 로고 — 투표 흐름 중 이탈 방지를 위해 Link 제거 (단순 노출 only).
              pointer-events-none + cursor-default 로 호버/클릭 시 인터랙티브 오인 차단.
              이미지 경로 / 정렬 / 8% 축소 규격(width 110 = 메인 120 대비) 그대로 유지. */}
          <span className="inline-flex items-center pointer-events-none cursor-default" aria-label="어울림">
            <Image
              src="/images/logo_white.png"
              alt="어울림"
              width={110}
              height={36}
              priority
              className="h-auto w-[110px] max-w-full object-contain"
            />
          </span>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 md:py-12">
        <div className="w-full max-w-lg md:max-w-2xl">
          {/* 페이지 타이틀 */}
          <div className="text-center mb-8 md:mb-12">
            <p className="text-[11px] md:text-xs font-black tracking-[0.3em] text-brand-point uppercase mb-2">
              Matching Results
            </p>
            <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight">매칭 투표 · 결과</h1>
          </div>

          {/* 로딩 */}
          {!mounted || loading ? (
            <div className="bg-white/95 rounded-3xl shadow-2xl p-8 md:p-10 text-center">
              <p className="text-gray-500 font-medium">불러오는 중...</p>
            </div>
          ) : !isLoggedIn ? (
            // ─── 로그인 게이트 ───
            <div className="bg-white/95 rounded-3xl shadow-2xl p-7 md:p-10">
              <h2 className="text-xl md:text-2xl font-black text-brand-black mb-2">로그인이 필요합니다</h2>
              <p className="text-sm text-gray-500 font-medium mb-6 leading-relaxed">
                참가확정 회원만 매칭 투표에 참여할 수 있습니다.
              </p>
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="이메일"
                  autoComplete="username"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none font-medium text-sm"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none font-medium text-sm"
                />
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full bg-brand-black text-white py-3.5 rounded-xl font-black hover:bg-brand-point transition-colors disabled:bg-gray-300"
                >
                  {loggingIn ? "로그인 중..." : "로그인"}
                </button>
              </form>
              <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                <Link href="/" className="text-xs text-gray-500 hover:text-brand-point underline-offset-4 hover:underline transition-colors">
                  홈으로 돌아가기
                </Link>
              </div>
            </div>
          ) : !data?.ok || !data.parties || data.parties.length === 0 ? (
            // ─── confirmed 파티 없음 ───
            <div className="bg-white/95 rounded-3xl shadow-2xl p-8 md:p-10 text-center">
              <h2 className="text-xl md:text-2xl font-black text-brand-black mb-3">참가확정된 파티가 없습니다</h2>
              <p className="text-sm text-gray-500 font-medium mb-7 leading-relaxed">
                매칭 투표는 관리자 승인을 받은 회원만 참여할 수 있습니다.<br />
                참가확정 후 다시 방문해주세요.
              </p>
              <Link href="/" className="inline-block bg-brand-black text-white px-7 py-3 rounded-xl font-bold hover:bg-brand-point transition-colors">
                홈페이지로 돌아가기
              </Link>
            </div>
          ) : (
            // ─── 메인 흐름 ───
            <div className="space-y-5 md:space-y-7">
              {/* 회원 정보 카드 (read-only) */}
              <div className="bg-white/95 rounded-3xl shadow-xl p-5 md:p-7">
                <h3 className="text-xs md:text-sm font-black tracking-[0.2em] text-brand-point uppercase mb-3">My Profile</h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm">
                  <div>
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">이름</p>
                    <p className="font-black text-brand-black">{data.user?.name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">성별</p>
                    <p className="font-black text-brand-black">{data.user?.gender || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">생년월일</p>
                    <p className="font-bold text-gray-700 tabular-nums">{data.user?.birth_date || "-"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">연락처</p>
                    <p className="font-bold text-gray-700 tabular-nums">{data.user?.phone || "-"}</p>
                  </div>
                </div>
              </div>

              {/* 파티 선택 */}
              {data.parties.length > 1 && (
                <div className="bg-white/95 rounded-3xl shadow-xl p-5 md:p-6">
                  <label className="block text-xs md:text-sm font-black text-gray-500 mb-2">참가 파티 선택</label>
                  <select
                    value={selectedPartyId ?? ""}
                    onChange={e => setSelectedPartyId(e.target.value)}
                    aria-label="참가 파티 선택"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-bold focus:ring-2 focus:ring-brand-point outline-none"
                  >
                    {data.parties.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title} · {p.dateString}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 투표 영역 — 상태별 분기 */}
              {selectedParty && (
                <div className="bg-white/95 rounded-3xl shadow-xl p-6 md:p-8">
                  <h2 className="text-lg md:text-xl font-black text-brand-black mb-1">{selectedParty.title}</h2>
                  <p className="text-xs md:text-sm text-gray-500 font-medium mb-5">{selectedParty.dateString}</p>

                  {selectedParty.voting_status === "closed" && (
                    <div className="text-center py-6 md:py-8">
                      <p className="text-base md:text-lg font-black text-brand-black mb-2">투표가 시작되지 않았습니다</p>
                      <p className="text-xs md:text-sm text-gray-500">파티 종료 후 관리자가 투표를 활성화하면 안내드립니다.</p>
                    </div>
                  )}

                  {selectedParty.voting_status === "open" && selectedParty.my_vote && !editing && (
                    // === 투표 완료 안내 뷰 — 결과창과 완전히 분리된 독립 섹션 ===
                    <div>
                      <div className="text-center py-5 md:py-7 bg-brand-point/10 border border-brand-point/30 rounded-2xl mb-5 md:mb-6">
                        <p className="text-xl md:text-3xl font-black text-brand-point mb-2 break-keep">
                          투표가 완료되었습니다.
                        </p>
                        <p className="text-xs md:text-sm font-bold text-gray-600 break-keep">
                          결과 발표 전까지 [수정하기] 로 자유롭게 다시 투표하실 수 있습니다.
                        </p>
                      </div>
                      {/* 내 투표 요약 — 본인 식별 + 선택한 이성 번호(성별 결합 식별자) */}
                      <div className="bg-gray-50 rounded-2xl p-5 md:p-6 mb-5 md:mb-6 space-y-3 md:space-y-4">
                        <div>
                          <p className="text-[11px] md:text-xs font-black text-gray-400 tracking-[0.15em] mb-1.5">나의 부여 번호</p>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-sm md:text-base ${genderBadge.bg} ${genderBadge.text}`}>
                            {genderKor || "성별 미설정"} {selectedParty.my_vote.voter_number}번
                          </span>
                        </div>
                        <div>
                          <p className="text-[11px] md:text-xs font-black text-gray-400 tracking-[0.15em] mb-1.5">내가 선택한 번호</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedParty.my_vote.picks.map((p, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border-2 border-brand-point/30 font-black text-sm md:text-base text-brand-black">
                                <span className="text-gray-400 text-xs">{oppositeKor === "이성" ? "" : oppositeKor}</span>
                                {p}번
                              </span>
                            ))}
                            {selectedParty.my_vote.picks.length === 0 && (
                              <span className="text-xs text-gray-400 font-bold">선택 정보 없음</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* [수정하기] — 어울림 포인트 컬러(#008080) 배경 + 흰색 글자 */}
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="w-full bg-[#008080] text-white py-4 rounded-xl font-black text-base md:text-lg hover:brightness-110 active:scale-[0.99] transition-all shadow-sm"
                      >
                        수정하기
                      </button>
                    </div>
                  )}

                  {selectedParty.voting_status === "open" && (!selectedParty.my_vote || editing) && (
                    <form onSubmit={handleSubmitVote} className="space-y-5">
                      <div>
                        <label className="block text-xs font-black text-gray-500 mb-2">
                          STEP 1. 본인의 부여 번호
                        </label>
                        {/* 성별 배지 + 번호 입력 — 모바일에서 자연 wrap, 데스크탑은 한 줄 */}
                        <div className="flex items-stretch flex-wrap gap-2">
                          {/* 성별 식별 칩 — DB user_gender 기반 상시 노출, 번호와 결합해 '남자 N번' / '여자 N번' 구분 */}
                          <span
                            className={`inline-flex items-center justify-center px-3.5 py-2 rounded-xl ring-1 font-black text-sm whitespace-nowrap flex-shrink-0 ${genderBadge.bg} ${genderBadge.text} ${genderBadge.ring}`}
                            aria-label={`내 성별: ${userGender || "미설정"}`}
                          >
                            {genderKor || "성별 미설정"}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={myNumber}
                            onChange={e => setMyNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
                            placeholder={genderKor ? `부여받은 ${genderKor} 3번이라면 '3'만 입력` : "예: 3"}
                            aria-label={`${genderKor || ""} 본인 부여 번호`}
                            className="flex-1 min-w-[140px] px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-brand-point outline-none font-bold text-lg tabular-nums text-center"
                            required
                          />
                        </div>
                        {myNumber && genderKor && (
                          <p className="text-[11px] md:text-xs text-gray-500 mt-2 font-bold break-keep">
                            내 식별: <span className={genderBadge.text}>{genderKor} {myNumber}번</span>
                            <span className="text-gray-300 mx-1.5">|</span>
                            <span className="text-gray-400">'{oppositeKor} {myNumber}번' 과 별도 참가자로 인식됩니다</span>
                          </p>
                        )}
                      </div>

                      {myNumber && (
                        <div>
                          <label className="block text-xs font-black text-gray-500 mb-2">
                            STEP 2. 마음에 드는 {oppositeKor === "이성" ? "이성" : `이성 (${oppositeKor})`} 1~2명 선택
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="number" min={1} max={99}
                              value={pick1}
                              onChange={e => setPick1(e.target.value.replace(/\D/g, "").slice(0, 2))}
                              placeholder="첫 번째"
                              className="px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-brand-point outline-none font-bold text-base tabular-nums text-center"
                            />
                            <input
                              type="number" min={1} max={99}
                              value={pick2}
                              onChange={e => setPick2(e.target.value.replace(/\D/g, "").slice(0, 2))}
                              placeholder="두 번째 (선택)"
                              className="px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-brand-point outline-none font-bold text-base tabular-nums text-center"
                            />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-2">두 번째는 선택사항입니다 — 한 명만 선택해도 됩니다.</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={submitting || !myNumber}
                        className="w-full bg-brand-black text-white py-4 rounded-xl font-black text-base hover:bg-brand-point transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {submitting ? "저장 중..." : selectedParty.my_vote ? "투표 수정 저장" : "투표 제출"}
                      </button>
                      {selectedParty.my_vote && (
                        <button
                          type="button"
                          onClick={() => {
                            // 취소 — 저장 전 값으로 되돌리고 완료 안내 뷰로 복귀
                            const mv = selectedParty.my_vote;
                            if (mv) {
                              setMyNumber(String(mv.voter_number));
                              setPick1(mv.picks[0] ? String(mv.picks[0]) : "");
                              setPick2(mv.picks[1] ? String(mv.picks[1]) : "");
                            }
                            setEditing(false);
                          }}
                          className="block mx-auto text-xs md:text-sm text-gray-500 hover:text-brand-black font-bold underline-offset-4 hover:underline transition-colors"
                        >
                          수정 취소 — 이전 투표로 돌아가기
                        </button>
                      )}
                    </form>
                  )}

                  {selectedParty.voting_status === "finalized" && (
                    <div>
                      {!result ? (
                        <p className="text-center py-6 text-sm text-gray-500">결과 불러오는 중...</p>
                      ) : result.matched && result.matches && result.matches.length > 0 ? (
                        // === 매칭 성공 — 헤드라인 "[성별] [번호]번과 매칭" + 이름·연락처 카드 ===
                        <div className="space-y-5 md:space-y-6">
                          {result.matches.map((m, idx) => (
                            <div key={idx}>
                              {/* 헤드라인 — 성별/번호 동적 노출 (한 줄 break-keep 으로 모바일 자연 줄바꿈) */}
                              <div className="text-center mb-3 md:mb-4 py-5 md:py-6 bg-brand-point/10 border border-brand-point/30 rounded-2xl">
                                <p className="text-base md:text-xl font-black text-brand-black break-keep leading-relaxed">
                                  <span className="text-brand-point">축하합니다!</span>{" "}
                                  <span className="text-brand-point font-black">{m.gender} {m.voter_number}번</span>과 매칭이 되었습니다!
                                </p>
                              </div>
                              {/* 상대방 카드 — 이름 + 연락처 (생년월일/성별 등 부가 정보 제외, 시인성 최우선) */}
                              <div className="bg-gradient-to-br from-brand-point/5 to-white border-2 border-brand-point/30 rounded-2xl p-5 md:p-7 shadow-md">
                                <p className="text-[11px] font-black text-brand-point tracking-[0.2em] uppercase mb-2">Matched Partner</p>
                                <h3 className="text-xl md:text-3xl font-black text-brand-black mb-4 md:mb-5 break-keep">{m.name}</h3>
                                <div className="pt-3 border-t border-gray-200/70">
                                  <p className="text-[11px] md:text-xs text-gray-400 font-bold mb-1">연락처</p>
                                  <a
                                    href={`tel:${m.phone}`}
                                    className="font-black text-brand-point text-lg md:text-2xl tabular-nums hover:underline break-all"
                                  >
                                    {m.phone || "-"}
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        // === 매칭 실패 — 차분한 안내, 개인정보 카드 절대 노출 X ===
                        <div className="text-center py-6 md:py-8">
                          <p className="text-base md:text-lg font-black text-brand-black mb-3 leading-relaxed break-keep">
                            아쉽게도 매칭이 되지 못했네요.
                          </p>
                          <p className="text-sm md:text-base text-gray-600 mb-7 leading-relaxed break-keep">
                            오늘 보낸 즐거운 시간이 조만간 더 좋은 인연으로 이어질 발판이 되기를 바랍니다.
                          </p>
                          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                            <Link href="/" className="inline-block bg-brand-black text-white px-7 py-3 rounded-xl font-bold hover:bg-brand-point transition-colors">
                              홈페이지로 돌아가기
                            </Link>
                            <Link href="/#apply" className="inline-block bg-white border-2 border-brand-black text-brand-black px-7 py-3 rounded-xl font-bold hover:bg-brand-point hover:border-brand-point hover:text-white transition-all">
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

      <Footer />
    </div>
  );
}
