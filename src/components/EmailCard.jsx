import ReplyDraft from './ReplyDraft'

const CATEGORY = {
  '항공/여행':   { bg: 'bg-sky-100',     text: 'text-sky-800',     border: 'border-sky-300' },
  '뉴스':       { bg: 'bg-gray-100',    text: 'text-gray-700',    border: 'border-gray-300' },
  '경제/금융':  { bg: 'bg-green-100',   text: 'text-green-800',   border: 'border-green-300' },
  '쇼핑':       { bg: 'bg-pink-100',    text: 'text-pink-800',    border: 'border-pink-300' },
  '구독/서비스': { bg: 'bg-purple-100',  text: 'text-purple-800',  border: 'border-purple-300' },
  '공공/관공서': { bg: 'bg-blue-100',    text: 'text-blue-800',    border: 'border-blue-300' },
  'SNS/커뮤니티':{ bg: 'bg-orange-100',  text: 'text-orange-800',  border: 'border-orange-300' },
  '건강/헬스':  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  '개인/지인':  { bg: 'bg-yellow-100',  text: 'text-yellow-800',  border: 'border-yellow-300' },
  '뉴스레터':   { bg: 'bg-indigo-100',  text: 'text-indigo-800',  border: 'border-indigo-300' },
  '적립/마일리지':{ bg: 'bg-amber-100',  text: 'text-amber-800',   border: 'border-amber-300' },
  '예약/티켓':  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    border: 'border-cyan-300' },
  '영수증':     { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-300' },
  '기타':       { bg: 'bg-gray-100',    text: 'text-gray-600',    border: 'border-gray-200' },
}

function importanceBadge(score) {
  if (score >= 8) return 'bg-red-500 text-white'
  if (score >= 5) return 'bg-amber-400 text-white'
  return 'bg-emerald-500 text-white'
}

export default function EmailCard({ email, result }) {
  const style = CATEGORY[result?.category] ?? { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' }

  return (
    <div
      className={`bg-white rounded-2xl border-2 ${result ? style.border : 'border-gray-200'} p-5 shadow-sm hover:shadow-md transition-shadow`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate leading-snug">{email.subject}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{email.from}</p>
          <p className="text-xs text-gray-400 mt-0.5">{email.date}</p>
        </div>

        {result && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.text}`}>
              {result.category}
            </span>
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${importanceBadge(result.importance)}`}
              title={`중요도 ${result.importance}/10`}
            >
              {result.importance}
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      {result?.summary && (
        <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2 leading-relaxed">
          {result.summary}
        </p>
      )}

      {/* Snippet (no analysis yet) */}
      {!result && email.snippet && (
        <p className="mt-2 text-sm text-gray-400 line-clamp-2">{email.snippet}</p>
      )}

      {/* Reply badge */}
      {result?.needsReply && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-0.5">
            ✉️ 답장 필요
          </span>
        </div>
      )}

      {/* Reply draft */}
      {result?.needsReply && result?.replyDraft && (
        <ReplyDraft draft={result.replyDraft} />
      )}
    </div>
  )
}
