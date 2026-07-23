// 财富持仓流水存储 + 聚合层
// 当前持仓 = Σ买入 − Σ卖出；成本价/总成本由买入流水加权算出
import { db, newRecordBase } from './database'
import type { HoldingTransactionRecord } from './database'
import type { Market } from '../utils/quoteApi'
import { syncEngine } from './sync-engine'

export interface Holding {
  symbol: string
  market: Market
  name: string
  quantity: number        // 当前净持仓（可为 0，表示已清仓）
  cost_price: number      // 加权成本价
  total_cost: number      // 当前持仓总成本
  buyQuantity: number
  sellQuantity: number
  firstBuyDate?: string
  lastTxDate?: string
  /** 买入账户币种（来自 asset_currency），用于港股通 CNY 折算 */
  accountCurrency?: string
  /** 关联的投资账户 ID（来自第一条买入的 account_id） */
  accountId?: string | null
}

// 资产大类：股票 / 基金 / 黄金
export type AssetCategory = 'stock' | 'fund' | 'gold'

export function marketToCategory(market: Market): AssetCategory {
  if (market === 'GOLD') return 'gold'
  if (market === 'FUND') return 'fund'
  return 'stock'
}

export function categoryToMarkets(cat: AssetCategory): Market[] {
  if (cat === 'gold') return ['GOLD']
  if (cat === 'fund') return ['FUND']
  return ['CN', 'HK', 'US']
}

export function marketLabel(market: Market): string {
  switch (market) {
    case 'CN': return 'A股'
    case 'HK': return '港股'
    case 'US': return '美股'
    case 'FUND': return '基金'
    case 'GOLD': return '黄金'
  }
}

// 新增一条流水（买入/卖出），写入本地并触发后台同步到远程
export async function addHoldingTransaction(
  tx: Omit<HoldingTransactionRecord, 'id' | 'user_id' | 'created_at' | 'updated_at' | '_sync_status' | '_updated_at_local'>,
): Promise<string> {
  const userId = await getCurrentUserId()
  const base = newRecordBase(userId)
  const record: HoldingTransactionRecord = {
    ...tx,
    ...base,
  } as HoldingTransactionRecord
  await db.holdings_transactions.put(record)
  // 后台非阻塞同步（fire-and-forget）
  syncEngine.syncAfterWrite('holdings_transactions', userId).catch(e => console.error('[Wealth] 同步持仓流水失败', e))
  return record.id
}

// 获取全部流水（排除已标记待删除的，避免软删记录参与聚合显示）
export async function getAllTransactions(): Promise<HoldingTransactionRecord[]> {
  const userId = await getCurrentUserId()
  const all = await db.holdings_transactions.where('user_id').equals(userId).toArray()
  return all.filter(r => r._sync_status !== 'pending_delete')
}

// 单笔更新流水（买入/卖出均可编辑）
export async function updateHoldingTransaction(
  id: string,
  patch: Partial<Pick<HoldingTransactionRecord, 'symbol' | 'market' | 'name' | 'direction' | 'quantity' | 'price' | 'date' | 'note' | 'account_id' | 'asset_currency' | 'is_active'>>,
): Promise<void> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  await db.holdings_transactions.update(id, { ...patch, _sync_status: 'local_dirty', _updated_at_local: now })
  syncEngine.syncAfterWrite('holdings_transactions', userId).catch(e => console.error('[Wealth] 同步更新持仓流水失败', e))
}

// 单笔删除流水（软删，与 deleteHolding 一致推送远程）
export async function deleteHoldingTransaction(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  await db.holdings_transactions.update(id, {
    _sync_status: 'pending_delete',
    _updated_at_local: now,
  })
  syncEngine.syncAfterWrite('holdings_transactions', userId).catch(e => console.error('[Wealth] 同步删除持仓流水失败', e))
}

// 按 symbol+market 删除某资产全部流水（清仓/删除用）
// 采用软删：标记 pending_delete 并后台同步，由同步引擎把删除推到远程后本地清除
export async function deleteHolding(symbol: string, market: Market): Promise<void> {
  const userId = await getCurrentUserId()
  const rows = await db.holdings_transactions
    .where('user_id').equals(userId)
    .filter(r => r.symbol === symbol && r.market === market)
    .toArray()
  const now = new Date().toISOString()
  for (const r of rows) {
    await db.holdings_transactions.update(r.id, {
      _sync_status: 'pending_delete',
      _updated_at_local: now,
    })
  }
  if (rows.length) {
    syncEngine.syncAfterWrite('holdings_transactions', userId).catch(e => console.error('[Wealth] 同步删除持仓失败', e))
  }
}

// 获取指定标的的活跃持仓流水（is_active=true 且非 pending_delete）
export async function getActiveTransactions(symbol: string, market: Market): Promise<HoldingTransactionRecord[]> {
  const userId = await getCurrentUserId()
  const all = await db.holdings_transactions
    .where('user_id').equals(userId)
    .filter(r => r.symbol === symbol && r.market === market && r._sync_status !== 'pending_delete' && r.is_active !== false)
    .toArray()
  return all
}

// 清仓归档：将指定标的的全部活跃流水标记为 is_active=false
// 并插入一条清仓节点记录（quantity=0, price=0, note='已清仓'）
export async function archiveHolding(symbol: string, market: Market): Promise<void> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  const active = await db.holdings_transactions
    .where('user_id').equals(userId)
    .filter(r => r.symbol === symbol && r.market === market && r.is_active !== false)
    .toArray()

  // 批量标记 is_active=false（必须加 local_dirty 否则 sync-engine 不推送）
  for (const r of active) {
    await db.holdings_transactions.update(r.id, {
      is_active: false,
      _sync_status: 'local_dirty',
      _updated_at_local: now,
    })
  }

  // 插入清仓节点记录
  const node: HoldingTransactionRecord = {
    ...newRecordBase(userId),
    symbol,
    market: market as HoldingTransactionRecord['market'],
    name: active[0]?.name || symbol,
    direction: 'sell',
    quantity: 0,
    price: 0,
    date: new Date().toISOString().slice(0, 10),
    note: '已清仓',
    is_active: false,
  } as HoldingTransactionRecord
  await db.holdings_transactions.put(node)

  if (active.length > 0) {
    syncEngine.syncAfterWrite('holdings_transactions', userId).catch(e => console.error('[Wealth] 同步清仓归档失败', e))
  }
}

/** 清仓复盘记录（一个标的的历史终局总结） */
export interface LiquidatedHolding {
  symbol: string
  market: Market
  name: string
  currency: string        // 原币种（USD/HKD/CNY）
  firstBuyDate: string    // 首笔买入日期
  lastSellDate: string    // 末笔卖出/清仓日期
  holdingDays: number
  totalCost: number       // 买入总成本
  totalProceeds: number   // 卖出总金额
  profitLoss: number      // 盈亏金额
  profitRate: number      // 盈亏百分比
}

// 聚合：当前持仓（仅聚合 is_active=true 的记录，清仓归档的不参与）
export async function aggregateHoldings(): Promise<Holding[]> {
  const txs = await getAllTransactions()
  // 按日期排序后处理，确保加权成本计算正确（卖出用当前均价冲减，依赖顺序）
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
  // 仅聚合 is_active=true 的记录（清仓归档的不参与当前持仓计算）
  const active = sorted.filter(t => t.is_active !== false)
  const map = new Map<string, Holding>()
  for (const t of active) {
    const key = `${t.market}:${t.symbol}`
    let h = map.get(key)
    if (!h) {
      h = {
        symbol: t.symbol,
        market: t.market,
        name: t.name,
        quantity: 0,
        cost_price: 0,
        total_cost: 0,
        buyQuantity: 0,
        sellQuantity: 0,
      }
      map.set(key, h)
    }
    h.name = t.name || h.name
    // 记录资产币种（从 asset_currency 字段取，用于港股通 CNY 折算）
    if (t.asset_currency && !h.accountCurrency) {
      h.accountCurrency = t.asset_currency
    }
    // 记录关联投资账户 ID（从第一条买入记录取）
    if (t.account_id && !h.accountId) {
      h.accountId = t.account_id
    }
    if (t.direction === 'buy') {
      h.buyQuantity += t.quantity
      // 加权成本：总成本累加买入金额
      h.total_cost += t.quantity * t.price
    } else {
      h.sellQuantity += t.quantity
      // 卖出按当前加权成本冲减总成本
      h.total_cost -= t.quantity * (h.buyQuantity > 0 ? h.total_cost / h.buyQuantity : t.price)
      if (h.total_cost < 0) h.total_cost = 0
    }
    h.lastTxDate = t.date
    if (!h.firstBuyDate && t.direction === 'buy') h.firstBuyDate = t.date
  }
  // 计算净持仓与加权成本价
  const result: Holding[] = []
  for (const h of map.values()) {
    h.quantity = Math.max(0, h.buyQuantity - h.sellQuantity)
    h.cost_price = h.buyQuantity > 0 ? h.total_cost / h.buyQuantity : 0
    // 净持仓为 0 但仍有卖出记录的，不展示（已清仓）
    if (h.quantity <= 0) continue
    result.push(h)
  }
  return result
}

/** 获取清仓复盘列表：所有彻底清仓（净持仓归零且全体 is_active=false）的标的历史终局统计 */
export async function getLiquidatedHoldings(): Promise<LiquidatedHolding[]> {
  const txs = await getAllTransactions()
  // 按日期排序确保成本计算顺序正确
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))

  // 按 symbol+market 分组
  const groups = new Map<string, HoldingTransactionRecord[]>()
  for (const t of sorted) {
    const key = `${t.market}:${t.symbol}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const result: LiquidatedHolding[] = []

  for (const [_key, records] of groups) {
    // 判断是否彻底清仓：全部记录的 is_active 都是 false
    if (records.some(r => r.is_active !== false)) continue
    // 且净持仓归零（买 = 卖）
    const buys = records.filter(r => r.direction === 'buy')
    const sells = records.filter(r => r.direction === 'sell')
    const buyQty = buys.reduce((s, r) => s + r.quantity, 0)
    const sellQty = sells.reduce((s, r) => s + r.quantity, 0)
    if (buyQty <= 0 || Math.abs(buyQty - sellQty) > 0.001) continue

    const firstBuy = buys[0]  // 按日期排序后第一条买入
    // 最后一条 sell 是清仓日（跳过清仓节点 quantity=0 的记录）
    const lastSell = [...sells].reverse().find(r => r.quantity > 0) || sells[sells.length - 1]

    const totalCost = buys.reduce((s, r) => s + r.quantity * r.price, 0)
    const totalProceeds = sells.filter(r => r.quantity > 0).reduce((s, r) => s + r.quantity * r.price, 0)
    const profitLoss = totalProceeds - totalCost
    const profitRate = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0

    const firstDate = firstBuy.date
    const lastDate = lastSell.date
    let holdingDays = 0
    if (firstDate && lastDate) {
      const d1 = new Date(firstDate)
      const d2 = new Date(lastDate)
      holdingDays = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    }

    // 从第一条买入提取原币种
    const currency = firstBuy.asset_currency || 'CNY'

    result.push({
      symbol: firstBuy.symbol,
      market: firstBuy.market,
      name: firstBuy.name,
      currency,
      firstBuyDate: firstDate,
      lastSellDate: lastDate,
      holdingDays,
      totalCost,
      totalProceeds,
      profitLoss,
      profitRate,
    })
  }

  // 按清仓日期倒序排列
  result.sort((a, b) => b.lastSellDate.localeCompare(a.lastSellDate))
  return result
}

// 取 user_id（复用 auth store）
async function getCurrentUserId(): Promise<string> {
  try {
    const { useAuthStore } = await import('../stores/useAuthStore')
    const id = useAuthStore.getState().user?.id
    return id || 'local'
  } catch {
    return 'local'
  }
}
