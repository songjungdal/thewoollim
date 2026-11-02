"use client";

/**
 * 관리자 [인증 심사] 탭 — 텔레그램 알림 설정 카드 (docs/specs/verification-telegram.md 3장·10장, 서버 api/admin/notify-telegram.php).
 *  - 접기/펼치기. 알림 켜기/끄기(기본 꺼짐), 봇 토큰(저장 뒤에는 앞 4자리만 — 원문은 다시 받지 않음, [토큰 바꾸기]로만 새로 입력),
 *    [받는 사람 찾기] → 받을 사람 체크(봇에게 [시작]을 누른 운영자 개인 대화 또는 그룹방, 최대 5) → [저장],
 *    관리자 바로가기 주소(선택), [테스트 알림 보내기](받는 사람별 결과).
 *  - 텔레그램에는 이름·연락처 등 회원 개인정보를 보내지 않는다(성별·나이대·구분·건수만).
 */

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Send } from "lucide-react";

const API = "/api/admin/notify-telegram.php";
const MAX_RECIPIENTS = 5;   // 서버 TELEGRAM_MAX_RECIPIENTS 와 같음

type Chat = { id: string; title: string; type: string };
type Settings = {
  enabled: boolean; hasToken: boolean; tokenMasked: string; recipients: Chat[];
  adminUrl: string; lastSummaryDate: string; updatedBy: string | null; updatedAt: string | null;
};
type TestResult = { title: string; ok: boolean; error: string };

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-black transition-colors disabled:opacity-50 min-h-11 md:min-h-0 md:h-10";
const input = "h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base outline-none focus:border-brand-point focus:ring-2 focus:ring-brand-point md:h-10 md:text-sm";
const chatType = (t: string) => (t === "private" ? "개인" : t === "supergroup" ? "슈퍼그룹" : "그룹");

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
  const [chats, setChats] = useState<Chat[] | null>(null);   // [받는 사람 찾기] 결과 — 있으면 저장 때 체크한 사람으로 바꾼다
  const [chatMsg, setChatMsg] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adminUrl, setAdminUrl] = useState("");
  const [busy, setBusy] = useState<"" | "find" | "save" | "test" | "toggle">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

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

  const findChats = async () => {
    setBusy("find"); setMsg(null); setChats(null); setChatMsg(""); setTestResults([]);
    const d = await post({ action: "find_chats", token: tokenInputShown ? token.trim() : "" });
    setBusy("");
    if (!d?.ok) { setMsg({ ok: false, text: String(d?.error || "대화를 불러오지 못했습니다.") }); return; }
    const list = d.chats as Chat[];
    setChats(list);
    setChatMsg(String(d.message || ""));
    // 지금 받는 사람은 미리 체크, 없으면 찾은 사람이 하나뿐일 때 그 사람을 체크
    const current = new Set((s?.recipients ?? []).map(r => r.id));
    setChecked(new Set(list.filter(c => current.has(c.id)).map(c => c.id).concat(current.size === 0 && list.length === 1 ? [list[0].id] : [])));
  };

  const toggleChat = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else if (next.size < MAX_RECIPIENTS) next.add(id);
    return next;
  });

  const save = async () => {
    setBusy("save"); setMsg(null); setTestResults([]);
    const body: Record<string, unknown> = { action: "save", adminUrl: adminUrl.trim() };
    if (tokenInputShown && token.trim()) body.token = token.trim();
    if (chats) body.recipients = chats.filter(c => checked.has(c.id));
    const d = await post(body);
    setBusy("");
    if (!d?.ok) { setMsg({ ok: false, text: String(d?.error || "저장하지 못했습니다.") }); return; }
    setS(d.settings as Settings);
    setToken(""); setEditToken(false); setChats(null); setChecked(new Set());
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
    setBusy("test"); setMsg(null); setTestResults([]);
    const d = await post({ action: "test" });
    setBusy("");
    setTestResults(Array.isArray(d?.results) ? (d.results as TestResult[]) : []);
    setMsg(d?.ok ? { ok: true, text: "테스트 알림을 보냈습니다. 텔레그램을 확인해주세요." } : { ok: false, text: String(d?.error || "보내지 못했습니다.") });
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
          {s && s.recipients.length > 0 && <span className="truncate text-xs font-bold text-gray-500">· 받는 사람 {s.recipients.length}명</span>}
        </span>
        <ChevronDown size={18} className={`flex-shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && s && (
        <div className="space-y-4 border-t border-gray-100 p-4 md:p-5">
          {!ready && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">웹 루트 밖 데이터 폴더가 없어 설정을 저장할 수 없습니다.</p>}

          <ol className="list-decimal space-y-1 rounded-xl bg-gray-50 py-3 pl-8 pr-4 text-[13px] leading-relaxed text-gray-600 break-keep">
            <li>텔레그램에서 <b>@BotFather</b> 검색 → <code>/newbot</code> → 봇 이름 입력 → 받은 <b>봇 토큰</b>을 복사</li>
            <li>알림 받을 분마다 텔레그램에서 방금 만든 <b>봇을 검색해 대화를 열고 [시작]</b>(<code>/start</code>)을 누르기 (여러 명 가능. 그룹방에서 받으려면 봇을 초대한 뒤 /start)</li>
            <li>아래에 토큰을 붙여넣고 <b>[받는 사람 찾기]</b> → 받을 사람 체크 → <b>[저장]</b> → <b>[켜기]</b> → <b>[테스트 알림 보내기]</b></li>
          </ol>
          <p className="text-xs text-gray-500 break-keep">[시작]을 누른 지 24시간 안에 [받는 사람 찾기]를 눌러야 목록에 나와요. 알림에는 회원 이름·연락처·이메일·사진은 들어가지 않고 성별·나이대·구분만 들어갑니다. 22:00~08:00 알림은 무음으로 갑니다.</p>

          {/* 켜기/끄기 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-700">알림 {s.enabled ? "켜짐" : "꺼짐"}{s.recipients.length === 0 && " — 토큰과 받는 사람을 저장하면 켤 수 있어요"}</p>
            <button type="button" onClick={toggle} disabled={!!busy || (!s.enabled && (!s.hasToken || s.recipients.length === 0))}
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

          {/* 받는 사람 */}
          <div>
            <p className="mb-1 text-sm font-black text-brand-black">받는 사람 <span className="text-xs font-bold text-gray-500">(최대 {MAX_RECIPIENTS}명)</span></p>
            {s.recipients.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5" data-testid="telegram-recipients">
                {s.recipients.map(r => (
                  <li key={r.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm font-bold text-gray-800">
                    <span className="min-w-0 truncate">{r.title || r.id}</span>
                    <span className="flex-shrink-0 text-xs font-medium text-gray-500">{chatType(r.type)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-sm text-gray-700" data-testid="telegram-recipients-empty">아직 없음</p>
            )}
            <button type="button" onClick={findChats} disabled={!!busy || (tokenInputShown && !token.trim() && !s.hasToken)}
              className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} data-testid="telegram-find">
              {busy === "find" && <Loader2 size={14} className="animate-spin" />} 받는 사람 찾기
            </button>
            {chats && chats.length === 0 && <p className="mt-2 text-sm font-bold text-amber-700 break-keep" data-testid="telegram-no-chat">{chatMsg}</p>}
            {chats && chats.length > 0 && (
              <div className="mt-2 flex flex-col gap-2" data-testid="telegram-chats">
                {chats.map(c => (
                  <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-bold ${checked.has(c.id) ? "border-brand-black bg-gray-50" : "border-gray-200"}`}>
                    <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggleChat(c.id)} className="h-4 w-4 accent-brand-point" />
                    <span className="min-w-0 truncate">{c.title}</span>
                    <span className="ml-auto flex-shrink-0 text-xs font-medium text-gray-500">{chatType(c.type)}</span>
                  </label>
                ))}
                <p className="text-xs text-gray-500 break-keep">체크한 사람으로 바뀝니다. [저장]을 눌러야 반영돼요.</p>
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
          {testResults.length > 0 && (
            <ul className="space-y-1 text-sm" data-testid="telegram-test-results">
              {testResults.map((r, i) => (
                <li key={i} className={`break-keep ${r.ok ? "text-emerald-700" : "text-red-600"}`}>{r.title}: {r.ok ? "받음" : `실패 (${r.error})`}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={test} disabled={!!busy || !s.hasToken || s.recipients.length === 0} className={`${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} data-testid="telegram-test">
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
