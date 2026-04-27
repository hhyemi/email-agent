import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { google } from 'googleapis'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Client as NotionClient } from '@notionhq/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOKEN_PATH = path.join(__dirname, 'tokens.json')

const app = express()
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// ── Gmail OAuth2 ──────────────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
)

if (fs.existsSync(TOKEN_PATH)) {
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)))
}

oauth2Client.on('tokens', (tokens) => {
  const existing = fs.existsSync(TOKEN_PATH)
    ? JSON.parse(fs.readFileSync(TOKEN_PATH))
    : {}
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...existing, ...tokens }))
  oauth2Client.setCredentials({ ...existing, ...tokens })
})

// ── API Clients ───────────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const gemini = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })
const notion = new NotionClient({ auth: process.env.NOTION_API_KEY })

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.get('/auth/gmail', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    prompt: 'consent',
  })
  res.redirect(authUrl)
})

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
    res.redirect('http://localhost:5173?auth=success')
  } catch (err) {
    console.error('Auth callback error:', err.message)
    res.redirect('http://localhost:5173?auth=error')
  }
})

app.get('/auth/status', (req, res) => {
  res.json({ authenticated: fs.existsSync(TOKEN_PATH) })
})

app.post('/auth/logout', (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
  res.json({ success: true })
})

// ── Mark as Read ─────────────────────────────────────────────────────────────
app.post('/api/emails/read', async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }
  try {
    const { ids } = req.body
    if (!ids?.length) return res.status(400).json({ error: 'ids 필요' })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    await Promise.all(
      ids.map((id) =>
        gmail.users.messages.modify({
          userId: 'me',
          id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        })
      )
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Mark as read error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Star Toggle ───────────────────────────────────────────────────────────────
app.post('/api/emails/star', async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }
  try {
    const { id, starred } = req.body
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    await gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: starred
        ? { addLabelIds: ['STARRED'] }
        : { removeLabelIds: ['STARRED'] },
    })
    res.json({ success: true })
  } catch (err) {
    console.error('Star error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Trash ─────────────────────────────────────────────────────────────────────
app.post('/api/emails/trash', async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }
  try {
    const { ids } = req.body
    if (!ids?.length) return res.status(400).json({ error: 'ids 필요' })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    await Promise.all(ids.map((id) => gmail.users.messages.trash({ userId: 'me', id })))
    res.json({ success: true })
  } catch (err) {
    console.error('Trash error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Email Routes ──────────────────────────────────────────────────────────────
app.get('/api/emails', async (req, res) => {
  if (!fs.existsSync(TOKEN_PATH)) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const limit = Math.min(parseInt(req.query.limit) || 10, 50)

    const unreadOnly = req.query.unread === 'true'
    const after = req.query.after
    const before = req.query.before

    const qParts = []
    if (after) qParts.push(`after:${after}`)
    if (before) qParts.push(`before:${before}`)

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      labelIds: unreadOnly ? ['INBOX', 'UNREAD'] : ['INBOX'],
      ...(qParts.length ? { q: qParts.join(' ') } : {}),
    })

    const messages = listRes.data.messages || []

    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        })

        const headers = detail.data.payload.headers
        const get = (name) => headers.find((h) => h.name === name)?.value || ''

        const body = extractBody(detail.data.payload)
        const isBulk = !!(get('List-Unsubscribe') || get('Precedence'))
        const isUnread = detail.data.labelIds?.includes('UNREAD') ?? false
        const isStarred = detail.data.labelIds?.includes('STARRED') ?? false
        const hasAttachment = (function checkParts(parts = []) {
          return parts.some((p) => (p.filename && p.body?.attachmentId) || checkParts(p.parts))
        })(detail.data.payload.parts)

        return {
          id: msg.id,
          subject: get('Subject') || '(제목 없음)',
          from: get('From'),
          to: get('To'),
          date: get('Date'),
          snippet: detail.data.snippet || '',
          body: body.slice(0, 2000),
          isBulk,
          isUnread,
          isStarred,
          hasAttachment,
        }
      })
    )

    res.json({ emails })
  } catch (err) {
    console.error('Fetch emails error:', err.message)
    const status = err.code === 401 ? 401 : 500
    res.status(status).json({ error: err.message })
  }
})

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

async function withRetry(fn, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      const isRetryable = err.message?.includes('503') || err.message?.includes('429')
      if (isRetryable && i < retries - 1) {
        console.log(`재시도 ${i + 1}/${retries - 1} (${delay / 1000}초 후)...`)
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
      } else {
        throw err
      }
    }
  }
}

function fastClassify(email) {
  const isAd = email.isBulk || (email.labelIds ?? []).includes('CATEGORY_PROMOTIONS')
  if (!isAd) return null
  return {
    id: email.id,
    category: '기타',
    importance: 2,
    isAd: true,
    needsReply: false,
    summary: email.snippet?.slice(0, 50) || '광고/홍보 메일',
    replyDraft: null,
  }
}

async function analyzeEmail(email) {
  const fast = fastClassify(email)
  if (fast) return fast

  const prompt = `다음 이메일을 분석해주세요.

발신자: ${email.from}
수신자: ${email.to}
제목: ${email.subject}
날짜: ${email.date}
대량발송여부: ${email.isBulk ? '예 (List-Unsubscribe 헤더 감지됨)' : '아니오'}
내용:
${(email.body || email.snippet || '').slice(0, 500)}

[분석 기준]
- category: 아래 목록 중 내용에 가장 맞는 것 하나 선택
  항공/여행 | 뉴스 | 경제/금융 | 쇼핑 | 구독/서비스 | 공공/관공서 | SNS/커뮤니티 | 건강/헬스 | 개인/지인 | 뉴스레터 | 적립/마일리지 | 예약/티켓 | 영수증 | 기타

- importance (1~10 기준):
  9~10: 보안 알림, 계좌/결제 이상, 긴급 대응 필요
  7~8: 개인적으로 보낸 메일, 업무/계약 관련, 답변 필요한 질문
  4~6: 일반 정보 안내, 예약 확인, 영수증
  1~3: 뉴스레터, 광고, 대량 발송 메일, 자동 발송

- isAd: 대량발송여부가 "예"이거나, 수신자가 나만이 아닌 경우, 마케팅/홍보 목적이면 true

- needsReply: 발신자가 답변을 기대하는 개인 메일일 때만 true. 자동발송/광고/뉴스레터는 false

아래 JSON 형식으로만 응답해주세요 (마크다운 코드블록 없이, 순수 JSON만):
{
  "category": "위 목록 중 하나",
  "importance": 1~10 사이의 정수,
  "isAd": true 또는 false,
  "needsReply": true 또는 false,
  "summary": "한줄 요약 (50자 이내)",
  "replyDraft": "답장 초안 (needsReply가 false이면 null)"
}`

  const response = await withRetry(() => gemini.generateContent(prompt))

  try {
    const text = response.response.text()
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match[0])
    return { id: email.id, ...parsed }
  } catch {
    return {
      id: email.id,
      category: '업무',
      importance: 5,
      needsReply: false,
      summary: '분석 결과를 파싱할 수 없습니다.',
      replyDraft: null,
    }
  }
}

// ── Notion Route ──────────────────────────────────────────────────────────────
app.post('/api/notion/save', async (req, res) => {
  const { emails, results } = req.body
  if (!emails?.length || !results?.length) {
    return res.status(400).json({ error: '저장할 데이터가 없습니다.' })
  }

  try {
    const db = await notion.databases.retrieve({ database_id: process.env.NOTION_DATABASE_ID })
    const props = db.properties

    const pages = await Promise.all(
      emails.map(async (email) => {
        const result = results.find((r) => r.id === email.id) || {}

        // 발신자 파싱: "홍길동 <hong@email.com>" 형식 처리
        const fromMatch = email.from.match(/^(.*?)\s*<(.+?)>$/)
        const senderName = fromMatch ? fromMatch[1].trim().replace(/"/g, '') : email.from
        const senderEmail = fromMatch ? fromMatch[2] : email.from

        // 날짜 ISO 변환
        let dateISO = null
        try { dateISO = new Date(email.date).toISOString().split('T')[0] } catch {}

        const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${email.id}`

        // 제목 속성 자동 감지
        const titlePropName = Object.keys(props).find((k) => props[k].type === 'title')

        const properties = {
          [titlePropName]: {
            title: [{ text: { content: email.subject || '(제목 없음)' } }],
          },
        }

        // 속성명으로 매핑
        for (const [name, def] of Object.entries(props)) {
          if (def.type === 'title') continue

          if (name === '메일 링크' && def.type === 'url') {
            properties[name] = { url: gmailLink }
          } else if (name === '받은 날짜' && def.type === 'date' && dateISO) {
            properties[name] = { date: { start: dateISO } }
          } else if (name === '보낸 사람' && def.type === 'rich_text') {
            properties[name] = { rich_text: [{ text: { content: senderName } }] }
          } else if (name === '보낸 사람 이메일') {
            if (def.type === 'email') {
              properties[name] = { email: senderEmail }
            } else if (def.type === 'rich_text') {
              properties[name] = { rich_text: [{ text: { content: senderEmail } }] }
            }
          } else if (name === '카테고리' && result.category) {
            if (def.type === 'select') {
              properties[name] = { select: { name: result.category } }
            } else if (def.type === 'multi_select') {
              properties[name] = { multi_select: [{ name: result.category }] }
            } else if (def.type === 'rich_text') {
              properties[name] = { rich_text: [{ text: { content: result.category } }] }
            }
          } else if (name === '태그' && def.type === 'multi_select') {
            const tags = []
            if (result.importance >= 7) tags.push({ name: '중요' })
            if (result.needsReply) tags.push({ name: '답장필요' })
            if (['개인/지인'].includes(result.category)) tags.push({ name: '개인' })
            if (result.isAd) tags.push({ name: '광고' })
            properties[name] = { multi_select: tags }
          }
        }

        // 페이지 본문: 요약 + 중요도 + 답장 초안
        const children = []
        if (result.summary) {
          children.push({
            object: 'block', type: 'callout',
            callout: {
              rich_text: [{ type: 'text', text: { content: result.summary } }],
              icon: { type: 'emoji', emoji: '📝' },
            },
          })
        }
        if (result.importance) {
          children.push({
            object: 'block', type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: `중요도: ${result.importance}/10  |  답장 필요: ${result.needsReply ? '✅' : '❌'}` } }],
            },
          })
        }
        if (result.replyDraft) {
          children.push(
            { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: '✉️ 답장 초안' } }] } },
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: result.replyDraft } }] } }
          )
        }

        return notion.pages.create({
          parent: { database_id: process.env.NOTION_DATABASE_ID },
          properties,
          children,
        })
      })
    )

    const dbUrl = `https://notion.so/${process.env.NOTION_DATABASE_ID.replace(/-/g, '')}`
    res.json({ pageUrl: dbUrl, count: pages.length })
  } catch (err) {
    console.error('Notion save error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})
