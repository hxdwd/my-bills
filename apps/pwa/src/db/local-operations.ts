/**
 * 本地数据库 CRUD 操作模块
 *
 * 所有操作仅操作 IndexedDB，不直接查询 Supabase。
 * 写入操作后标记 _sync_status = 'local_dirty'，由同步引擎异步推送。
 * 删除操作标记 _sync_status = 'pending_delete'，由同步引擎异步删除。
 */

import { db, newRecordBase, markDirty, markDeleted, SyncStatus } from './database'
import type {
  AccountRecord,
  CategoryRecord,
  TransactionRecord,
  TransferRecord,
  BudgetRecord,
  SubCategoryRecord,
  TagRecord,
  ProfileRecord,
} from './database'

// ============================================================
// 通用查询：排除已标记删除的记录
// ============================================================

function filterActive<T extends { _sync_status: SyncStatus }>(records: T[]): T[] {
  return records.filter(r => r._sync_status !== 'pending_delete')
}

// ============================================================
// Accounts
// ============================================================

export const localAccounts = {
  /** 获取所有有效账户，按 sort_order 排序 */
  async getAll(userId: string): Promise<AccountRecord[]> {
    const records = await db.accounts
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .sortBy('sort_order')
    return records
  },

  /** 获取单个账户 */
  async getById(id: string): Promise<AccountRecord | undefined> {
    const record = await db.accounts.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增账户 */
  async insert(userId: string, data: Omit<AccountRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<AccountRecord> {
    const record: AccountRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.accounts.put(record)
    return record
  },

  /** 更新账户 */
  async update(id: string, data: Partial<AccountRecord>): Promise<void> {
    const existing = await db.accounts.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.accounts.put(updated)
  },

  /** 删除账户（软删除） */
  async remove(id: string): Promise<void> {
    const existing = await db.accounts.get(id)
    if (!existing) return
    // 使用软删除标记
    const deleted = markDeleted({ ...existing, is_active: false })
    await db.accounts.put(deleted)
  },
}

// ============================================================
// Categories
// ============================================================

export const localCategories = {
  /** 获取所有有效分类，按 sort_order 排序 */
  async getAll(userId: string): Promise<CategoryRecord[]> {
    const records = await db.categories
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .sortBy('sort_order')
    return records
  },

  /** 获取单个分类 */
  async getById(id: string): Promise<CategoryRecord | undefined> {
    const record = await db.categories.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增分类 */
  async insert(userId: string, data: Omit<CategoryRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<CategoryRecord> {
    const record: CategoryRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.categories.put(record)
    return record
  },

  /** 更新分类 */
  async update(id: string, data: Partial<CategoryRecord>): Promise<void> {
    const existing = await db.categories.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.categories.put(updated)
  },

  /** 删除分类 */
  async remove(id: string): Promise<void> {
    const existing = await db.categories.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.categories.put(deleted)
  },
}

// ============================================================
// Transactions
// ============================================================

/**
 * 安全解析 transaction_date 字符串为时间戳。
 * 优先用 YYYY/MM/DD 构造（避免 UTC 偏移），
 * 失败则降级为 0，保证 sort 不崩溃。
 */
function parseTransactionDate(dateStr: string): number {
  if (!dateStr) return 0
  // 用 / 替换 - 避免 new Date('YYYY-MM-DD') 按 UTC 解析
  const ts = new Date(dateStr.replace(/-/g, '/')).getTime()
  return isNaN(ts) ? 0 : ts
}

export const localTransactions = {
  /** 获取所有有效交易，按日期倒序 */
  async getAll(userId: string): Promise<TransactionRecord[]> {
    const records = await db.transactions
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .toArray()
    // 按日期+时间倒序排序 (IndexedDB 不保证复合排序，用 JS sort)
    // 使用 Date 对象比较而非字符串 localeCompare，防止 YYYY-MM-DD 跨年边界
    // 或非标准日期格式导致的排序错乱
    records.sort((a, b) => {
      const da = parseTransactionDate(a.transaction_date)
      const db = parseTransactionDate(b.transaction_date)
      const dateCmp = db - da
      if (dateCmp !== 0) return dateCmp
      return (b.transaction_time || '').localeCompare(a.transaction_time || '')
    })
    return records
    return records
  },

  /** 获取单个交易 */
  async getById(id: string): Promise<TransactionRecord | undefined> {
    const record = await db.transactions.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增交易 */
  async insert(userId: string, data: Omit<TransactionRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.transactions.put(record)
    return record
  },

  /** 更新交易 */
  async update(id: string, data: Partial<TransactionRecord>): Promise<void> {
    const existing = await db.transactions.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.transactions.put(updated)
  },

  /** 删除交易 */
  async remove(id: string): Promise<void> {
    const existing = await db.transactions.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.transactions.put(deleted)
  },

  /** 批量获取指定账户的交易（用于余额计算） */
  async getByAccount(userId: string, accountId: string): Promise<TransactionRecord[]> {
    return db.transactions
      .where('account_id').equals(accountId)
      .filter(r => r.user_id === userId && r._sync_status !== 'pending_delete')
      .toArray()
  },
}

// ============================================================
// Transfers（账户间转账，独立表，不计入消费，支持多币种）
// ============================================================

export const localTransfers = {
  /** 获取所有有效转账，按日期倒序 */
  async getAll(userId: string): Promise<TransferRecord[]> {
    const records = await db.transfers
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .toArray()
    records.sort((a, b) => {
      const da = parseTransactionDate(a.transaction_date)
      const dbDate = parseTransactionDate(b.transaction_date)
      const dateCmp = dbDate - da
      if (dateCmp !== 0) return dateCmp
      return (b.transaction_time || '').localeCompare(a.transaction_time || '')
    })
    return records
  },

  /** 获取单条转账 */
  async getById(id: string): Promise<TransferRecord | undefined> {
    const record = await db.transfers.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增转账 */
  async insert(userId: string, data: Omit<TransferRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<TransferRecord> {
    const record: TransferRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.transfers.put(record)
    return record
  },

  /** 更新转账 */
  async update(id: string, data: Partial<TransferRecord>): Promise<void> {
    const existing = await db.transfers.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.transfers.put(updated)
  },

  /** 删除转账（软删除） */
  async remove(id: string): Promise<void> {
    const existing = await db.transfers.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.transfers.put(deleted)
  },
}

// ============================================================
// Budgets
// ============================================================

export const localBudgets = {
  /** 获取所有有效预算，按月份倒序 */
  async getAll(userId: string): Promise<BudgetRecord[]> {
    const records = await db.budgets
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .toArray()
    records.sort((a, b) => b.month.localeCompare(a.month))
    return records
  },

  /** 获取单个预算 */
  async getById(id: string): Promise<BudgetRecord | undefined> {
    const record = await db.budgets.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增预算 */
  async insert(userId: string, data: Omit<BudgetRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<BudgetRecord> {
    const record: BudgetRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.budgets.put(record)
    return record
  },

  /** 更新预算 */
  async update(id: string, data: Partial<BudgetRecord>): Promise<void> {
    const existing = await db.budgets.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.budgets.put(updated)
  },

  /** 删除预算 */
  async remove(id: string): Promise<void> {
    const existing = await db.budgets.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.budgets.put(deleted)
  },
}

// ============================================================
// SubCategories（子分类，绑一级分类）
// ============================================================

export const localSubCategories = {
  /** 获取某用户全部子分类 */
  async getAll(userId: string): Promise<SubCategoryRecord[]> {
    const records = await db.subCategories
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .toArray()
    return records
  },

  /** 获取某分类下的子分类 */
  async getByCategory(userId: string, categoryId: string): Promise<SubCategoryRecord[]> {
    const records = await this.getAll(userId)
    return records.filter(r => r.category_id === categoryId)
  },

  /** 获取单个子分类 */
  async getById(id: string): Promise<SubCategoryRecord | undefined> {
    const record = await db.subCategories.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增子分类 */
  async insert(userId: string, data: Omit<SubCategoryRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<SubCategoryRecord> {
    const record: SubCategoryRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.subCategories.put(record)
    return record
  },

  /** 调整子分类排序：写入新的 sort_order 列表 */
  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    const existingMap = new Map<string, SubCategoryRecord>()
    const all = await this.getAll(userId)
    all.forEach(r => existingMap.set(r.id, r))
    await db.transaction('rw', db.subCategories, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        const rec = existingMap.get(orderedIds[i])
        if (rec) {
          await db.subCategories.update(orderedIds[i], {
            sort_order: i,
            _sync_status: 'local_dirty',
            _updated_at_local: new Date().toISOString(),
          } as Partial<SubCategoryRecord>)
        }
      }
    })
  },

  /** 更新子分类 */
  async update(id: string, data: Partial<SubCategoryRecord>): Promise<void> {
    const existing = await db.subCategories.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.subCategories.put(updated)
  },

  /** 删除子分类 */
  async remove(id: string): Promise<void> {
    const existing = await db.subCategories.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.subCategories.put(deleted)
  },
}

// ============================================================
// Tags（全局自由标签，跨分类）
// ============================================================

export const localTags = {
  /** 获取所有有效标签 */
  async getAll(userId: string): Promise<TagRecord[]> {
    const records = await db.tags
      .where('user_id').equals(userId)
      .filter(r => r._sync_status !== 'pending_delete')
      .toArray()
    return records
  },

  /** 获取单个标签 */
  async getById(id: string): Promise<TagRecord | undefined> {
    const record = await db.tags.get(id)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 新增标签 */
  async insert(userId: string, data: Omit<TagRecord, keyof ReturnType<typeof newRecordBase> | '_sync_status' | '_updated_at_local'>): Promise<TagRecord> {
    const record: TagRecord = {
      ...newRecordBase(userId),
      ...data,
    }
    await db.tags.put(record)
    return record
  },

  /** 更新标签 */
  async update(id: string, data: Partial<TagRecord>): Promise<void> {
    const existing = await db.tags.get(id)
    if (!existing) return
    const updated = markDirty({ ...existing, ...data })
    await db.tags.put(updated)
  },

  /** 删除标签 */
  async remove(id: string): Promise<void> {
    const existing = await db.tags.get(id)
    if (!existing) return
    const deleted = markDeleted(existing)
    await db.tags.put(deleted)
  },
}

// ============================================================
// Profiles
// ============================================================

export const localProfiles = {
  /** 获取用户设置 */
  async get(userId: string): Promise<ProfileRecord | undefined> {
    const record = await db.profiles.get(userId)
    if (record && record._sync_status === 'pending_delete') return undefined
    return record
  },

  /** 插入/更新用户设置 */
  async upsert(userId: string, data: Omit<ProfileRecord, 'id' | '_sync_status' | '_updated_at_local' | 'created_at' | 'updated_at'> & Partial<Pick<ProfileRecord, 'created_at' | 'updated_at'>>): Promise<ProfileRecord> {
    const existing = await db.profiles.get(userId)
    const now = new Date().toISOString()
    const record: ProfileRecord = {
      id: userId,
      display_name: data.display_name ?? null,
      avatar_url: data.avatar_url ?? null,
      currency: data.currency ?? 'CNY',
      locale: data.locale ?? 'zh-CN',
      big_expense_threshold: data.big_expense_threshold ?? 3000,
      created_at: data.created_at ?? (existing?.created_at || now),
      updated_at: data.updated_at ?? now,
      _sync_status: 'local_dirty',
      _updated_at_local: now,
    }
    await db.profiles.put(record)
    return record
  },
}

// ============================================================
// 工具函数：检查本地是否有数据
// ============================================================

export async function hasLocalData(): Promise<boolean> {
  const count = await db.accounts.count()
  return count > 0
}
