import { useState, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import { ko } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import EmailList from './components/EmailList'
import { checkAuthStatus, fetchEmails, analyzeEmails, saveToNotion, markAsRead, trashEmails, toggleStar, logout } from './api'

const CATEGORY_COLORS = {
  '항공/여행':    'bg-sky-100 text-sky-800',
  '뉴스':        'bg-gray-100 text-gray-700',
  '경제/금융':   'bg-green-100 text-green-800',
  '쇼핑':        'bg-pink-100 text-pink-800',
  '구독/서비스':  'bg-purple-100 text-purple-800',
  '공공/관공서':  'bg-blue-100 text-blue-800',
  'SNS/커뮤니티': 'bg-orange-100 text-orange-800',
  '건강/헬스':   'bg-emerald-100 text-emerald-800',
  '개인/지인':   'bg-yellow-100 text-yellow-800',
  '뉴스레터':    'bg-indigo-100 text-indigo-800',
  '적립/마일리지': 'bg-amber-100 text-amber-800',
  '예약/티켓':   'bg-cyan-100 text-cyan-800',
  '영수증':      'bg-slate-100 text-slate-700',
  '기타':        'bg-gray-100 text-gray-600',
}

export default function App() {
  const [authStatus, setAuthStatus] = useState('loading') // 'loading' | 'unauthenticated' | 'authenticated'
  const [emails, setEmails] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState({ fetching: false, analyzing: false, saving: false, marking: false, trashing: false })
  const [error, setError] = useState(null)
  const [notionUrl, setNotionUrl] = useState(null)
  const [dateRange, setDateRange] = useState([null, null])
  const [startDate, endDate] = dateRange
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [hideAds, setHideAds] = useState(false)
  const [minImportance, setMinImportance] = useState(1)

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleSelectAll = () =>
    setSelectedIds(selectedIds.size === emails.length ? new Set() : new Set(emails.map((e) => e.id)))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth')) {
      window.history.replaceState({}, '', '/')
      if (params.get('auth') === 'error') {
        setError('Google 인증에 실패했습니다. 다시 시도해주세요.')
      }
    }

    checkAuthStatus()
      .then(({ authenticated }) => setAuthStatus(authenticated ? 'authenticated' : 'unauthenticated'))
      .catch(() => setAuthStatus('unauthenticated'))
  }, [])

  const setPartialLoading = (key, value) =>
    setLoading((prev) => ({ ...prev, [key]: value }))

  const toGmailDate = (date) =>
    date ? `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` : null

  const handleFetchEmails = async (unreadOnly = false, useRange = false) => {
    setError(null)
    setNotionUrl(null)
    setPartialLoading('fetching', true)
    try {
      const after = useRange ? toGmailDate(startDate) : null
      const before = useRange && endDate
        ? toGmailDate(new Date(endDate.getTime() + 86400000))
        : null
      const { emails: data } = await fetchEmails(50, unreadOnly, after, before)
      setEmails(data)
      setResults([])
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('fetching', false)
    }
  }

  const handleAnalyze = async () => {
    if (!emails.length) return
    setError(null)
    setPartialLoading('analyzing', true)
    try {
      const { results: data } = await analyzeEmails(emails)
      setResults(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('analyzing', false)
    }
  }

  const handleSaveToNotion = async () => {
    if (!results.length) return
    setError(null)
    setPartialLoading('saving', true)
    try {
      const { pageUrl } = await saveToNotion(emails, results)
      setNotionUrl(pageUrl)
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('saving', false)
    }
  }

  const handleMarkAsRead = async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : emails.map((e) => e.id)
    if (!ids.length) return
    setError(null)
    setPartialLoading('marking', true)
    try {
      await markAsRead(ids)
      setEmails((prev) => prev.map((e) => ids.includes(e.id) ? { ...e, isUnread: false } : e))
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('marking', false)
    }
  }

  const handleToggleStar = async (id, starred) => {
    try {
      await toggleStar(id, starred)
      setEmails((prev) => prev.map((e) => e.id === id ? { ...e, isStarred: starred } : e))
    } catch (e) {
      setError(e.message)
    }
  }

  const handleTrash = async () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : []
    if (!ids.length) return
    setError(null)
    setPartialLoading('trashing', true)
    try {
      await trashEmails(ids)
      setEmails((prev) => prev.filter((e) => !ids.includes(e.id)))
      setResults((prev) => prev.filter((r) => !ids.includes(r.id)))
      setSelectedIds(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setPartialLoading('trashing', false)
    }
  }

  const handleLogout = async () => {
    await logout()
    setAuthStatus('unauthenticated')
    setEmails([])
    setResults([])
    setNotionUrl(null)
    setError(null)
  }

  const categorySummary = results.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {})

  const needsReplyCount = results.filter((r) => r.needsReply).length

  const visibleEmails = emails.filter((e) => {
    const result = results.find((r) => r.id === e.id)
    if (!result) return true
    if (hideAds && result.isAd) return false
    if (result.importance < minImportance) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">📧 이메일 분류 에이전트</h1>
            <p className="text-xs text-gray-400">Gmail + Claude AI 자동 분석</p>
          </div>

          {authStatus === 'authenticated' && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Gmail 연결됨
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                연결 해제
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Loading auth */}
        {authStatus === 'loading' && (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm">로딩 중...</span>
            </div>
          </div>
        )}

        {/* Unauthenticated */}
        {authStatus === 'unauthenticated' && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="text-7xl">📬</div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-800">Gmail 연동이 필요합니다</h2>
              <p className="text-gray-500 mt-2 max-w-sm">
                Google 계정을 연결하면 최신 이메일을 AI가 자동으로 분석하고 분류해드립니다.
              </p>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                {error}
              </p>
            )}
            <a
              href="/auth/gmail"
              className="mt-1 px-7 py-3 bg-blue-600 text-white rounded-2xl font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200"
            >
              Google 계정으로 연결
            </a>
          </div>
        )}

        {/* Authenticated */}
        {authStatus === 'authenticated' && (
          <>
            {/* Date range picker */}
            <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-white/70 border border-gray-200 rounded-2xl">
              <span className="text-sm text-gray-500 font-medium">📅 기간</span>
              <DatePicker
                selectsRange
                startDate={startDate}
                endDate={endDate}
                onChange={(range) => setDateRange(range)}
                locale={ko}
                dateFormat="yyyy.MM.dd"
                placeholderText="시작일 ~ 종료일"
                isClearable
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-52 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={() => handleFetchEmails(false, true)}
                disabled={loading.fetching || !startDate}
                className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading.fetching ? '불러오는 중...' : '기간 조회'}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-5">
              <button
                onClick={() => handleFetchEmails(false)}
                disabled={loading.fetching}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
              >
                {loading.fetching ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    불러오는 중...
                  </>
                ) : (
                  <>📥 최근 20개</>
                )}
              </button>

              <button
                onClick={() => handleFetchEmails(true)}
                disabled={loading.fetching}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
              >
                {loading.fetching ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    불러오는 중...
                  </>
                ) : (
                  <>📬 안읽은 메일</>
                )}
              </button>

              {emails.length > 0 && (
                <button
                  onClick={handleAnalyze}
                  disabled={loading.analyzing}
                  className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
                >
                  {loading.analyzing ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      AI 분석 중...
                    </>
                  ) : (
                    <>🤖 AI 분석하기</>
                  )}
                </button>
              )}

              {emails.length > 0 && (
                <button
                  onClick={handleMarkAsRead}
                  disabled={loading.marking}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
                >
                  {loading.marking ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      처리 중...
                    </>
                  ) : (
                    <>✅ 읽음 처리{selectedIds.size > 0 && ` (${selectedIds.size})`}</>
                  )}
                </button>
              )}

              {selectedIds.size > 0 && (
                <button
                  onClick={handleTrash}
                  disabled={loading.trashing}
                  className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
                >
                  {loading.trashing ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      삭제 중...
                    </>
                  ) : (
                    <>🗑️ 삭제 ({selectedIds.size})</>
                  )}
                </button>
              )}

              {results.length > 0 && (
                <button
                  onClick={handleSaveToNotion}
                  disabled={loading.saving}
                  className="px-5 py-2.5 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-900 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
                >
                  {loading.saving ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      저장 중...
                    </>
                  ) : (
                    <>📝 Notion에 저장</>
                  )}
                </button>
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <span>⚠️</span>
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Notion success banner */}
            {notionUrl && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
                <span>✅</span>
                <span>Notion에 저장되었습니다!</span>
                <a
                  href={notionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto underline font-semibold hover:text-emerald-900"
                >
                  페이지 보기 →
                </a>
              </div>
            )}

            {/* Filters */}
            {results.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 mb-4 px-4 py-3 bg-white/70 border border-gray-200 rounded-2xl">
                <button
                  onClick={() => setHideAds((v) => !v)}
                  className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${hideAds ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}
                >
                  <span>{hideAds ? '📢' : '📢'}</span>
                  광고 {hideAds ? '숨김' : '표시'}
                </button>

                <div className="flex items-center gap-3 flex-1 min-w-48">
                  <span className="text-sm text-gray-500 shrink-0">중요도</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={minImportance}
                    onChange={(e) => setMinImportance(Number(e.target.value))}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-sm font-bold text-blue-600 w-12 shrink-0">
                    {minImportance === 1 ? '전체' : `${minImportance}점+`}
                  </span>
                </div>

                {(hideAds || minImportance > 1) && (
                  <span className="text-xs text-gray-400">
                    {visibleEmails.length} / {emails.length}개 표시
                  </span>
                )}
              </div>
            )}

            {/* Category summary chips */}
            {results.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {Object.entries(categorySummary).map(([cat, count]) => {
                  const ids = results.filter((r) => r.category === cat).map((r) => r.id)
                  const allSelected = ids.every((id) => selectedIds.has(id))
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        if (allSelected) {
                          setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
                        } else {
                          setSelectedIds((prev) => new Set([...prev, ...ids]))
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${allSelected ? 'ring-2 ring-offset-1 ring-blue-400' : ''} ${CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700'} hover:opacity-80 cursor-pointer`}
                    >
                      {cat} {count}건
                    </button>
                  )
                })}
                {needsReplyCount > 0 && (() => {
                  const ids = results.filter((r) => r.needsReply).map((r) => r.id)
                  const allSelected = ids.every((id) => selectedIds.has(id))
                  return (
                    <button
                      onClick={() => {
                        if (allSelected) {
                          setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
                        } else {
                          setSelectedIds((prev) => new Set([...prev, ...ids]))
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${allSelected ? 'ring-2 ring-offset-1 ring-blue-400' : ''} bg-orange-100 text-orange-800 hover:opacity-80 cursor-pointer`}
                    >
                      ✉️ 답장 필요 {needsReplyCount}건
                    </button>
                  )
                })()}
              </div>
            )}

            {/* Email list */}
            {emails.length > 0 ? (
              <EmailList
                emails={visibleEmails}
                results={results}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onToggleStar={handleToggleStar}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-sm">위의 버튼으로 이메일을 가져오세요</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
