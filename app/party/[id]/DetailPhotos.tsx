import type { PartyDetailImage } from "../../lib/partyDetailTemplates";

/**
 * 관리자 사진(사진 칸 ①~⑤, 소개 묶음 사진) 표시 (docs/specs/party-detail-relayout.md D-5).
 *  - 0장: 그리지 않음
 *  - 1장·여러 장 모두: 본문 전체 폭, 원본 비율 그대로(자르지 않음). 여러 장이면 위에서 아래로 차례로.
 *    명세의 "모바일 옆으로 넘겨 보기 / 태블릿·PC 2열"은 쓰지 않는다 — 사진마다 폭을 맞춰 크게 보이도록 (2026-10-21 사용자 결정)
 * alt 는 관리자 대체 텍스트. 모두 lazy 로딩(상단이미지는 이 컴포넌트를 쓰지 않음).
 */
export default function DetailPhotos({ images, className = "" }: { images: PartyDetailImage[]; className?: string }) {
  if (images.length === 0) return null;
  return (
    <div className={`space-y-4 md:space-y-6 ${className}`} data-testid="detail-photos">
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${img.url}-${i}`}
          src={img.url}
          alt={img.alt}
          loading="lazy"
          className="block h-auto w-full max-w-full rounded-2xl"
        />
      ))}
    </div>
  );
}
