import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { LineChart } from '../components/charts'
import { Modal } from '../components/ui/Modal'
import Toast from '../components/ui/Toast'
import Button from '../components/ui/Button'
import { fetchQuoteHistory, HistoryPeriod, Market } from '../utils/quoteApi'
import {
  deleteHolding,
  marketLabel,
  getAllTransactions,
  updateHoldingTransaction,
  deleteHoldingTransaction,
  addHoldingTransaction,
} from '../db/wealthStore'
import { useWealthValuation, todayProfit } from '../hooks/useWealthValuation'
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
  // 加减仓 BottomSheet
  const [showTradeSheet, setShowTradeSheet] = useState(false)
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell'>('buy')
  const [tradeQty, setTradeQty] = useState('')
  const [tradePrice, setTradePrice] = useState('')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10))
  const [confirmClear, setConfirmClear] = useState(false) // 清仓二次确认
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const toastTimer = useRef<number | null>(null)
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = window.setTimeout(() => setToast(null), 2000)
  }, [])


  // 直接复用 useWealthValuation 的 batch 结果，无需额外调 detail 接口
  const v = useMemo(
    () => results.find(r => r.market === market && r.symbol === symbol),
    [results, market, symbol],
  )
  const holding = v?.holding

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

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadTxs() }, [loadTxs])

  const name = v?.name || symbol
  const cur = (v?.currency ?? 'CNY') as Currency
  const mv = v?.market_value ?? null
  const pl = v?.profit_loss ?? null
  const pr = v?.profit_rate ?? null
  const curPrice = v?.current_price ?? null
  const changePct = v?.change_percent ?? null
  // 今日收益：按资产自身币种计算（详情页不折算）
  const td = v ? todayProfit(v) : null

  // 涨跌颜色状态机：累计收益(pl/pr) 与 今日涨跌
  const plColor = colorOf(trendOf(pl))
  const plSign = signOf(pl)
  const tdColor = colorOf(trendOf(td))
  const tdSign = signOf(td)
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

  // 打开加减仓面板
  const openTradeSheet = (direction: 'buy' | 'sell') => {
    setTradeDirection(direction)
    setTradeQty('')
    setTradePrice(curPrice != null ? String(curPrice) : '')
    setTradeDate(new Date().toISOString().slice(0, 10))
    setConfirmClear(false)
    setShowTradeSheet(true)
  }

  // 减仓份额校验
  const totalQty = holding?.quantity ?? 0
  const tradeQtyNum = parseFloat(tradeQty) || 0
  const tradePriceNum = parseFloat(tradePrice) || 0
  const isSellOver = tradeDirection === 'sell' && tradeQtyNum > totalQty
  const isNearClear = tradeDirection === 'sell' && totalQty - tradeQtyNum < 0.01 && tradeQtyNum > 0 && tradeQtyNum <= totalQty
  const canSubmit = tradeQtyNum > 0 && tradePriceNum > 0 && tradeDate && !isSellOver

  // 提交交易
  const submitTrade = async () => {
    if (!canSubmit) return
    if (!symbol || !market) return
    // 接近清仓时二次确认
    if (isNearClear && !confirmClear) {
      setConfirmClear(true)
      return
    }
    try {
      await addHoldingTransaction({
        symbol,
        market: market as any,
        name: name || symbol,
        direction: tradeDirection,
        quantity: tradeQtyNum,
        price: tradePriceNum,
        date: tradeDate,
      })
      showToast(`${tradeDirection === 'buy' ? '加仓' : '减仓'}成功`, 'success')
      setShowTradeSheet(false)
      await loadTxs()
    } catch (e: any) {
      showToast(e?.message || '操作失败', 'error')
    }
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

      {/* 方案二：左重右精 · 主次分明 · 响应式字号 */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mb-3">
        <div className="flex items-center justify-between">
          {/* 左侧：超大总市值 + 累计收益 */}
          <div className="min-w-0 flex-1">
            <div className="text-ink-2 mb-1" style={{ fontSize: 'clamp(10px, 2vw, 13px)' }}>当前市值</div>
            <div
              className="font-extrabold font-amount leading-tight text-ink whitespace-nowrap overflow-hidden text-ellipsis"
              style={{ fontSize: 'clamp(22px, 6vw, 38px)' }}
            >
              {mv == null ? '—' : fmtWithSymbol(mv, cur)}
            </div>
            <div className="mt-2">
              <div className="text-ink-2 mb-0.5" style={{ fontSize: 'clamp(10px, 2vw, 13px)' }}>累计收益</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span
                  className="font-bold font-amount whitespace-nowrap"
                  style={{ color: plColor, fontSize: 'clamp(13px, 3.5vw, 20px)' }}
                >
                  {pl == null ? '—' : pl >= 0 ? `+${fmtWithSymbol(pl, cur)}` : fmtWithSymbol(pl, cur)}
                </span>
                <span
                  className="font-semibold whitespace-nowrap"
                  style={{ color: plColor, fontSize: 'clamp(10px, 2.2vw, 14px)' }}
                >
                  {pr == null ? '' : `(${pl >= 0 ? '+' : ''}${(pr * 100).toFixed(2)}%)`}
                </span>
              </div>
            </div>
          </div>

          {/* 右侧：今日收益中心 */}
          <div className="text-center ml-3 flex-shrink-0">
            <div className="text-ink-2 mb-1" style={{ fontSize: 'clamp(10px, 2vw, 13px)' }}>今日收益</div>
            <div
              className="font-bold font-amount leading-tight whitespace-nowrap"
              style={{ color: tdColor, fontSize: 'clamp(12px, 4vw, 24px)' }}
            >
              {td == null ? '—' : td >= 0 ? `+${fmtWithSymbol(td, cur)}` : fmtWithSymbol(td, cur)}
            </div>
            <div
              className="mt-2 text-ink-2/70 leading-relaxed whitespace-nowrap"
              style={{ fontSize: 'clamp(10px, 1.8vw, 12px)' }}
            >
              {changePct != null && (
                <span style={{ color: changeColor }}>{changeArrow} {(Math.abs(changePct) * 100).toFixed(2)}%</span>
              )}
              {curPrice != null && <span className="hidden sm:inline"> ｜ 现价 {fmtWithSymbol(curPrice, cur)}</span>}
              {market === 'FUND' && <span className="text-ink-3"> (估算)</span>}
            </div>
          </div>
        </div>
        <div
          className="text-ink-3/40 text-right mt-3"
          style={{ fontSize: 'clamp(9px, 1.5vw, 11px)' }}
        >
          更新于 {v?.quote_time ? new Date(v.quote_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') : '—'}
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

      {/* 交易流水 + 加减仓入口 */}
      <div className="bg-surface rounded-3xl p-4 border border-brand-tint mt-3">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-ink">交易流水</div>
          <div className="flex gap-2">
            <button
              onClick={() => openTradeSheet('buy')}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#dc2626]/10 text-[#dc2626] active:scale-95 transition-transform"
            >➕ 加仓</button>
            <button
              onClick={() => openTradeSheet('sell')}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#16a34a]/10 text-[#16a34a] active:scale-95 transition-transform"
            >➖ 减仓</button>
          </div>
        </div>
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
                        <div className="flex-1">
                          <input
                            className="w-full bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none border border-brand-tint"
                            placeholder={`份额（当前持仓 ${fmt(holding?.quantity ?? 0, 4)} 份）`}
                            inputMode="decimal" value={editDraft.quantity}
                            onChange={e => setEditDraft(s => ({ ...s, quantity: e.target.value }))}
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            className="w-full bg-surface rounded-lg px-2 py-1.5 text-sm text-ink outline-none border border-brand-tint"
                            placeholder={`价格（现价 ${curPrice != null ? fmtWithSymbol(curPrice, cur) : '—'}）`}
                            inputMode="decimal" value={editDraft.price}
                            onChange={e => setEditDraft(s => ({ ...s, price: e.target.value }))}
                          />
                        </div>
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

      {/* 加减仓 BottomSheet */}
      {showTradeSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowTradeSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-3xl px-5 pt-5 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] animate-slide-up">
            <div className="w-10 h-1 rounded-full bg-ink-3/20 mx-auto mb-4" />
            <div className="text-base font-bold text-ink mb-4">
              {tradeDirection === 'buy' ? '➕ 加仓' : '➖ 减仓'}
            </div>

            {/* 份额 */}
            <div className="mb-3">
              <div className="text-xs text-ink-2 mb-1.5">
                {tradeDirection === 'buy' ? '买入份额' : '卖出份额'}
                <span className="text-ink-3 ml-1">（当前持仓 {fmt(totalQty, 4)} 份）</span>
              </div>
              <input
                className={`w-full bg-bg rounded-xl px-3 py-2.5 text-sm text-ink outline-none border transition-colors ${isSellOver ? 'border-red-400 bg-red-50' : 'border-brand-tint'}`}
                placeholder={tradeDirection === 'sell' ? `最大可卖 ${fmt(totalQty, 4)} 份` : '请输入买入份额'}
                inputMode="decimal"
                value={tradeQty}
                onChange={e => { setTradeQty(e.target.value); setConfirmClear(false) }}
              />
              {isSellOver && (
                <div className="text-[11px] text-red-400 mt-1">
                  持仓不足，最大可卖 {fmt(totalQty, 4)} 份
                </div>
              )}
              {isNearClear && !isSellOver && (
                <div className="text-[11px] text-amber-500 mt-1">
                  接近清仓，提交时需二次确认
                </div>
              )}
            </div>

            {/* 价格 */}
            <div className="mb-3">
              <div className="text-xs text-ink-2 mb-1.5">
                交易价格
                {curPrice != null && <span className="text-ink-3 ml-1">（现价 {fmtWithSymbol(curPrice, cur)}）</span>}
              </div>
              <input
                className={`w-full bg-bg rounded-xl px-3 py-2.5 text-sm text-ink outline-none border transition-colors ${tradePriceNum > 0 && curPrice != null && Math.abs(tradePriceNum - curPrice) > 0.01 ? 'border-amber-300 bg-amber-50' : 'border-brand-tint'}`}
                placeholder="请输入交易价格"
                inputMode="decimal"
                value={tradePrice}
                onChange={e => setTradePrice(e.target.value)}
              />
              {tradePriceNum > 0 && curPrice != null && Math.abs(tradePriceNum - curPrice) > 0.01 && (
                <div className="text-[11px] text-amber-500 mt-1">
                  注意：当前市场价不同
                </div>
              )}
            </div>

            {/* 日期 */}
            <div className="mb-5">
              <div className="text-xs text-ink-2 mb-1.5">交易日期</div>
              <input
                className="w-full bg-bg rounded-xl px-3 py-2.5 text-sm text-ink outline-none border border-brand-tint"
                type="date"
                value={tradeDate}
                onChange={e => setTradeDate(e.target.value)}
              />
            </div>

            {/* 确认按钮 */}
            <button
              onClick={submitTrade}
              disabled={!canSubmit}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${canSubmit ? 'bg-brand text-ink' : 'bg-ink-3/10 text-ink-3 cursor-not-allowed'}`}
            >
              {confirmClear ? '确认清仓？' : tradeDirection === 'buy' ? '确认加仓' : '确认减仓'}
            </button>

            {/* 清仓二次确认提示 */}
            {confirmClear && (
              <div className="text-center text-[11px] text-amber-500 mt-2">
                当前卖出份额将清空该持仓，再次点击确认
              </div>
            )}
          </div>
        </>
      )}

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
