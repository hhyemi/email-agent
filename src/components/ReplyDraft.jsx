import { useState } from 'react'

export default function ReplyDraft({ draft }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        답장 초안 {open ? '접기' : '펼치기'}
      </button>

      {open && (
        <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {draft}
        </div>
      )}
    </div>
  )
}
