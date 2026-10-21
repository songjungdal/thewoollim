"use client";

/**
 * 관리자 파티 등록/수정 — "상단이미지"(heroImageUrl, 상세페이지 맨 위 16:9) 자르기 창 (docs/specs/party-detail-relayout.md A-3).
 *  - 16:9 틀 안에서 사진을 끌어 위치를 옮기고, 슬라이더로 확대/축소한다 (방향키로도 이동).
 *  - 상세페이지에서 겹치는 자리 표시: 왼쪽 위 상태 배지(가로 30%·세로 20%), 오른쪽 아래 인원 표시(가로 35%·세로 15%).
 *  - [적용] → 1600×900 JPEG(품질 0.85)로 만든다. 고른 영역이 1600px 보다 작으면 늘리지 않고 그 크기(16:9 유지) 그대로.
 *    업로드는 부르는 쪽(page.tsx uploadImage)이 기존 /api/admin/upload.php 로 한다.
 * 외부 라이브러리 없이 canvas 로 자른다.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { X, ZoomIn, ZoomOut, ImagePlus } from "lucide-react";
import { loadImage } from "./heroAnalyze";

const RATIO = 16 / 9;
const OUT_W = 1600;
const MIN_W = 1280;     // 권장 최소 크기 (1280×720)
const MAX_ZOOM = 3;

type Point = { x: number; y: number };
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

export default function PartyHeroCropModal({ file, onCancel, onApply, onPickOther }: {
  file: File;
  onCancel: () => void;
  onApply: (blob: Blob) => void;   // 잘라 낸 JPEG
  onPickOther: () => void;         // [다른 사진 선택]
}) {
  const [src, setSrc] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [error, setError] = useState("");
  const [boxW, setBoxW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point | null>(null);   // 틀 가운데에 오는 사진 위치 (원본 픽셀)
  const [making, setMaking] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // 고른 파일 읽기 — 창이 닫히거나 파일이 바뀌면 임시 주소를 지운다
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let alive = true;
    loadImage(url)
      .then(img => { if (alive) { setSrc({ url, img }); setCenter(null); setZoom(1); setError(""); } })
      .catch(() => { if (alive) setError("이미지를 불러오지 못했습니다. JPG·PNG·WebP 파일인지 확인해 주세요."); });
    return () => { alive = false; URL.revokeObjectURL(url); };
  }, [file]);

  // 16:9 틀의 실제 폭 (화면 크기에 따라 바뀜)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setBoxW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const nw = src?.img.naturalWidth ?? 0;
  const nh = src?.img.naturalHeight ?? 0;
  const boxH = boxW / RATIO;
  // 확대 1 = 틀을 빈틈 없이 채우는 가장 작은 크기
  const scale = nw && nh && boxW ? Math.max(boxW / nw, boxH / nh) * zoom : 0;
  const clampCenter = (p: Point): Point => scale
    ? { x: clamp(p.x, boxW / (2 * scale), nw - boxW / (2 * scale)), y: clamp(p.y, boxH / (2 * scale), nh - boxH / (2 * scale)) }
    : p;
  const c = clampCenter(center ?? { x: nw / 2, y: nh / 2 });
  // 원본에서 잘라 낼 영역 (원본 픽셀)
  const cropW = scale ? boxW / scale : 0;
  const cropH = scale ? boxH / scale : 0;
  const outW = Math.min(OUT_W, Math.floor(cropW));
  const outH = Math.round(outW / RATIO);

  const moveBy = (dx: number, dy: number) => { if (scale) setCenter(clampCenter({ x: c.x - dx / scale, y: c.y - dy / scale })); };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!scale) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    moveBy(e.clientX - d.x, e.clientY - d.y);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const map: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    moveBy(m[0], m[1]);
  };

  const apply = () => {
    if (!src || !scale || outW < 1) return;
    setMaking(true);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setMaking(false); setError("이미지를 만들지 못했습니다."); return; }
    ctx.fillStyle = "#ffffff";   // 투명 PNG 의 빈 곳이 검게 나오지 않게
    ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src.img, c.x - cropW / 2, c.y - cropH / 2, cropW, cropH, 0, 0, outW, outH);
    canvas.toBlob(blob => {
      setMaking(false);
      if (blob) onApply(blob);
      else setError("이미지를 만들지 못했습니다.");
    }, "image/jpeg", 0.85);
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-0 md:p-4" role="dialog" aria-modal="true" aria-label="상단이미지 16:9 자르기">
      <div className="flex max-h-full w-full flex-col overflow-y-auto bg-white p-4 md:max-w-2xl md:rounded-2xl md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-black md:text-lg">상단이미지 자르기 (16:9)</h3>
          <button type="button" onClick={onCancel} aria-label="닫기" className="-m-2 p-2 text-gray-500 hover:text-brand-black"><X size={20} /></button>
        </div>
        <p className="mb-3 text-[13px] text-gray-600 md:text-sm">사진을 끌어 위치를 맞추고, 아래 막대로 크기를 조절하세요. 어두운 칸은 상세페이지에서 배지·인원 표시가 겹치는 자리예요.</p>

        <div
          ref={boxRef}
          tabIndex={0}
          aria-label="자를 영역 — 끌거나 방향키로 위치 이동"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="relative aspect-video w-full touch-none select-none overflow-hidden rounded-lg bg-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-point cursor-grab active:cursor-grabbing"
        >
          {src && scale > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ left: boxW / 2 - c.x * scale, top: boxH / 2 - c.y * scale, width: nw * scale, height: nh * scale }}
            />
          )}
          {/* 상세페이지에서 겹치는 자리 — 왼쪽 위 상태 배지(30%×20%), 오른쪽 아래 인원 표시(35%×15%) */}
          <div className="pointer-events-none absolute left-0 top-0 flex h-[20%] w-[30%] items-start border-b border-r border-dashed border-white/80 bg-black/45 p-1.5">
            <span className="text-[11px] font-bold text-white md:text-xs">상태 배지 자리</span>
          </div>
          <div className="pointer-events-none absolute bottom-0 right-0 flex h-[15%] w-[35%] items-end justify-end border-l border-t border-dashed border-white/80 bg-black/45 p-1.5">
            <span className="text-[11px] font-bold text-white md:text-xs">인원 표시 자리</span>
          </div>
          {!src && !error && <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">불러오는 중…</span>}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <ZoomOut size={16} className="flex-shrink-0 text-gray-500" aria-hidden />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            aria-label="확대/축소"
            className="w-full accent-black"
          />
          <ZoomIn size={16} className="flex-shrink-0 text-gray-500" aria-hidden />
        </div>
        {src && scale > 0 && (
          <p className={`mt-2 text-[13px] md:text-sm ${outW < MIN_W ? "font-bold text-danger" : "text-gray-500"}`}>
            저장 크기 {outW}×{outH}
            {outW < MIN_W && " — 1280×720 보다 작아 흐리게 보일 수 있어요. 더 큰 사진을 쓰거나 덜 확대해 주세요."}
          </p>
        )}
        {error && <p className="mt-2 text-sm font-bold text-danger">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onPickOther} className="mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold hover:bg-gray-50 md:min-h-0">
            <ImagePlus size={15} />다른 사진 선택
          </button>
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold hover:bg-gray-50 md:min-h-0">취소</button>
          <button type="button" onClick={apply} disabled={!src || !scale || making}
            className="min-h-11 rounded-lg bg-brand-black px-5 py-2 text-sm font-black text-white hover:bg-brand-point hover:text-black disabled:opacity-40 md:min-h-0">
            {making ? "만드는 중…" : "적용"}
          </button>
        </div>
      </div>
    </div>
  );
}
