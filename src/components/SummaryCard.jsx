export default function SummaryCard({ emails, results }) {
  const urgent = results.filter((r) => r.importance >= 7 || r.needsReply)
  const needsReply = results.filter((r) => r.needsReply)
  const topEmail = urgent
    .sort((a, b) => b.importance - a.importance)[0]
  const topEmailData = topEmail ? emails.find((e) => e.id === topEmail.id) : null

  return (
    <div className="mb-6 p-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">분석 요약</p>
      <div className="flex flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-base">🔴</span>
          <div>
            <p className="text-xs text-red-500 font-medium">지금 처리</p>
            <p className="text-lg font-bold text-red-700 leading-none">{urgent.length}건</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl">
          <span className="text-base">✉️</span>
          <div>
            <p className="text-xs text-orange-500 font-medium">답장 필요</p>
            <p className="text-lg font-bold text-orange-700 leading-none">{needsReply.length}건</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl">
          <span className="text-base">📊</span>
          <div>
            <p className="text-xs text-gray-500 font-medium">전체 분석</p>
            <p className="text-lg font-bold text-gray-700 leading-none">{results.length}건</p>
          </div>
        </div>
      </div>

      {topEmailData && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50/50 border border-red-100 rounded-xl">
          <span className="text-xs text-red-400 shrink-0">최우선</span>
          <p className="text-sm font-semibold text-gray-800 truncate">{topEmailData.subject}</p>
          <span className="ml-auto shrink-0 text-xs font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
            {topEmail.importance}점
          </span>
        </div>
      )}
    </div>
  )
}
