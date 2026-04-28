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
      if (!fn) return Promise.reject(new Error(`Unknown tool: ${name}`))
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
