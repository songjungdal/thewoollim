/**
 * 사진 심사 · 직업 인증 화면 공용 — 서버 응답 타입, 호출, 문구 (docs/specs/photo-job-verification.md).
 * 서버: api/verification/state.php · photo.php · job.php · my-photo.php (공통 규칙 api/verification/_lib.php)
 * 결제 가능 여부의 최종 판단은 서버(api/payments/pending.php · vbank-submit.php)가 한다. 화면 검사는 안내용.
 */

export type PhotoStatus = "none" | "pending" | "approved" | "rejected";
export type JobStatus = "none" | "pending" | "approved" | "reverify" | "rejected";
export type JobType = "employee" | "business" | "other";

export type PhotoSummary = {
  status: PhotoStatus;
  approved: boolean;            // 승인 사진이 있음 — 심사 중·반려 중이어도 이전 승인 사진으로 신청 가능
  rejectReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
};

export type JobSummary = {
  status: JobStatus;
  verified: boolean;            // 배지 표시 중
  label: string | null;         // 관리자가 정한 표시 직업
  jobType: JobType | null;
  rejectReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

export type VerificationState = {
  ok: boolean;
  ready: boolean;               // 서버가 업로드를 받을 수 있는 상태
  photoRequired: boolean;       // 결제 전 사진 승인 필요 (관리자 스위치)
  testUser: boolean;            // 테스트 회원 — 검사 통과
  photo: PhotoSummary;
  job: JobSummary;
};

/** 결제를 막는 사진 상태 — 서버 code 와 같은 이름 */
export type PhotoGateCode = "PHOTO_REQUIRED" | "PHOTO_PENDING" | "PHOTO_REJECTED";

export async function fetchVerificationState(): Promise<VerificationState | null> {
  try {
    const r = await fetch("/api/verification/state.php", { credentials: "include", cache: "no-store" });
    const d = await r.json().catch(() => null);
    return d && d.ok ? (d as VerificationState) : null;
  } catch {
    return null;
  }
}

/** 결제 전에 안내창을 띄워야 하면 그 code, 아니면 null */
export function photoGateCode(s: VerificationState | null): PhotoGateCode | null {
  if (!s || !s.photoRequired || s.testUser || s.photo.approved) return null;
  if (s.photo.status === "pending") return "PHOTO_PENDING";
  if (s.photo.status === "rejected") return "PHOTO_REJECTED";
  return "PHOTO_REQUIRED";
}

/** 서버 응답 code 가 사진 심사 차단인지 */
export function isPhotoGateCode(code: unknown): code is PhotoGateCode {
  return code === "PHOTO_REQUIRED" || code === "PHOTO_PENDING" || code === "PHOTO_REJECTED";
}

/** 인증 페이지 주소 — 승인 뒤 돌아갈 주소(보던 파티·결제 화면)를 함께 넘긴다 */
export function verificationHref(from?: string): string {
  return from && isSafeReturnPath(from) ? `/verification/?from=${encodeURIComponent(from)}` : "/verification/";
}

/** 돌아갈 주소로 허용하는 모양 — 사이트 안 파티 상세·결제·마이페이지만 */
export function isSafeReturnPath(p: string): boolean {
  return /^\/(party\/[A-Za-z0-9_-]+\/|checkout\/\?(id|ids)=[A-Za-z0-9_,-]+|mypage\/)$/.test(p);
}

export const PHOTO_STATUS_LABEL: Record<PhotoStatus, string> = {
  none: "미제출",
  pending: "심사 중",
  approved: "승인",
  rejected: "반려",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  none: "미인증",
  pending: "심사 중",
  approved: "인증 완료",
  reverify: "재인증 필요",
  rejected: "반려",
};

export const JOB_TYPES: { key: JobType; label: string }[] = [
  { key: "employee", label: "직장인" },
  { key: "business", label: "사업자" },
  { key: "other", label: "기타(전문직·프리랜서 등)" },
];

/** 구분별 서류 종류 — 서버 VERIFY_DOC_KINDS 와 같은 key */
export const DOC_KINDS: Record<JobType, { key: string; label: string }[]> = {
  employee: [
    { key: "employment_cert", label: "재직증명서" },
    { key: "business_card", label: "명함" },
    { key: "employee_id", label: "사원증" },
    { key: "health_insurance", label: "건강보험 자격득실확인서" },
  ],
  business: [{ key: "biz_registration", label: "사업자등록증" }],
  other: [
    { key: "license", label: "자격증" },
    { key: "contract", label: "위촉·용역계약서" },
    { key: "etc", label: "기타 직업 증빙 서류" },
  ],
};

/** 동의문 (명세 5-1, 5-2) */
export const PHOTO_CONSENT: { title: string; items: [string, string][]; notes: string[] } = {
  title: "사진 수집·이용 동의 (필수)",
  items: [
    ["수집 항목", "얼굴이 포함된 사진 2장"],
    ["이용 목적", "파티 참가자 사전 심사, 파티 현장 본인 확인"],
    ["보유 기간", "회원 탈퇴 시까지 (반려·교체된 사진은 30일 후 삭제)"],
  ],
  notes: [
    "등록한 사진은 운영진만 확인하며 다른 참가자에게 공개하지 않습니다. 자동 얼굴 인식 등 기술적 처리를 하지 않습니다.",
    "동의를 거부할 수 있으나, 거부 시 파티 신청이 제한됩니다.",
  ],
};

export const JOB_CONSENT: { title: string; items: [string, string][]; notes: string[] } = {
  title: "직업 증빙 서류 수집·이용 동의 (선택)",
  items: [
    ["수집 항목", "직업 증빙 서류 이미지(재직증명서·명함·사원증·건강보험 자격득실확인서·사업자등록증 등), 사업자등록번호·개업일자(사업자)"],
    ["이용 목적", "직업 확인 및 '직업 인증' 표시"],
    ["보유 기간", "서류 이미지는 확인 즉시 삭제, 인증 결과(구분·표시 직업·일시)는 회원 탈퇴 시까지"],
  ],
  notes: [
    "주민등록번호는 수집하지 않으며, 가려지지 않은 서류는 즉시 삭제합니다.",
    "동의를 거부해도 파티 신청에는 제한이 없습니다.",
  ],
};

const MAX_SIDE = 1600;

/**
 * 고른 사진을 브라우저에서 JPEG 로 다시 그려 올린다 — iPhone 사진(HEIC)도 브라우저가 열 수 있으면 JPEG 가 된다.
 * 촬영 방향은 브라우저가 반영해서 그린다. 긴 변 1600px 로 줄인다. 열 수 없는 사진이면 null.
 * (서버도 다시 저장하며 EXIF 를 지운다 — 이 변환은 용량·HEIC 대응용)
 */
export async function toUploadJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), "image/jpeg", 0.9));
  } catch {
    return null;
  }
}
