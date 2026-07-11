import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart } from '../components/charts'
import { Modal } from '../components/ui/Modal'
import Toast from '../components/ui/Toast'
import Button from '../components/ui/Button'
import { fetchQuoteDetail, fetchQuoteHistory, HistoryPeriod, Market } from '../utils/quoteApi'
import {
  deleteHolding,
  marketLabel,
  getAllTransactions,
  updateHoldingTransaction,
  deleteHoldingTransaction,
} from '../db/wealthStore'
import { useWealthValuation } from '../hooks/useWealthValuation'
import { fmtWithSymbol, Currency } from '../utils/currency'

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: d })
}

// 涨跌配色状态机：盈利为红、亏损为绿、持平/无效为灰（与全站一致）
type Trend = 'up' | 'down' | 'flat'
const COLOR_UP = '#dc2626'
const COLOR_DOWN = '#16a34a'
const COLOR_FLAT = '#6b7280'

function trendOf(n: number | null | undefined): Trend {
  if (n == null || isNaN(n) || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

function colorOf(trend: Trend): string {
  switch (trend) {
    case 'up': return COLOR_UP
    case 'down': return COLOR_DOWN
    default: return COLOR_FLAT
  }
}

// 正负号：盈利 '+'，亏损 ''（负数自带 -），持平 ''
function signOf(n: number | null | undefined): string {
  return trendOf(n) === 'up' ? '+' : ''
}

const PERIODS: HistoryPeriod[] = ['1m', '3m', '1y']

export function WealthDetail() {
  const { market, symbol } = useParams<{ market: string; symbol: string }>()
  const navigate = useNavigate()
  const { results } = useWealthValuation()
  const [detail, setDetail] = useState<any>(null)
  const [history, setHistory] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] })
  const [period, setPeriod] = useState<HistoryPeriod>('1m')
  const [loadingHist, setLoadingHist] = useState(false)
  const [txs, setTxs] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ direction: 'buy' | 'sell'; quantity: string; price: string; date: string }>({
    direction: 'buy',
    quantity: '',
    price: '',
    date: '',
  })
  const [showHolding, setShowHolding] = useState(true)
  // 自定义确认弹窗 + Toast 反馈（替代原生 confirm/无提示）
  const [confirmTx, setConfirmTx] = useState<any | null>(null)
  const [confirmHolding, setConfirmHolding] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<number | null>(null)
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])


  const v = results.find(r => r.market === market && r.symbol === symbol)
  const holding = v?.holding

  const loadDetail = useCallback(async () => {
    if (!symbol) return
    try {
      const d = await fetchQuoteDetail(symbol, market as any)
      setDetail(d)
    } catch { /* 兜底：detail.name 可能空，用 v.name */ }
  }, [symbol, market])

  const loadHistory = useCallback(async () => {
    if (!symbol) return
    setLoadingHist(true)
    try {
      const pts = await fetchQuoteHistory(symbol, market as any, period)
      // 横轴只显示「月-日」（去掉年份），让图表更简洁
      setHistory({
        labels: pts.map(p => p.date.slice(5)),
        data: pts.map(p => p.price),
      })
    } catch {
      setHistory({ labels: [], data: [] })
    } finally {
      setLoadingHist(false)
    }
  }, [symbol, market, period])

  const loadTxs = useCallback(async () => {
    if (!symbol || !market) return
    const all = await getAllTransactions()
    const list = all
      .filter(t => t.symbol === symbol && t.market === market)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    setTxs(list)
  }, [symbol, market])

  useEffect(() => { loadDetail() }, [loadDetail])
  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadTxs() }, [loadTxs])

  const name = v?.name || detail?.name || symbol
  const cur = (v?.currency ?? 'CNY') as Currency
  const mv = v?.market_value ?? null
  const pl = v?.profit_loss ?? null
  const pr = v?.profit_rate ?? null
  const curPrice = detail?.current_price ?? v?.current_price ?? null
  const changePct = detail?.change_percent ?? v?.change_percent ?? null

  // 涨跌颜色状态机：核心收益(pl/pr) 与 当日涨跌(changePct)
  const plColor = colorOf(trendOf(pl))
  const prColor = colorOf(trendOf(pr))
  const plSign = signOf(pl)
  const prSign = signOf(pr)
  const changeColor = colorOf(trendOf(changePct))
  const changeArrow = trendOf(changePct) === 'up' ? '▲' : trendOf(changePct) === 'down' ? '▼' : ''


  const onDelete = () => {
    setConfirmHolding(true)
  }

  const confirmDeleteHolding = async () => {
    setConfirmHolding(false)
    await deleteHolding(symbol!, market as any)
    navigate('/wealth')
  }

  const startEdit = (t: any) => {
    setEditingId(t.id)
    setEditDraft({
      direction: t.direction,
      quantity: String(t.quantity),
      price: String(t.price),
      date: t.date,
    })
  }

  const saveEdit = async (id: string) => {
    const q = Number(editDraft.quantity)
    const p = Number(editDraft.price)
    if (!editDraft.date || !(q > 0) || !(p > 0)) {
      alert('请填写有效的数量、价格与日期')
      return
    }
    await updateHoldingTransaction(id, {
      direction: editDraft.direction,
      quantity: q,
      price: p,
      date: editDraft.date,
    })
    setEditingId(null)
    await loadTxs()
  }

  const removeTx = (t: any) => {
    setConfirmTx(t)
  }

  const confirmDeleteTx = async () => {
    if (!confirmTx) return
    const t = confirmTx
    setConfirmTx(null)
    await deleteHoldingTransaction(t.id)
    await loadTxs()
    showToast(`已删除该${t.direction === 'buy' ? '买入' : '卖出'}流水`, 'success')
  }

  return (
    <div className="min-h-screen bg-bg px-4 pt-6 pb-24">
      <div className="flex items-center mb-4">
        <button onClick={() => navigate(-1)} className="text-ink-2 mr-3 text-xl">‹</button>
        <div>
          <h1 className="text-xl font-bold text-ink">{name}</h1>
          <div className="text-xs text-ink-3">{symbol} · {marketLabel(market as any)}</div>
        </div>
      </div>

      {/* 实时行情：左大右小 —— 左核心(市值+累计收益)，右辅助(现价+当日涨跌) */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-3">
        <div className="flex items-end justify-between gap-4">
          {/* 左侧核心视觉：市值 + 累计收益 */}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-2 mb-1">当前市值</div>
            <div className="text-3xl font-bold amount-fluid-lg text-ink leading-tight">
              {mv == null ? '—' : fmtWithSymbol(mv, cur)}
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span
                className="text-lg font-bold"
                style={{ color: plColor }}
              >
                {pl == null ? '—' : `${plSign}${fmtWithSymbol(pl, cur)}`}
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: prColor }}
              >
                {pr == null ? '' : `${prSign}${(pr * 100).toFixed(2)}%`}
              </span>
            </div>
          </div>

          {/* 右侧辅助：单股现价 + 当日涨跌幅 */}
          <div className="text-right shrink-0">
            <div className="text-xs text-ink-2 mb-1">现价</div>
            <div className="text-base font-semibold text-ink">{curPrice == null ? '—' : fmtWithSymbol(curPrice, cur)}</div>
            {changePct != null && (
              <div className="text-xs mt-1.5" style={{ color: changeColor }}>
                {changeArrow} {Math.abs(changePct).toFixed(2)}%
                {market === 'FUND' && <span className="text-ink-3 ml-1">(估算)</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 持仓信息（成本等明细，可收起） */}
      {holding && (
        <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-3 text-sm">
          <button
            onClick={() => setShowHolding(v => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="font-semibold text-ink">持仓信息</div>
            <span className="text-ink-3 text-xs">{showHolding ? '收起 ▴' : '展开 ▾'}</span>
          </button>
          {showHolding && (
            <div className="mt-2">
              <Row k="持仓数量" v={`${fmt(holding.quantity, 4)} ${market === 'GOLD' ? '克' : '份'}`} />
              <Row k="加权成本价" v={fmtWithSymbol(holding.cost_price, cur)} />
              <Row k="总成本" v={fmtWithSymbol(holding.total_cost, cur)} />
            </div>
          )}
        </div>
      )}

      {/* 走势图 */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-ink">走势图</div>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-2 py-1 rounded-lg ${period === p ? 'bg-brand text-ink' : 'bg-bg text-ink-2'}`}
              >{p}</button>
            ))}
          </div>
        </div>
        {loadingHist ? (
          <div className="text-center text-ink-3 text-sm py-10">加载中…</div>
        ) : history.data.length > 0 ? (
          <LineChart
            labels={history.labels}
            datasets={[{ label: name || symbol || '', data: history.data, color: '#c96442', fill: true }]}
            height={220}
          />
        ) : (
          <div className="text-center text-ink-3 text-sm py-10">暂无数据</div>
        )}
      </div>

      {/* 交易流水（内联可编辑/删除，买入卖出均开放） */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mt-3">
        <div className="font-semibold text-ink mb-2">交易流水</div>
        {txs.length === 0 ? (
          <div className="text-center text-ink-3 text-sm py-6">暂无流水记录</div>
        ) : (
          <div className="space-y-2">
            {txs.map(t => {
              const isEdit = editingId === t.id
              return (
                <div key={t.id} className="rounded-2xl bg-bg p-3">
                  {isEdit ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        {(['buy', 'sell'] as const).map(d => (
                          <button
                            key={d}
                            onClick={() => setEditDraft(s => ({ ...s, direction: d }))}
                            className={`flex-1 text-xs py-1.5 rounded-lg ${editDraft.direction === d ? 'bg-brand text-ink font-medium' : 'bg-surface text-ink-2'}`}
                          >{d === 'buy' ? '买入' : '卖出'}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none border border-brand-tint"
                          placeholder="数量" inputMode="decimal" value={editDraft.quantity}
                          onChange={e => setEditDraft(s => ({ ...s, quantity: e.target.value }))}
                        />
                        <input
                          className="flex-1 bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none border border-brand-tint"
                          placeholder="价格" inputMode="decimal" value={editDraft.price}
                          onChange={e => setEditDraft(s => ({ ...s, price: e.target.value }))}
                        />
                      </div>
                      <input
                        className="w-full bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none border border-brand-tint"
                        type="date" value={editDraft.date}
                        onChange={e => setEditDraft(s => ({ ...s, date: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(t.id)} className="flex-1 text-xs py-1.5 rounded-lg bg-brand text-ink font-medium">保存</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 text-xs py-1.5 rounded-lg bg-surface text-ink-2">取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className={t.direction === 'buy' ? 'text-red-500' : 'text-green-500'}>
                          {t.direction === 'buy' ? '买入' : '卖出'}
                        </span>
                        <span className="text-ink ml-2">{t.date}</span>
                        <div className="text-xs text-ink-3 mt-0.5">
                          {fmt(t.quantity, 4)} {market === 'GOLD' ? '克' : '份'} · {fmtWithSymbol(t.price, cur)}
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <button onClick={() => startEdit(t)} className="text-ink-2">编辑</button>
                        <button onClick={() => removeTx(t)} className="text-red-400">删除</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button onClick={onDelete} className="mt-4 w-full text-center text-xs text-red-400 py-2">
        删除该持仓
      </button>

      {/* 删除交易流水确认 */}
      <Modal isOpen={confirmTx != null} onClose={() => setConfirmTx(null)} title="删除确认">
        <p className="text-sm text-ink-2">
          确认删除这笔{confirmTx?.direction === 'buy' ? '买入' : '卖出'}流水（{confirmTx?.date}）吗？此操作不可撤销。
        </p>
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" fullWidth onClick={() => setConfirmTx(null)}>
            取消
          </Button>
          <Button variant="danger" fullWidth onClick={confirmDeleteTx}>
            删除
          </Button>
        </div>
      </Modal>

      {/* 删除持仓确认 */}
      <Modal isOpen={confirmHolding} onClose={() => setConfirmHolding(false)} title="删除确认">
        <p className="text-sm text-ink-2">
          确认删除 {name} 的全部持仓流水吗？此操作不可撤销。
        </p>
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" fullWidth onClick={() => setConfirmHolding(false)}>
            取消
          </Button>
          <Button variant="danger" fullWidth onClick={confirmDeleteHolding}>
            删除
          </Button>
        </div>
      </Modal>

      {/* 操作反馈 Toast */}
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          visible={true}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-brand-tint/50 last:border-0">
      <span className="text-ink-2">{k}</span>
      <span className="font-medium" style={{ color }}>{v}</span>
    </div>
  )
}
