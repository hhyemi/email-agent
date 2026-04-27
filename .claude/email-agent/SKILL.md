---
name: email-agent
description: "Gmail 이메일을 Gemini AI로 분석하고 Notion에 저장하는 전체 워크플로우를 실행한다. '이메일 분석해줘', '안읽은 메일 확인해줘', 'Notion에 저장해줘' 같은 요청에 사용한다."
---

# 이메일 에이전트 스킬

## 목표

사용자 대신 Gmail → AI 분석 → Notion 저장 워크플로우를 실행하고 결과를 요약한다.

## 서버 정보

- 백엔드: `http://localhost:3000` (`server/index.js`, Node.js + Express)
- 프론트엔드: `http://localhost:5173` (Vite + React, 참고용)

## 워크플로우 (순서대로 실행)

### 1단계: 서버 상태 확인

```bash
curl -s http://localhost:3000/auth/status
```

- 서버가 응답하지 않으면: `npm run dev` (백엔드)로 서버를 먼저 실행하도록 안내
- `authenticated: false`이면: `http://localhost:3000/auth/gmail` 접속하여 Google 로그인 필요 안내

### 2단계: 이메일 조회

```bash
# 최근 20개
curl -s "http://localhost:3000/api/emails?limit=20"

# 안읽은 메일만
curl -s "http://localhost:3000/api/emails?limit=20&unread=true"
```

사용자 요청에서 "안읽은", "미읽음" 키워드가 있으면 `unread=true` 사용.

### 3단계: AI 분석

```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"emails": [<2단계 결과 배열>]}'
```

- 이메일 수에 따라 시간이 걸릴 수 있음 (메일당 약 1~2초)
- 분석 결과 각 항목: `category`, `importance`, `isAd`, `needsReply`, `summary`, `replyDraft`

### 4단계: 결과 요약 출력

분석 완료 후 아래 형식으로 요약한다:

```
📊 분석 결과 (총 N개)

🔴 중요 메일 (중요도 7 이상)
- [발신자] 제목 — 요약
- ...

✉️ 답장 필요
- [발신자] 제목
  초안: ...

📁 카테고리별
- 업무/개인: N개
- 뉴스레터: N개
- 광고: N개
- ...
```

### 5단계: 선택 작업 (사용자 확인 후 실행)

**Notion 저장** 요청이 있을 때:
```bash
curl -s -X POST http://localhost:3000/api/notion/save \
  -H "Content-Type: application/json" \
  -d '{"emails": [...], "results": [...]}'
```

**읽음 처리** 요청이 있을 때:
```bash
curl -s -X POST http://localhost:3000/api/emails/read \
  -H "Content-Type: application/json" \
  -d '{"ids": ["id1", "id2", ...]}'
```

## 사용 예시

| 사용자 요청 | 실행 내용 |
|-------------|-----------|
| "이메일 분석해줘" | 최근 20개 조회 → AI 분석 → 요약 출력 |
| "안읽은 메일 확인해줘" | 미읽음 필터 조회 → AI 분석 → 요약 출력 |
| "중요한 메일 있어?" | 최근 20개 조회 → AI 분석 → 중요도 7 이상만 출력 |
| "Notion에 저장해줘" | (분석이 안 됐으면 먼저 분석) → Notion 저장 실행 |
| "읽음 처리해줘" | 현재 조회된 메일 읽음 처리 |

## 주의사항

- Notion 저장, 읽음 처리 등 되돌리기 어려운 작업은 실행 전 반드시 사용자에게 확인
- 분석 결과 없이 Notion 저장 요청이 오면 먼저 분석을 진행할지 물어볼 것
- 서버 미실행 시 `npm run dev`로 백엔드(`server/index.js`)를 기동하도록 안내
  - package.json의 scripts 확인: 백엔드는 `node server/index.js` 또는 별도 스크립트
