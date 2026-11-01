import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ChevronLeft,
  Copy,
  Download,
  Loader2,
  Trash2,
  WifiOff,
} from 'lucide-react'
import {
  clearNetEntries,
  compactPath,
  getNetEntries,
  isDevToolsEnabled,
  prettyJSON,
  setDevToolsEnabled,
  shortPath,
  subscribeDevTools,
  timeLabel,
  type NetEntry,
  type NetKind,
} from '../utils/devtools'

type Filter = 'all' | NetKind | 'error'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'api', label: '接口' },
  { key: 'db', label: '数据库' },
  { key: 'other', label: '其它' },
  { key: 'error', label: '异常' },
]

function statusColor(entry: NetEntry): string {
  if (entry.error) return 'text-danger'
  if (entry.status == null) return 'text-ink-2'
  if (entry.status >= 500) return 'text-danger'
  if (entry.status >= 400) return 'text-amber-600'
  return 'text-[#2d8a5e]'
}

function KindTag({ kind }: { kind: NetKind }) {
  const map: Record<NetKind, { label: string; cls: string }> = {
    api: { label: '接口', cls: 'bg-brand/10 text-brand' },
    db: { label: 'DB', cls: 'bg-[#5b8dee]/10 text-[#5b8dee]' },
    other: { label: '其它', cls: 'bg-ink-2/10 text-ink-2' },
  }
  const m = map[kind]
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>{m.label}</span>
}

export default function DevTools() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<NetEntry[]>(() => getNetEntries())
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const enabled = isDevToolsEnabled()

  // 未启用直接回设置页（正常用户不应该走到这里）
  useEffect(() => {
    if (!enabled) navigate('/settings', { replace: true })
  }, [enabled, navigate])

  useEffect(() => {
    return subscribeDevTools(() => setEntries([...getNetEntries()]))
  }, [])

  const shown = useMemo(() => {
    if (filter === 'all') return entries
    if (filter === 'error') return entries.filter((e) => !!e.error || (e.status ?? 0) >= 400)
    return entries.filter((e) => e.kind === filter)
  }, [entries, filter])

  const counts = useMemo(
    () => ({
      api: entries.filter((e) => e.kind === 'api').length,
      db: entries.filter((e) => e.kind === 'db').length,
      error: entries.filter((e) => !!e.error || (e.status ?? 0) >= 400).length,
    }),
    [entries],
  )

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时静默失败，用户可手动选中 */
    }
  }

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mybills-devtools-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md safe-area-top px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/settings')} className="p-1 -ml-1 text-ink-2" aria-label="返回">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold text-ink">开发者工具</h1>
          <span className="ml-auto text-[11px] text-ink-3">
            接口 {counts.api} · DB {counts.db} · 异常 {counts.error}
          </span>
        </div>

        {/* 筛选 */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 h-8 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.key ? 'bg-ink text-bg' : 'bg-surface text-ink-2 border border-brand-tint'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 pb-28 space-y-2">
        <p className="text-[11px] text-ink-3 leading-relaxed mt-1">
          这里显示的是<b>未经包装的原始响应</b>：/api/* 会额外标出外层的 code / message，
          数据库请求直接是原始 JSON。仅记录同源请求，header 不记录。
        </p>

        {shown.length === 0 && (
          <div className="py-16 text-center text-sm text-ink-3">
            还没有请求记录
            <div className="text-[11px] mt-1">去首页或财富页操作一下，再回来看看</div>
          </div>
        )}

        {shown.map((e) => {
          const open = openId === e.id
          return (
            <div key={e.id} className="bg-surface rounded-xl border border-brand-tint overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : e.id)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2"
              >
                <span className="text-[10px] font-mono font-bold text-ink-2 w-11 shrink-0">{e.method}</span>
                <KindTag kind={e.kind} />
                <span className="flex-1 min-w-0 text-xs text-ink font-mono truncate">
                  {compactPath(e.url)}
                </span>
                {e.pending ? (
                  <Loader2 size={13} className="animate-spin text-ink-3 shrink-0" />
                ) : e.error ? (
                  <WifiOff size={13} className="text-danger shrink-0" />
                ) : (e.status ?? 0) >= 400 ? (
                  <AlertCircle size={13} className="text-amber-600 shrink-0" />
                ) : null}
                <span className={`text-xs font-mono shrink-0 ${statusColor(e)}`}>{e.status ?? '—'}</span>
                <span className="text-[10px] text-ink-3 font-mono w-12 text-right shrink-0">{e.duration}ms</span>
              </button>

              {open && (
                <div className="px-3 pb-3 space-y-2 border-t border-brand-tint pt-2">
                  <div className="flex items-center gap-2 text-[11px] text-ink-3">
                    <span>{timeLabel(e.at)}</span>
                    <span className="font-mono break-all">{shortPath(e.url)}</span>
                  </div>

                  {e.envelope && (
                    <div className="rounded-lg bg-bg px-2 py-1.5 text-[11px] font-mono">
                      <span className="text-ink-3">业务外壳 </span>
                      <span className={e.envelope.code === 0 ? 'text-[#2d8a5e]' : 'text-danger'}>
                        code={String(e.envelope.code)}
                      </span>
                      {e.envelope.message && <span className="text-ink-2"> message={e.envelope.message}</span>}
                    </div>
                  )}

                  {e.error && <div className="rounded-lg bg-danger/10 px-2 py-1.5 text-[11px] text-danger">{e.error}</div>}

                  {e.requestBody && (
                    <div>
                      <div className="text-[11px] text-ink-3 mb-1">请求体</div>
                      <pre className="rounded-lg bg-bg p-2 text-[11px] font-mono text-ink-2 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                        {prettyJSON(e.requestBody)}
                      </pre>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-ink-3">
                        原始响应{e.truncated ? '（已截断）' : ''}
                      </span>
                      <button
                        onClick={() => copy(e.responseBody || '')}
                        className="flex items-center gap-1 text-[11px] text-ink-2 px-2 py-1 rounded-lg bg-bg"
                      >
                        <Copy size={11} />
                        {copied ? '已复制' : '复制'}
                      </button>
                    </div>
                    <pre className="rounded-lg bg-bg p-2 text-[11px] font-mono text-ink whitespace-pre-wrap break-all max-h-72 overflow-auto">
                      {e.responseBody ? prettyJSON(e.responseBody) : e.pending ? '读取中…' : '（无响应体）'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </main>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg/90 backdrop-blur-md border-t border-brand-tint px-4 py-3 flex gap-2 safe-area-bottom">
        <button
          onClick={() => {
            clearNetEntries()
            setOpenId(null)
          }}
          className="flex-1 h-10 rounded-xl bg-surface border border-brand-tint text-sm text-ink-2 flex items-center justify-center gap-1.5"
        >
          <Trash2 size={15} /> 清空
        </button>
        <button
          onClick={exportJSON}
          disabled={entries.length === 0}
          className="flex-1 h-10 rounded-xl bg-surface border border-brand-tint text-sm text-ink-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Download size={15} /> 导出
        </button>
        <button
          onClick={() => {
            setDevToolsEnabled(false)
            navigate('/settings')
          }}
          className="flex-1 h-10 rounded-xl bg-ink text-bg text-sm font-medium"
        >
          关闭工具
        </button>
      </div>
    </div>
  )
}
