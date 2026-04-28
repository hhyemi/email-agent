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
