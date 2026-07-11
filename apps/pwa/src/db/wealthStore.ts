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
  patch: Partial<Pick<HoldingTransactionRecord, 'symbol' | 'market' | 'name' | 'direction' | 'quantity' | 'price' | 'date' | 'note'>>,
): Promise<void> {
  const userId = await getCurrentUserId()
  const now = new Date().toISOString()
  await db.holdings_transactions.update(id, { ...patch, _updated_at_local: now })
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

// 聚合：当前持仓
export async function aggregateHoldings(): Promise<Holding[]> {
  const txs = await getAllTransactions()
  const map = new Map<string, Holding>()
  for (const t of txs) {
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
