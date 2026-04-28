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
