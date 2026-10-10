/**
 * 파티 상세페이지 안내(detail) — 구조, 기본 내용(템플릿), 입력 제한.
 *
 * - 파티에 detail 이 없으면 종류별 템플릿으로 보여준다 (기존 매칭파티는 따로 손대지 않아도 지금과 같게 보인다).
 * - 관리자가 저장하면 편집기 내용이 그 파티의 detail 로 저장되고, 이후에는 그 파티 전용 내용이 된다.
 * - 상세페이지 화면(app/party/[id]/PartyClientView.tsx)과 관리자 편집기가 같이 쓴다.
 * - 입력 제한·사진 주소 규칙은 서버(api/lib.php sanitizePartyDetail)에서도 같은 값으로 강제한다.
 */
import type { PartyType } from "./data";
import { PARTY_GUIDES, visibleNotices } from "./partyGuides";

export type PartyDetailImage = { url: string; alt: string };
export type PartyDetailStep = { title: string; time: string; desc: string; note: string };
export type PartyDetailDurationRow = { label: string; total: string };
/** 소개글 묶음 — 소제목·본문·사진 (docs/specs/party-solo-guide.md 7-1). 셋 중 하나 이상 있어야 한다 */
export type PartyAboutSection = { heading: string; body: string; images: PartyDetailImage[] };
export const DEFAULT_ABOUT_TITLE = "파티 소개";
/** 참가 신청 방법·필수 확인 사항 (docs/specs/party-guide-edit.md 3-1). 없으면 상세페이지는 종류별 기본 문구(partyGuides.ts) */
export type PartyApplyStep = { title: string; desc: string; note: string };
export type PartyNoticeItem = { title: string; desc: string; warn: string };
export type PartyApply = { title: string; steps: PartyApplyStep[] };
export type PartyNotice = { title: string; intro: string; items: PartyNoticeItem[] };
export const DEFAULT_APPLY_TITLE = "참가 신청 방법";
export const DEFAULT_NOTICE_TITLE = "필수 확인 사항";

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
  timeline: { title: string; intro: string; steps: PartyDetailStep[]; numbered?: boolean };   // numbered 없음 = true(번호 형식)
  durations: { title: string; rows: PartyDetailDurationRow[] };
  images: Record<DetailImageSlot, PartyDetailImage[]>;
  about: { title: string; sections: PartyAboutSection[] };   // 묶음 0개면 상세페이지에 영역 자체가 없다
  apply?: PartyApply;     // 저장된 경우만 — 단계 0개면 영역 숨김
  notice?: PartyNotice;   // 저장된 경우만 — 항목 0개면 영역 숨김
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
  applyTitle: 40,
  applySteps: 8,
  applyStepTitle: 60,
  applyStepDesc: 500,
  applyStepNote: 300,
  noticeTitle: 40,
  noticeIntro: 200,
  noticeItems: 10,
  noticeItemTitle: 60,
  noticeItemDesc: 500,
  noticeItemWarn: 200,
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
  timeline: { title: DEFAULT_TIMELINE_TITLE, intro: "", steps: [], numbered: false },   // 솔로파티는 자유 형식이 기본
  durations: { title: DEFAULT_DURATIONS_TITLE, rows: [] },
  images: { beforeApply: [], afterApply: [], beforeTimeline: [], beforeNotice: [], afterNotice: [] },
  about: { title: DEFAULT_ABOUT_TITLE, sections: [] },
};

/** 참가 신청 방법 기본 문구 — 지금 고정 문구(partyGuides.ts) 그대로 */
export function defaultApply(type: PartyType): PartyApply {
  return { title: DEFAULT_APPLY_TITLE, steps: PARTY_GUIDES[type].steps.map(s => ({ title: s.title, desc: s.desc, note: s.note ?? "" })) };
}

/** 필수 확인 사항 기본 문구 — 솔로파티 "신청한 회차 시간 지키기"는 참가 구성(회차)이 있을 때만 */
export function defaultNotice(type: PartyType, hasSessions: boolean): PartyNotice {
  const g = PARTY_GUIDES[type];
  return { title: DEFAULT_NOTICE_TITLE, intro: g.noticeIntro, items: visibleNotices(g, hasSessions).map(n => ({ title: n.title, desc: n.desc, warn: n.warn ?? "" })) };
}

/** 종류별 기본 내용 (편집기에서 고칠 수 있도록 매번 새 복사본). 참가 신청 방법·필수 확인 사항 기본 문구 포함 */
export function templateFor(type: PartyType, hasSessions = false): PartyDetail {
  return { ...cloneDetail(type === "solo" ? SOLO_TEMPLATE : MATCHING_TEMPLATE), apply: defaultApply(type), notice: defaultNotice(type, hasSessions) };
}

/** 편집기에 채울 값 — 저장된 안내에 참가 신청 방법·필수 확인 사항이 없으면 기본 문구로 채운다 (화면은 이미 기본 문구로 보이고 있으므로) */
export function withGuideDefaults(d: PartyDetail, type: PartyType, hasSessions: boolean): PartyDetail {
  return { ...d, apply: d.apply ?? defaultApply(type), notice: d.notice ?? defaultNotice(type, hasSessions) };
}

/**
 * 저장할 값 — 기본 문구와 똑같은 참가 신청 방법·필수 확인 사항은 빼고, 번호 형식(true)은 numbered 를 뺀다.
 * 편집하지 않은 파티를 그대로 다시 저장해도 저장 값과 화면이 바뀌지 않게 하기 위해서다(빠진 값은 종류별 기본 문구로 보인다).
 */
export function compactDetailForSave(d: PartyDetail, type: PartyType): PartyDetail {
  const out: PartyDetail = cloneDetail(d);
  if (out.timeline.numbered !== false) delete out.timeline.numbered;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (out.apply && same(out.apply, defaultApply(type))) delete out.apply;
  // 필수 확인 사항은 회차 항목 포함/미포함 기본 문구 둘 다 "기본 문구"로 본다 — 빠지면 화면이 참가 구성 여부에 맞춰 기본 문구를 고른다
  if (out.notice && (same(out.notice, defaultNotice(type, true)) || same(out.notice, defaultNotice(type, false)))) delete out.notice;
  return out;
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
      ...(tl.numbered === false ? { numbered: false } : {}),
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
    // 참가 신청 방법·필수 확인 사항 — 저장된 경우만
    ...(r.apply && typeof r.apply === "object" ? { apply: {
      title: str(obj(r.apply).title),
      steps: arr(obj(r.apply).steps).map(x => ({ title: str(obj(x).title), desc: str(obj(x).desc), note: str(obj(x).note) })),
    } } : {}),
    ...(r.notice && typeof r.notice === "object" ? { notice: {
      title: str(obj(r.notice).title),
      intro: str(obj(r.notice).intro),
      items: arr(obj(r.notice).items).map(x => ({ title: str(obj(x).title), desc: str(obj(x).desc), warn: str(obj(x).warn) })),
    } } : {}),
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
