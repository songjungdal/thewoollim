"use client";

/**
 * 관리자 파티 등록 모달 — [상세페이지 안내] 탭 편집기.
 * 화면 순서: 소개글(맨 위, 상세페이지에서는 참가 항목·버튼 바로 아래) → 사진 ①②③ → 진행 안내 → 소요 시간 → 사진 ④⑤
 * 구조·입력 제한·기본 내용: app/lib/partyDetailTemplates.ts (서버도 같은 제한을 강제)
 */
import { useState } from "react";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Trash2, Plus, ImageIcon, RotateCcw, Download } from "lucide-react";
import { PARTY_TYPE_LABELS, type PartyType } from "../../lib/data";
import {
  DETAIL_IMAGE_SLOT_LABELS, DETAIL_LIMITS, DEFAULT_ABOUT_TITLE, templateFor, cloneDetail,
  type PartyDetail, type DetailImageSlot, type PartyDetailStep, type PartyDetailDurationRow, type PartyDetailImage, type PartyAboutSection,
} from "../../lib/partyDetailTemplates";

export type DetailSourceParty = { id: string; title: string; partyType: PartyType; dateString: string; detail: PartyDetail | null };

const inputCls = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-brand-point outline-none";
const smallBtn = "inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed";
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UPLOAD_MAX = 10 * 1024 * 1024;

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 사진을 넣는 곳 — 사진 칸(①~⑤) 또는 소개 묶음 */
type PhotoTarget = { kind: "slot"; slot: DetailImageSlot } | { kind: "about"; index: number };
const targetKey = (t: PhotoTarget) => (t.kind === "slot" ? `slot:${t.slot}` : `about:${t.index}`);
const photosOf = (d: PartyDetail, t: PhotoTarget): PartyDetailImage[] =>
  t.kind === "slot" ? d.images[t.slot] : d.about.sections[t.index].images;
const photoLimit = (t: PhotoTarget) => (t.kind === "slot" ? DETAIL_LIMITS.imagesPerSlot : DETAIL_LIMITS.aboutImages);
const photoLabel = (t: PhotoTarget) => (t.kind === "slot" ? DETAIL_IMAGE_SLOT_LABELS[t.slot] : `소개 묶음 ${t.index + 1}`);

function Counter({ value, max }: { value: string; max: number }) {
  return <span className="text-[11px] text-gray-500 tabular-nums">{value.length}/{max}</span>;
}

export default function PartyDetailEditor({ value, onChange, partyType, usingDefault, sources, currentId }: {
  value: PartyDetail;
  onChange: (next: PartyDetail | ((prev: PartyDetail) => PartyDetail)) => void;
  partyType: PartyType;
  usingDefault: boolean;          // 수정 모드에서 저장된 detail 이 없는 파티 (기본 안내 사용 중)
  sources: DetailSourceParty[];   // [다른 파티에서 불러오기] 후보 (최근 등록 순)
  currentId?: string;
}) {
  const [sourceId, setSourceId] = useState("");
  const [upload, setUpload] = useState<{ key: string; done: number; total: number } | null>(null);

  const set = (fn: (d: PartyDetail) => void) => { const d = cloneDetail(value); fn(d); onChange(d); };
  const setSteps = (steps: PartyDetailStep[]) => set(d => { d.timeline.steps = steps; });
  const setRows  = (rows: PartyDetailDurationRow[]) => set(d => { d.durations.rows = rows; });
  const setSections = (sections: PartyAboutSection[]) => set(d => { d.about.sections = sections; });

  const loadFromParty = () => {
    const src = sources.find(s => s.id === sourceId);
    if (!src) { alert("불러올 파티를 선택해주세요."); return; }
    if (!confirm(`지금 상세페이지 안내를 #${src.id} 파티의 내용으로 바꿀까요?\n(지금 입력한 내용은 사라집니다.)`)) return;
    onChange(src.detail ? cloneDetail(src.detail) : templateFor(src.partyType));
  };
  const resetToTemplate = () => {
    if (!confirm(`상세페이지 안내를 ${PARTY_TYPE_LABELS[partyType]} 기본 내용으로 되돌릴까요?\n(지금 입력한 내용은 사라집니다.)`)) return;
    onChange(templateFor(partyType));
  };

  // 여러 장을 고르면 기존 업로드 API(/api/admin/upload.php)로 한 장씩 차례로 올린다.
  const addPhotos = async (t: PhotoTarget, files: File[]) => {
    const limit = photoLimit(t);
    const where = t.kind === "slot" ? "한 위치" : "한 묶음";
    const room = limit - photosOf(value, t).length;
    if (room <= 0) { alert(`${where}에는 사진을 ${limit}장까지 넣을 수 있습니다.`); return; }
    const skipped: string[] = [];
    const picked = files.filter(f => {
      if (!UPLOAD_TYPES.includes(f.type)) { skipped.push(`${f.name} (JPG·PNG·WebP만 가능)`); return false; }
      if (f.size > UPLOAD_MAX) { skipped.push(`${f.name} (10MB 초과)`); return false; }
      return true;
    });
    if (picked.length > room) skipped.push(`${picked.length - room}장 (${where}에 최대 ${limit}장)`);
    const queue = picked.slice(0, room);
    const key = targetKey(t);
    setUpload({ key, done: 0, total: queue.length });
    for (let i = 0; i < queue.length; i++) {
      try {
        const fd = new FormData();
        fd.append("image", queue[i]);
        const res = await fetch("/api/admin/upload.php", { method: "POST", credentials: "include", body: fd });
        const d = await res.json();
        if (d?.ok && typeof d.url === "string") {
          // 업로드 중에 다른 칸을 고쳐도 덮어쓰지 않도록 최신 값에 이어 붙인다 (업로드 중에는 묶음 순서 바꾸기·삭제를 막는다)
          const url: string = d.url;
          onChange(prev => { const next = cloneDetail(prev); photosOf(next, t).push({ url, alt: "" }); return next; });
        } else {
          skipped.push(`${queue[i].name} (${d?.error || "업로드 실패"})`);
        }
      } catch {
        skipped.push(`${queue[i].name} (네트워크 오류)`);
      }
      setUpload({ key, done: i + 1, total: queue.length });
    }
    setUpload(null);
    if (skipped.length) alert(`다음 사진은 추가하지 못했습니다.\n- ${skipped.join("\n- ")}`);
  };

  // 사진 목록 (썸네일·앞으로/뒤로/삭제·대체 텍스트·사진 추가) — 사진 칸과 소개 묶음이 같이 쓴다
  const photoList = (t: PhotoTarget, emptyText: string) => {
    const list = photosOf(value, t);
    const limit = photoLimit(t);
    const label = photoLabel(t);
    const busy = upload?.key === targetKey(t);
    const edit = (fn: (l: PartyDetailImage[], d: PartyDetail) => void) => set(d => fn(photosOf(d, t), d));
    return (
      <>
        {list.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {list.map((img, i) => (
              <div key={`${img.url}-${i}`} className="w-48 flex-shrink-0">
                <div className="w-48 h-28 bg-gray-100 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-1 mt-1.5">
                  <button type="button" className={`${smallBtn} px-2`} disabled={i === 0} aria-label="앞으로"
                    onClick={() => edit(l => { const m = move(l, i, i - 1); l.splice(0, l.length, ...m); })}><ChevronLeft size={12} />앞으로</button>
                  <button type="button" className={`${smallBtn} px-2`} disabled={i === list.length - 1} aria-label="뒤로"
                    onClick={() => edit(l => { const m = move(l, i, i + 1); l.splice(0, l.length, ...m); })}>뒤로<ChevronRight size={12} /></button>
                  <button type="button" className={`${smallBtn} text-red-600`} aria-label="삭제"
                    onClick={() => edit(l => { l.splice(i, 1); })}><Trash2 size={12} /></button>
                </div>
                <input value={img.alt} maxLength={DETAIL_LIMITS.imageAlt} placeholder="대체 텍스트 (사진 설명)"
                  aria-label={`${label} ${i + 1}번째 사진 대체 텍스트`}
                  onChange={e => { const v = e.target.value; edit(l => { l[i].alt = v; }); }}
                  className="mt-1.5 w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-brand-point outline-none" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-2"><ImageIcon size={14} />{emptyText}</div>
        )}
        <label className={`mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer ${busy || list.length >= limit ? "bg-gray-100 text-gray-400 pointer-events-none" : "bg-brand-black text-white hover:bg-brand-point hover:text-black"}`}>
          <Plus size={12} />사진 추가
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" aria-label={`${label} 사진 추가`}
            disabled={!!upload || list.length >= limit}
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (files.length) addPhotos(t, files); }} />
        </label>
        {busy && <span className="ml-2 text-xs font-bold text-brand-point-ink">업로드 중 {upload.done}/{upload.total}</span>}
      </>
    );
  };

  const photoSlot = (slot: DetailImageSlot) => (
    <div className="rounded-xl border border-gray-200 p-3 md:p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-black text-gray-700">{DETAIL_IMAGE_SLOT_LABELS[slot]}</p>
        <span className="text-[11px] text-gray-500">{value.images[slot].length}/{DETAIL_LIMITS.imagesPerSlot}장</span>
      </div>
      {photoList({ kind: "slot", slot }, "사진 없음 — 상세페이지에서 이 위치는 표시되지 않습니다.")}
    </div>
  );

  const sections = value.about.sections;
  const steps = value.timeline.steps;
  const rows = value.durations.rows;

  return (
    <div className="space-y-4">
      {/* 위쪽 도구 */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 md:p-4 space-y-3">
        {usingDefault && (
          <p className="text-xs md:text-sm font-bold text-brand-black bg-brand-point/15 rounded-lg px-3 py-2">
            이 파티는 기본 안내를 사용 중입니다. 저장하면 아래 내용이 이 파티 전용으로 저장됩니다.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <select value={sourceId} onChange={e => setSourceId(e.target.value)} aria-label="불러올 파티"
            className={`${inputCls} sm:flex-1 min-w-0`}>
            <option value="">다른 파티 선택…</option>
            {sources.filter(s => s.id !== currentId).map(s => (
              <option key={s.id} value={s.id}>#{s.id} {s.title} · {PARTY_TYPE_LABELS[s.partyType]} · {s.dateString}</option>
            ))}
          </select>
          <button type="button" onClick={loadFromParty} className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-bold bg-brand-black text-white hover:bg-brand-point hover:text-black whitespace-nowrap">
            <Download size={14} />다른 파티에서 불러오기
          </button>
        </div>
        <button type="button" onClick={resetToTemplate} className="inline-flex items-center gap-1.5 text-xs md:text-sm font-bold text-gray-600 underline">
          <RotateCcw size={13} />기본 내용으로 되돌리기 ({PARTY_TYPE_LABELS[partyType]})
        </button>
        <p className="text-[11px] md:text-xs text-gray-500 leading-relaxed">
          JPG·PNG·WebP, 10MB 이하. 원본 비율 그대로 화면 폭에 맞춰 표시됩니다. 가로 900px 이상 권장.
        </p>
      </div>

      {/* 소개글 — 소제목·본문·사진 묶음 (docs/specs/party-solo-guide.md 7-3) */}
      <div className="rounded-xl border-2 border-brand-point/40 p-3 md:p-4 space-y-3" data-testid="about-editor">
        <p className="text-sm font-black text-gray-700">소개글 <span className="text-gray-500 font-medium">· 상세페이지의 참가 항목·버튼 바로 아래에 보입니다. 묶음이 없으면 표시되지 않습니다</span></p>
        <div>
          <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">제목</label><Counter value={value.about.title} max={DETAIL_LIMITS.aboutTitle} /></div>
          <input value={value.about.title} maxLength={DETAIL_LIMITS.aboutTitle} placeholder={DEFAULT_ABOUT_TITLE} aria-label="소개글 제목"
            onChange={e => set(d => { d.about.title = e.target.value; })} className={inputCls} />
        </div>
        {sections.map((sec, i) => (
          <div key={i} className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2" data-testid="about-section-editor">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-black text-brand-point-ink">소개 묶음 {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" className={smallBtn} disabled={i === 0 || !!upload} aria-label={`소개 묶음 ${i + 1} 위로`} onClick={() => setSections(move(sections, i, i - 1))}><ArrowUp size={12} />위로</button>
                <button type="button" className={smallBtn} disabled={i === sections.length - 1 || !!upload} aria-label={`소개 묶음 ${i + 1} 아래로`} onClick={() => setSections(move(sections, i, i + 1))}><ArrowDown size={12} />아래로</button>
                <button type="button" className={`${smallBtn} text-red-600`} disabled={!!upload} aria-label={`소개 묶음 ${i + 1} 삭제`} onClick={() => setSections(sections.filter((_, j) => j !== i))}><Trash2 size={12} />삭제</button>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">소제목(선택)</label><Counter value={sec.heading} max={DETAIL_LIMITS.aboutHeading} /></div>
              <input value={sec.heading} maxLength={DETAIL_LIMITS.aboutHeading} aria-label={`소개 묶음 ${i + 1} 소제목`}
                onChange={e => set(d => { d.about.sections[i].heading = e.target.value; })} className={inputCls} />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">본문(선택, 줄바꿈 그대로 표시)</label><Counter value={sec.body} max={DETAIL_LIMITS.aboutBody} /></div>
              <textarea value={sec.body} maxLength={DETAIL_LIMITS.aboutBody} rows={5} aria-label={`소개 묶음 ${i + 1} 본문`}
                onChange={e => set(d => { d.about.sections[i].body = e.target.value; })} className={`${inputCls} resize-y`} />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">사진(선택)</label><span className="text-[11px] text-gray-500">{sec.images.length}/{DETAIL_LIMITS.aboutImages}장</span></div>
              {photoList({ kind: "about", index: i }, "사진 없음")}
            </div>
          </div>
        ))}
        <button type="button" disabled={sections.length >= DETAIL_LIMITS.aboutSections}
          onClick={() => setSections([...sections, { heading: "", body: "", images: [] }])}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-bold text-gray-600 hover:border-brand-point disabled:opacity-40">
          <Plus size={14} />소개 묶음 추가 ({sections.length}/{DETAIL_LIMITS.aboutSections})
        </button>
        <p className="text-[11px] md:text-xs text-gray-500">묶음마다 소제목·본문·사진 중 하나 이상을 넣어 주세요.</p>
      </div>

      {photoSlot("beforeApply")}
      {photoSlot("afterApply")}
      {photoSlot("beforeTimeline")}

      {/* 진행 안내 */}
      <div className="rounded-xl border border-gray-200 p-3 md:p-4 space-y-3">
        <p className="text-sm font-black text-gray-700">진행 안내 <span className="text-gray-500 font-medium">· 단계가 없으면 상세페이지에서 진행 안내 전체가 숨겨집니다</span></p>
        <div>
          <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">제목</label><Counter value={value.timeline.title} max={DETAIL_LIMITS.timelineTitle} /></div>
          <input value={value.timeline.title} maxLength={DETAIL_LIMITS.timelineTitle} aria-label="진행 안내 제목"
            onChange={e => set(d => { d.timeline.title = e.target.value; })} className={inputCls} />
        </div>
        <div>
          <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">소개 문구</label><Counter value={value.timeline.intro} max={DETAIL_LIMITS.intro} /></div>
          <input value={value.timeline.intro} maxLength={DETAIL_LIMITS.intro} aria-label="진행 안내 소개 문구"
            onChange={e => set(d => { d.timeline.intro = e.target.value; })} className={inputCls} />
        </div>
        {steps.map((st, i) => (
          <div key={i} className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-black tracking-[0.2em] text-brand-point-ink">STEP {String(i + 1).padStart(2, "0")}</span>
              <div className="flex gap-1">
                <button type="button" className={smallBtn} disabled={i === 0} onClick={() => setSteps(move(steps, i, i - 1))}><ArrowUp size={12} />위로</button>
                <button type="button" className={smallBtn} disabled={i === steps.length - 1} onClick={() => setSteps(move(steps, i, i + 1))}><ArrowDown size={12} />아래로</button>
                <button type="button" className={`${smallBtn} text-red-600`} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 size={12} />삭제</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
              <div>
                <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">제목 *</label><Counter value={st.title} max={DETAIL_LIMITS.stepTitle} /></div>
                <input value={st.title} maxLength={DETAIL_LIMITS.stepTitle} aria-label={`단계 ${i + 1} 제목`}
                  onChange={e => set(d => { d.timeline.steps[i].title = e.target.value; })} className={inputCls} />
              </div>
              <div>
                <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">소요시간(선택)</label></div>
                <input value={st.time} maxLength={DETAIL_LIMITS.stepTime} placeholder="예: 10분" aria-label={`단계 ${i + 1} 소요시간`}
                  onChange={e => set(d => { d.timeline.steps[i].time = e.target.value; })} className={inputCls} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">설명 *</label><Counter value={st.desc} max={DETAIL_LIMITS.stepDesc} /></div>
              <textarea value={st.desc} maxLength={DETAIL_LIMITS.stepDesc} rows={3} aria-label={`단계 ${i + 1} 설명`}
                onChange={e => set(d => { d.timeline.steps[i].desc = e.target.value; })} className={`${inputCls} resize-y`} />
            </div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">참고 문구(선택)</label><Counter value={st.note} max={DETAIL_LIMITS.stepNote} /></div>
              <textarea value={st.note} maxLength={DETAIL_LIMITS.stepNote} rows={2} aria-label={`단계 ${i + 1} 참고 문구`}
                onChange={e => set(d => { d.timeline.steps[i].note = e.target.value; })} className={`${inputCls} resize-y`} />
            </div>
          </div>
        ))}
        <button type="button" disabled={steps.length >= DETAIL_LIMITS.steps}
          onClick={() => setSteps([...steps, { title: "", time: "", desc: "", note: "" }])}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-bold text-gray-600 hover:border-brand-point disabled:opacity-40">
          <Plus size={14} />단계 추가 ({steps.length}/{DETAIL_LIMITS.steps})
        </button>
      </div>

      {/* 소요 시간 안내 */}
      <div className="rounded-xl border border-gray-200 p-3 md:p-4 space-y-3">
        <p className="text-sm font-black text-gray-700">소요 시간 안내 <span className="text-gray-500 font-medium">· 줄이 없으면 이 블록만 숨겨집니다</span></p>
        <div>
          <div className="flex justify-between mb-1"><label className="text-xs font-bold text-gray-500">제목</label><Counter value={value.durations.title} max={DETAIL_LIMITS.durationsTitle} /></div>
          <input value={value.durations.title} maxLength={DETAIL_LIMITS.durationsTitle} aria-label="소요 시간 안내 제목"
            onChange={e => set(d => { d.durations.title = e.target.value; })} className={inputCls} />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input value={r.label} maxLength={DETAIL_LIMITS.durationLabel} placeholder="구분 (예: 6 : 6 파티)" aria-label={`소요 시간 ${i + 1}번째 줄 구분`}
              onChange={e => set(d => { d.durations.rows[i].label = e.target.value; })} className={`${inputCls} sm:flex-1`} />
            <input value={r.total} maxLength={DETAIL_LIMITS.durationTotal} placeholder="총 소요시간 (예: 약 2시간)" aria-label={`소요 시간 ${i + 1}번째 줄 시간`}
              onChange={e => set(d => { d.durations.rows[i].total = e.target.value; })} className={`${inputCls} sm:flex-1`} />
            <div className="flex gap-1">
              <button type="button" className={smallBtn} disabled={i === 0} onClick={() => setRows(move(rows, i, i - 1))}><ArrowUp size={12} />위로</button>
              <button type="button" className={smallBtn} disabled={i === rows.length - 1} onClick={() => setRows(move(rows, i, i + 1))}><ArrowDown size={12} />아래로</button>
              <button type="button" className={`${smallBtn} text-red-600`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={12} />삭제</button>
            </div>
          </div>
        ))}
        <button type="button" disabled={rows.length >= DETAIL_LIMITS.durationRows}
          onClick={() => setRows([...rows, { label: "", total: "" }])}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-bold text-gray-600 hover:border-brand-point disabled:opacity-40">
          <Plus size={14} />줄 추가 ({rows.length}/{DETAIL_LIMITS.durationRows})
        </button>
      </div>

      {photoSlot("beforeNotice")}
      {photoSlot("afterNotice")}
    </div>
  );
}

/** 저장 전 확인 — 문제 목록 (비어 있으면 통과). 서버도 같은 규칙으로 다시 검사한다. */
export function validateDetail(d: PartyDetail): string[] {
  const errs: string[] = [];
  d.about.sections.forEach((s, i) => {
    if (!s.heading.trim() && !s.body.trim() && s.images.length === 0) errs.push(`소개 묶음 ${i + 1}: 소제목·본문·사진 중 하나 이상`);
  });
  d.timeline.steps.forEach((s, i) => {
    if (!s.title.trim()) errs.push(`진행 안내 단계 ${i + 1}: 제목`);
    if (!s.desc.trim())  errs.push(`진행 안내 단계 ${i + 1}: 설명`);
  });
  return errs;
}
