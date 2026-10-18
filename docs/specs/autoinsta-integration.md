# Auto Insta 연동용 파티 현황 API 개발 명세서

- 작성일: 2026-10-19
- 기준 코드: `songjungdal/thewoollim` main `c6ad053`
- 적용 위치: 이 파일을 사이트 저장소 `docs/specs/autoinsta-integration.md`로 넣고 작업한다. 사이트 저장소의 `AGENTS.md`·`CLAUDE.md` 규칙(PR·병합·배포 절차, 문서 갱신)을 그대로 따른다.
- 상태: **개발 착수 가능.** 읽기 전용 API 추가이며 결제·예약·개인정보 흐름을 바꾸지 않는다.

---

## 1. 목적

인스타그램 자동 관리 서비스(Auto Insta, 별도 서버)가 DM 답변과 운영자 알림에 쓸 파티 현황을 읽어 간다. 남은 자리 계산을 Auto Insta에 다시 만들지 않도록, **사이트 서버의 기존 계산 함수 결과를 그대로** 내려준다.

## 2. 범위

| 파일 | 변경 |
|---|---|
| `api/integrations/autoinsta-parties.php` | 새 파일. 읽기 전용 GET API |
| `api/integrations/autoinsta-config.example.php` | 새 파일. 연동 키 설정 템플릿 |
| `.gitignore` | `/api/integrations/autoinsta-config.php` 한 줄 추가 |
| `docs/PROJECT_OVERVIEW.md` | 외부 연동·코드 경로·데이터 저장 위치 섹션에 한 줄씩 추가 |

배포 대상: `api` (사이트 `AGENTS.md` 13장). 서버의 실제 설정 파일 `autoinsta-config.php`는 배포 필터의 `/**/*-config.php` 보호 규칙으로 덮어쓰이지 않는다.

## 3. 변경하지 않는 것

- 결제(`api/payments/*`), 예약 상태, 취소·환불, 쿠폰, 문자 발송, `api/cron/*` 코드
- `api/parties.php`, `api/party-counts.php`, `api/party-detail.php`의 응답 형식
- `api/data/*.json` — **읽기만 한다. 쓰지 않는다.**
- 화면(`app/`) 전부
- 6장 "화면과 서버에 같은 규칙" 표의 규칙들 — 새 규칙을 만들지 않고 기존 함수를 호출만 한다

## 4. API

```
GET /api/integrations/autoinsta-parties.php?from=2026-10-12
Header: X-Api-Key: <연동 키>
```

- `from`(선택, `YYYY-MM-DD`): `calendarDate`가 이 날짜 이상인 파티만. 없으면 오늘(KST)로부터 7일 전.
- 키 비교는 `hash_equals`. 키가 없거나 다르면 `401 {ok:false,error:"unauthorized"}`. 서버에 설정 파일이 없으면 `503 {ok:false,error:"not configured"}`.
- GET 외에는 `405`.
- 헤더는 `jsonHeaders()`(캐시 금지) 사용.

**응답 `200`**
```json
{
  "ok": true,
  "generatedAt": "2026-10-19T09:00:00+09:00",
  "parties": [
    {
      "id": "59",
      "title": "[3040] 로테이션 소개팅",
      "partyType": "matching",
      "dateString": "2026년 10월 24일 (토) 17:00",
      "calendarDate": "2026-10-24",
      "startsAt": "2026-10-24T17:00:00+09:00",
      "location": "경기 수원시 팔달구 정조로 882, 4층",
      "locationTag": "수원",
      "target": "만 30세 ~ 만 40세 (싱글) / 남녀비율 1:1",
      "minAge": 29,
      "maxAge": 42,
      "allowedMaritalStatus": "싱글",
      "targetGroup": "싱글",
      "priceMale": 69000,
      "priceFemale": 49000,
      "maleStock": 6,
      "femaleStock": 6,
      "maleBooked": 2,
      "femaleBooked": 2,
      "remaining": { "male": 4, "female": 4 },
      "vbankPending": { "male": 0, "female": 1 },
      "couponDisabled": false,
      "status": null,
      "url": "https://thewoollim.com/party/59/",
      "imageUrl": "https://thewoollim.com/uploads/parties/p_xxx.jpg",
      "sessions": [],
      "options": []
    }
  ]
}
```

| 필드 | 만드는 방법 (기존 코드 재사용) |
|---|---|
| 기본 필드(`id`~`targetGroup`, `couponDisabled`, `imageUrl`) | `api/parties.php`와 같은 값. `imageUrl`은 `/`로 시작하면 `https://thewoollim.com`을 붙여 절대 주소로 |
| `priceMale/priceFemale` | 일반 파티: `priceForGender($party, '남성'|'여성')` — 성별 가격이 없으면 기본가. 참가 구성 파티: `null`(가격은 `options[].priceMale/priceFemale`) |
| `maleStock/femaleStock` | `partyStockLimit($party, 'male'|'female')` — 서버 마감 판단과 같은 값(0 이하면 12) |
| `maleBooked/femaleBooked` | `party_counts.json` 값(카드 결제 완료 + 무통장 입금 확인 인원) |
| `remaining` | `partyRemainingSeats($party, $countsRow)` 그대로 |
| `vbankPending` | `bookings_*.json`에서 `status === 'vbank_pending'`인 예약을 이 파티·성별로 센 수(`partyApplicantStats`와 같은 방식으로 파일을 읽음). 인원(`maleBooked`)에는 들어가지 않은 수다 |
| `startsAt` | `calendarDate` + `dateString` 안의 첫 `HH:MM`(없으면 첫 회차 `startTime`, 그것도 없으면 `00:00`), `+09:00` |
| `status` | 파티에 `status`가 있으면 그 값(현재 `completed`만 있음), 없으면 `null` |
| `url` | `https://thewoollim.com/party/{id}/` (`trailingSlash`) |
| `sessions/options` | 참가 구성 파티만. `api/parties.php`와 같은 형식 + 회차마다 `remaining: {male, female}` (`sessionStockLimit` − 회차 인원, 0 미만은 0) |

- 개인정보(이름·이메일·전화·생년월일·예약 상세)는 **넣지 않는다.** 숫자 집계만 내려준다.
- 파티가 없거나 파일이 손상되면 `parties: []`.

## 5. 설정 파일

```php
<?php
// api/integrations/autoinsta-config.example.php
// 서버에서 이 파일을 autoinsta-config.php 로 복사하고 키를 넣는다. 실제 파일은 커밋하지 않는다.
return [
    'api_key' => 'CHANGE_ME_LONG_RANDOM_STRING',
];
```

## 6. 성능

- Auto Insta 호출 빈도: 5분 1회 + DM 잔여석 문의 때 수시(1분 캐시) — 분당 수 회 이하.
- `vbankPending` 계산은 예약 파일을 한 번 훑는다(관리자 화면 `partyApplicantStats`와 같은 비용). 느려지면 이 필드만 30초 캐시를 둔다.

## 7. 완료 기준

1. `php -l` 통과(새 PHP 파일 2개).
2. 키 없이 호출 → 401. 틀린 키 → 401. 설정 파일 없음 → 503.
3. 같은 시각에 호출한 `/api/parties.php`와 `maleBooked/femaleBooked/maleStock/femaleStock`가 같다(정원 0 이하 파티는 12로 나옴).
4. 일반 파티 1개와 참가 구성 솔로파티 1개에서 `remaining`이 파티 상세 화면에 보이는 남은 자리와 같다.
5. 무통장 입금 대기 예약 1건을 만들면 `vbankPending`만 +1 되고 `maleBooked`·`remaining`은 그대로다.
6. 응답에 개인정보가 없다.
7. `api/data/` 파일의 수정 시각이 호출 전후로 바뀌지 않는다.

## 8. 서버에서 사람이 할 일

- 배포 뒤 서버에 `api/integrations/autoinsta-config.php`를 만들고 긴 무작위 키를 넣는다. 같은 키를 Auto Insta 환경변수 `SITE_API_KEY`에 넣는다. 키는 문서·PR·대화에 적지 않는다.
- 작업 보고에 "운영 서버에서 키 설정 후 401/200 확인 필요"를 적는다.
