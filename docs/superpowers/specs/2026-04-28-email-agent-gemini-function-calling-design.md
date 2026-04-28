# Email Agent — Gemini Function Calling 전환 설계

**날짜:** 2026-04-28  
**목표:** 서버 중심의 프롬프트 기반 구조를 Gemini Function Calling 에이전트 구조로 전환

---

## 1. 배경 및 목표

### 현재 구조 (프롬프트 기반)
서버가 모든 흐름을 직접 제어한다.

```
서버 → Gmail API 호출 → 이메일 텍스트를 Gemini 프롬프트에 삽입 → 분석 결과 파싱 → Notion API 호출
```

- Gemini는 텍스트 분석기 역할만 담당 (툴 없음, 결정권 없음)
- 서버가 "무엇을 언제 호출할지" 모두 하드코딩

### 변경 후 구조 (Function Calling 에이전트)
Gemini가 흐름을 제어한다.

```
사용자 목표 → Gemini가 툴 선택 → 서버가 툴 실행 → 결과 반환 → Gemini가 다음 단계 결정 → 완료
```

- Gemini가 어떤 툴을 언제 호출할지 스스로 결정
- 분석은 Gemini의 내부 추론으로 처리 (별도 API 호출 없음)

---

## 2. 파일 구조

```
server/
  index.js              ← 기존 엔드포인트 유지 + /api/agent 추가
  agent/
    tools.js            ← Gemini에게 줄 툴 정의 (functionDeclarations)
    executor.js         ← 툴 이름 → 실제 Gmail/Notion API 호출 매핑
    loop.js             ← Gemini 대화 루프 (툴 호출 ↔ 결과 반환 반복)
```

---

## 3. 툴 정의

Gemini가 사용할 수 있는 툴 목록. `tools.js`에 `functionDeclarations` 형식으로 정의한다.

| 툴 이름 | 파라미터 | 설명 |
|---------|---------|------|
| `get_emails` | `limit` (int), `unread_only` (bool), `after` (string), `before` (string) | Gmail INBOX에서 이메일 가져오기 |
| `save_to_notion` | `emails` (분석 결과 포함 배열) | Notion DB에 이메일 + 분석 결과 저장 |
| `mark_as_read` | `ids` (string[]) | 이메일 읽음 처리 |
| `star_email` | `id` (string), `starred` (bool) | 별표 토글 |
| `trash_emails` | `ids` (string[]) | 이메일 휴지통 이동 |

`save_to_notion`의 `emails` 배열 각 항목 스펙:
```json
{
  "id": "gmail_message_id",
  "subject": "...",
  "from": "...",
  "date": "...",
  "category": "카테고리 목록 중 하나",
  "importance": 1~10,
  "isAd": true/false,
  "needsReply": true/false,
  "summary": "한줄 요약",
  "replyDraft": "답장 초안 또는 null"
}
```

---

## 4. 에이전트 루프 (`loop.js`)

```
POST /api/agent { goal: "이메일 분석해서 Notion에 저장해줘" }
        ↓
시스템 프롬프트 + 툴 목록 + 사용자 목표 → Gemini 전송
        ↓
┌─────────────────────────────────────────────────┐
│ Gemini 응답 수신                                  │
│   ↓ functionCall 포함?                           │
│   YES → executor.js로 실제 API 호출              │
│         결과를 functionResponse로 Gemini에 반환  │
│         (루프 반복)                               │
│   NO  → 최종 텍스트 응답 → 루프 종료             │
└─────────────────────────────────────────────────┘
        ↓
{ message: "완료 메시지", notionUrl: "..." }
```

**실제 흐름 예시:**
1. Gemini → `get_emails(limit: 10, unread_only: true)` 호출
2. 서버 → Gmail API 실행 → 이메일 10개 반환
3. Gemini → 내부 추론으로 분석 → `save_to_notion(emails: [...분석결과포함...])` 호출
4. 서버 → Notion API 실행 → 저장 완료 반환
5. Gemini → "10개 이메일 분석 및 저장이 완료되었습니다."

**루프 안전장치:** 최대 반복 횟수 10회 제한 (무한 루프 방지)

---

## 5. 시스템 프롬프트

에이전트 시작 시 Gemini에게 전달하는 분석 기준:

- 카테고리 목록: 항공/여행 | 뉴스 | 경제/금융 | 쇼핑 | 구독/서비스 | 공공/관공서 | SNS/커뮤니티 | 건강/헬스 | 개인/지인 | 뉴스레터 | 적립/마일리지 | 예약/티켓 | 영수증 | 기타
- 중요도 기준 (1~10): 9~10 보안/긴급, 7~8 개인/업무, 4~6 일반 안내, 1~3 광고/뉴스레터
- isAd: List-Unsubscribe 헤더 존재 또는 마케팅 목적이면 true
- needsReply: 발신자가 답변을 기대하는 개인 메일일 때만 true

---

## 6. API 변경

| 엔드포인트 | 변경 |
|-----------|------|
| `POST /api/analyze` | **삭제** (Gemini 추론으로 대체) |
| `GET /api/emails` | 유지 |
| `POST /api/notion/save` | 유지 |
| `POST /api/emails/star` | 유지 |
| `POST /api/emails/trash` | 유지 |
| `POST /api/emails/read` | 유지 |
| `POST /api/agent` | **신규 추가** |

### POST /api/agent

**Request:**
```json
{ "goal": "이메일 분석해서 Notion에 저장해줘" }
```

**Response:**
```json
{
  "message": "10개 이메일 분석 및 저장이 완료되었습니다.",
  "notionUrl": "https://notion.so/...",
  "count": 10
}
```

---

## 7. 프론트엔드 변경 (최소)

**버튼 통합:**
```
기존: [분석하기] [Notion 저장]
변경: [에이전트 실행 →]
```

**진행 상태 표시:**
에이전트 실행 중 로딩 스피너 + 단계 메시지 표시 (실시간 스트리밍 아님, 단순 로딩 상태)
- 버튼 클릭 → "에이전트 실행 중..." 로딩 표시
- 완료 후 결과 메시지 및 Notion 링크 표시

---

## 8. 에러 처리

- Gmail 인증 오류 → 401 반환, 프론트에서 재인증 유도
- Gemini API 오류 → 기존 `withRetry` 로직 유지 (3회, 지수 백오프)
- 루프 최대 횟수 초과 → 500 반환, 에러 메시지 반환
- Notion 저장 오류 → 에이전트 응답에 실패 내용 포함
