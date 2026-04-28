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
