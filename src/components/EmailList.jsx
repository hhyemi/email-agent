import { useState } from 'react'
import EmailCard from './EmailCard'

function Section({ title, icon, emails, results, selectedIds, onToggleSelect, onToggleStar, defaultOpen = true, dimmed = false }) {
  const [open, setOpen] = useState(defaultOpen)

  if (!emails.length) return null

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <span>{icon}</span>
        <span className={`text-sm font-bold ${dimmed ? 'text-gray-400' : 'text-gray-700'}`}>{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${dimmed ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 text-gray-600'}`}>
          {emails.length}
        </span>
        <span className="ml-auto text-xs text-gray-400 group-hover:text-gray-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3">
          {emails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              result={results.find((r) => r.id === email.id) ?? null}
              selected={selectedIds.has(email.id)}
              onToggleSelect={onToggleSelect}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function EmailList({ emails, results, selectedIds, onToggleSelect, onToggleSelectAll, onToggleStar }) {
  const allSelected = emails.length > 0 && selectedIds.size === emails.length
  const hasSections = results.length > 0

  const urgent = emails.filter((e) => {
    const r = results.find((r) => r.id === e.id)
    return r && (r.importance >= 7 || r.needsReply)
  })
  const review = emails.filter((e) => {
    const r = results.find((r) => r.id === e.id)
    return r && r.importance >= 4 && r.importance < 7 && !r.needsReply
  })
  const rest = emails.filter((e) => {
    const r = results.find((r) => r.id === e.id)
    return !r || (r.importance < 4 && !r.needsReply)
  })

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-1">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleSelectAll}
          className="w-4 h-4 accent-blue-500 cursor-pointer"
        />
        <span className="text-xs text-gray-400">
          {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : '전체 선택'}
        </span>
      </div>

      {hasSections ? (
        <>
          <Section title="지금 처리" icon="🔴" emails={urgent} results={results} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onToggleStar={onToggleStar} defaultOpen={true} />
          <Section title="확인 필요" icon="📋" emails={review} results={results} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onToggleStar={onToggleStar} defaultOpen={true} />
          <Section title="나머지" icon="🗂️" emails={rest} results={results} selectedIds={selectedIds} onToggleSelect={onToggleSelect} onToggleStar={onToggleStar} defaultOpen={false} dimmed />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {emails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              result={null}
              selected={selectedIds.has(email.id)}
              onToggleSelect={onToggleSelect}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
