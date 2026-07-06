# IndexedDB (Dexie.js) 缓存方案实施文档

## 概述

将 Supabase 远程数据库镜像到浏览器端 IndexedDB，所有页面只读写本地数据库，通过异步同步引擎保持与 Supabase 的一致性。

## 实施原则

1. **渐进式改造**：不改动 UI 层代码，AppContext 的接口签名保持不变
2. **本地优先**：所有读写操作先走 IndexedDB，Supabase 只作为后台同步目标
3. **向后兼容**：首次使用无缓存时自动从 Supabase 全量拉取

## 分步实施计划

### Step 1: 安装依赖 + 定义 Dexie 数据库 Schema

**安装 Dexie.js:**

```bash
npm install dexie@^4.0.0
```

**新建文件: `apps/pwa/src/db/database.ts`**

定义 IndexedDB 数据库结构：

```typescript
import Dexie, { Table } from 'dexie'

// 带同步状态的通用记录类型
export interface SyncableRecord {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  _sync_status: 'synced' | 'local_dirty' | 'pending_delete'
  _updated_at_local: string // 本地最后修改时间
}

export interface AccountRecord extends SyncableRecord {
  name: string
  type: string
  balance: number
  icon: string
  color: string
  sort_order: number
  is_active: boolean
}

export interface CategoryRecord extends SyncableRecord {
  name: string
  icon: string
  color: string
  type: 'expense' | 'income'
  sort_order: number
  is_system: boolean
}

export interface TransactionRecord extends SyncableRecord {
  type: 'expense' | 'income'
  amount: number
  category_id: string | null
  account_id: string
  to_account_id: string | null
  transaction_date: string  // YYYY-MM-DD
  transaction_time: string  // HH:mm:ss
  tags: string[] | null
  note: string | null
  images: string[] | null
  location: any | null
}

export interface BudgetRecord extends SyncableRecord {
  month: string
  category_id: string | null
  amount: number
}

export interface BillRecord extends SyncableRecord {
  name: string
  amount: number
  type: string
  due_date: number
  start_date: string
  end_date: string | null
  remind_days: number[]
}

export interface TagRecord extends SyncableRecord {
  name: string
  color: string
  category_id: string
}

export interface ProfileRecord extends SyncableRecord {
  display_name: string | null
  avatar_url: string | null
  currency: string
  locale: string
  big_expense_threshold: number
}

export interface SyncMeta {
  key: string
  value: string
}

class BillsDatabase extends Dexie {
  accounts!: Table<AccountRecord, string>
  categories!: Table<CategoryRecord, string>
  transactions!: Table<TransactionRecord, string>
  budgets!: Table<BudgetRecord, string>
  bills!: Table<BillRecord, string>
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
      bills: 'id, user_id, _sync_status, type',
      tags: 'id, user_id, _sync_status, category_id',
      profiles: 'id, _sync_status',
      syncMeta: 'key',
    })
  }
}

export const db = new BillsDatabase()
```

### Step 2: 实现同步引擎

**新建文件: `apps/pwa/src/db/sync-engine.ts`**

核心逻辑：

```typescript
import { db } from './database'
import { supabase } from '../services/supabase'

// 同步元数据 key
const LAST_SYNC_KEY = 'last_sync'
const TABLE_NAMES = ['accounts', 'categories', 'transactions', 'budgets', 'bills', 'tags', 'profiles'] as const

// ============ 拉取同步 (Pull) ============
// 从 Supabase 增量拉取变更并合并到 IndexedDB
async function pullFromSupabase(tableName: string, userId: string): Promise<void> {
  const lastSync = await getLastSyncTime(tableName)
  
  let query = supabase.from(tableName).select('*')
  
  if (lastSync) {
    // 增量拉取: 只拉 updated_at > lastSync 的记录
    query = query.gt('updated_at', lastSync)
  }
  // 注意: 增量拉取时不能加 .eq('user_id', userId) 因为 profiles 表的主键就是 user_id
  // 需要根据具体表来处理，这里简化为依赖 RLS
  
  const { data, error } = await query
  
  if (error) throw error
  if (!data || data.length === 0) return

  // 批量 upsert 到 IndexedDB (用 bulkPut 做 upsert)
  const records = data.map((row: any) => ({
    ...row,
    _sync_status: 'synced' as const,
    _updated_at_local: new Date().toISOString(),
  }))

  await (db as any)[tableName].bulkPut(records)
  
  // 更新该表的 last_sync 时间
  await setLastSyncTime(tableName, new Date().toISOString())
}

// ============ 推送同步 (Push) ============
// 将本地 dirty 记录推送到 Supabase
async function pushToSupabase(tableName: string, userId: string): Promise<void> {
  const table = (db as any)[tableName]
  
  // 1. 处理待新增/修改的记录
  const dirtyRecords = await table
    .where('_sync_status')
    .equals('local_dirty')
    .toArray()

  for (const record of dirtyRecords) {
    try {
      const { _sync_status, _updated_at_local, ...cleanRecord } = record
      // 移除 id 让 Supabase 自动生成 (如果是新增)
      // 但我们需要保持 ID 一致，所以用 upsert
      const { error } = await supabase
        .from(tableName)
        .upsert({ ...cleanRecord, user_id: userId })
        .eq('id', record.id)

      if (error) throw error

      // 标记为已同步
      await table.update(record.id, { _sync_status: 'synced' })
    } catch (err) {
      console.error(`推送 ${tableName} 记录 ${record.id} 失败:`, err)
      // 保持 local_dirty 状态，等待下次重试
    }
  }

  // 2. 处理待删除的记录
  const deleteRecords = await table
    .where('_sync_status')
    .equals('pending_delete')
    .toArray()

  for (const record of deleteRecords) {
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', record.id)

      if (error) throw error

      // 从本地彻底删除
      await table.delete(record.id)
    } catch (err) {
      console.error(`删除 ${tableName} 记录 ${record.id} 失败:`, err)
    }
  }
}

// ============ 全量同步 (首次使用) ============
async function fullSync(userId: string): Promise<void> {
  for (const tableName of TABLE_NAMES) {
    // 先检查本地是否有数据
    const count = await (db as any)[tableName].count()
    if (count === 0) {
      await pullFromSupabase(tableName, userId)
    }
  }
}

// ============ 启动时同步 ============
async function syncOnStartup(userId: string): Promise<void> {
  // 1. 检查是否需要首次全量同步
  const hasData = await db.accounts.count() > 0
  if (!hasData) {
    console.log('🔄 首次使用，全量同步中...')
    await fullSync(userId)
    return
  }

  // 2. 增量同步
  console.log('🔄 增量同步中...')
  for (const tableName of TABLE_NAMES) {
    try {
      await pullFromSupabase(tableName, userId)
    } catch (err) {
      console.error(`增量同步 ${tableName} 失败:`, err)
    }
  }

  // 3. 推送本地未同步的变更
  for (const tableName of TABLE_NAMES) {
    try {
      await pushToSupabase(tableName, userId)
    } catch (err) {
      console.error(`推送 ${tableName} 失败:`, err)
    }
  }

  console.log('✅ 同步完成')
}

// ============ 辅助函数 ============
async function getLastSyncTime(tableName: string): Promise<string | null> {
  const meta = await db.syncMeta.get(`${LAST_SYNC_KEY}:${tableName}`)
  return meta?.value || null
}

async function setLastSyncTime(tableName: string, time: string): Promise<void> {
  await db.syncMeta.put({ key: `${LAST_SYNC_KEY}:${tableName}`, value: time })
}

// ============ 网络恢复同步 ============
function setupNetworkListener(userId: string): () => void {
  const handleOnline = () => {
    console.log('🌐 网络恢复，开始同步...')
    syncOnStartup(userId)
  }
  window.addEventListener('online', handleOnline)
  return () => window.removeEventListener('online', handleOnline)
}

export const syncEngine = {
  pullFromSupabase,
  pushToSupabase,
  fullSync,
  syncOnStartup,
  setupNetworkListener,
}
```

### Step 3: 重构 AppContext

**修改文件: `apps/pwa/src/context/AppContext.tsx`**

核心改动点：

#### 3.1 移除 `loadData()` 中的 Supabase 直接查询

```typescript
// 旧: 从 Supabase 全量拉取
const loadData = async () => {
  const { data } = await supabase.from('accounts').select('*')
  setAccounts(data.map(mapAccount))
  // ...
}

// 新: 从 IndexedDB 读取 + 后台同步
const loadData = async () => {
  // 1. 先从 IndexedDB 读取 (毫秒级)
  const localAccounts = await db.accounts
    .where('_sync_status').notEqual('pending_delete')
    .toArray()
  setAccounts(localAccounts.map(mapAccount))

  const localTransactions = await db.transactions
    .where('_sync_status').notEqual('pending_delete')
    .orderBy('transaction_date')
    .reverse()
    .toArray()
  setTransactions(localTransactions.map(mapTransaction))
  
  // ... 同理加载其他表

  // 2. 后台同步 (不阻塞 UI)
  syncEngine.syncOnStartup(userId).then(() => {
    // 同步完成后刷新本地数据
    refreshFromLocal()
  })
}
```

#### 3.2 改造 CRUD 函数为本地优先

以 `addTransaction` 为例：

```typescript
const addTransaction = async (t: Omit<Transaction, 'id'>) => {
  const newId = crypto.randomUUID()
  const now = new Date().toISOString()
  const [h, m] = (t.time || '00:00').split(':')
  const transactionDate = t.transactionDate || t.date || now.split('T')[0]

  const record: TransactionRecord = {
    id: newId,
    user_id: userId!,
    type: t.type === 'transfer' ? 'expense' : t.type,
    amount: t.amount,
    category_id: t.type === 'transfer' ? null : t.categoryId,
    account_id: t.accountId,
    to_account_id: t.toAccountId || null,
    transaction_date: transactionDate,
    transaction_time: `${h}:${m}:00`,
    tags: t.tags?.length ? t.tags : null,
    note: t.note || null,
    images: null,
    location: null,
    created_at: now,
    updated_at: now,
    _sync_status: 'local_dirty',
    _updated_at_local: now,
  }

  // 1. 立即写入 IndexedDB
  await db.transactions.put(record)

  // 2. 立即更新 React state
  const newTransaction = mapTransactionToLocal(record)
  setTransactions(prev => [newTransaction, ...prev])

  // 3. 后台异步同步到 Supabase (fire-and-forget)
  syncEngine.pushToSupabase('transactions', userId!)
    .catch(err => console.error('后台同步失败:', err))
}
```

#### 3.3 账户余额动态计算

```typescript
// 新增: 从 transactions 动态计算账户余额
const getAccountBalance = (accountId: string): number => {
  let balance = 0
  transactions
    .filter(t => t._sync_status !== 'pending_delete')
    .forEach(t => {
      if (t.accountId === accountId) {
        if (t.type === 'income') balance += t.amount
        else if (t.type === 'expense') balance -= t.amount
      }
      if (t.type === 'transfer' && t.toAccountId === accountId) {
        balance += t.amount
      }
    })
  return balance
}

// Account 接口中的 balance 改为计算属性
const accountsWithBalance = useMemo(() => {
  return accounts.map(a => ({
    ...a,
    balance: getAccountBalance(a.id)
  }))
}, [accounts, transactions])
```

#### 3.4 去除 200 条限制

```typescript
// 旧: .limit(200)
// 新: 从 IndexedDB 读取全部，按需分页展示
const localTransactions = await db.transactions
  .where('_sync_status').notEqual('pending_delete')
  .orderBy('transaction_date')
  .reverse()
  .toArray() // 不再限制数量
```

### Step 4: 日期处理统一化

当前 `date` 字段格式为 `"X月X日"`，不包含年份，跨年场景有 bug。

**方案**: 在 IndexedDB 层统一使用 `transactionDate` (YYYY-MM-DD)，`date` 字段改为**计算属性**：

```typescript
// Transaction 接口保持兼容
interface Transaction {
  // ...
  transactionDate: string  // 主日期字段: YYYY-MM-DD
  date: string             // 计算属性: 从 transactionDate 格式化为 "X月X日"
}

// 加载时计算
function mapTransactionToLocal(record: TransactionRecord): Transaction {
  const d = new Date(record.transaction_date)
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    categoryId: record.category_id || '',
    // ...
    transactionDate: record.transaction_date,
    date: `${d.getMonth() + 1}月${d.getDate()}日`,
    time: record.transaction_time?.slice(0, 5) || '00:00',
  }
}
```

### Step 5: 清除和重置

```typescript
// 退出登录时清除本地数据库
async function clearLocalData(): Promise<void> {
  await db.accounts.clear()
  await db.categories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.bills.clear()
  await db.tags.clear()
  await db.profiles.clear()
  await db.syncMeta.clear()
}
```

## 改动影响范围

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `package.json` | 新增依赖 | + dexie@^4.0.0 |
| `src/db/database.ts` | 新建 | Dexie 数据库定义 |
| `src/db/sync-engine.ts` | 新建 | 同步引擎 |
| `src/db/account.db.ts` | 新建 | 账户本地操作 |
| `src/db/transaction.db.ts` | 新建 | 交易本地操作 |
| `src/db/category.db.ts` | 新建 | 分类本地操作 |
| `src/db/budget.db.ts` | 新建 | 预算本地操作 |
| `src/db/bill.db.ts` | 新建 | 账单本地操作 |
| `src/db/tag.db.ts` | 新建 | 标签本地操作 |
| `src/db/profile.db.ts` | 新建 | 设置本地操作 |
| `src/context/AppContext.tsx` | 重构 | 数据源切换为 IndexedDB |
| `src/stores/useAuthStore.ts` | 小改 | logout 时清除 IndexedDB |
| UI 页面 | **无需改动** | AppContext 接口不变 |

## 风险点和注意事项

1. **RLS 依赖**: 当前 `set_current_user_id` RPC 需要在每次 Supabase 操作前调用。同步引擎需要在 push/pull 前确保已设置。离线时此调用会失败 → 离线期间的变更只能暂存本地。

2. **软删除 vs 硬删除**: `accounts` 表使用 `is_active` 软删除，而其他表使用硬删除。同步引擎的 `pending_delete` 机制对两种策略都适用。

3. **Supabase `updated_at` 自动更新**: 数据库表已有 `updated_at` 触发器 (`update_updated_at_column`)，确保增量同步能正确检测变更。

4. **首次加载体验**: 首次使用时 IndexedDB 为空，需要从 Supabase 全量拉取。此时仍会有网络延迟，但可以加 loading 状态。建议在首次全量同步时显示进度条。

5. **存储空间**: IndexedDB 在浏览器中通常有 50MB-无限的限制（取决于浏览器和磁盘空间）。个人记账数据量通常远低于此限制。

6. **Dexie 版本升级**: 如果后续要修改 IndexedDB 表结构，需要用 Dexie 的 `version()` 链式升级 API，不要直接修改 `version(1).stores()`。

## 不实施的功能（后续迭代）

- ❌ Service Worker Background Sync
- ❌ 复杂冲突处理 (CRDT/OT)
- ❌ WebSocket 实时同步
- ❌ 多设备协同编辑
- ❌ 图片文件离线缓存 (仅缓存 URL，不缓存二进制)
