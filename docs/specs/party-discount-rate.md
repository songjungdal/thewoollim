# 파티 참가비 할인율 개발 명세서

- 작성일: 2026-10-26
- 기준 코드: `songjungdal/thewoollim` main `a7af4f9`
- 목적: 파티 참가비에 "할인율" 기능을 추가한다. 화면 표시와 실제 결제 금액이 모두 할인가로 맞춰져야 한다.
- 명세와 다르게 구현해야 할 이유가 생기면 구현 전에 먼저 알린다.
- 관리자 화면 경로는 `/admin****`로 가려서 적는다.

---

## 원칙

- 결제 금액은 서버 `api/lib.php`의 `priceForGender` 한 곳에서만 할인을 적용한다.
  프론트 `app/lib/data.ts`의 `priceForGender`도 같은 규칙으로 맞춘다 (두 함수 결과가 항상 같아야 한다).
- 그 외 결제 로직(pending, success, vbank-submit, refund, cancel, 쿠폰 계산, 정원 검사)은 고치지 않는다.
  두 함수만 바꾸면 자동으로 따라오게 한다.
- 참가 구성(options) 파티는 대상이 아니다. 화면·결제 모두 기존 그대로.
- 할인율이 0이거나 없으면 모든 화면과 결제 금액이 지금과 완전히 같아야 한다.
- 이미 결제된 예약의 금액(저장된 결제 금액)은 할인율이 바뀌어도 변하면 안 된다.
- 쿠폰은 할인가 기준으로 추가 적용된다 (할인 + 쿠폰 중복 허용).

## 1. 데이터 - `api/data/parties.json`

- 파티 객체에 `discountRate`(정수, 기본 0) 추가. DB 마이그레이션은 필요 없다.
- `api/admin/parties.php` `sanitizeParty`: `'discountRate'` => 0~90 정수만 허용, 그 외 값은 0
- `api/parties.php`, `party-detail.php` 등 파티를 내려주는 곳에서 `discountRate`를 내려준다.
- 프론트 `Party` 타입(`app/lib/data.ts`), `partyNormalize.ts`, 관리자 폼 타입에 `discountRate` 추가.

## 2. 금액 계산 함수

- 프론트 `app/lib/data.ts`
  - `export function discountedPrice(price: number, rate?: number): number`
    - rate가 1~90 정수가 아니면 price 그대로
    - `Math.floor(price * (100 - rate) / 100000) * 1000` → 천원 미만 내림 (69,000원 20% → 55,000)
  - `export function basePriceForGender(party, gender): number`
    - 할인 적용 전 성별 가격 (기존 `priceForGender`의 지금 계산 그대로). 화면 표시 전용, 결제 계산에 쓰지 않는다.
- 서버 `api/lib.php`
  - `function discountedPrice(int $price, $rate): int` — 같은 규칙 (`intdiv($price * (100 - $rate), 100000) * 1000`)
- 두 `priceForGender` 모두: options 파티가 아니면 지금 계산한 성별 가격에 `discountedPrice(가격, discountRate)`를 적용해서 반환.
  options 파티 분기는 손대지 않는다.

## 3. 결제 연동 확인 (코드 수정 없이 동작 확인)

- 결제창(checkout), 결제 준비(`api/payments/pending.php` expectedAmount), 승인(`success.php`), 무통장(`vbank-submit.php`)이
  모두 할인가로 계산되는지 확인한다.
- `success.php`는 pending 때 저장한 금액과 비교하는 지금 방식을 그대로 둔다
  (결제 도중 할인율이 바뀌면 금액 불일치로 자동 취소되는 기존 안전장치 유지).
- 환불·취소(`refund.php`, `cancel-request.php`)와 마이페이지 예약 내역이 "저장된 결제 금액"을 쓰는지 확인한다.
  현재 파티 가격으로 다시 계산하는 곳이 있으면 고치지 말고 멈추고 보고한다.
- `api/integrations/autoinsta-parties.php`는 `priceForGender`를 쓰므로 할인가가 나간다. 새 필드는 추가하지 않는다.
- `app/lib/partySeo.ts`(검색엔진용 가격)는 자체 계산이므로 `discountedPrice`를 적용해 화면 가격과 맞춘다.

## 4. 공통 화면 컴포넌트 2개 - `app/components/`에 새 파일

### (1) DiscountArrow: 정가 + 빨간 화살표

- 감싸는 요소: relative, inline-flex, items-center
- 정가 텍스트: #9ca3af, font-semibold, tabular-nums, nowrap, 취소선(line-through) 쓰지 않음
  - size "panel": 모바일 13px + 오른쪽 여백 24px / md 이상 14px + 오른쪽 여백 26px
  - size "small": 12px + 오른쪽 여백 20px (md 이상 13px + 22px)
  - size "bar": 12px + 오른쪽 여백 18px
- 빨간 선: absolute, left -2px ~ right 1px, 세로 50%, 높이 2px, rounded,
  그라데이션 #F7A9B0 → #E11D2E, pointer-events-none. 정가 글자 가운데를 지나 오른쪽 여백까지 끊김 없이.
- 화살촉: 오른쪽 끝 absolute, 세로 가운데, SVG 9×12, path "M2 1l6 5-6 5", stroke #E11D2E 2px, round

### (2) DiscountBadge: "20%할인" 배지

- rounded-full, bg #E11D2E, 흰 글씨, line-height 1, nowrap, 그림자 없음
- "{rate}%" font-black + "할인" font-bold, 간격 1px, baseline 정렬
- 모바일: padding 3px 5px, 숫자 10px / 할인 9px · md 이상: padding 3px 6px, 숫자 11px / 할인 10px

## 5. 상세페이지 정보 패널 - `app/party/[id]/PartyClientView.tsx` 참가비 행

할인율 1 이상 + options 파티 아님일 때만. 행 높이는 일시 행과 비슷하게 유지.

- 정가 = `basePriceForGender`, 할인가 = `discountedPrice(정가, discountRate)`

모바일(md 미만) 남/여 분리:

- 기존 infoRow(₩ 아이콘 + 값) 유지. dd 안 grid: [성별 라벨 28px | DiscountArrow | 할인가 | DiscountBadge]
  column-gap 6px, row-gap 5px, items-center, justify-start
- 성별 라벨: text-male / text-female 12px bold
- 할인가: 18px font-black #E11D2E tabular-nums nowrap (360px 미만 16px)
- 남성 한 줄, 여성 한 줄. 360px에서 줄바꿈 없이.

md 이상 남/여 분리:

- 기존 infoRow(아이콘 + "참가비" 라벨) 유지. dd: flex items-center gap 16px, 넘치면 wrap
  [남성 묶음] [세로 구분선 1px × 26px gray-200] [여성 묶음]
- 묶음: inline-flex gap 7px → 성별 라벨(13px) · DiscountArrow · 할인가(22px, lg도 22px) · DiscountBadge

단일 가격: [DiscountArrow] [할인가] [DiscountBadge] 한 줄, wrap 허용

"정상가", "할인가" 글자는 넣지 않는다.

## 6. PC 하단 고정 바 - `PartyBottomBar.tsx`

- BarFee split/single에 `discountRate?: number` 추가 (from 타입은 그대로).
- 할인 시 윗줄: "참가비" 옆 gap 6px 배지 "20% 할인" (bg #E11D2E, 흰 글씨, rounded-full, padding 2px 6px, 숫자 11px black + 할인 10px bold)
  아랫줄(gap 6px, nowrap): 남 [DiscountArrow size=bar, ₩ 없이 "69,000"] [₩55,000 20px font-black #E11D2E] · 여 [같은 형태]
  single: [DiscountArrow size=bar] [할인가]
- 바 높이·레이아웃·버튼은 그대로.

## 7. 결제 페이지 - `app/checkout/page.tsx`

- 금액은 `priceForGender`를 통해 자동으로 할인가가 된다. 화면 디자인은 바꾸지 않는다.
- 기존 "할인" 줄(쿠폰 할인액)은 쿠폰 할인만 계속 보여준다.

## 8. 마이페이지 장바구니 - `app/mypage/page.tsx`

- 장바구니 카드 금액 영역 (할인율 1 이상 + options 파티 아님일 때만):
  - 쿠폰 없음: [DiscountArrow size=panel (정가)] [할인가 20px(lg 24px) font-black #E11D2E] [DiscountBadge] 한 줄
    - 모바일은 왼쪽 "결제 금액" 라벨 유지, 오른쪽에 위 내용
  - 쿠폰 적용: 세로 2줄, 오른쪽 정렬
    - 윗줄: [DiscountArrow size=small (정가)] [할인가 13px(lg 14px) font-extrabold #E11D2E] [DiscountBadge]
    - 아랫줄: "쿠폰 적용"(11px font-extrabold text-brand-point-ink) + 최종 금액(기존 쿠폰 적용 금액 스타일 그대로, text-brand-point-ink)
  - 기존 쿠폰 적용 시 회색 취소선 금액(`<s>`)은 위 윗줄로 대체한다.
- 할인 없는 파티 카드는 지금 그대로.
- 결제 요약(영수증):
  - 파티 할인 또는 쿠폰 할인이 하나라도 있으면 내역을 보여준다.
  - "상품 금액" = 선택한 파티들의 `basePriceForGender` 합 (정가 합)
  - "파티 할인" = 상품 금액 - 할인가 합 (0보다 클 때만, #E11D2E font-bold, "- ₩28,000")
  - "쿠폰 할인 (코드)" = 지금 그대로 (할인가 기준 쿠폰 금액)
  - 전체/선택 결제금액과 결제 버튼 금액은 지금 계산 그대로 (`priceForGender`가 할인가를 반환하므로 자동 반영)

## 9. 관리자 파티 등록/수정 폼 - `app/admin****/dashboard/page.tsx` "참가비 · 정원"

- 단일 가격 모드에서만 보인다 (참가 구성 모드에서는 숨김).
- 입력: label "할인율 (%)", number, min 0, max 90, step 1, 안쪽 오른쪽에 "%"
  - 기존 입력칸 스타일. 값이 1 이상이면 테두리 #E11D2E + 연한 빨강 포커스 링.
  - 안내문: "0 또는 비우면 할인 없음 · 1~90 정수"
- 배치
  - lg 이상: 기존 한 줄 4칸(남·여 참가비, 남·여 정원) 아래 줄 grid 4칸
    - 1칸 할인율 입력 / 2~3칸(span 2) 미리보기 / 4칸 기존 "입력한 정원이 결제 마감 기준이 됩니다." 안내
  - lg 미만: 남·여 참가비 바로 아래 할인율 입력(폭 140px) → 미리보기 → 남·여 정원
- 미리보기 (할인율 1 이상일 때만): label "상세페이지 표시"
  - 박스 rounded-[10px], bg #FFF6F7, border #FFE0E3, padding 10px 12px, 세로 gap 6px
  - 남·여 두 줄: 성별 라벨 · DiscountArrow · 할인가(16px font-black #E11D2E) · DiscountBadge (입력하면 바로 갱신)
  - 박스 아래 안내: "백원 단위 내림. 결제도 이 금액으로 진행됩니다."
- 저장할 때 `discountRate`를 함께 보낸다. 기존 필수값 검사는 바꾸지 않는다.

## 10. 관리자 파티 목록 표시

- 할인율 1 이상인 파티만 참가비 칸 변경. 할인 없는 파티·options 파티는 그대로.
- PC 표: [DiscountBadge] + "남 ₩55,000 / 여 ₩39,000"(font-black #E11D2E tabular-nums), 오른쪽 정렬
  - 아래 줄: "남 ₩69,000 / 여 ₩49,000" 12px #9ca3af 취소선 (남·여 가격 없으면 단일 가격으로 같은 형태)
- 모바일 카드: 할인가(빨강) + 배지, 아래 줄 정가 취소선
- 예약 합계·매출 등 이미 결제된 금액 표시는 바꾸지 않는다.

## 11. 확인

- 할인율 0: 상세페이지·하단 바·장바구니·결제창·관리자 화면과 결제 금액이 지금과 같은지
- 할인율 20, 남 69,000 / 여 49,000:
  - 상세 표시 55,000 / 39,000, 결제창 금액 55,000(남성 회원) / 39,000(여성 회원)
  - pending.php expectedAmount와 토스 결제 금액이 할인가와 같은지
- 장바구니: 남 69,000 20% 파티 2개 + 59,000 일반 파티 1개 + 10% 쿠폰 1장(할인 파티 1개에 적용)
  → 상품 금액 197,000 / 파티 할인 -28,000 / 쿠폰 -5,500 / 결제 163,500, 결제창 금액도 163,500
- 할인 + 쿠폰(정액·정률)을 함께 쓸 때 할인가 기준으로 계산되는지
- 결제 도중 할인율을 바꾸면 기존 안전장치대로 금액 불일치로 처리되는지
- 이미 결제된 예약의 마이페이지 금액·환불 금액이 할인율 변경 후에도 그대로인지
- 프론트 `priceForGender`와 서버 `priceForGender` 결과가 같은지 (같은 입력으로 비교)
- 관리자에서 할인율 저장 후 다시 열었을 때 값이 유지되는지
- 360px / 768px / 1280px에서 참가비·장바구니 금액 영역이 넘치지 않는지
- 빨간 선이 정가 글자 가운데를 지나 화살촉까지 끊김 없이 이어지는지
- 작업 보고: 변경 파일 목록, 결제 경로별 확인 결과, 명세와 다르게 한 부분(있다면)

## 12. 구현 메모 (2026-10-26)

명세와 다르게 하거나 명세에 없던 부분을 정한 것. ①~③은 구현 전에 사용자 확인을 받았다.

- ① 장바구니 영수증 "상품 금액": 할인 파티는 `basePriceForGender`(정가), 참가 구성 파티는 담은 항목 가격(할인 없음)을 더한다. 참가 구성 파티에 `basePriceForGender`를 쓰면 항목 가격이 아닌 대표 가격(`price`)이 나오기 때문.
- ② 참가 구성 모드로 저장하면 `discountRate`를 0으로 보낸다 (숨겨진 할인율이 남지 않게).
- ③ 수정 저장 요청에 `discountRate` 키가 없으면(배포 전 열어 둔 예전 관리자 화면) 기존 값을 유지한다 (`couponDisabled`와 같은 방식). 키가 있으면 0~90 정수만, 그 밖의 값은 0.
- 서버 `partyDiscountRate()`가 저장값을 0~90 정수로 읽고(숫자 1~2자리 문자열 포함), 공개 API(`parties.php`, `party-detail.php`)도 이 값을 내려 준다. 화면 `normalizeParty`도 같은 규칙.
- 정가(화살표) 앞 ₩는 768px 미만에서 작게(글자의 77%) 쓴다. 처음에는 생략했다가 2026-10-26 사용자 요청으로 작게 다시 넣었다. 그만큼 모바일 화살표 오른쪽 여백은 24px → 22px.
- 상세 정보 패널 모바일(2026-10-26 사용자 요청으로 정리): 배지는 줄마다가 아니라 남·여 두 줄 오른쪽에 **하나만** 두고, 성별 라벨 칸은 글자 폭만큼, 간격은 5px. 폭이 모자라면(10만 원 이상 금액, 320px 폰) 배지가 금액 아래 줄로 내려가 패널 밖으로 나가지 않는다. (예전의 "359px 이하에서 배지 숨김"은 없앴다)
- 상세 정보 패널 md 이상: 태블릿 폭에서 여성 묶음이 다음 줄로 내려가면 세로 구분선이 윗줄 끝에 남지 않도록, 구분선을 여성 묶음 왼쪽 간격에 그리고 줄 시작에서는 가린다.
- 장바구니 카드 모바일: 할인 파티는 "결제 금액" 라벨을 한 줄로 고정하고, 더 좁은 폭에서는 금액 줄이 오른쪽 정렬로 줄바꿈된다.
- 색은 `app/globals.css`에 토큰 `discount`(#E11D2E), `discount-light`(#F7A9B0), `discount-bg`(#FFF6F7), `discount-line`(#FFE0E3)으로 두었다.

- **PC 하단 바 (6장 변경, 2026-10-26 사용자 요청)**: 파티 제목·일시·장소가 더 중요하다는 요청으로, 참가비는 **할인가만**(빨강 20px) 보여 주고 정가 화살표는 넣지 않는다. "참가비" 옆 "20% 할인" 배지는 그대로. 제목은 PC에서 2줄까지 줄바꿈하고, 일시·장소는 "…"로 줄이지 않으며 한 줄에 다 안 들어가면 장소를 다음 줄로 내린다(태블릿도 같음). 그래서 `DiscountArrow`의 `bar` 크기는 없앴다.

- 장바구니 카드의 장소(2026-10-26 사용자 요청): 늘 한 줄. 일시 옆에 다 들어가면 같은 줄, 아니면 다음 줄로 내려 줄 전체 폭을 쓰고, 그래도 길면 "…"(마우스를 올리면 전체 주소). 장바구니 금액 줄 간격은 6px → 4px.

확인 결과 메모:

- 결제 도중 할인율 변경: 결제 화면이 예전 가격을 보여 주는 상태에서 결제하면, 결제창 금액(화면 계산)과 `pending.php` 금액(서버 계산)이 달라 `success.php`가 토스 승인 전에 "결제 금액이 일치하지 않습니다"로 돌려보낸다. `pending.php`가 끝난 뒤(결제창이 열린 뒤 10분 안)에 할인율이 바뀌면 그때 저장한 금액(`lines`, `expectedAmount`)으로 결제·저장된다.
- 결제 완료 화면(`app/payment/success/page.tsx`)의 줄별 금액은 참가 구성 예약이 아니면 파티 `price`를 보여 줘서 할인가와 다르게 보였다(기존에도 성별 가격·쿠폰과 달랐음). 2026-10-26 사용자 요청으로 모든 파티를 예약에 저장된 결제 금액(`total`)으로 바꿨다.
