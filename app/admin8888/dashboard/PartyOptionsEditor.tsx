"use client";

/**
 * 관리자 파티 등록 모달 — [기본 정보] 탭의 "참가 구성" 편집기 (솔로파티 · [참가 구성 사용]).
 * 명세 7-1: 회차 목록 [이름, 시작 시각, 남 정원, 여 정원, 삭제] / 참가 항목 [이름, 포함 회차, 남 가격, 여 가격, 위로/아래로, 삭제]
 * 신청자가 있는 회차·항목은 삭제를 막고 "신청자 N명"을 보여준다. 신청자가 있는 항목은 포함 회차도 바꿀 수 없다.
 * 규칙·변환: app/lib/partyOptions.ts (서버 api/lib.php sanitizePartyOptions 가 최종 판정)
 */
import { ArrowUp, ArrowDown, Trash2, Plus, Wand2 } from "lucide-react";
import {
  OPTION_LIMITS, optionSessionsSummary, defaultOptionsDraft, newDraftKey,
  type OptionsDraft, type SessionDraft, type OptionDraft, type OptionApplicants,
} from "../../lib/partyOptions";

const inputCls = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none";
const smallBtn = "inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const digits = (v: string) => v.replace(/[^\d]/g, "");

export default function PartyOptionsEditor({ value, onChange, applicants }: {
  value: OptionsDraft;
  onChange: (next: OptionsDraft) => void;
  applicants: OptionApplicants | null;   // 수정 모드 — 저장된 회차·항목의 신청자 수
}) {
  const { sessions, options } = value;
  const sessionApplicants = (key: string) => {
    const a = applicants?.sessions?.[key];
    return a ? a.male + a.female : 0;
  };
  const optionApplicants = (key: string) => applicants?.options?.[key] ?? 0;

  const setSessions = (next: SessionDraft[]) => {
    const keys = new Set(next.map(s => s.key));
    // 지운 회차는 항목의 포함 회차에서도 뺀다
    onChange({ sessions: next, options: options.map(o => ({ ...o, sessionKeys: o.sessionKeys.filter(k => keys.has(k)) })) });
  };
  const setOptions = (next: OptionDraft[]) => onChange({ sessions, options: next });
  const patchSession = (i: number, patch: Partial<SessionDraft>) => setSessions(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const patchOption = (i: number, patch: Partial<OptionDraft>) => setOptions(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const fillDefault = () => {
    if ((sessions.length > 0 || options.length > 0)
      && !confirm("지금 입력한 회차·참가 항목을 지우고 기본 구성(1부·2부 / 1부·2부·1부+2부)으로 채웁니다. 계속하시겠습니까?")) return;
    const hasApplicants = sessions.some(s => sessionApplicants(s.key) > 0) || options.some(o => optionApplicants(o.key) > 0);
    if (hasApplicants) { alert("신청자가 있는 회차·참가 항목이 있어 기본 구성으로 바꿀 수 없습니다."); return; }
    onChange(defaultOptionsDraft());
  };

  return (
    <div className="space-y-5" data-testid="party-options-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-gray-700">참가 구성 *</p>
        <button type="button" onClick={fillDefault} className={smallBtn}><Wand2 size={12} />기본 구성 넣기</button>
      </div>
      <p className="text-xs md:text-[13px] text-gray-600 leading-relaxed bg-brand-point/5 border-l-2 border-brand-point/40 pl-3 py-2 rounded-r-md">
        1부+2부처럼 여러 회차를 포함한 항목을 신청하면, 포함된 회차의 정원을 모두 차지합니다.
      </p>
      <p className="text-xs md:text-[13px] font-bold text-danger leading-relaxed" data-testid="options-lock-notice">
        신청자가 생기면 항목의 포함 회차를 바꿀 수 없습니다. 저장 전에 항목마다 포함 회차를 꼭 확인해주세요.
      </p>

      {/* 회차 */}
      <div>
        <p className="text-sm font-bold text-gray-700 mb-2">회차 <span className="text-gray-500 font-medium">· 시작 시각 순서로 저장됩니다 (24시간 형식, 예: 19:00)</span></p>
        {sessions.length === 0 && <p className="text-xs text-gray-500 py-2">회차가 없습니다. [기본 구성 넣기] 또는 [+ 회차 추가]로 입력해주세요.</p>}
        <div className="space-y-2">
          {sessions.map((s, i) => {
            const n = sessionApplicants(s.key);
            return (
              <div key={s.key} className="rounded-xl border border-gray-200 p-3 bg-white" data-testid="session-row">
                <div className="grid grid-cols-2 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] gap-2 items-end">
                  <label className="col-span-2 md:col-span-1">
                    <span className="block text-xs font-bold text-gray-500 mb-1">이름</span>
                    <input className={inputCls} value={s.name} maxLength={OPTION_LIMITS.name} placeholder="1부" aria-label={`회차 ${i + 1} 이름`}
                      onChange={e => patchSession(i, { name: e.target.value })} />
                  </label>
                  <label className="col-span-2 md:col-span-1">
                    <span className="block text-xs font-bold text-gray-500 mb-1">시작 시각</span>
                    <input className={inputCls} value={s.startTime} maxLength={5} placeholder="19:00" inputMode="numeric" aria-label={`회차 ${i + 1} 시작 시각`}
                      onChange={e => patchSession(i, { startTime: e.target.value.replace(/[^\d:]/g, "") })} />
                  </label>
                  <label>
                    <span className="block text-xs font-bold text-gray-500 mb-1">남 정원</span>
                    <input className={inputCls} value={s.maleStock} inputMode="numeric" placeholder="명" aria-label={`회차 ${i + 1} 남 정원`}
                      onChange={e => patchSession(i, { maleStock: digits(e.target.value) })} />
                  </label>
                  <label>
                    <span className="block text-xs font-bold text-gray-500 mb-1">여 정원</span>
                    <input className={inputCls} value={s.femaleStock} inputMode="numeric" placeholder="명" aria-label={`회차 ${i + 1} 여 정원`}
                      onChange={e => patchSession(i, { femaleStock: digits(e.target.value) })} />
                  </label>
                  <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-2">
                    {n > 0 && <span className="text-xs font-bold text-gray-600 whitespace-nowrap">신청자 {n}명</span>}
                    <button type="button" className={`${smallBtn} text-red-600`} disabled={n > 0} aria-label={`회차 ${i + 1} 삭제`}
                      title={n > 0 ? "신청자가 있는 회차는 삭제할 수 없습니다" : undefined}
                      onClick={() => setSessions(sessions.filter((_, j) => j !== i))}><Trash2 size={12} />삭제</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className={`${smallBtn} mt-2`} disabled={sessions.length >= OPTION_LIMITS.sessions}
          onClick={() => setSessions([...sessions, { key: newDraftKey(), name: "", startTime: "", maleStock: "", femaleStock: "" }])}>
          <Plus size={12} />회차 추가 <span className="text-gray-500 font-medium">({sessions.length}/{OPTION_LIMITS.sessions})</span>
        </button>
      </div>

      {/* 참가 항목 */}
      <div>
        <p className="text-sm font-bold text-gray-700 mb-2">참가 항목 <span className="text-gray-500 font-medium">· 상세페이지에 이 순서로 나옵니다</span></p>
        {options.length === 0 && <p className="text-xs text-gray-500 py-2">참가 항목이 없습니다. [기본 구성 넣기] 또는 [+ 항목 추가]로 입력해주세요.</p>}
        <div className="space-y-2">
          {options.map((o, i) => {
            const n = optionApplicants(o.key);
            return (
              <div key={o.key} className="rounded-xl border border-gray-200 p-3 bg-white" data-testid="option-row">
                <div className="grid grid-cols-2 md:grid-cols-[1.2fr_0.9fr_0.9fr] gap-2">
                  <label className="col-span-2 md:col-span-1">
                    <span className="block text-xs font-bold text-gray-500 mb-1">이름</span>
                    <input className={inputCls} value={o.name} maxLength={OPTION_LIMITS.name} placeholder="1부+2부" aria-label={`항목 ${i + 1} 이름`}
                      onChange={e => patchOption(i, { name: e.target.value })} />
                  </label>
                  <label>
                    <span className="block text-xs font-bold text-gray-500 mb-1">남 가격 (원)</span>
                    <input className={inputCls} value={o.priceMale} inputMode="numeric" placeholder="원" aria-label={`항목 ${i + 1} 남 가격`}
                      onChange={e => patchOption(i, { priceMale: digits(e.target.value) })} />
                  </label>
                  <label>
                    <span className="block text-xs font-bold text-gray-500 mb-1">여 가격 (원)</span>
                    <input className={inputCls} value={o.priceFemale} inputMode="numeric" placeholder="원" aria-label={`항목 ${i + 1} 여 가격`}
                      onChange={e => patchOption(i, { priceFemale: digits(e.target.value) })} />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-xs font-bold text-gray-500">포함 회차</span>
                  {sessions.length === 0 && <span className="text-xs text-gray-500">회차를 먼저 추가해주세요</span>}
                  {sessions.map((s, si) => (
                    <label key={s.key} className={`inline-flex items-center gap-1.5 text-sm font-bold min-h-[32px] ${n > 0 ? "text-gray-500" : "text-gray-800 cursor-pointer"}`}>
                      <input type="checkbox" className="w-4 h-4 accent-black" disabled={n > 0}
                        checked={o.sessionKeys.includes(s.key)} aria-label={`항목 ${i + 1} 포함 회차 ${s.name || `회차 ${si + 1}`}`}
                        onChange={e => patchOption(i, {
                          sessionKeys: e.target.checked
                            ? sessions.map(x => x.key).filter(k => k === s.key || o.sessionKeys.includes(k))
                            : o.sessionKeys.filter(k => k !== s.key),
                        })} />
                      {s.name || `회차 ${si + 1}`}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs font-bold text-gray-700" data-testid="option-sessions-summary">{optionSessionsSummary(value, o)}</p>
                {n > 0 && <p className="mt-1 text-xs text-gray-500">신청자가 있어 포함 회차는 바꿀 수 없습니다. 이름·가격은 바꿀 수 있고, 가격은 이후 결제부터 적용됩니다.</p>}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                  {n > 0 && <span className="text-xs font-bold text-gray-600 whitespace-nowrap mr-1">신청자 {n}명</span>}
                  <button type="button" className={smallBtn} disabled={i === 0} aria-label={`항목 ${i + 1} 위로`} onClick={() => setOptions(move(options, i, i - 1))}><ArrowUp size={12} />위로</button>
                  <button type="button" className={smallBtn} disabled={i === options.length - 1} aria-label={`항목 ${i + 1} 아래로`} onClick={() => setOptions(move(options, i, i + 1))}><ArrowDown size={12} />아래로</button>
                  <button type="button" className={`${smallBtn} text-red-600`} disabled={n > 0} aria-label={`항목 ${i + 1} 삭제`}
                    title={n > 0 ? "신청자가 있는 항목은 삭제할 수 없습니다" : undefined}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}><Trash2 size={12} />삭제</button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className={`${smallBtn} mt-2`} disabled={options.length >= OPTION_LIMITS.options}
          onClick={() => setOptions([...options, { key: newDraftKey(), name: "", sessionKeys: [], priceMale: "", priceFemale: "" }])}>
          <Plus size={12} />항목 추가 <span className="text-gray-500 font-medium">({options.length}/{OPTION_LIMITS.options})</span>
        </button>
      </div>
    </div>
  );
}
