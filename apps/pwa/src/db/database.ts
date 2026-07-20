import Dexie, { Table } from 'dexie'

// ============================================================
// IndexedDB Schema — 镜像 Supabase 远程表结构
// ============================================================

export type SyncStatus = 'synced' | 'local_dirty' | 'pending_delete'

// 同步元数据 (last_sync 时间戳等)
export interface SyncMeta {
  key: string
  value: string
}

// 账户
export interface AccountRecord {
  id: string
  user_id: string
  name: string
  type: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt'
  balance: number
  currency: string
  icon: string
  color: string
  sort_order: number
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 分类
export interface CategoryRecord {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  sort_order: number
  is_system: boolean
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 交易
export interface TransactionRecord {
  id: string
  user_id: string
  type: 'expense' | 'income'
  amount: number
  category_id: string | null
  subcategory_id: string | null
  subcategory_name?: string | null
  subcategory_color?: string | null
  account_id: string
  to_account_id: string | null
  transaction_date: string  // YYYY-MM-DD
  transaction_time: string  // HH:mm:ss
  tags: string[] | null
  note: string | null
  images: string[] | null
  location: any | null
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 预算
export interface BudgetRecord {
  id: string
  user_id: string
  month: string   // YYYY-MM-DD (月份第一天)
  category_id: string | null
  amount: number
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 子分类（二级分类，绑在一级分类下，最末级）
export interface SubCategoryRecord {
  id: string
  user_id: string
  name: string
  color: string
  category_id: string
  sort_order: number
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 标签（全局自由标签，跨分类，可多选）
export interface TagRecord {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 财富持仓流水（买入/卖出记录，当前持仓由聚合得出）
export interface HoldingTransactionRecord {
  id: string // UUID，对齐远程表与同步引擎的 on_conflict=id
  user_id: string
  symbol: string
  market: 'CN' | 'HK' | 'US' | 'FUND' | 'GOLD'
  name: string
  direction: 'buy' | 'sell'
  quantity: number
  price: number
  date: string // YYYY-MM-DD
  note?: string | null
  account_id?: string | null
  asset_currency?: string | null
  is_active?: boolean
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 用户设置
export interface ProfileRecord {
  id: string
  display_name: string | null
  avatar_url: string | null
  currency: string
  locale: string
  big_expense_threshold: number
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// 账户间转账（独立表，不计入消费，支持多币种）
export interface TransferRecord {
  id: string
  user_id: string
  from_account_id: string
  from_currency: string
  from_amount: number
  to_account_id: string
  to_currency: string
  to_amount: number
  exchange_rate: number
  fee: number
  transaction_date: string
  transaction_time: string
  note?: string | null
  created_at: string
  updated_at: string
  _sync_status: SyncStatus
  _updated_at_local: string
}

// Dexie 数据库定义
class BillsDatabase extends Dexie {
  accounts!: Table<AccountRecord, string>
  categories!: Table<CategoryRecord, string>
  transactions!: Table<TransactionRecord, string>
  transfers!: Table<TransferRecord, string>
  budgets!: Table<BudgetRecord, string>
  subCategories!: Table<SubCategoryRecord, string>
  tags!: Table<TagRecord, string>
  profiles!: Table<ProfileRecord, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('MyBillsDB')
    this.version(1).stores({
      accounts: 'id, user_id, _sync_status, type, is_active',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id',
      budgets: 'id, user_id, _sync_status, month, category_id',
      tags: 'id, user_id, _sync_status, category_id',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    })
    // v2: 新增 accounts.is_default 字段
    this.version(2).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id',
      budgets: 'id, user_id, _sync_status, month, category_id',
      tags: 'id, user_id, _sync_status, category_id',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    }).upgrade(tx => {
      return tx.table('accounts').toCollection().modify(account => {
        account.is_default = account.is_default ?? false
      })
    })
    // v3: 拆分 tags 为 sub_categories（绑分类）+ 全局 tags
    this.version(3).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    }).upgrade(tx => {
      // 旧 tags 行（含 category_id）全部迁移为 sub_categories；全局 tags 表留空
      return tx.table('tags').toCollection().toArray().then((oldTags: any[]) => {
        const subs = oldTags
          .filter(t => t._sync_status !== 'pending_delete' && t.category_id)
          .map(t => ({
            id: t.id,
            user_id: t.user_id,
            name: t.name,
            color: t.color,
            category_id: t.category_id,
            created_at: t.created_at,
            updated_at: t.updated_at,
            _sync_status: t._sync_status,
            _updated_at_local: t._updated_at_local,
          }))
        // 迁移后的旧 tags 行从 tags 表删除，避免脏数据残留在全局标签表
        const migratedIds = subs.map(s => s.id)
        return tx.table('subCategories').bulkPut(subs).then(() => {
          if (migratedIds.length > 0) {
            return tx.table('tags').bulkDelete(migratedIds)
          }
        })
      })
    })
    // v4: transactions 表补齐 tags 索引，与 TS 类型及远程表保持一致
    this.version(4).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    })
    // v5: subCategories 增加 sort_order 字段，支持子分类排序持久化
    this.version(5).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id, sort_order',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    }).upgrade(tx => {
      // 旧 subCategories 行补全 sort_order（按现有顺序从 0 递增）
      return tx.table('subCategories').toCollection().toArray().then((subs: any[]) => {
        const byCategory = new Map<string, any[]>()
        subs
          .filter(s => s._sync_status !== 'pending_delete')
          .forEach(s => {
            const arr = byCategory.get(s.category_id) || []
            arr.push(s)
            byCategory.set(s.category_id, arr)
          })
        const updates: Promise<any>[] = []
        byCategory.forEach(arr => {
          arr.forEach((s, i) => {
            if (typeof s.sort_order !== 'number') {
              s.sort_order = i
              updates.push(tx.table('subCategories').put(s))
            }
          })
        })
        return Promise.all(updates)
      })
    })
    // v6: 沿用 v5 表结构（持仓交易流水表已移除）
    this.version(6).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id, sort_order',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    })
    // v7: 首次引入财富持仓流水表 holdings_transactions
    this.version(7).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id, sort_order',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
      holdings_transactions: '++id, user_id, symbol, market, direction, date',
    })

    // v8: 移除 holdings_transactions（Dexie 会自动删旧 ++id 表，旧数据清空——财富可重建）
    this.version(8).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id, sort_order',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    })

    // v9: 以 UUID 'id' 主键重建 holdings_transactions（对齐远程表与同步引擎 on_conflict=id）
    this.version(9).stores({
      accounts: 'id, user_id, _sync_status, type, is_active, is_default',
      categories: 'id, user_id, _sync_status, type',
      transactions: 'id, user_id, _sync_status, transaction_date, account_id, type, category_id, subcategory_id, tags',
      budgets: 'id, user_id, _sync_status, month, category_id',
      subCategories: 'id, user_id, _sync_status, category_id, sort_order',
      tags: 'id, user_id, _sync_status',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
      holdings_transactions: 'id, user_id, _sync_status, symbol, market, direction, date, account_id, is_active',
    })

    // v10: 新增 transfers 独立表（账户间转账，不计入消费，支持多币种）
    this.version(10).stores({
      transfers: 'id, user_id, _sync_status, transaction_date, from_account_id, to_account_id',
    })
  }

  // 财富持仓流水记录（主键为 UUID 字符串，对齐远程表与同步引擎）
  holdings_transactions!: Table<HoldingTransactionRecord, string>
}

export const db = new BillsDatabase()

// 自修复：若因历史 schema 冲突（如持仓表主键变更）导致升级失败，
// 直接清空本地库并以最新 schema 重建（数据可由远程同步引擎拉回）。
db.open().catch(async (err: any) => {
  const msg = String(err?.message || '')
  if (/primary key|changing primary|UpgradeError|DatabaseClosed/i.test(msg)) {
    console.warn('[DB] 检测到 schema 升级冲突，重置本地库以恢复：', msg)
    try {
      await Dexie.delete('MyBillsDB')
      location.reload()
    } catch (e) {
      console.error('[DB] 重置失败', e)
    }
  } else {
    console.error('[DB] 打开失败', err)
  }
})


// 辅助函数：生成新记录的基础字段
export function newRecordBase(userId: string) {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    created_at: now,
    updated_at: now,
    _sync_status: 'local_dirty' as SyncStatus,
    _updated_at_local: now,
  }
}

// 辅助函数：更新记录时刷新同步状态
export function markDirty(record: { _sync_status: SyncStatus; _updated_at_local: string }) {
  record._sync_status = 'local_dirty'
  record._updated_at_local = new Date().toISOString()
  return record
}

// 辅助函数：标记删除
export function markDeleted(record: { _sync_status: SyncStatus; _updated_at_local: string }) {
  record._sync_status = 'pending_delete'
  record._updated_at_local = new Date().toISOString()
  return record
}

