"use client";

/**
 * 관리자 [회원 관리] 탭 — 테스트 회원 도구 (서버: api/admin/test-users.php).
 *  - [테스트 회원 만들기]: 비밀번호를 한 번 입력받아 a1~a20·b1~b20@naver.com 중 DB에 없는 계정만 만든다.
 *    비밀번호는 이 컴포넌트 상태에만 잠시 두고, 요청이 끝나면 바로 지운다.
 *  - [테스트 회원 프로필 다시 섞기]: 테스트 회원의 이름·직업·생년월일·MBTI·관심사를 무작위로 다시 정한다.
 *  - [테스트 회원 삭제]: 테스트 회원만 목록에 보이고, 한 명씩 또는 골라서(전체 선택) 삭제한다.
 *    취소되지 않은 예약이 있으면 "예약 N건이 있습니다" 경고 후 진행한다.
 */

import { useMemo, useState } from "react";
import { isTestUser, TEST_USER_MAX } from "../../lib/testUsers";

type Member = { email: string; name: string };

const API = "/api/admin/test-users.php";

async function post(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

/** a1, a2 … a20, b1 … b20 순서 */
function testOrder(email: string): number {
  const m = /^([ab])(\d+)@/.exec(email.toLowerCase());
  return m ? (m[1] === "a" ? 0 : 100) + Number(m[2]) : 999;
}

const btnCls = "px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 min-h-11 md:min-h-0 md:h-10";

export default function TestUsersTools({ users, onChanged }: { users: Member[]; onChanged: () => void | Promise<void> }) {
  const testMembers = useMemo(
    () => users.filter(u => isTestUser(u.email)).sort((a, b) => testOrder(a.email) - testOrder(b.email)),
    [users],
  );

  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 만들기
  const [createOpen, setCreateOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // 삭제
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const closeCreate = () => { setCreateOpen(false); setPassword(""); setCreateError(null); };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setCreateError("비밀번호는 8자 이상이어야 합니다."); return; }
    setBusy(true); setCreateError(null);
    try {
      const d = await post({ action: "create", password });
      if (!d?.ok) { setCreateError(d?.error || "테스트 회원 만들기에 실패했습니다."); return; }
      setResult(`새로 만듦 ${d.created}개 / 이미 있음 ${d.existing}개`);
      closeCreate();
      await onChanged();
    } catch {
      setCreateError("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  const shuffle = async () => {
    if (busy || testMembers.length === 0) return;
    if (!confirm(`테스트 회원 ${testMembers.length}명의 이름·직업·생년월일·MBTI·관심사를 무작위로 다시 정합니다.\n이메일·비밀번호·성별·연락처는 그대로입니다.\n\n계속할까요?`)) return;
    setBusy(true);
    try {
      const d = await post({ action: "shuffle" });
      if (!d?.ok) { alert(d?.error || "프로필 다시 섞기에 실패했습니다."); return; }
      setResult(`프로필 다시 섞음 ${d.updated}명`);
      await onChanged();
    } catch {
      alert("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (emails: string[]) => {
    if (busy || emails.length === 0) return;
    setBusy(true);
    try {
      const c = await post({ action: "check", emails });
      if (!c?.ok) { alert(c?.error || "삭제 전 확인에 실패했습니다."); return; }
      const who = emails.length === 1
        ? `${testMembers.find(m => m.email === emails[0])?.name ?? ""} (${emails[0]})`
        : `테스트 회원 ${emails.length}명`;
      const msg = c.activeBookings > 0
        ? `예약 ${c.activeBookings}건이 있습니다.\n\n삭제하면 이 예약들을 [취소]와 같은 규칙으로 정리하고(정원 수 차감), 장바구니·예약을 함께 지웁니다.\n\n대상: ${who}\n이 작업은 되돌릴 수 없습니다. 삭제할까요?`
        : `정말로 삭제하시겠습니까?\n\n대상: ${who}\n이 작업은 되돌릴 수 없습니다.`;
      if (!confirm(msg)) return;
      const d = await post({ action: "delete", emails });
      if (!d?.ok) { alert(d?.error || "삭제에 실패했습니다."); return; }
      setResult(`삭제 ${d.deleted}명${d.cancelledBookings ? ` (예약 ${d.cancelledBookings}건 정리)` : ""}`);
      setSelected(prev => { const next = new Set(prev); emails.forEach(e => next.delete(e)); return next; });
      // 메인 페이지 '실시간 참여자'·남은 자리 등 다른 탭에 즉시 알림 (기존 회원 삭제·취소와 같은 채널)
      try {
        const ch = new BroadcastChannel("woollim_users");
        emails.forEach(email => ch.postMessage({ type: "deleted", email, at: Date.now() }));
        ch.close();
      } catch { }
      if (d.cancelledBookings) { try { new BroadcastChannel("woollim_party_counts").postMessage({ at: Date.now() }); } catch { } }
      await onChanged();
    } catch {
      alert("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const allChecked = testMembers.length > 0 && testMembers.every(m => selected.has(m.email));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(testMembers.map(m => m.email)));
  const toggle = (email: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(email)) next.delete(email); else next.add(email);
    return next;
  });
  const selectedEmails = testMembers.filter(m => selected.has(m.email)).map(m => m.email);

  return (
    <div className="flex flex-col gap-1 w-full md:w-auto">
      <div className="grid grid-cols-1 gap-2 md:flex md:items-center">
        <button type="button" className={btnCls} disabled={busy}
          onClick={() => { setResult(null); setCreateOpen(true); }}>
          테스트 회원 만들기
        </button>
        <button type="button" className={btnCls} disabled={busy || testMembers.length === 0} onClick={() => { setResult(null); shuffle(); }}>
          테스트 회원 프로필 다시 섞기
        </button>
        <button type="button" className={btnCls} disabled={busy || testMembers.length === 0}
          onClick={() => { setResult(null); setSelected(new Set()); setDeleteOpen(true); }}>
          테스트 회원 삭제
        </button>
      </div>
      {result && (
        <p role="status" data-testid="test-users-result" className="text-xs font-bold text-emerald-700">{result}</p>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="test-users-title">
          <form onSubmit={submitCreate} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="test-users-title" className="text-lg font-black">테스트 회원 만들기</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              a1~a{TEST_USER_MAX}(남)·b1~b{TEST_USER_MAX}(여)@naver.com 중 <b>아직 없는 계정만</b> 만듭니다.
              이미 있는 계정은 바꾸지 않습니다. 새 계정은 모두 아래 비밀번호로 로그인합니다.
              이름·직업·나이·MBTI·관심사는 무작위로 정해집니다.
            </p>
            <label className="mt-4 block text-sm font-bold text-gray-700">
              비밀번호 (8자 이상)
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                aria-label="테스트 회원 비밀번호"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-base md:text-sm font-medium focus:ring-2 focus:ring-brand-point focus:border-brand-point outline-none"
              />
            </label>
            {createError && <p role="alert" className="mt-2 text-sm font-bold text-red-600">{createError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeCreate} disabled={busy}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 min-h-11 md:min-h-0">
                취소
              </button>
              <button type="submit" disabled={busy}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 disabled:opacity-50 min-h-11 md:min-h-0">
                {busy ? "만드는 중…" : "만들기"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="test-users-delete-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl flex flex-col max-h-[85vh]">
            <h3 id="test-users-delete-title" className="text-lg font-black">테스트 회원 삭제</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              테스트 회원(a1~a{TEST_USER_MAX}·b1~b{TEST_USER_MAX}@naver.com)만 보입니다. 삭제하면 장바구니·예약도 함께 지우고,
              취소되지 않은 예약은 [취소]와 같은 규칙으로 정원 수를 뺍니다.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold text-gray-700 border-b border-gray-100 pb-2">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="테스트 회원 전체 선택" className="w-4 h-4" />
              전체 선택 ({testMembers.length}명)
            </label>
            <ul className="mt-1 overflow-y-auto divide-y divide-gray-100" data-testid="test-users-delete-list">
              {testMembers.map(m => (
                <li key={m.email} className="flex items-center gap-2 py-2">
                  <input type="checkbox" checked={selected.has(m.email)} onChange={() => toggle(m.email)}
                    aria-label={`${m.email} 선택`} className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm">
                    <b className="font-bold">{m.name}</b>
                    <span className="ml-2 text-gray-500 break-all">{m.email}</span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => remove([m.email])}
                    aria-label={`${m.email} 삭제`}
                    className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 disabled:opacity-50 flex-shrink-0 min-h-11 md:min-h-0">
                    삭제
                  </button>
                </li>
              ))}
              {testMembers.length === 0 && <li className="py-6 text-center text-sm text-gray-500">테스트 회원이 없습니다.</li>}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteOpen(false)} disabled={busy}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 min-h-11 md:min-h-0">
                닫기
              </button>
              <button type="button" disabled={busy || selectedEmails.length === 0} onClick={() => remove(selectedEmails)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 min-h-11 md:min-h-0">
                선택한 {selectedEmails.length}명 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
