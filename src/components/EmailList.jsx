import EmailCard from './EmailCard'

export default function EmailList({ emails, results, selectedIds, onToggleSelect, onToggleSelectAll, onToggleStar }) {
  const allSelected = emails.length > 0 && selectedIds.size === emails.length

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
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
    </div>
  )
}
