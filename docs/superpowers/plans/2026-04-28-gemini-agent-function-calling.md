# Gemini Function Calling 에이전트 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 중심의 프롬프트 기반 이메일 분석 구조를 Gemini Function Calling 에이전트로 전환한다.

**Architecture:** Gemini에게 Gmail/Notion 툴을 정의해 제공하고, AI가 스스로 어떤 툴을 언제 호출할지 결정하는 에이전트 루프를 구현한다. 서버는 툴 실행자 역할만 담당하며, AI가 흐름을 제어한다.

**Tech Stack:** Node.js (ESM), Express, `@google/generative-ai` v0.24.1, googleapis, `@notionhq/client`, vitest

---

## 파일 구조

| 파일 | 동작 | 변경 유형 |
|------|------|---------|
| `server/agent/tools.js` | Gemini functionDeclarations + SYSTEM_PROMPT | 신규 |
| `server/agent/executor.js` | 툴 이름 → Gmail/Notion API 호출 매핑 | 신규 |
| `server/agent/loop.js` | Gemini 대화 루프 | 신규 |
| `server/index.js` | `/api/agent` 추가, `/api/analyze` 삭제 | 수정 |
| `src/api/index.js` | `runAgent()` 추가, `analyzeEmails()` 삭제 | 수정 |
| `src/App.jsx` | 에이전트 버튼 통합 | 수정 |
| `server/agent/tests/tools.test.js` | tools.js 구조 검증 | 신규 |
| `server/agent/tests/executor.test.js` | executor 라우팅 검증 | 신규 |
| `server/agent/tests/loop.test.js` | 루프 동작 검증 | 신규 |

---

## Task 0: vitest 설치 및 설정

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: vitest 설치**

```bash
npm install --save-dev vitest
```

Expected output: `added X packages`

- [ ] **Step 2: package.json에 test 스크립트 추가**

`package.json`의 `scripts` 블록을 열어 `"test"` 항목 추가:

```json
"scripts": {
  "dev": "concurrently \"npm run server\" \"npm run client\"",
  "server": "node --watch server/index.js",
  "client": "vite",
  "build": "vite build",
  "test": "vitest run"
}
```

- [ ] **Step 3: vitest.config.js 생성**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: 테스트 디렉토리 생성 확인**

```bash
mkdir -p server/agent/tests
```

- [ ] **Step 5: 동작 확인용 smoke test 생성**

`server/agent/tests/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: 테스트 실행**

```bash
npm test
```

Expected output:
```
 ✓ server/agent/tests/smoke.test.js (1)
 Test Files  1 passed (1)
```

- [ ] **Step 7: smoke test 파일 삭제**

```bash
rm server/agent/tests/smoke.test.js
```

- [ ] **Step 8: 커밋**

```bash
git add package.json vitest.config.js
git commit -m "chore: vitest 테스트 환경 설정"
```

---

## Task 1: tools.js — Gemini 툴 정의

**Files:**
- Create: `server/agent/tools.js`
- Create: `server/agent/tests/tools.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`server/agent/tests/tools.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { toolDeclarations, SYSTEM_PROMPT } from '../tools.js'

describe('toolDeclarations', () => {
  it('5개의 툴을 정의한다', () => {
    expect(toolDeclarations).toHaveLength(5)
  })

  it('모든 툴이 name, description, parameters를 가진다', () => {
    for (const tool of toolDeclarations) {
      expect(tool).toHaveProperty('name')
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('parameters')
      expect(tool.parameters).toHaveProperty('type', 'object')
    }
  })

  it('필수 툴 이름을 포함한다', () => {
    const names = toolDeclarations.map((t) => t.name)
    expect(names).toContain('get_emails')
    expect(names).toContain('save_to_notion')
    expect(names).toContain('mark_as_read')
    expect(names).toContain('star_email')
    expect(names).toContain('trash_emails')
  })
})

describe('SYSTEM_PROMPT', () => {
  it('카테고리 기준을 포함한다', () => {
    expect(SYSTEM_PROMPT).toContain('항공/여행')
    expect(SYSTEM_PROMPT).toContain('importance')
  })
})
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npm test
```

Expected: `Cannot find module '../tools.js'`

- [ ] **Step 3: tools.js 구현**

`server/agent/tools.js`:
```js
export const SYSTEM_PROMPT = `당신은 이메일 관리 에이전트입니다. 사용자의 목표를 달성하기 위해 제공된 툴을 사용하세요.

이메일 분석 기준:
- category: 항공/여행 | 뉴스 | 경제/금융 | 쇼핑 | 구독/서비스 | 공공/관공서 | SNS/커뮤니티 | 건강/헬스 | 개인/지인 | 뉴스레터 | 적립/마일리지 | 예약/티켓 | 영수증 | 기타
- importance (1~10): 9~10 보안/긴급, 7~8 개인/업무, 4~6 일반 안내, 1~3 광고/뉴스레터
- isAd: List-Unsubscribe 헤더가 있거나 마케팅 목적이면 true
- needsReply: 발신자가 답변을 기대하는 개인 메일일 때만 true. 자동발송/광고/뉴스레터는 false
- summary: 50자 이내 한줄 요약
- replyDraft: needsReply가 true일 때만 답장 초안, 아니면 null`

export const toolDeclarations = [
  {
    name: 'get_emails',
    description: 'Gmail INBOX에서 이메일을 가져옵니다.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '가져올 이메일 수 (최대 50)', nullable: true },
        unread_only: { type: 'boolean', description: '읽지 않은 이메일만 가져올지 여부', nullable: true },
        after: { type: 'string', description: '이 날짜 이후 이메일 (YYYY/MM/DD 형식)', nullable: true },
        before: { type: 'string', description: '이 날짜 이전 이메일 (YYYY/MM/DD 형식)', nullable: true },
      },
      required: [],
    },
  },
  {
    name: 'save_to_notion',
    description: '분석된 이메일 목록을 Notion 데이터베이스에 저장합니다.',
    parameters: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          description: '분석 결과가 포함된 이메일 배열',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              subject: { type: 'string' },
              from: { type: 'string' },
              date: { type: 'string' },
              category: { type: 'string' },
              importance: { type: 'integer' },
              isAd: { type: 'boolean' },
              needsReply: { type: 'boolean' },
              summary: { type: 'string' },
              replyDraft: { type: 'string', nullable: true },
            },
            required: ['id', 'subject', 'from', 'date', 'category', 'importance', 'isAd', 'needsReply', 'summary'],
          },
        },
      },
      required: ['emails'],
    },
  },
  {
    name: 'mark_as_read',
    description: '지정한 이메일을 읽음으로 표시합니다.',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: '읽음 처리할 이메일 ID 배열' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'star_email',
    description: '이메일의 별표를 토글합니다.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '이메일 ID' },
        starred: { type: 'boolean', description: 'true: 별표 추가, false: 별표 제거' },
      },
      required: ['id', 'starred'],
    },
  },
  {
    name: 'trash_emails',
    description: '지정한 이메일을 휴지통으로 이동합니다.',
    parameters: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: '삭제할 이메일 ID 배열' },
      },
      required: ['ids'],
    },
  },
]
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npm test
```

Expected:
```
 ✓ server/agent/tests/tools.test.js (4)
 Test Files  1 passed (1)
```

- [ ] **Step 5: 커밋**

```bash
git add server/agent/tools.js server/agent/tests/tools.test.js
git commit -m "feat(server): 에이전트 툴 정의 추가 (tools.js)"
```

---

## Task 2: executor.js — 툴 실행 함수

**Files:**
- Create: `server/agent/executor.js`
- Create: `server/agent/tests/executor.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`server/agent/tests/executor.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { createExecutor } from '../executor.js'

const makeGmailMock = () => ({
  users: {
    messages: {
      list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
      get: vi.fn(),
      modify: vi.fn().mockResolvedValue({}),
      trash: vi.fn().mockResolvedValue({}),
    },
  },
})

const makeNotionMock = () => ({
  databases: { retrieve: vi.fn().mockResolvedValue({ properties: { 제목: { type: 'title' } } }) },
  pages: { create: vi.fn().mockResolvedValue({}) },
})

describe('createExecutor', () => {
  it('알 수 없는 툴 이름은 에러를 던진다', async () => {
    const executor = createExecutor({
      gmailClient: makeGmailMock(),
      notion: makeNotionMock(),
      databaseId: 'test-db-id',
    })
    await expect(executor.execute('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool')
  })

  it('mark_as_read는 gmail.modify를 ids 수만큼 호출한다', async () => {
    const gmail = makeGmailMock()
    const executor = createExecutor({ gmailClient: gmail, notion: makeNotionMock(), databaseId: 'test-db-id' })
    await executor.execute('mark_as_read', { ids: ['id1', 'id2'] })
    expect(gmail.users.messages.modify).toHaveBeenCalledTimes(2)
  })

  it('star_email starred=true는 STARRED 레이블을 추가한다', async () => {
    const gmail = makeGmailMock()
    const executor = createExecutor({ gmailClient: gmail, notion: makeNotionMock(), databaseId: 'test-db-id' })
    await executor.execute('star_email', { id: 'id1', starred: true })
    expect(gmail.users.messages.modify).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: { addLabelIds: ['STARRED'] } })
    )
  })

  it('trash_emails는 gmail.trash를 ids 수만큼 호출한다', async () => {
    const gmail = makeGmailMock()
    const executor = createExecutor({ gmailClient: gmail, notion: makeNotionMock(), databaseId: 'test-db-id' })
    await executor.execute('trash_emails', { ids: ['id1', 'id2', 'id3'] })
    expect(gmail.users.messages.trash).toHaveBeenCalledTimes(3)
  })

  it('get_emails는 빈 받은편지함에서 빈 배열을 반환한다', async () => {
    const gmail = makeGmailMock()
    const executor = createExecutor({ gmailClient: gmail, notion: makeNotionMock(), databaseId: 'test-db-id' })
    const result = await executor.execute('get_emails', { limit: 10 })
    expect(result.emails).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npm test
```

Expected: `Cannot find module '../executor.js'`

- [ ] **Step 3: executor.js 구현**

`server/agent/executor.js`:
```js
import { google } from 'googleapis'

export function createExecutor({ gmailClient, notion, databaseId }) {
  async function get_emails({ limit = 10, unread_only = false, after = null, before = null } = {}) {
    const qParts = []
    if (after) qParts.push(`after:${after}`)
    if (before) qParts.push(`before:${before}`)

    const listRes = await gmailClient.users.messages.list({
      userId: 'me',
      maxResults: Math.min(limit, 50),
      labelIds: unread_only ? ['INBOX', 'UNREAD'] : ['INBOX'],
      ...(qParts.length ? { q: qParts.join(' ') } : {}),
    })

    const messages = listRes.data.messages || []
    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmailClient.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
        const headers = detail.data.payload.headers
        const getHeader = (name) => headers.find((h) => h.name === name)?.value || ''
        const body = extractBody(detail.data.payload)
        const isBulk = !!(getHeader('List-Unsubscribe') || getHeader('Precedence'))

        return {
          id: msg.id,
          subject: getHeader('Subject') || '(제목 없음)',
          from: getHeader('From'),
          to: getHeader('To'),
          date: getHeader('Date'),
          snippet: detail.data.snippet || '',
          body: body.slice(0, 2000),
          isBulk,
          isUnread: detail.data.labelIds?.includes('UNREAD') ?? false,
          isStarred: detail.data.labelIds?.includes('STARRED') ?? false,
        }
      })
    )
    return { emails }
  }

  async function save_to_notion({ emails }) {
    const db = await notion.databases.retrieve({ database_id: databaseId })
    const props = db.properties
    const titlePropName = Object.keys(props).find((k) => props[k].type === 'title')

    await Promise.all(
      emails.map(async (email) => {
        const fromMatch = email.from?.match(/^(.*?)\s*<(.+?)>$/)
        const senderName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : (email.from || '')
        const senderEmail = fromMatch ? fromMatch[2] : (email.from || '')

        let dateISO = null
        try { dateISO = new Date(email.date).toISOString().split('T')[0] } catch {}

        const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${email.id}`
        const properties = {
          [titlePropName]: { title: [{ text: { content: email.subject || '(제목 없음)' } }] },
        }

        for (const [name, def] of Object.entries(props)) {
          if (def.type === 'title') continue
          if (name === '메일 링크' && def.type === 'url') {
            properties[name] = { url: gmailLink }
          } else if (name === '받은 날짜' && def.type === 'date' && dateISO) {
            properties[name] = { date: { start: dateISO } }
          } else if (name === '보낸 사람' && def.type === 'rich_text') {
            properties[name] = { rich_text: [{ text: { content: senderName } }] }
          } else if (name === '보낸 사람 이메일') {
            if (def.type === 'email') properties[name] = { email: senderEmail }
            else if (def.type === 'rich_text') properties[name] = { rich_text: [{ text: { content: senderEmail } }] }
          } else if (name === '카테고리' && email.category) {
            if (def.type === 'select') properties[name] = { select: { name: email.category } }
            else if (def.type === 'multi_select') properties[name] = { multi_select: [{ name: email.category }] }
            else if (def.type === 'rich_text') properties[name] = { rich_text: [{ text: { content: email.category } }] }
          } else if (name === '태그' && def.type === 'multi_select') {
            const tags = []
            if (email.importance >= 7) tags.push({ name: '중요' })
            if (email.needsReply) tags.push({ name: '답장필요' })
            if (['개인/지인'].includes(email.category)) tags.push({ name: '개인' })
            if (email.isAd) tags.push({ name: '광고' })
            properties[name] = { multi_select: tags }
          }
        }

        const children = []
        if (email.summary) {
          children.push({
            object: 'block', type: 'callout',
            callout: {
              rich_text: [{ type: 'text', text: { content: email.summary } }],
              icon: { type: 'emoji', emoji: '📝' },
            },
          })
        }
        if (email.importance) {
          children.push({
            object: 'block', type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: `중요도: ${email.importance}/10  |  답장 필요: ${email.needsReply ? '✅' : '❌'}` } }],
            },
          })
        }
        if (email.replyDraft) {
          children.push(
            { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: '✉️ 답장 초안' } }] } },
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: email.replyDraft } }] } }
          )
        }

        return notion.pages.create({ parent: { database_id: databaseId }, properties, children })
      })
    )

    const dbUrl = `https://notion.so/${databaseId.replace(/-/g, '')}`
    return { count: emails.length, notionUrl: dbUrl }
  }

  async function mark_as_read({ ids }) {
    await Promise.all(
      ids.map((id) =>
        gmailClient.users.messages.modify({
          userId: 'me',
          id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        })
      )
    )
    return { success: true }
  }

  async function star_email({ id, starred }) {
    await gmailClient.users.messages.modify({
      userId: 'me',
      id,
      requestBody: starred ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] },
    })
    return { success: true }
  }

  async function trash_emails({ ids }) {
    await Promise.all(ids.map((id) => gmailClient.users.messages.trash({ userId: 'me', id })))
    return { success: true }
  }

  const toolMap = { get_emails, save_to_notion, mark_as_read, star_email, trash_emails }

  return {
    execute(name, args) {
      const fn = toolMap[name]
      if (!fn) throw new Error(`Unknown tool: ${name}`)
      return fn(args)
    },
  }
}

function extractBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npm test
```

Expected:
```
 ✓ server/agent/tests/tools.test.js (4)
 ✓ server/agent/tests/executor.test.js (5)
 Test Files  2 passed (2)
```

- [ ] **Step 5: 커밋**

```bash
git add server/agent/executor.js server/agent/tests/executor.test.js
git commit -m "feat(server): 에이전트 툴 실행기 추가 (executor.js)"
```

---

## Task 3: loop.js — 에이전트 루프

**Files:**
- Create: `server/agent/loop.js`
- Create: `server/agent/tests/loop.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`server/agent/tests/loop.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { runAgentLoop } from '../loop.js'

function makeChatMock(responses) {
  let callIndex = 0
  return {
    startChat: () => ({
      sendMessage: vi.fn().mockImplementation(() => {
        const resp = responses[callIndex++]
        return Promise.resolve({ response: resp })
      }),
    }),
  }
}

function makeTextResponse(text) {
  return {
    functionCalls: () => null,
    text: () => text,
  }
}

function makeFunctionCallResponse(name, args) {
  return {
    functionCalls: () => [{ name, args }],
    text: () => '',
  }
}

describe('runAgentLoop', () => {
  it('functionCall 없는 응답으로 루프를 즉시 종료한다', async () => {
    const model = makeChatMock([makeTextResponse('완료되었습니다.')])
    const executor = { execute: vi.fn() }

    const result = await runAgentLoop({ model, executor, goal: '테스트' })

    expect(result.message).toBe('완료되었습니다.')
    expect(executor.execute).not.toHaveBeenCalled()
  })

  it('functionCall이 있으면 executor.execute를 호출하고 루프를 계속한다', async () => {
    const model = makeChatMock([
      makeFunctionCallResponse('get_emails', { limit: 5 }),
      makeTextResponse('이메일을 가져왔습니다.'),
    ])
    const executor = { execute: vi.fn().mockResolvedValue({ emails: [] }) }

    const result = await runAgentLoop({ model, executor, goal: '이메일 가져와' })

    expect(executor.execute).toHaveBeenCalledWith('get_emails', { limit: 5 })
    expect(result.message).toBe('이메일을 가져왔습니다.')
  })

  it('save_to_notion 호출 시 notionUrl과 분석된 이메일을 반환한다', async () => {
    const analyzedEmails = [{ id: '1', subject: '테스트', from: 'a@b.com', date: '2024-01-01', category: '기타', importance: 5, isAd: false, needsReply: false, summary: '요약', replyDraft: null }]
    const model = makeChatMock([
      makeFunctionCallResponse('save_to_notion', { emails: analyzedEmails }),
      makeTextResponse('저장 완료'),
    ])
    const executor = {
      execute: vi.fn().mockResolvedValue({ count: 1, notionUrl: 'https://notion.so/test' }),
    }

    const result = await runAgentLoop({ model, executor, goal: '저장해줘' })

    expect(result.notionUrl).toBe('https://notion.so/test')
    expect(result.analyzedEmails).toEqual(analyzedEmails)
  })

  it('get_emails 호출 결과를 rawEmails로 반환한다', async () => {
    const rawEmails = [{ id: '1', subject: '제목', from: 'a@b.com', date: '2024-01-01', snippet: '요약', isBulk: false, isUnread: true, isStarred: false }]
    const model = makeChatMock([
      makeFunctionCallResponse('get_emails', { limit: 5 }),
      makeTextResponse('완료'),
    ])
    const executor = { execute: vi.fn().mockResolvedValue({ emails: rawEmails }) }

    const result = await runAgentLoop({ model, executor, goal: '이메일 가져와' })

    expect(result.rawEmails).toEqual(rawEmails)
  })

  it('MAX_ITERATIONS 초과 시 에러를 던진다', async () => {
    const responses = Array(11).fill(makeFunctionCallResponse('get_emails', {}))
    const model = makeChatMock(responses)
    const executor = { execute: vi.fn().mockResolvedValue({ emails: [] }) }

    await expect(runAgentLoop({ model, executor, goal: '무한루프' })).rejects.toThrow('최대 반복')
  })
})
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
npm test
```

Expected: `Cannot find module '../loop.js'`

- [ ] **Step 3: loop.js 구현**

`server/agent/loop.js`:
```js
import { toolDeclarations, SYSTEM_PROMPT } from './tools.js'

const MAX_ITERATIONS = 10

export function createAgentModel(genAI) {
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    tools: [{ functionDeclarations: toolDeclarations }],
    systemInstruction: SYSTEM_PROMPT,
  })
}

export async function runAgentLoop({ model, executor, goal }) {
  const chat = model.startChat()
  let result = await chat.sendMessage(goal)
  let notionResult = null
  let analyzedEmails = []
  let rawEmails = []

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = result.response
    const functionCalls = response.functionCalls()

    if (!functionCalls || functionCalls.length === 0) {
      return {
        message: response.text(),
        notionUrl: notionResult?.notionUrl ?? null,
        count: notionResult?.count ?? 0,
        analyzedEmails,
        rawEmails,
      }
    }

    const toolResponses = await Promise.all(
      functionCalls.map(async (call) => {
        const toolResult = await executor.execute(call.name, call.args)
        if (call.name === 'get_emails') {
          rawEmails = toolResult.emails || []
        }
        if (call.name === 'save_to_notion') {
          notionResult = toolResult
          analyzedEmails = call.args.emails || []
        }
        return {
          functionResponse: {
            name: call.name,
            response: toolResult,
          },
        }
      })
    )

    result = await chat.sendMessage(toolResponses)
  }

  throw new Error('에이전트 루프가 최대 반복 횟수를 초과했습니다.')
}
```

- [ ] **Step 4: 테스트 실행 (통과 확인)**

```bash
npm test
```

Expected:
```
 ✓ server/agent/tests/tools.test.js (4)
 ✓ server/agent/tests/executor.test.js (5)
 ✓ server/agent/tests/loop.test.js (4)
 Test Files  3 passed (3)
```

- [ ] **Step 5: 커밋**

```bash
git add server/agent/loop.js server/agent/tests/loop.test.js
git commit -m "feat(server): 에이전트 루프 추가 (loop.js)"
```

---

## Task 4: server/index.js 수정 — `/api/agent` 추가, `/api/analyze` 삭제

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: import 추가 및 analyzeEmail 관련 코드 제거**

`server/index.js` 상단 import 블록에 다음을 추가 (기존 import 아래):

```js
import { createExecutor } from './agent/executor.js'
import { createAgentModel, runAgentLoop } from './agent/loop.js'
import { google } from 'googleapis'
```

(google은 이미 import되어 있으므로 executor.js, loop.js import만 추가)

실제로 추가할 두 줄:
```js
import { createExecutor } from './agent/executor.js'
import { createAgentModel, runAgentLoop } from './agent/loop.js'
```

- [ ] **Step 2: `/api/analyze` 라우트 삭제**

`server/index.js`에서 아래 블록 전체 삭제 (228~242번 줄):

```js
// ── Analyze Route ─────────────────────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { emails } = req.body
  if (!emails?.length) {
    return res.status(400).json({ error: '분석할 이메일이 없습니다.' })
  }

  try {
    const results = await Promise.all(emails.map(analyzeEmail))
    res.json({ results })
  } catch (err) {
    console.error('Analyze error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 3: `withRetry`, `fastClassify`, `analyzeEmail` 함수 삭제**

`server/index.js`에서 아래 세 함수 전체 삭제 (244~330번 줄):

```js
async function withRetry(fn, retries = 3, delay = 5000) { ... }
function fastClassify(email) { ... }
async function analyzeEmail(email) { ... }
```

- [ ] **Step 4: `/api/agent` 라우트 추가**

`server/index.js`의 `// ── Notion Route` 블록 바로 위에 추가:

```js
// ── Agent Route ───────────────────────────────────────────────────────────────
app.post('/api/agent', async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }
  try {
    const { goal = '안읽은 이메일을 분석해서 Notion에 저장해줘' } = req.body
    const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client })
    const executor = createExecutor({ gmailClient, notion, databaseId: process.env.NOTION_DATABASE_ID })
    const model = createAgentModel(genAI)
    const { message, notionUrl, count, analyzedEmails, rawEmails } = await runAgentLoop({ model, executor, goal })
    res.json({ message, notionUrl, count, analyzedEmails, rawEmails })
  } catch (err) {
    console.error('Agent error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 5: 서버 기동 확인**

```bash
npm run server
```

Expected: `Server running on http://localhost:3000` (에러 없음)

`Ctrl+C`로 종료.

- [ ] **Step 6: 커밋**

```bash
git add server/index.js
git commit -m "feat(server): /api/agent 추가 및 /api/analyze 제거"
```

---

## Task 5: src/api/index.js 수정 — `runAgent` 추가, `analyzeEmails` 삭제

**Files:**
- Modify: `src/api/index.js`

- [ ] **Step 1: `analyzeEmails` 함수 삭제**

`src/api/index.js`에서 아래 블록 삭제:

```js
export async function analyzeEmails(emails) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '분석에 실패했습니다.')
  return data
}
```

- [ ] **Step 2: `runAgent` 함수 추가**

`src/api/index.js`에서 `saveToNotion` 함수 바로 위에 추가:

```js
export async function runAgent(goal) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '에이전트 실행에 실패했습니다.')
  return data
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/api/index.js
git commit -m "feat(frontend): runAgent API 추가 및 analyzeEmails 제거"
```

---

## Task 6: src/App.jsx 수정 — 에이전트 버튼 통합

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: import에서 `analyzeEmails`, `saveToNotion` 제거하고 `runAgent` 추가**

`src/App.jsx` 7번 줄을 수정:

```js
// 기존
import { checkAuthStatus, fetchEmails, analyzeEmails, saveToNotion, markAsRead, trashEmails, toggleStar, logout } from './api'

// 변경
import { checkAuthStatus, fetchEmails, runAgent, markAsRead, trashEmails, toggleStar, logout } from './api'
```

- [ ] **Step 2: `loading` 상태에서 `analyzing`, `saving` 제거하고 `running` 추가**

`src/App.jsx` 30번 줄을 수정:

```js
// 기존
const [loading, setLoading] = useState({ fetching: false, analyzing: false, saving: false, marking: false, trashing: false })

// 변경
const [loading, setLoading] = useState({ fetching: false, running: false, marking: false, trashing: false })
```

- [ ] **Step 3: 자동 분석 로직 수정 (useEffect, 63~85번 줄)**

```js
// 기존
useEffect(() => {
  if (authStatus !== 'authenticated') return
  const autoLoad = async () => {
    setPartialLoading('fetching', true)
    try {
      const { emails: data } = await fetchEmails(50, true)
      setEmails(data)
      setResults([])
      setSelectedIds(new Set())
      if (!data.length) return
      setPartialLoading('fetching', false)
      setPartialLoading('analyzing', true)
      const { results: analysisData } = await analyzeEmails(data)
      setResults(analysisData)
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('fetching', false)
      setPartialLoading('analyzing', false)
    }
  }
  autoLoad()
}, [authStatus])

// 변경
useEffect(() => {
  if (authStatus !== 'authenticated') return
  const autoLoad = async () => {
    setPartialLoading('fetching', true)
    try {
      const { emails: data } = await fetchEmails(50, true)
      setEmails(data)
      setResults([])
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('fetching', false)
    }
  }
  autoLoad()
}, [authStatus])
```

- [ ] **Step 4: `handleAnalyze`, `handleSaveToNotion` 삭제하고 `handleRunAgent` 추가**

`src/App.jsx`에서 `handleAnalyze` 함수(113~125번 줄)와 `handleSaveToNotion` 함수(127~139번 줄)를 삭제하고, 그 자리에 아래를 추가:

```js
const handleRunAgent = async () => {
  setError(null)
  setNotionUrl(null)
  setPartialLoading('running', true)
  try {
    const { notionUrl: url, analyzedEmails, rawEmails } = await runAgent(
      '안읽은 이메일을 가져와서 분석하고 Notion에 저장해줘'
    )
    if (rawEmails?.length) {
      setEmails(rawEmails)
      setSelectedIds(new Set())
    }
    if (analyzedEmails?.length) {
      setResults(analyzedEmails.map((e) => ({
        id: e.id,
        category: e.category,
        importance: e.importance,
        isAd: e.isAd,
        needsReply: e.needsReply,
        summary: e.summary,
        replyDraft: e.replyDraft,
      })))
    }
    if (url) setNotionUrl(url)
  } catch (e) {
    setError(e.message)
  } finally {
    setPartialLoading('running', false)
  }
}
```

- [ ] **Step 5: "AI 분석하기" 버튼을 "에이전트 실행" 버튼으로 교체, "Notion에 저장" 버튼 삭제**

`src/App.jsx`에서 아래 블록을 찾아서:

```jsx
{emails.length > 0 && (
  <button
    onClick={handleAnalyze}
    disabled={loading.analyzing}
    className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
  >
    {loading.analyzing ? (
      <>
        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
        AI 분석 중...
      </>
    ) : (
      <>🤖 AI 분석하기</>
    )}
  </button>
)}
```

아래로 교체:

```jsx
<button
  onClick={handleRunAgent}
  disabled={loading.running}
  className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
>
  {loading.running ? (
    <>
      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
      에이전트 실행 중...
    </>
  ) : (
    <>🤖 에이전트 실행 →</>
  )}
</button>
```

그리고 "Notion에 저장" 버튼 블록 전체 삭제:

```jsx
{results.length > 0 && (
  <button
    onClick={handleSaveToNotion}
    disabled={loading.saving}
    className="px-5 py-2.5 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-900 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
  >
    {loading.saving ? (
      <>
        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
        저장 중...
      </>
    ) : (
      <>📝 Notion에 저장</>
    )}
  </button>
)}
```

- [ ] **Step 6: 헤더의 "Claude AI" 텍스트 수정**

`src/App.jsx` 214번 줄:
```jsx
// 기존
<p className="text-xs text-gray-400">Gmail + Claude AI 자동 분석</p>

// 변경
<p className="text-xs text-gray-400">Gmail + Gemini 에이전트 자동 분석</p>
```

- [ ] **Step 7: 빌드 확인**

```bash
npm run build
```

Expected: 에러 없이 `dist/` 생성

- [ ] **Step 8: 커밋**

```bash
git add src/App.jsx
git commit -m "feat(frontend): 에이전트 실행 버튼 통합 및 분석/저장 버튼 제거"
```

---

## 완료 확인

- [ ] `npm test` — 13개 테스트 전부 통과
- [ ] `npm run build` — 빌드 성공
- [ ] `npm run dev` — 서버 + 클라이언트 정상 기동
- [ ] 브라우저에서 "에이전트 실행 →" 버튼 클릭 → Gemini가 이메일 가져와 분석 후 Notion 저장 확인
