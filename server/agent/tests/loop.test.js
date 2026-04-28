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
