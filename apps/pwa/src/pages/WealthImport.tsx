import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ParsedHolding } from '../utils/holdingImport'
import { searchQuote, fetchQuoteDetail, QuoteSearchResult } from '../utils/quoteApi'
import { addHoldingTransaction } from '../db/wealthStore'
import { fmtMoney as fmtMoneyUtil, Currency } from '../utils/currency'
import { Trash2, Check, Loader2, Upload } from 'lucide-react'

// 市场 → 默认币种（与后端 marketCurrency 一致）
function marketToCurrency(market: ImportRow['market']): Currency {
  if (market === 'US') return 'USD'
  if (market === 'HK') return 'HKD'
  return 'CNY'
}

// 导入预览行：解析 + 匹配 + 计算后的可编辑流水
interface ImportRow {
  id: string
  raw: ParsedHolding
  // 匹配结果
  matched: QuoteSearchResult | null
  name: string
  symbol: string
  market: 'CN' | 'HK' | 'US' | 'FUND' | 'GOLD'
  // 计算出的流水字段（可编辑）
  quantity: string
  price: string
  date: string
  // 匹配到的当前净值/价格（用于盈亏核对）
  curPrice: number | null
  // 状态
  resolving: boolean
  resolveError: string | null
  drop: boolean
}

// 构造搜索候选名：基金名常带后缀导致搜不到，依次回退到更短的核心名
function buildNameCandidates(name: string): string[] {
  const clean = name.trim()
  const cands = [clean]
  // 去尾部字母份额类别（C / A / B / E）
  const noTail = clean.replace(/[CABE]\s*$/, '').trim()
  if (noTail && noTail !== clean) cands.push(noTail)
  // 去常见类型/营销词
  const core = clean
    .replace(/(联接|ETF|LOF|QDII|FOF|指数|混合|债券|货币|股票|黄金|基金|理财|进阶|金选|优选|精选|主题|产业|证券|资管)/g, ' ')
    .replace(/[CABE]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (core && core !== clean && core.length >= 2) cands.push(core)
  // 进一步递减截断核心名（每减 2 字），提高长基金名命中率
  let s = core
  while (s.length > 4) {
    s = s.slice(0, s.length - 2).trim()
    if (s.length >= 4 && !cands.includes(s)) cands.push(s)
  }
  // 去重
  return Array.from(new Set(cands))
}

// 计算数量/成本价。
//  - 精确模式（raw.precise=true，文本已给 数量 + 成本/现价）：直接采用，不查行情。
//  - 反推模式（仅市值 + 持有收益，基金常见）：按 raw.market 查行情取现价反推。
//    份额 = 市值 / 现价；成本 = (市值 - 持有收益) / 份额。
// 若取不到行情价，绝不退化成「1 份、单价=市值」这类荒谬值，而是留空让用户手填。
async function resolveRow(raw: ParsedHolding): Promise<{
  matched: QuoteSearchResult | null
  quantity: string
  price: string
  curPrice: number | null
  error: string | null
}> {
  // —— 精确模式：文本已含数量与成本/现价，直接用，不查行情 ——
  if (raw.precise && raw.quantity != null && (raw.costPrice != null || raw.currentPrice != null)) {
    const qty = raw.quantity
    const price = raw.costPrice != null ? raw.costPrice : (raw.currentPrice as number)
    return {
      matched: null,
      quantity: String(qty),
      price: price.toFixed(4),
      curPrice: raw.currentPrice,
      error: null,
    }
  }

  // —— 反推模式：用市值 + 持有收益，查行情取现价反推 ——
  const mv = raw.marketValue
  if (mv == null) {
    return { matched: null, quantity: '', price: '', curPrice: null, error: '未解析到市值，请手动填写' }
  }
  try {
    // 搜索优先级：symbol（代码精确匹配）> name（名称模糊搜索）
    const searchQuery = raw.symbol || raw.name
    const nameCandidates = buildNameCandidates(searchQuery)
    let found: QuoteSearchResult[] = []
    let best: QuoteSearchResult | null = null
    for (const q of nameCandidates) {
      const r = await searchQuote(q).catch(() => [] as QuoteSearchResult[])
      if (r && r.length > 0) { found = r; break }
    }
    best = found?.[0] || null
    const market: ImportRow['market'] = best?.market === 'FUND' || raw.market === 'FUND' ? 'FUND' : (best?.market || raw.market) as ImportRow['market']
    const symbol = best?.code || best?.symbol || raw.name
    const detail = await fetchQuoteDetail(symbol, market).catch(() => null)
    const cur = detail?.current_price
    if (cur && cur > 0) {
      const qty = mv / cur
      const cost = raw.holdProfit != null ? (mv - raw.holdProfit) / qty : cur
      return {
        matched: best,
        quantity: qty.toFixed(4),
        price: cost.toFixed(4),
        curPrice: cur,
        error: null,
      }
    }
    return {
      matched: best,
      quantity: '',
      price: '',
      curPrice: null,
      error: best ? '未取到行情价，请手动填写份额与成本价' : '未匹配到标的，请手动填写',
    }
  } catch (e: any) {
    return {
      matched: null,
      quantity: '',
      price: '',
      curPrice: null,
      error: '匹配失败：' + (e?.message || e),
    }
  }
}

export function WealthImport() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [parsed, setParsed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  // 双模式切换：paste = 粘贴文本，upload = 上传截图
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ====== 公共：调用 import-screenshot 接口（rawText 或 imageBase64）→ 解析结果 ======
  const apiBase = (import.meta as any).env?.VITE_FUNCTIONS_URL || ''

  const callImportAPI = async (payload: { imageBase64?: string; rawText?: string }) => {
    const resp = await fetch(`${apiBase}/api/wealth/import-screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (json.code !== 0) throw new Error(json.message || '识别失败')
    return json.data?.items || []
  }

  // ====== 公共：AI 返回的 items → ImportRow[] → resolveRow 并行匹配 ======
  const processAIResult = async (items: any[]) => {
    const base: ImportRow[] = items.map((item: any, i: number) => {
      const raw: ParsedHolding = {
        name: item.name || '',
        market: item.market === 'A股' ? 'CN' : item.market || 'CN',
        marketLabel: item.market,
        symbol: item.symbol || null,
        marketValue: item.market_value ?? 0,
        holdProfit: item.profit_loss ?? null,
        costPrice: item.cost_price ?? null,
        currentPrice: item.current_price ?? null,
        quantity: item.quantity ?? null,
        precise: (item.quantity > 0 && item.cost_price > 0),
        date: item.date || undefined,
      }
      return {
        id: `${Date.now()}-${i}`,
        raw,
        matched: null as QuoteSearchResult | null,
        name: raw.name,
        symbol: item.symbol || raw.name,
        market: raw.market as ImportRow['market'],
        quantity: '',
        price: '',
        curPrice: null,
        date: item.date || new Date().toISOString().slice(0, 10),
        resolving: true,
        resolveError: null,
        drop: false,
      }
    })
    setRows(base)
    setParsed(true)
    setSaveMsg(null)

    // 去重缓存：相同 symbol 只查一次行情，避免批量同名资产反复调 API
    const resolveCache = new Map<string, Awaited<ReturnType<typeof resolveRow>>>()
    const getCacheKey = (raw: ParsedHolding) => `${raw.market}:${raw.symbol || raw.name}`

    const settled = await Promise.all(
      base.map(async r => {
        const key = getCacheKey(r.raw)
        let res = resolveCache.get(key)
        if (!res) {
          res = await resolveRow(r.raw)
          resolveCache.set(key, res)
        }
        return {
          ...r,
          matched: res.matched,
          symbol: res.matched?.code || res.matched?.symbol || r.raw.name,
          market: (res.matched?.market || r.raw.market) as ImportRow['market'],
          name: res.matched?.name || r.raw.name,
          quantity: res.quantity,
          price: res.price,
          curPrice: res.curPrice,
          resolving: false,
          resolveError: res.error,
        }
      })
    )
    setRows(settled)
  }

  // ====== 粘贴文本 → AI 识别 ======
  const onParse = async () => {
    if (!text.trim()) return
    setUploading(true)
    setUploadMsg('AI 识别中…')
    try {
      const items = await callImportAPI({ rawText: text.trim() })
      if (items.length === 0) {
        setUploadMsg('未识别到持仓数据')
        setUploading(false)
        return
      }
      await processAIResult(items)
      setUploading(false)
      setUploadMsg(null)
    } catch (e: any) {
      setUploadMsg(e?.message || '识别失败')
      setUploading(false)
    }
  }

  // 截图上传 → OCR + DeepSeek → 复用 processAIResult
  const handleScreenshot = async (file: File) => {
    setUploading(true)
    setUploadMsg('识别中…')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const items = await callImportAPI({ imageBase64: base64 })
      if (items.length === 0) {
        setUploadMsg('未识别到持仓数据')
        setUploading(false)
        return
      }
      await processAIResult(items)
      setUploading(false)
      setUploadMsg(null)
    } catch (e: any) {
      setUploadMsg(e?.message || '上传失败')
      setUploading(false)
    }
  }

  const updateRow = (id: string, patch: Partial<ImportRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  const onSave = async () => {
    const valid = rows.filter(r => !r.drop && parseFloat(r.quantity) > 0 && parseFloat(r.price) > 0)
    if (valid.length === 0) {
      setSaveMsg('没有可导入的持仓')
      return
    }
    setSaving(true)
    setSaveMsg(null)
    let ok = 0
    let fail = 0
    for (const r of valid) {
      try {
        await addHoldingTransaction({
          symbol: r.symbol,
          market: r.market,
          name: r.name,
          direction: 'buy',
          quantity: parseFloat(r.quantity),
          price: parseFloat(r.price),
          date: r.date,
        })
        ok++
      } catch {
        fail++
      }
    }
    setSaving(false)
    setSaveMsg(`已导入 ${ok} 条${fail ? `，${fail} 条失败` : ''}`)
    if (ok > 0) {
      setTimeout(() => navigate('/wealth'), 800)
    }
  }

  const validCount = rows.filter(r => !r.drop && parseFloat(r.quantity) > 0 && parseFloat(r.price) > 0).length

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-28">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate('/wealth/add')} className="text-ink-2 mr-3 text-xl">‹</button>
        <h1 className="text-xl font-bold text-ink">批量导入持仓</h1>
      </div>

      {!parsed && (
        <div className="space-y-3">
          <p className="text-xs text-ink-3 leading-relaxed">
            粘贴持仓文本或上传截图，AI 将自动识别资产类型、数量、成本、市值等信息。若文本已含数量与成本价，将直接采用；若仅有市值与收益，则自动匹配行情反推。
          </p>

          {/* 双模式切换胶囊 */}
          <div className="flex bg-bg rounded-xl p-1 border border-brand-tint shadow-sm">
            <button
              onClick={() => setInputMode('paste')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'paste' ? 'bg-brand text-ink' : 'bg-[#f5f5f5] text-[#999]'
              }`}
            >
              📝 粘贴文本
            </button>
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMode === 'upload' ? 'bg-brand text-ink' : 'bg-[#f5f5f5] text-[#999]'
              }`}
            >
              📸 上传截图
            </button>
          </div>

          {/* 粘贴文本模式 */}
          {inputMode === 'paste' && (
            <>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="粘贴持仓文本，支持支付宝/天天基金/券商等任意格式，AI 自动识别"
                className="w-full h-64 bg-surface rounded-2xl p-3 border border-brand-tint text-ink text-sm leading-relaxed resize-none"
              />
              {uploading ? (
                <div className="w-full bg-brand/60 text-ink py-3 rounded-xl font-bold text-center flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {uploadMsg}
                </div>
              ) : (
                <button
                  onClick={onParse}
                  disabled={!text.trim()}
                  className="w-full bg-brand text-ink py-3 rounded-xl font-bold disabled:opacity-50"
                >
                  AI 智能识别
                </button>
              )}
            </>
          )}

          {/* 上传截图模式 */}
          {inputMode === 'upload' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleScreenshot(file)
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-48 bg-surface rounded-2xl border-2 border-dashed border-brand-tint flex flex-col items-center justify-center gap-3 text-ink-3 hover:border-brand hover:text-ink transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 size={32} className="animate-spin" />
                    <span className="text-sm">{uploadMsg}</span>
                  </>
                ) : (
                  <>
                    <Upload size={32} />
                    <span className="text-sm font-medium">点击上传持仓截图</span>
                    <span className="text-xs text-ink-3">支持相册选择或拍照</span>
                  </>
                )}
              </button>
              {uploadMsg && !uploading && (
                <div className="text-center text-sm text-red-400">{uploadMsg}</div>
              )}
            </div>
          )}
        </div>
      )}

      {parsed && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-2">共解析 {rows.length} 条，待导入 {validCount} 条</div>
            <button onClick={() => { setParsed(false); setRows([]); setText('') }} className="text-xs text-ink-3 underline">重新粘贴</button>
          </div>

          {rows.length === 0 && <div className="text-center text-ink-3 text-sm py-6">未解析到持仓，换个格式试试</div>}

          {rows.map(r => (
            <div key={r.id} className={`bg-surface rounded-2xl p-3 border ${r.drop ? 'opacity-40 border-dashed' : 'border-brand-tint'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate">{r.name}</div>
                  <div className="text-xs text-ink-3">
                    {r.symbol} · {r.market}
                    {r.raw.marketLabel && <span className="ml-1">（原识别：{r.raw.marketLabel}）</span>}
                  </div>
                </div>
                <button
                  onClick={() => updateRow(r.id, { drop: !r.drop })}
                  className={`shrink-0 p-1.5 rounded-lg ${r.drop ? 'bg-brand-tint text-ink' : 'text-red-500'}`}
                >
                  {r.drop ? <Check size={16} /> : <Trash2 size={16} />}
                </button>
              </div>

              {r.resolving && <div className="text-xs text-ink-3 mt-2 flex items-center gap-1"><Loader2 size={12} className="animate-spin" />匹配行情中…</div>}
              {!r.resolving && r.resolveError && <div className="text-xs text-amber-600 mt-1">{r.resolveError}</div>}

              {!r.resolving && !r.drop && r.raw.precise && (
                <div className="text-[11px] text-brand rounded-lg px-2 py-1.5 bg-brand-tint mt-1">
                  已直接读取文本中的数量 / 成本，未查行情
                </div>
              )}


              {!r.resolving && !r.drop && r.curPrice != null && parseFloat(r.price) > 0 && (
                <div className="mt-2">
                  {(() => {
                    const cost = parseFloat(r.price)
                    const gain = cost < r.curPrice
                    const rate = ((r.curPrice - cost) / cost) * 100
                    return (
                      <div className={`text-[11px] rounded-lg px-2 py-1.5 ${gain ? 'bg-red-500/10 text-red-600' : 'bg-green-500/10 text-green-600'}`}>
                        成本 {cost.toFixed(4)} · 净值 {r.curPrice.toFixed(4)} ·
                        {gain ? ` 盈利 ${rate.toFixed(2)}%` : ` 亏损 ${Math.abs(rate).toFixed(2)}%`}
                      </div>
                    )
                  })()}
                </div>
              )}

              {!r.resolving && !r.drop && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <div className="text-[10px] text-ink-3 mb-0.5">数量</div>
                    <input
                      type="number"
                      value={r.quantity}
                      onChange={e => updateRow(r.id, { quantity: e.target.value })}
                      className="w-full bg-bg rounded-lg p-2 border border-brand-tint text-ink text-sm"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-3 mb-0.5">成本价</div>
                    <input
                      type="number"
                      value={r.price}
                      onChange={e => updateRow(r.id, { price: e.target.value })}
                      className="w-full bg-bg rounded-lg p-2 border border-brand-tint text-ink text-sm"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-ink-3 mb-0.5">日期</div>
                    <input
                      type="date"
                      value={r.date}
                      onChange={e => updateRow(r.id, { date: e.target.value })}
                      className="w-full bg-bg rounded-lg p-2 border border-brand-tint text-ink text-sm"
                    />
                  </div>
                </div>
              )}
              {!r.resolving && !r.drop && (
                <div className="text-[10px] text-ink-3 mt-1.5">
                  持有金额 {fmtMoneyUtil(r.raw.marketValue)}
                  {r.raw.holdProfit != null && ` · 持有收益 ${r.raw.holdProfit >= 0 ? '+' : ''}${fmtMoneyUtil(r.raw.holdProfit)}`}
                </div>
              )}
            </div>
          ))}

          {saveMsg && <div className="text-center text-sm text-ink-2">{saveMsg}</div>}

          <button
            onClick={onSave}
            disabled={saving || validCount === 0}
            className="w-full bg-brand text-ink py-3 rounded-xl font-bold disabled:opacity-50"
          >
            {saving ? '导入中…' : `导入 ${validCount} 条持仓`}
          </button>
        </div>
      )}
    </div>
  )
}
