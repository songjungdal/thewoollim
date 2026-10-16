/**
 * 파티 상세 고정 안내 문구 — 파티 종류별 (docs/specs/party-solo-guide.md 5·6장).
 *  - "신청 전 꼭 확인해주세요" 박스, "참가 신청 방법" 단계, "필수 확인 사항" 목록
 *  - 매칭파티 문구는 이전에 PartyClientView.tsx 에 고정돼 있던 문구를 그대로 옮긴 것이다 (한 글자도 바꾸지 않음).
 *  - 솔로파티 문구는 명세 6장 그대로. 파티마다 다른 내용은 소개글(detail.about)에 쓴다.
 */
import type { PartyType } from "./data";

/** 강조(굵게) 구간을 나눠 둔 한 문단 */
export type GuideText = { text: string; strong?: boolean }[];

export type GuideStep = { title: string; desc: string; note: string | null };
export type GuideNotice = { title: string; desc: string; warn: string | null; onlyWithSessions?: boolean };

export type PartyGuide = {
  beforeApply: GuideText;        // 신청 전 꼭 확인해주세요
  steps: GuideStep[];            // 참가 신청 방법
  noticeIntro: string;           // 필수 확인 사항 머리말
  notices: GuideNotice[];        // 필수 확인 사항 (onlyWithSessions: 회차가 있는 파티에서만)
};

const REFUND_NOTE = "성비가 맞지 않거나 주최측의 사정으로 파티가 취소될 경우 100% 환불이나 쿠폰 적립 후 다음 모임 선확정 중 선택하실 수 있습니다.";
const PHOTO_NOTICE: GuideNotice = {
  title: "현장 기록 및 마케팅 활용 안내",
  desc:  "파티의 분위기를 기록하기 위해 현장 스케치 촬영이 진행될 수 있습니다. 촬영된 모든 사진은 참가자의 프라이버시 보호를 위해 얼굴 식별이 불가능하도록 블러/모자이크 처리 후 마케팅 자료로 활용됩니다.",
  warn:  null,
};

export const PARTY_GUIDES: Record<PartyType, PartyGuide> = {
  matching: {
    beforeApply: [
      { text: "어울림은 진정성 있는 만남을 위해 " },
      { text: "100% 사전 승인제", strong: true },
      { text: "로 운영됩니다. 결제 후 프로필 정보를 입력해 주시면 " },
      { text: "[확정 대기 중]", strong: true },
      { text: " 상태가 되며, 관리자의 꼼꼼한 확인을 거쳐 최종 " },
      { text: "[참가 확정]", strong: true },
      { text: "이 이루어집니다. 참가 확정 및 안내 문자는 확정 시점에 맞춰 순차적으로 발송됩니다." },
    ],
    steps: [
      {
        title: "파티 카드를 확인하고 결제하기",
        desc: "파티 카드의 일시, 장소, 연령대를 확인하고 결제해주세요.",
        note: null,
      },
      {
        title: "프로필 카드 작성하기",
        desc: "프로필 카드 작성을 완료해야 참가확정을 받으실 수 있습니다.",
        note: "마이페이지의 내 예약 현황에서 현재 참가 확정 여부를 확인하실 수 있습니다.",
      },
      {
        title: "파티 참가확정 확인 후 방문하기",
        desc: "참가확정이 되어야만 참석 가능하오니 알림 문자나 참가 확정 여부를 꼭 확인해주세요!",
        note: REFUND_NOTE,
      },
    ],
    noticeIntro: "편안하고 신뢰할 수 있는 만남을 위해 아래 내용을 꼭 확인해 주세요.",
    notices: [
      {
        title: "본인 확인을 위한 신분증 지참",
        desc:  "안전하고 투명한 만남을 위해 사전 인증이 완료된 분들만 참여 가능합니다. 현장에서 본인 확인 절차가 진행되오니, 신분증(주민등록증, 운전면허증 등)을 반드시 지참해 주세요.",
        warn:  "미지참 시 입장이 제한될 수 있으며, 이로 인한 환불은 불가합니다.",
      },
      {
        title: "드레스코드 — 깔끔하고 단정한 차림",
        desc:  "첫인상은 소중한 인연의 시작입니다. 상대방에 대한 예의를 갖춘 깔끔한 소개팅 복장(셔츠, 슬랙스, 원피스 등)을 권장합니다.",
        warn:  "트레이닝복, 슬리퍼 등 과하게 편안한 복장은 입장이 제한될 수 있습니다.",
      },
      {
        title: "성숙한 매너와 배려",
        desc:  "서로를 존중하는 따뜻한 분위기를 지향합니다. 과도한 음주, 무례한 언행 등 타인에게 불편을 주는 경우 운영진의 판단에 따라 즉시 퇴장 조치될 수 있으며 참가비는 환불되지 않습니다.",
        warn:  null,
      },
      {
        title: "신중한 참가 신청",
        desc:  "파티는 정해진 성비를 맞추어 세심하게 준비됩니다. 당일 무단 불참(No-Show)은 다른 참가자분들의 소중한 기회를 저해하므로 신중한 참가신청을 부탁드립니다.",
        warn:  "무단 불참 시 향후 모든 파티 참여가 제한될 수 있습니다.",
      },
      PHOTO_NOTICE,
    ],
  },
  solo: {
    beforeApply: [
      { text: "솔로파티는 MC 진행에 따라 게임과 대화를 즐기는 " },
      { text: "단체 파티", strong: true },
      { text: "입니다. 결제하시면 " },
      { text: "[확정 대기 중]", strong: true },
      { text: " 상태가 되며, 운영진이 성비와 참가 조건을 확인한 뒤 " },
      { text: "[참가 확정]", strong: true },
      { text: " 문자를 보내드립니다. 별도의 프로필 카드 작성은 필요 없습니다." },
    ],
    steps: [
      {
        title: "파티 확인하고 결제하기",
        desc: "일시·장소·참가 대상을 확인하고, 참가 항목(1부·2부 등)이 있다면 원하는 항목을 골라 결제해 주세요.",
        note: null,
      },
      {
        title: "참가 확정 문자 확인하기",
        desc: "결제하시면 [확정 대기 중] 상태가 되고, 운영진 확인 후 참가 확정 문자를 보내드립니다. 별도의 프로필 작성은 필요 없습니다.",
        note: "마이페이지의 내 예약 현황에서 참가 확정 여부를 확인하실 수 있습니다.",
      },
      {
        title: "신분증 챙겨서 방문하기",
        desc: "참가가 확정되면, 신청하신 파티(회차) 시작 시각에 맞춰 신분증을 지참하고 방문해 주세요.",
        note: REFUND_NOTE,
      },
    ],
    noticeIntro: "모두가 즐겁고 안전한 파티를 위해 아래 내용을 꼭 확인해 주세요.",
    notices: [
      {
        title: "신분증 지참 (본인·성인 확인)",
        desc:  "술과 함께하는 파티로, 입장 시 신분증으로 본인 여부와 성인 여부를 확인합니다. 신분증(주민등록증, 운전면허증 등)을 꼭 지참해 주세요.",
        warn:  "미지참 시 입장이 제한될 수 있으며, 이로 인한 환불은 불가합니다.",
      },
      {
        title: "드레스코드 — 깔끔하고 편안한 캐주얼",
        desc:  "게임과 활동이 있는 파티입니다. 깔끔하면서도 움직이기 편한 캐주얼 복장을 권장합니다.",
        warn:  "트레이닝복, 슬리퍼 등 과하게 편안한 복장은 입장이 제한될 수 있습니다.",
      },
      {
        title: "건강한 음주 매너",
        desc:  "음주는 자율입니다. 자신의 주량에 맞게 즐겨 주시고, 다른 분께 술을 권하거나 강요하지 말아 주세요. 음주 후에는 절대 운전하지 마시고 대중교통이나 대리운전을 이용해 주세요.",
        warn:  "과도한 음주로 다른 참가자에게 불편을 주는 경우 즉시 퇴장 조치되며, 참가비는 환불되지 않습니다.",
      },
      {
        title: "서로를 존중하는 매너",
        desc:  "게임 중에도 상대방이 불편해하는 신체 접촉이나 언행은 삼가 주세요. 불편한 상황이 생기면 언제든 MC나 운영진에게 말씀해 주세요.",
        warn:  "위반 시 운영진 판단에 따라 즉시 퇴장 조치되며, 참가비는 환불되지 않습니다.",
      },
      {
        title: "신청한 회차 시간 지키기",
        desc:  "신청하신 회차의 시작 시각에 맞춰 입장해 주세요. 신청하지 않은 회차에는 참여할 수 없습니다.",
        warn:  null,
        onlyWithSessions: true,
      },
      {
        title: "신중한 참가 신청",
        desc:  "파티는 정해진 성비를 맞추어 세심하게 준비됩니다. 당일 무단 불참(No-Show)은 다른 참가자분들의 즐거운 시간을 해치므로 신중한 참가 신청을 부탁드립니다.",
        warn:  "무단 불참 시 향후 모든 파티 참여가 제한될 수 있습니다.",
      },
      PHOTO_NOTICE,
    ],
  },
};

/** 화면에 보일 필수 확인 사항 — 회차 전용 항목은 회차(참가 구성)가 있는 파티에서만 */
export function visibleNotices(guide: PartyGuide, hasSessions: boolean): GuideNotice[] {
  return guide.notices.filter(n => !n.onlyWithSessions || hasSessions);
}

/** 신청 전 확인 박스 본문을 편집용 글자로 — 굵은 구간을 **…** 로 감싼다 (docs/specs/party-box-sms.md 1-1) */
export function guideTextToMarkup(t: GuideText): string {
  return t.map(seg => (seg.strong ? `**${seg.text}**` : seg.text)).join("");
}

/** 편집용 글자 → 굵게/보통 구간. **…** 로 감싼 부분만 굵게, 그 밖의 기호는 글자 그대로 */
export function markupToGuideText(body: string): GuideText {
  const out: GuideText = [];
  const re = /\*\*([\s\S]+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    out.push({ text: m[1], strong: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}
