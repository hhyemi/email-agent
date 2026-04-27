export async function checkAuthStatus() {
  const res = await fetch('/auth/status')
  return res.json()
}

export async function fetchEmails(limit = 10, unreadOnly = false, after = null, before = null) {
  const params = new URLSearchParams({ limit, unread: unreadOnly })
  if (after) params.set('after', after)
  if (before) params.set('before', before)
  const res = await fetch(`/api/emails?${params}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '이메일을 불러오지 못했습니다.')
  return data
}

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

export async function saveToNotion(emails, results) {
  const res = await fetch('/api/notion/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails, results }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Notion 저장에 실패했습니다.')
  return data
}

export async function markAsRead(ids) {
  const res = await fetch('/api/emails/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '읽음 처리 실패')
  return data
}

export async function toggleStar(id, starred) {
  const res = await fetch('/api/emails/star', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, starred }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '별표 처리 실패')
  return data
}

export async function trashEmails(ids) {
  const res = await fetch('/api/emails/trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '삭제 실패')
  return data
}

export async function logout() {
  await fetch('/auth/logout', { method: 'POST' })
}
