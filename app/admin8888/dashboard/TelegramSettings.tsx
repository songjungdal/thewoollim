"use client";

/**
 * 관리자 [인증 심사] 탭 — 텔레그램 알림 설정 카드 (docs/specs/verification-telegram.md 3장, 서버 api/admin/notify-telegram.php).
 *  - 접기/펼치기. 알림 켜기/끄기(기본 꺼짐), 봇 토큰(저장 뒤에는 앞 4자리만 — 원문은 다시 받지 않음, [토큰 바꾸기]로만 새로 입력),
 *    [그룹 찾기] → 그룹 선택 → [저장], 관리자 바로가기 주소(선택), [테스트 알림 보내기].
 *  - 텔레그램에는 이름·연락처 등 개인정보를 보내지 않는다(성별·나이대·구분·건수만).
 */

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Send } from "lucide-react";

const API = "/api/admin/notify-telegram.php";

type Settings = {
  enabled: boolean; hasToken: boolean; tokenMasked: string; chatId: string; chatTitle: string;
  adminUrl: string; lastSummaryDate: string; updatedBy: string | null; updatedAt: string | null;
};
type Group = { id: string; title: string; type: string };

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black transition-colors disabled:opacity-50 min-h-11 md:min-h-0 md:h-10";
const input = "h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point md:h-10 md:text-sm";

async function post(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => null);
}

export default function TelegramSettings() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [ready, setReady] = useState(true);
  const [token, setToken] = useState("");
  const [editToken, setEditToken] = useState(false);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupMsg, setGroupMsg] = useState("");
  const [picked, setPicked] = useState<Group | null>(null);
  const [adminUrl, setAdminUrl] = useState("");
  const [busy, setBusy] = useState<"" | "find" | "save" | "test" | "toggle">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(API, { credentials: "include", cache: "no-store" }).then(x => x.json()).catch(() => null).then(r => {
      if (cancelled || !r?.ok) return;
      setS(r.settings as Settings);
      setReady(!!r.ready);
      setAdminUrl((r.settings as Settings).adminUrl);
    });
    return () => { cancelled = true; };
  }, []);

  const tokenInputShown = !s?.hasToken || editToken;

  const findGroups = async () => {
    setBusy("find"); setMsg(null); setGroups(null); setGroupMsg("");
    const d = await post({ action: "find_groups", token: tokenInputShown ? token.trim() : "" });
    setBusy("");
    if (!d?.ok) { setMsg({ ok: false, text: String(d?.error || "그룹을 불러오지 못했습니다.") }); return; }
    setGroups(d.groups as Group[]);
    setGroupMsg(String(d.message || ""));
    setPicked((d.groups as Group[]).length === 1 ? (d.groups as Group[])[0] : null);
  };

  const save = async () => {
    setBusy("save"); setMsg(null);
    const body: Record<string, unknown> = { action: "save", adminUrl: adminUrl.trim() };
    if (tokenInputShown && token.trim()) body.token = token.trim();
    if (picked) { body.chatId = picked.id; body.chatTitle = picked.title; }
    const d = await post(body);
    setBusy("");
    if (!d?.ok) { setMsg({ ok: false, text: String(d?.error || "저장하지 못했습니다.") }); return; }
    setS(d.settings as Settings);
    setToken(""); setEditToken(false); setGroups(null); setPicked(null);
    setMsg({ ok: true, text: "저장했습니다." });
  };

  const toggle = async () => {
    if (!s) return;
    setBusy("toggle"); setMsg(null);
    const d = await post({ action: "toggle", on: !s.enabled });
    setBusy("");
    if (!d?.ok) { setMsg({ ok: false, text: String(d?.error || "저장하지 못했습니다.") }); return; }
    setS(d.settings as Settings);
  };

  const test = async () => {
    setBusy("test"); setMsg(null);
    const d = await post({ action: "test" });
    setBusy("");
    setMsg(d?.ok ? { ok: true, text: "테스트 알림을 보냈습니다. 그룹방을 확인해주세요." } : { ok: false, text: String(d?.error || "보내지 못했습니다.") });
  };

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white" data-testid="telegram-card">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left md:p-5" data-testid="telegram-toggle-open">
        <span className="flex min-w-0 flex-wrap items-center gap-2 font-black text-brand-black">
          <Send size={18} className="text-brand-point-ink" aria-hidden /> 텔레그램 알림 설정
          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${s?.enabled ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"}`} data-testid="telegram-state">
            {s?.enabled ? "켜짐" : "꺼짐"}
          </span>
          {s?.chatTitle && <span className="truncate text-xs font-bold text-gray-500">· {s.chatTitle}</span>}
        </span>
        <ChevronDown size={18} className={`flex-shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && s && (
        <div className="space-y-4 border-t border-gray-100 p-4 md:p-5">
          {!ready && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">웹 루트 밖 데이터 폴더가 없어 설정을 저장할 수 없습니다.</p>}

          <ol className="list-decimal space-y-1 rounded-xl bg-gray-50 py-3 pl-8 pr-4 text-[13px] leading-relaxed text-gray-600 break-keep">
            <li>텔레그램에서 <b>@BotFather</b> 검색 → <code>/newbot</code> → 봇 이름 입력 → 받은 <b>봇 토큰</b>을 복사</li>
            <li>운영자 그룹방을 만들고(또는 기존 방) 방금 만든 봇을 <b>초대</b></li>
            <li>그룹방에서 <code>/start</code> 를 한 번 입력</li>
            <li>아래에 토큰을 붙여넣고 <b>[그룹 찾기]</b> → 그룹 선택 → <b>[저장]</b> → <b>[테스트 알림 보내기]</b></li>
          </ol>
          <p className="text-xs text-gray-500 break-keep">알림에는 이름·연락처·이메일·사진은 들어가지 않고 성별·나이대·구분만 들어갑니다. 22:00~08:00 알림은 무음으로 갑니다.</p>

          {/* 켜기/끄기 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-700">알림 {s.enabled ? "켜짐" : "꺼짐"}{!s.chatId && " — 토큰과 그룹을 저장하면 켤 수 있어요"}</p>
            <button type="button" onClick={toggle} disabled={!!busy || (!s.enabled && (!s.hasToken || !s.chatId))}
              className={`${btn} ${s.enabled ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" : "bg-brand-black text-white hover:bg-brand-point hover:text-black"}`}
              data-testid="telegram-switch">
              {busy === "toggle" && <Loader2 size={14} className="animate-spin" />} {s.enabled ? "끄기" : "켜기"}
            </button>
          </div>

          {/* 토큰 */}
          <div>
            <p className="mb-1 text-sm font-black text-brand-black">봇 토큰</p>
            {tokenInputShown ? (
              <div className="flex flex-col gap-2 md:flex-row">
                <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="123456789:ABC… (BotFather 가 준 토큰)"
                  className={input} data-testid="telegram-token" />
                {editToken && <button type="button" onClick={() => { setEditToken(false); setToken(""); }} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>취소</button>}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm text-gray-700" data-testid="telegram-token-masked">{s.tokenMasked}</span>
                <button type="button" onClick={() => setEditToken(true)} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} data-testid="telegram-change-token">토큰 바꾸기</button>
              </div>
            )}
          </div>

          {/* 그룹 */}
          <div>
            <p className="mb-1 text-sm font-black text-brand-black">그룹방</p>
            <p className="mb-2 text-sm text-gray-700">연결된 그룹: <b data-testid="telegram-chat-title">{s.chatTitle || "없음"}</b></p>
            <button type="button" onClick={findGroups} disabled={!!busy || (tokenInputShown && !token.trim() && !s.hasToken)}
              className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} data-testid="telegram-find">
              {busy === "find" && <Loader2 size={14} className="animate-spin" />} 그룹 찾기
            </button>
            {groups && groups.length === 0 && <p className="mt-2 text-sm font-bold text-amber-700 break-keep" data-testid="telegram-no-group">{groupMsg}</p>}
            {groups && groups.length > 0 && (
              <div className="mt-2 flex flex-col gap-2" data-testid="telegram-groups">
                {groups.map(g => (
                  <label key={g.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-bold ${picked?.id === g.id ? "border-brand-black bg-gray-50" : "border-gray-200"}`}>
                    <input type="radio" name="tg-group" checked={picked?.id === g.id} onChange={() => setPicked(g)} className="accent-brand-point" />
                    <span className="min-w-0 truncate">{g.title}</span>
                    <span className="ml-auto flex-shrink-0 text-xs font-medium text-gray-500">{g.type === "supergroup" ? "슈퍼그룹" : "그룹"} · {g.id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 관리자 주소 */}
          <label className="block">
            <span className="mb-1 block text-sm font-black text-brand-black">관리자 화면 바로가기 주소 (선택)</span>
            <input type="url" value={adminUrl} onChange={e => setAdminUrl(e.target.value)} placeholder="비워두면 '관리자 > 인증 심사에서 확인'"
              className={input} data-testid="telegram-admin-url" />
          </label>

          {msg && <p className={`text-sm font-bold break-keep ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="status" data-testid="telegram-msg">{msg.text}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={test} disabled={!!busy || !s.hasToken || !s.chatId} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} data-testid="telegram-test">
              {busy === "test" && <Loader2 size={14} className="animate-spin" />} 테스트 알림 보내기
            </button>
            <button type="button" onClick={save} disabled={!!busy || !ready} className={`${btn} bg-brand-black text-white hover:bg-brand-point hover:text-black`} data-testid="telegram-save">
              {busy === "save" && <Loader2 size={14} className="animate-spin" />} 저장
            </button>
          </div>
          {s.updatedAt && <p className="text-xs text-gray-500">마지막 변경: {s.updatedAt} ({s.updatedBy}){s.lastSummaryDate && ` · 마지막 요약 ${s.lastSummaryDate}`}</p>}
        </div>
      )}
    </div>
  );
}
