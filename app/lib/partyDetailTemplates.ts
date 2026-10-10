/**
 * 파티 상세페이지 안내(detail) — 구조, 기본 내용(템플릿), 입력 제한.
 *
 * - 파티에 detail 이 없으면 종류별 템플릿으로 보여준다 (기존 매칭파티는 따로 손대지 않아도 지금과 같게 보인다).
 * - 관리자가 저장하면 편집기 내용이 그 파티의 detail 로 저장되고, 이후에는 그 파티 전용 내용이 된다.
 * - 상세페이지 화면(app/party/[id]/PartyClientView.tsx)과 관리자 편집기가 같이 쓴다.
 * - 입력 제한·사진 주소 규칙은 서버(api/lib.php sanitizePartyDetail)에서도 같은 값으로 강제한다.
 */
import type { PartyType } from "./data";

export type PartyDetailImage = { url: string; alt: string };
export type PartyDetailStep = { title: string; time: string; desc: string; note: string };
export type PartyDetailDurationRow = { label: string; total: string };
/** 소개글 묶음 — 소제목·본문·사진 (docs/specs/party-solo-guide.md 7-1). 셋 중 하나 이상 있어야 한다 */
export type PartyAboutSection = { heading: string; body: string; images: PartyDetailImage[] };
export const DEFAULT_ABOUT_TITLE = "파티 소개";

export const DETAIL_IMAGE_SLOTS = ["beforeApply", "afterApply", "beforeTimeline", "beforeNotice", "afterNotice"] as const;
export type DetailImageSlot = typeof DETAIL_IMAGE_SLOTS[number];
export const DETAIL_IMAGE_SLOT_LABELS: Record<DetailImageSlot, string> = {
  beforeApply:    "사진 ① 참가 신청 방법 위",
  afterApply:     "사진 ② 참가 신청 방법 아래",
  beforeTimeline: "사진 ③ 진행 안내 위",
  beforeNotice:   "사진 ④ 필수 확인 사항 위",
  afterNotice:    "사진 ⑤ 필수 확인 사항 아래",
};

export type PartyDetail = {
  timeline: { title: string; intro: string; steps: PartyDetailStep[] };
  durations: { title: string; rows: PartyDetailDurationRow[] };
  images: Record<DetailImageSlot, PartyDetailImage[]>;
  about: { title: string; sections: PartyAboutSection[] };   // 묶음 0개면 상세페이지에 영역 자체가 없다
};

/** 입력 제한 — api/lib.php sanitizePartyDetail 과 같은 값 */
export const DETAIL_LIMITS = {
  timelineTitle: 60,
  intro: 200,
  steps: 10,
  stepTitle: 60,
  stepTime: 20,
  stepDesc: 500,
  stepNote: 200,
  durationsTitle: 60,
  durationRows: 6,
  durationLabel: 30,
  durationTotal: 30,
  imagesPerSlot: 10,
  imageAlt: 100,
  aboutTitle: 40,
  aboutSections: 10,
  aboutHeading: 40,
  aboutBody: 2000,
  aboutImages: 10,
} as const;

/** 사진 주소 허용 규칙 — /uploads/parties/파일명 또는 /images/파일명 만 (외부 주소 불가) */
export const DETAIL_IMAGE_URL_RE = /^\/(uploads\/parties|images)\/[A-Za-z0-9._-]+$/;

const DEFAULT_TIMELINE_TITLE  = "Party Timeline";
const DEFAULT_TIMELINE_INTRO  = "편안한 분위기 속에서, 자연스럽게 이어지는 인연의 시작";
const DEFAULT_DURATIONS_TITLE = "인원별 소요 시간 안내";

/** 매칭파티 기본 내용 — 지금 상세페이지에 고정된 문구·사진·순서를 그대로 옮긴 것 */
export const MATCHING_TEMPLATE: PartyDetail = {
  timeline: {
    title: DEFAULT_TIMELINE_TITLE,
    intro: DEFAULT_TIMELINE_INTRO,
    steps: [
      {
        title: "설레는 첫 만남과 입장",
        time: "10분",
        desc: "프라이빗한 만남을 위한 간단한 확인 후 입장이 진행됩니다. 웰컴 드링크와 함께 여유롭게 긴장을 풀고, 오늘의 만남을 편안하게 시작해 보세요.",
        note: "",
      },
      {
        title: "나를 표현하는 매칭 카드 작성",
        time: "10분",
        desc: "나의 취향과 가치관을 담은 프로필을 작성합니다. 부담 없이 서로를 이해하고 자연스럽게 대화를 시작할 수 있는 준비 시간입니다.",
        note: "",
      },
      {
        title: "1:1 로테이션 대화",
        time: "",
        desc: "모든 참가자와 한 분씩 돌아가며 1:1 대화를 나눕니다. 각 테마에 맞춰 큐레이션된 스페셜 페어링(티, 와인, 사케 등)이 대화의 즐거움을 더해줍니다.",
        note: "대화 시간은 인원 구성에 따라 1인당 10~15분 내외로 유연하게 운영됩니다.",
      },
      {
        title: "최종 매칭 및 종료",
        time: "20분",
        desc: "모든 대화가 끝난 후, 가장 인상 깊었던 분을 선택하는 시간입니다. 서로의 마음이 닿은 커플에게는 인연을 이어갈 수 있는 연락처를 조심스럽게 전달해 드립니다.",
        note: "",
      },
    ],
  },
  durations: {
    title: DEFAULT_DURATIONS_TITLE,
    rows: [
      { label: "6 : 6 파티",   total: "약 2시간" },
      { label: "8 : 8 파티",   total: "약 2시간 30분" },
      { label: "10 : 10 파티", total: "약 3시간" },
    ],
  },
  images: {
    beforeApply:    [{ url: "/images/party_apply_guide_head.png", alt: "참가 신청 안내" }],
    afterApply:     [{ url: "/images/page_a01.webp", alt: "참가 신청 방법 안내" }],
    beforeTimeline: [
      { url: "/images/party_our_experience.webp", alt: "OUR EXPERIENCE" },
      { url: "/images/page_a02.webp", alt: "Party Timeline 안내" },
      { url: "/images/page_a03.webp", alt: "Party Timeline 안내" },
    ],
    beforeNotice:   [{ url: "/images/page_a04.webp", alt: "필수 확인 사항 안내" }],
    afterNotice:    [
      { url: "/images/page_a05.webp", alt: "필수 확인 사항 안내" },
      { url: "/images/party_required_notice_bottom.png", alt: "필수 확인 사항 안내" },
    ],
  },
  about: { title: DEFAULT_ABOUT_TITLE, sections: [] },
};

/** 솔로파티 기본 내용 — 모두 비어 있음 (제목 필드 기본값만) */
export const SOLO_TEMPLATE: PartyDetail = {
  timeline: { title: DEFAULT_TIMELINE_TITLE, intro: "", steps: [] },
  durations: { title: DEFAULT_DURATIONS_TITLE, rows: [] },
  images: { beforeApply: [], afterApply: [], beforeTimeline: [], beforeNotice: [], afterNotice: [] },
  about: { title: DEFAULT_ABOUT_TITLE, sections: [] },
};

/** 종류별 기본 내용 (편집기에서 고칠 수 있도록 매번 새 복사본) */
export function templateFor(type: PartyType): PartyDetail {
  return cloneDetail(type === "solo" ? SOLO_TEMPLATE : MATCHING_TEMPLATE);
}

export function cloneDetail(d: PartyDetail): PartyDetail {
  return JSON.parse(JSON.stringify(d)) as PartyDetail;
}

/** API 응답 등 외부 값을 PartyDetail 모양으로 맞춘다. 모양이 아니면 null. */
export function normalizeDetail(raw: unknown): PartyDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const tl = obj(r.timeline);
  const du = obj(r.durations);
  const im = obj(r.images);
  const ab = obj(r.about);
  const imageList = (v: unknown) => arr(v)
    .map(x => ({ url: str(obj(x).url), alt: str(obj(x).alt) }))
    .filter(x => DETAIL_IMAGE_URL_RE.test(x.url));
  const images = {} as Record<DetailImageSlot, PartyDetailImage[]>;
  for (const slot of DETAIL_IMAGE_SLOTS) {
    images[slot] = imageList(im[slot]);
  }
  return {
    timeline: {
      title: str(tl.title),
      intro: str(tl.intro),
      steps: arr(tl.steps).map(x => {
        const s = obj(x);
        return { title: str(s.title), time: str(s.time), desc: str(s.desc), note: str(s.note) };
      }),
    },
    durations: {
      title: str(du.title),
      rows: arr(du.rows).map(x => ({ label: str(obj(x).label), total: str(obj(x).total) })),
    },
    images,
    // 소개글 — 없던 예전 파티는 묶음 0개
    about: {
      title: str(ab.title),
      sections: arr(ab.sections).map(x => {
        const s = obj(x);
        return { heading: str(s.heading), body: str(s.body), images: imageList(s.images) };
      }),
    },
  };
}

/** 사진 총 장수 (안내·기록용) */
export function detailPhotoCount(d: PartyDetail): number {
  return DETAIL_IMAGE_SLOTS.reduce((n, slot) => n + d.images[slot].length, 0)
    + d.about.sections.reduce((n, s) => n + s.images.length, 0);
}
