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
