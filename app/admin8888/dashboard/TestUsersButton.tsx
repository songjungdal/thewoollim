"use client";

/**
 * 관리자 [회원] 탭 — [테스트 회원 만들기].
 *  - 비밀번호를 한 번 입력받아 api/admin/test-users.php 로 보낸다.
 *  - 서버가 a1~a20·b1~b20@naver.com 중 DB에 없는 계정만 만든다. 이미 있는 계정은 건드리지 않는다.
 *  - 비밀번호는 이 컴포넌트 상태에만 잠시 두고, 요청이 끝나면 바로 지운다.
 */

import { useState } from "react";
import { TEST_USER_MAX } from "../../lib/testUsers";

export default function TestUsersButton({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setOpen(false); setPassword(""); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/test-users.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => null);
      if (!d?.ok) { setError(d?.error || "테스트 회원 만들기에 실패했습니다."); return; }
      setResult(`새로 만듦 ${d.created}개 / 이미 있음 ${d.existing}개`);
      close();
      await onCreated();
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도해주세요.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full md:w-auto">
      <button
        type="button"
        onClick={() => { setResult(null); setOpen(true); }}
        className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 min-h-11 md:min-h-0"
      >
        테스트 회원 만들기
      </button>
      {result && (
        <p role="status" data-testid="test-users-result" className="text-xs font-bold text-emerald-700">{result}</p>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="test-users-title">
          <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="test-users-title" className="text-lg font-black">테스트 회원 만들기</h3>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              a1~a{TEST_USER_MAX}(남)·b1~b{TEST_USER_MAX}(여)@naver.com 중 <b>아직 없는 계정만</b> 만듭니다.
              이미 있는 계정은 바꾸지 않습니다. 새 계정은 모두 아래 비밀번호로 로그인합니다.
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
            {error && <p role="alert" className="mt-2 text-sm font-bold text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={close} disabled={busy}
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
    </div>
  );
}
