# 📧 이메일 분류 에이전트

Gmail 받은편지함을 Gemini AI로 자동 분석해 중요한 메일을 놓치지 않도록 도와주는 웹 앱입니다.
분석 결과는 Notion 데이터베이스에 저장할 수 있습니다.

## 주요 기능

- **자동 트리아지** — 로그인하면 미읽은 메일을 자동으로 가져와 AI 분석 실행
- **중요도 분류** — 🔴 지금 처리 / 📋 확인 필요 / 🗂️ 나머지 3섹션으로 자동 분리
- **요약 카드** — 답장 필요 건수, 긴급 건수, 최우선 메일을 한눈에 표시
- **AI 분석** — 카테고리, 중요도(1~10), 광고 여부, 답장 필요 여부, 한줄 요약, 답장 초안 생성
- **Notion 저장** — 분석 결과를 Notion 데이터베이스에 자동 저장
- **기간 조회** — 날짜 범위로 메일 필터링
- **선택 작업** — 카드/카테고리 배지 클릭으로 다중 선택 후 읽음 처리·삭제
- **별표 토글** — Gmail 별표편지함에 바로 추가/제거
- **필터** — 광고 숨기기, 중요도 슬라이더

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18, Vite, Tailwind CSS |
| 백엔드 | Node.js, Express |
| AI | Google Gemini 2.5 Flash Lite |
| 이메일 | Gmail API (OAuth 2.0) |
| 저장 | Notion API |

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 채웁니다.

```env
# Gmail OAuth2
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REDIRECT_URI=http://localhost:3000/auth/callback

# Gemini AI
GEMINI_API_KEY=

# Notion
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

#### Gmail OAuth2 설정
1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 생성
2. Gmail API 활성화
3. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
4. 승인된 리디렉션 URI에 `http://localhost:3000/auth/callback` 추가

#### Gemini API 설정
1. [Google AI Studio](https://aistudio.google.com) → API 키 발급

#### Notion 설정
1. [Notion Integrations](https://www.notion.so/my-integrations) → 새 통합 생성
2. 저장할 데이터베이스에 통합 연결
3. 데이터베이스 URL에서 ID 복사 (`notion.so/.../{DATABASE_ID}?v=...`)

### 3. 실행

```bash
npm run dev
```

- 프론트엔드: http://localhost:5173
- 백엔드: http://localhost:3000

## 사용 방법

1. 브라우저에서 `http://localhost:5173` 접속
2. **Google 계정으로 연결** 클릭 → Gmail 인증
3. 로그인하면 미읽은 메일 자동 분석 시작
4. 분석 완료 후 섹션별로 메일 확인
5. 필요한 메일 선택 후 Notion 저장 또는 읽음/삭제 처리

## 프로젝트 구조

```
email-agent/
├── server/
│   └── index.js          # Express 서버 (Gmail, Gemini, Notion API)
├── src/
│   ├── api/
│   │   └── index.js      # 백엔드 API 호출 함수
│   ├── components/
│   │   ├── EmailCard.jsx  # 이메일 카드
│   │   ├── EmailList.jsx  # 트리아지 섹션 목록
│   │   ├── ReplyDraft.jsx # 답장 초안 토글
│   │   └── SummaryCard.jsx# 분석 요약 카드
│   └── App.jsx            # 메인 앱
└── .env                   # 환경변수 (git 제외)
```
