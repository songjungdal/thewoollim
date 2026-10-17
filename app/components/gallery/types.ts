/** 현장스케치 사진 한 장 — /api/gallery.php 응답 형식 */
export type GalleryItem = { id: number; image_path: string; alt_text: string; sort_order: number };

/** 사진 설명 — 관리자가 설명(alt)을 비워 두면 순번으로 대신한다 */
export const galleryAlt = (item: GalleryItem, index: number) =>
  item.alt_text?.trim() || `갤러리 이미지 ${index + 1}`;

/** 다크 배경 위 버튼 공통 포커스 링 (키보드로 이동할 때만) */
export const GALLERY_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-point " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-black";

/** 사진 칸 포커스 링 — 칸 안쪽에 그린다 (바깥에 그리면 슬라이드 영역에 잘림) */
export const GALLERY_PHOTO_FOCUS =
  "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-point";
