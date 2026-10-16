"use client";

/**
 * 관리자 "메인이미지" 탭 — 메인 히어로(롤링 슬라이드) 이미지와 연결 파티 관리.
 *  - 1번 브랜드 슬라이드: PC/모바일 이미지, 초점(3×3), 글자 톤 [자동 | 어두운 글자 | 흰 글자]
 *  - 2~4번 파티 슬라이드: 모집중 파티 최대 3개, 순서 변경, 메인 전용 이미지(선택), 빈 자리 자동 채우기
 *  - 미리보기: 메인과 같은 HeroSlide 로 PC(16:9)·모바일(4:5) 박스 + 가독성 경고(WCAG 대비 4.5 미만)
 * 저장: POST /api/admin/hero.php → api/data/hero.json, 업로드: /api/admin/upload-hero.php
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
import HeroSlide, { HeroIndicators } from "../../components/HeroSlide";
import {
  buildHeroSlides, DEFAULT_HERO_CONFIG, HERO_DEFAULT_IMAGE, HERO_FOCUS_GRID, HERO_MAX_PARTIES,
  type HeroConfig, type HeroImageConfig, type HeroPartyConfig, type HeroPartyInfo, type HeroSlideData, type HeroTone, type HeroToneMode,
} from "../../lib/hero";
import { analyzeHeroImage, heroContrast, HERO_MIN_CONTRAST, type HeroImageAnalysis } from "./heroAnalyze";

const FOCUS_LABELS = ["왼쪽 위", "가운데 위", "오른쪽 위", "왼쪽 가운데", "가운데", "오른쪽 가운데", "왼쪽 아래", "가운데 아래", "오른쪽 아래"];
const TONE_LABEL: Record<HeroTone, string> = { light: "어두운 글자", dark: "흰 글자" };
const HINT_PC = "권장 1920×1080 · 인물은 오른쪽 절반, 왼쪽은 비워주세요(문구 자리)";
const HINT_MO = "권장 1080×1350(4:5) · 인물은 위쪽 절반, 아래쪽 45%는 비워주세요(문구가 이미지 위에 올라갑니다)";
const MAX_UPLOAD = 5 * 1024 * 1024;

type View = "pc" | "mo";
type ImageSet = Pick<HeroImageConfig, "imagePc" | "imageMo" | "focusPc" | "focusMo" | "tonePc" | "toneMo" | "toneModePc" | "toneModeMo">;
type Analyses = Record<string, HeroImageAnalysis | "error">;

const isTone = (v: unknown): v is HeroTone => v === "light" || v === "dark";
const isMode = (v: unknown): v is HeroToneMode => v === "auto" || isTone(v);
const s = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/** 서버 설정 → 화면 상태 (서버가 이미 정리해서 주지만 타입을 맞춘다) */
function toConfig(raw: unknown): HeroConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_HERO_CONFIG;
  const r = raw as { brand?: Record<string, unknown>; parties?: unknown[]; autoFill?: unknown };
  const set = (o: Record<string, unknown> | undefined, d: ImageSet): ImageSet => {
    const tonePc = isTone(o?.tonePc) ? o.tonePc : d.tonePc;
    const toneMo = isTone(o?.toneMo) ? o.toneMo : d.toneMo;
    return {
      imagePc: o ? s(o.imagePc) : d.imagePc, imageMo: o ? s(o.imageMo) : d.imageMo,
      focusPc: s(o?.focusPc) ?? d.focusPc, focusMo: s(o?.focusMo) ?? d.focusMo,
      tonePc, toneMo,
      toneModePc: isMode(o?.toneModePc) ? o.toneModePc : tonePc,
      toneModeMo: isMode(o?.toneModeMo) ? o.toneModeMo : toneMo,
    };
  };
  const brand = set(r.brand, DEFAULT_HERO_CONFIG.brand);
  return {
    brand: { ...brand, imagePc: brand.imagePc ?? HERO_DEFAULT_IMAGE, imageMo: brand.imageMo ?? brand.imagePc ?? HERO_DEFAULT_IMAGE },
    parties: (Array.isArray(r.parties) ? r.parties : []).flatMap(p => {
      const o = p && typeof p === "object" ? p as Record<string, unknown> : null;
      const pid = s(o?.partyId);
      return pid ? [{ partyId: pid, ...set(o ?? undefined, NEW_PARTY_SET) }] : [];
    }).slice(0, HERO_MAX_PARTIES),
    autoFill: r.autoFill !== false,
  };
}

const NEW_PARTY_SET: ImageSet = {
  imagePc: null, imageMo: null, focusPc: "50% 50%", focusMo: "50% 0%",
  tonePc: "dark", toneMo: "dark", toneModePc: "auto", toneModeMo: "auto",
};

const analysisOf = (an: Analyses, src: string | null | undefined): HeroImageAnalysis | null => {
  const a = src ? an[src] : undefined;
  return a && a !== "error" ? a : null;
};

/** 자동 모드면 분석값, 아니면 고른 톤 */
function resolveSet<T extends Partial<ImageSet>>(set: T, an: Analyses): T {
  const pcSrc = set.imagePc ?? set.imageMo ?? null;
  const moSrc = set.imageMo ?? set.imagePc ?? null;
  return {
    ...set,
    tonePc: set.toneModePc === "auto" ? (analysisOf(an, pcSrc)?.tonePc ?? set.tonePc ?? "dark") : (set.toneModePc ?? set.tonePc ?? "dark"),
    toneMo: set.toneModeMo === "auto" ? (analysisOf(an, moSrc)?.toneMo ?? set.toneMo ?? "dark") : (set.toneModeMo ?? set.toneMo ?? "dark"),
  };
}

async function uploadHero(file: File): Promise<string> {
  if (!/^image\/(webp|jpeg|png)$/.test(file.type)) throw new Error("WEBP/JPG/PNG 형식만 가능합니다.");
  if (file.size > MAX_UPLOAD) throw new Error("파일은 5MB 이하만 가능합니다.");
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/admin/upload-hero.php", { method: "POST", body: fd, credentials: "include" });
  const d = await res.json().catch(() => null);
  if (!d?.ok || typeof d.url !== "string") throw new Error(d?.error || "업로드에 실패했습니다.");
  return d.url;
}

export default function HeroEditor() {
  const [config, setConfig] = useState<HeroConfig>(DEFAULT_HERO_CONFIG);
  const [infos, setInfos] = useState<HeroPartyInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Analyses>({});
  const [previewIdx, setPreviewIdx] = useState(0);
  const pending = useRef(new Set<string>());

  useEffect(() => {
    fetch("/api/admin/hero.php", { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || "불러오지 못했습니다.");
        setConfig(toConfig(d.config));
        setInfos(Array.isArray(d.parties) ? d.parties as HeroPartyInfo[] : []);
        setLoaded(true);
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, []);

  // 쓰는 이미지마다 한 번씩 분석 (자동 톤·비율·가독성) — 파티 대표 이미지(전용 이미지 없을 때 배경)도 포함
  const slides: HeroSlideData[] = useMemo(() => {
    const resolved: HeroConfig = {
      ...config,
      brand: resolveSet(config.brand, analyses),
      parties: config.parties.map(p => resolveSet(p, analyses)),
    };
    return buildHeroSlides(resolved, infos);
  }, [config, infos, analyses]);

  useEffect(() => {
    const urls = new Set<string>();
    const add = (u: string | null | undefined) => { if (u) urls.add(u); };
    add(config.brand.imagePc); add(config.brand.imageMo);
    config.parties.forEach(p => { add(p.imagePc); add(p.imageMo); });
    slides.forEach(sl => { if (sl.type === "party") add(sl.fallbackImage); });
    urls.forEach(u => {
      if (analyses[u] || pending.current.has(u)) return;
      pending.current.add(u);
      analyzeHeroImage(u)
        .then(a => setAnalyses(prev => ({ ...prev, [u]: a })))
        .catch(() => setAnalyses(prev => ({ ...prev, [u]: "error" })))
        .finally(() => pending.current.delete(u));
    });
  }, [config, slides, analyses]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 2500);
  };

  const patchBrand = (patch: Partial<ImageSet>) => setConfig(c => ({ ...c, brand: { ...c.brand, ...patch } }));
  const patchParty = (i: number, patch: Partial<ImageSet>) =>
    setConfig(c => ({ ...c, parties: c.parties.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const moveParty = (i: number, d: -1 | 1) => setConfig(c => {
    const list = [...c.parties];
    const j = i + d;
    if (j < 0 || j >= list.length) return c;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...c, parties: list };
  });
  const removeParty = (i: number) => setConfig(c => ({ ...c, parties: c.parties.filter((_, j) => j !== i) }));
  const addParty = (pid: string) => setConfig(c => (
    c.parties.length >= HERO_MAX_PARTIES || c.parties.some(p => p.partyId === pid)
      ? c
      : { ...c, parties: [...c.parties, { partyId: pid, ...NEW_PARTY_SET }] }
  ));

  const save = async () => {
    setSaving(true);
    try {
      const body: HeroConfig = {
        ...config,
        brand: resolveSet(config.brand, analyses),
        parties: config.parties.map(p => resolveSet(p, analyses)),
      };
      const res = await fetch("/api/admin/hero.php", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: body }),
      });
      const d = await res.json().catch(() => null);
      if (!d?.ok) throw new Error(d?.error || "저장에 실패했습니다.");
      setConfig(toConfig(d.config));
      showToast("저장되었습니다. 메인 페이지에 바로 반영됩니다.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  // 업로드한 파일은 로컬에서 바로 분석해 자동 톤에 반영
  const onUploaded = async (url: string, file: File) => {
    const local = URL.createObjectURL(file);
    try {
      const a = await analyzeHeroImage(local);
      setAnalyses(prev => ({ ...prev, [url]: a }));
    } catch {
      /* 분석 실패 — 톤은 직접 고르면 됨 */
    } finally {
      URL.revokeObjectURL(local);
    }
  };

  // 가독성 경고 — 슬라이드별 PC/모바일 대비비
  const contrastOf = (sl: HeroSlideData, view: View): number | null => {
    const own = !!(sl.imagePc || sl.imageMo);
    const src = own ? (view === "pc" ? sl.imagePc ?? sl.imageMo : sl.imageMo ?? sl.imagePc) : sl.type === "party" ? sl.fallbackImage : null;
    const a = analysisOf(analyses, src);
    const tone = own ? (view === "pc" ? sl.tonePc : sl.toneMo) : "dark";
    return heroContrast(a ? (view === "pc" ? a.pc : a.mo) : null, tone, view, !own);
  };
  const warnOf = (sl: HeroSlideData) => (["pc", "mo"] as View[]).filter(v => {
    const c = contrastOf(sl, v);
    return c !== null && c < HERO_MIN_CONTRAST;
  });

  if (loadError) return <p className="text-sm text-danger font-bold">메인이미지 설정을 불러오지 못했습니다. ({loadError})</p>;
  if (!loaded) return <p className="text-sm text-gray-500">불러오는 중…</p>;

  const selectedIds = new Set(config.parties.map(p => p.partyId));
  const addable = infos.filter(i => i.open && !selectedIds.has(i.partyId));
  const idx = Math.min(previewIdx, slides.length - 1);
  const cur = slides[idx];
  const curWarn = warnOf(cur);

  return (
    <section className="space-y-6 max-w-5xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-black tracking-tight">메인이미지</h2>
          <p className="text-[13px] md:text-sm text-gray-500 mt-1">
            메인 첫 화면의 롤링 슬라이드입니다. 1번은 브랜드 슬라이드, 2~4번은 모집중 파티 슬라이드(최대 3개)입니다. 6초마다 넘어갑니다.
          </p>
        </div>
        <button type="button" onClick={save} disabled={saving}
          className="bg-brand-black text-white px-5 py-3 rounded-lg text-sm font-black hover:bg-brand-point hover:text-black transition-all disabled:bg-gray-300 min-h-11 md:min-h-9">
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {/* 1번 브랜드 슬라이드 */}
      <Card title="1번 · 브랜드 슬라이드 (고정)" desc="메인 문구와 [어울림 매칭파티 신청하기] 버튼이 올라가는 첫 화면입니다.">
        <ImageSetEditor value={config.brand} onChange={patchBrand} analyses={analyses} onUploaded={onUploaded} optional={false} />
      </Card>

      {/* 2~4번 파티 슬라이드 */}
      <Card title={`2~4번 · 파티 슬라이드 (${config.parties.length}/${HERO_MAX_PARTIES})`}
        desc="고른 순서대로 나옵니다. 마감·종료된 파티는 메인에서 자동으로 빠집니다.">
        <div className="space-y-4">
          {config.parties.length === 0 && <p className="text-sm text-gray-500">고른 파티가 없습니다.</p>}
          {config.parties.map((p, i) => (
            <PartyCard key={p.partyId} cfg={p} info={infos.find(x => x.partyId === p.partyId) ?? null} index={i} total={config.parties.length}
              onMove={d => moveParty(i, d)} onRemove={() => removeParty(i)} onChange={patch => patchParty(i, patch)}
              analyses={analyses} onUploaded={onUploaded} />
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value=""
              disabled={config.parties.length >= HERO_MAX_PARTIES || addable.length === 0}
              onChange={e => { if (e.target.value) addParty(e.target.value); }}
              className="px-4 py-3 rounded-lg border border-gray-200 text-base md:text-sm font-medium bg-white disabled:bg-gray-100 disabled:text-gray-400 max-w-full min-h-11 md:min-h-0"
              aria-label="파티 추가"
            >
              <option value="">
                {config.parties.length >= HERO_MAX_PARTIES ? "최대 3개까지 고를 수 있습니다" : addable.length === 0 ? "추가할 모집중 파티가 없습니다" : "+ 파티 추가 (모집중만)"}
              </option>
              {addable.map(i => (
                <option key={i.partyId} value={i.partyId}>
                  {i.dateString || i.calendarDate} · {i.title} · 남 {i.maleLeft}석 · 여 {i.femaleLeft}석
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input type="checkbox" checked={config.autoFill} onChange={e => setConfig(c => ({ ...c, autoFill: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-black flex-shrink-0" />
            <span>
              <span className="block text-sm font-black text-gray-700">빈 자리는 가까운 모집중 파티로 자동 채우기</span>
              <span className="block text-[13px] md:text-sm font-medium text-gray-500 mt-0.5">고른 파티가 3개보다 적거나 마감되면 날짜가 가까운 모집중 파티로 채웁니다.</span>
            </span>
          </label>
        </div>
      </Card>

      {/* 미리보기 */}
      <Card title="미리보기" desc="저장 전 설정으로 계산한 실제 메인 화면입니다. 글자가 잘 안 보이면 노란 경고가 나옵니다.">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button type="button" onClick={() => setPreviewIdx((idx - 1 + slides.length) % slides.length)} aria-label="이전 슬라이드"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 min-h-11 md:min-h-9"><ChevronLeft size={16} /></button>
          {slides.map((sl, i) => (
            <button key={i} type="button" onClick={() => setPreviewIdx(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all max-w-[200px] truncate ${i === idx ? "bg-brand-black text-white border-brand-black" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"} min-h-11 md:min-h-9`}>
              {i + 1}. {sl.type === "brand" ? "브랜드" : sl.title}{warnOf(sl).length > 0 ? " ⚠" : ""}
            </button>
          ))}
          <button type="button" onClick={() => setPreviewIdx((idx + 1) % slides.length)} aria-label="다음 슬라이드"
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 md:min-h-9"><ChevronRight size={16} /></button>
        </div>
        {curWarn.length > 0 && (
          <p className="flex items-start gap-2 mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-bold">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{curWarn.map(v => (v === "pc" ? "PC" : "모바일")).join("·")}: 글자가 잘 안 보일 수 있어요. 글자 톤을 바꾸거나 다른 이미지를 사용해 주세요</span>
          </p>
        )}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="w-full lg:flex-1 min-w-0">
            <p className="text-[13px] md:text-sm font-bold text-gray-500 mb-2">PC (16:9)</p>
            <ScaledPreview baseW={1440} baseH={810}>
              <HeroSlide key={`pc-${idx}`} slide={cur} mode="pc" active={false} reducedMotion interactive={false} />
              <HeroIndicators count={slides.length} index={idx} tonePc={cur.type === "party" && !(cur.imagePc || cur.imageMo) ? "dark" : cur.tonePc} mode="pc" running={false} />
            </ScaledPreview>
            <ContrastNote value={contrastOf(cur, "pc")} />
          </div>
          <div className="w-full max-w-[375px] flex-shrink-0">
            <p className="text-[13px] md:text-sm font-bold text-gray-500 mb-2">모바일 (4:5, 폭 375px)</p>
            <ScaledPreview baseW={375} baseH={469}>
              <HeroSlide key={`mo-${idx}`} slide={cur} mode="mo" active={false} reducedMotion interactive={false} />
              <HeroIndicators count={slides.length} index={idx} tonePc="dark" mode="mo" running={false} />
            </ScaledPreview>
            <ContrastNote value={contrastOf(cur, "mo")} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving}
          className="bg-brand-black text-white px-6 py-3 rounded-lg text-sm font-black hover:bg-brand-point hover:text-black transition-all disabled:bg-gray-300 min-h-11 md:min-h-9">
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 bg-brand-black text-white px-5 py-3 rounded-full shadow-xl text-sm font-bold">
          <CheckCircle2 size={16} className="text-brand-point" /> {toast}
        </div>
      )}
    </section>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6">
      <h3 className="text-base md:text-lg font-black">{title}</h3>
      {desc && <p className="text-[13px] md:text-sm text-gray-500 mt-1 mb-4">{desc}</p>}
      {children}
    </div>
  );
}

/** 고정 크기(baseW×baseH)로 그린 뒤 박스 폭에 맞춰 축소 — 메인과 같은 글자 크기 비율로 보이게 */
function ScaledPreview({ baseW, baseH, children }: { baseW: number; baseH: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / baseW);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseW]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-xl bg-brand-black" style={{ height: baseH * scale }}>
      {scale > 0 && (
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: baseW, height: baseH, transform: `scale(${scale})` }}>
          <div className="relative w-full h-full overflow-hidden">{children}</div>
        </div>
      )}
    </div>
  );
}

function ContrastNote({ value }: { value: number | null }) {
  if (value === null) return <p className="text-[13px] md:text-sm text-gray-500 mt-1.5">가독성: 이미지 분석 전이거나 분석할 수 없는 이미지입니다.</p>;
  const ok = value >= HERO_MIN_CONTRAST;
  return (
    <p className={`text-xs font-bold mt-1.5 ${ok ? "text-gray-500" : "text-amber-700"}`}>
      글자 대비 약 {value.toFixed(1)}:1 {ok ? "· 잘 보입니다" : "· 4.5:1 미만"}
    </p>
  );
}

function PartyCard({ cfg, info, index, total, onMove, onRemove, onChange, analyses, onUploaded }: {
  cfg: HeroPartyConfig; info: HeroPartyInfo | null; index: number; total: number;
  onMove: (d: -1 | 1) => void; onRemove: () => void; onChange: (patch: Partial<ImageSet>) => void;
  analyses: Analyses; onUploaded: (url: string, file: File) => void;
}) {
  const status = !info
    ? { text: "삭제된 파티", cls: "bg-gray-200 text-gray-600", excluded: true }
    : info.open
      ? info.almostFull ? { text: "마감임박", cls: "bg-red-600 text-white", excluded: false } : { text: "모집중", cls: "bg-brand-point text-black", excluded: false }
      : { text: info.ended ? "종료" : "마감", cls: "bg-gray-200 text-gray-600", excluded: true };
  const own = !!(cfg.imagePc || cfg.imageMo);
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={info?.imageUrl || "/images/party_card_default_banner.jpg"} alt="" className="w-16 h-12 object-cover rounded flex-shrink-0 bg-gray-100" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] md:text-sm font-black text-gray-500">{index + 2}번</span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${status.cls}`}>{status.text}</span>
            {status.excluded && <span className="text-[13px] md:text-sm font-bold text-amber-700">메인에서 자동 제외됨</span>}
          </div>
          <p className="font-bold text-sm mt-1 truncate">{info?.title ?? `파티 #${cfg.partyId}`}</p>
          <p className="text-[13px] md:text-sm text-gray-500">{info ? `${info.dateString || info.calendarDate} · 남 ${info.maleLeft}석 · 여 ${info.femaleLeft}석` : "파티 목록에 없는 파티입니다."}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="위로" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 min-h-11 md:min-h-9"><ArrowUp size={14} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="아래로" className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 min-h-11 md:min-h-9"><ArrowDown size={14} /></button>
          <button type="button" onClick={onRemove} aria-label="삭제" className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-danger min-h-11 md:min-h-9"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-sm font-black text-gray-700 mb-1">메인 전용 이미지 (선택)</p>
        {!own && <p className="text-[13px] md:text-sm text-gray-500 mb-3">비워두면 파티 대표 이미지를 사용합니다(흰 글자 고정).</p>}
        <ImageSetEditor value={{ ...NEW_PARTY_SET, ...cfg }} onChange={onChange} analyses={analyses} onUploaded={onUploaded} optional />
      </div>
    </div>
  );
}

function ImageSetEditor({ value, onChange, analyses, onUploaded, optional }: {
  value: ImageSet; onChange: (patch: Partial<ImageSet>) => void;
  analyses: Analyses; onUploaded: (url: string, file: File) => void; optional: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-5">
      <ImageSide view="pc" value={value} onChange={onChange} analyses={analyses} onUploaded={onUploaded} optional={optional} />
      <ImageSide view="mo" value={value} onChange={onChange} analyses={analyses} onUploaded={onUploaded} optional={optional} />
    </div>
  );
}

function ImageSide({ view, value, onChange, analyses, onUploaded, optional }: {
  view: View; value: ImageSet; onChange: (patch: Partial<ImageSet>) => void;
  analyses: Analyses; onUploaded: (url: string, file: File) => void; optional: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const isPc = view === "pc";
  const img = isPc ? value.imagePc : value.imageMo;
  const shown = img ?? (isPc ? value.imageMo : value.imagePc); // 한쪽만 있으면 다른 쪽 이미지를 같이 쓴다
  const focus = isPc ? value.focusPc : value.focusMo;
  const mode = isPc ? value.toneModePc : value.toneModeMo;
  const a = analysisOf(analyses, shown);
  const autoTone = a ? (isPc ? a.tonePc : a.toneMo) : null;
  const key = (k: "image" | "focus" | "toneMode" | "tone") => `${k}${isPc ? "Pc" : "Mo"}` as keyof ImageSet;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadHero(file);
      onChange({ [key("image")]: url } as Partial<ImageSet>);
      onUploaded(url, file);
    } catch (e) {
      alert(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const setMode = (m: HeroToneMode) => {
    const tone: HeroTone = m === "auto" ? (autoTone ?? (isPc ? value.tonePc : value.toneMo)) : m;
    onChange({ [key("toneMode")]: m, [key("tone")]: tone } as Partial<ImageSet>);
  };

  return (
    <div>
      <p className="text-sm font-black text-gray-700">{isPc ? "PC 이미지" : "모바일 이미지"}</p>
      <p className="text-[13px] md:text-sm text-gray-500 mb-2 leading-relaxed">{isPc ? HINT_PC : HINT_MO}</p>
      <div className={`relative overflow-hidden rounded-lg bg-gray-100 border border-gray-200 ${isPc ? "aspect-video" : "aspect-[4/5] max-w-[180px]"}`}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: focus }} />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[13px] md:text-sm text-gray-500">이미지 없음</span>
        )}
      </div>
      {!isPc && a?.moRatioWarning && img && (
        <p className="text-[13px] md:text-sm font-bold text-amber-700 mt-1.5">권장 비율(4:5)과 달라 일부가 잘릴 수 있어요</p>
      )}
      <div className="grid grid-cols-1 gap-2 md:flex md:flex-wrap mt-2">
        <label className={`inline-flex items-center justify-center md:justify-start gap-1.5 min-h-11 md:min-h-9 px-3 py-2 rounded-lg text-[13px] md:text-xs font-bold cursor-pointer transition-all ${busy ? "bg-gray-200 text-gray-500" : "bg-brand-black text-white hover:bg-brand-point hover:text-black"}`}>
          <Upload size={13} /> {busy ? "업로드 중…" : img ? "이미지 바꾸기" : "이미지 업로드"}
          <input type="file" accept="image/webp,image/jpeg,image/png" className="hidden" disabled={busy}
            onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {/* 파티 전용 이미지만 비울 수 있다 (비우면 파티 대표 이미지 사용). 브랜드 이미지는 [이미지 바꾸기]로만 교체 */}
        {img && optional && (
          <button type="button" onClick={() => onChange({ [key("image")]: null } as Partial<ImageSet>)}
            className="px-3 py-2 rounded-lg text-[13px] md:text-xs font-bold border border-gray-200 hover:bg-gray-50 min-h-11 md:min-h-9">
            비우기
          </button>
        )}
      </div>

      <p className="text-[13px] md:text-sm font-bold text-gray-600 mt-3 mb-1.5">초점 위치</p>
      <div className="grid grid-cols-3 gap-1 w-[84px]" role="group" aria-label={`${isPc ? "PC" : "모바일"} 초점 위치`}>
        {HERO_FOCUS_GRID.map((f, i) => (
          <button key={f} type="button" onClick={() => onChange({ [key("focus")]: f } as Partial<ImageSet>)}
            aria-label={`초점 ${FOCUS_LABELS[i]}`} aria-pressed={focus === f}
            className={`w-[26px] h-[26px] rounded border transition-all ${focus === f ? "bg-brand-black border-brand-black" : "bg-white border-gray-300 hover:bg-gray-100"}`} />
        ))}
      </div>

      <p className="text-[13px] md:text-sm font-bold text-gray-600 mt-3 mb-1.5">글자 톤</p>
      <div className="grid grid-cols-1 w-full md:inline-flex md:flex-wrap md:w-auto rounded-lg border border-gray-200 overflow-hidden text-[13px] md:text-xs font-bold" role="group" aria-label={`${isPc ? "PC" : "모바일"} 글자 톤`}>
        {(["auto", "light", "dark"] as HeroToneMode[]).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`min-h-11 md:min-h-9 px-3 py-2 border-b last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 border-gray-200 transition-all ${mode === m ? "bg-brand-black text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            {m === "auto" ? `자동${shown ? ` (${autoTone ? TONE_LABEL[autoTone] : "분석 중"})` : ""}` : TONE_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
