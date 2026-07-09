/**
 * 同步引擎
 *
 * 负责 IndexedDB ↔ Supabase 之间的数据同步：
 * - pull:  从 Supabase 增量拉取变更 → 合并到 IndexedDB
 * - push:  将 IndexedDB 中 dirty 记录 → 推送到 Supabase
 * - sync:  启动时执行全量/增量同步
 * - 网络监听: 网络恢复时自动触发同步
 */

import { db, SyncStatus } from './database'
import { supabase, getSupabaseUserId } from '../services/supabase'

const LAST_SYNC_KEY_PREFIX = 'last_sync'

// 需要同步的表名列表
const TABLE_NAMES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'subCategories',
  'tags',
  'profiles',
] as const

type TableName = (typeof TABLE_NAMES)[number]

// 本地 Dexie 表名使用驼峰（如 subCategories），但远程 Supabase 表名为蛇形
// （sub_categories）。拉取/推送 REST URL 需映射到远程真实表名。
const REMOTE_TABLE_MAP: Record<TableName, string> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  subCategories: 'sub_categories',
  tags: 'tags',
  profiles: 'profiles',
}

function remoteTable(tableName: TableName): string {
  return REMOTE_TABLE_MAP[tableName] ?? tableName
}

// ============================================================
// 同步元数据
// ============================================================

async function getLastSync(tableName: TableName): Promise<string | null> {
  const meta = await db.syncMeta.get(`${LAST_SYNC_KEY_PREFIX}:${tableName}`)
  return meta?.value || null
}

async function setLastSync(tableName: TableName, time: string): Promise<void> {
  await db.syncMeta.put({ key: `${LAST_SYNC_KEY_PREFIX}:${tableName}`, value: time })
}

// ============================================================
// Pull: 从 Supabase 拉取变更
// ============================================================

/**
 * 从 Supabase 拉取单表的变更数据并合并到 IndexedDB
 */
async function pullTable(tableName: TableName, userId: string): Promise<void> {
  const table = (db as any)[tableName]
  const lastSync = await getLastSync(tableName)

  // 构建 URL，通过 x-user-id header 传递 user_id 用于 RLS
  const uid = getSupabaseUserId() || userId
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']

  let url = `${supabaseUrl}/rest/v1/${remoteTable(tableName)}?select=*`
  if (tableName === 'profiles') {
    url += `&id=eq.${userId}`
  }
  // tags 表数据量小且用户期望本地与远程始终一致，跳过增量过滤做全量拉取，
  // 否则 old 标签在 lastSync 之前创建、之后无更新时永远拉不回来。
  if (lastSync && tableName !== 'tags') {
    url += `&updated_at=gt.${encodeURIComponent(lastSync)}`
  }

  const headers: Record<string, string> = {
    'apikey': supabaseKey,
    'x-user-id': uid,
  }

  const resp = await fetch(url, { headers })
  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`[Sync] 拉取 ${tableName} 失败: ${resp.status} ${errBody}`)
  }

  const data = await resp.json() as any[]

  if (!data || data.length === 0) {
    if (!lastSync) {
      await setLastSync(tableName, new Date().toISOString())
    }
    // 远程返回空集合时，一律不清理本地数据。tags 表也与其他表一致：
    // 增量拉取窗口内无变更返回空数组是常态，绝不能据此删本地，否则会
    // 误删用户在远程正常存在的标签（远程有数据但 lastSync 之后无更新时）。
    return
  }

  console.log(`[Sync] 拉取 ${tableName}: ${data.length} 条记录`)

  // 检查哪些记录是本地已删除的（不覆盖本地删除操作）
  const localDeletedIds = new Set<string>()
  const deletedRecords = await table
    .where('_sync_status')
    .equals('pending_delete')
    .toArray()
  deletedRecords.forEach((r: any) => localDeletedIds.add(r.id))

  // 批量 upsert 到 IndexedDB
  const records = data
    .filter((row: any) => !localDeletedIds.has(row.id))
    .map((row: any) => ({
      ...row,
      _sync_status: 'synced' as SyncStatus,
      _updated_at_local: new Date().toISOString(),
    }))

  if (records.length > 0) {
    await table.bulkPut(records)
  }

  // 更新 lastSync 时间
  const maxUpdatedAt = data.reduce((max: string, row: any) => {
    return row.updated_at > max ? row.updated_at : max
  }, lastSync || '')

  await setLastSync(tableName, maxUpdatedAt || new Date().toISOString())
}

/**
 * 从 Supabase 拉取所有表的变更
 */
async function pullAll(userId: string): Promise<void> {
  for (const tableName of TABLE_NAMES) {
    try {
      await pullTable(tableName, userId)
    } catch (err) {
      console.error(`[Sync] 拉取 ${tableName} 异常:`, err)
    }
  }
}

// ============================================================
// Push: 推送本地变更到 Supabase
// ============================================================

/**
 * 将单表本地 dirty 记录推送到 Supabase
 */
async function pushTable(tableName: TableName, userId: string): Promise<void> {
  const table = (db as any)[tableName]
  const uid = getSupabaseUserId() || userId
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']

  // 1. 处理待新增/修改的记录 (local_dirty)
  const dirtyRecords = await table
    .where('_sync_status')
    .equals('local_dirty')
    .toArray()

  if (dirtyRecords.length > 0) {
    console.log(`[Sync] 推送 ${tableName}: ${dirtyRecords.length} 条变更`)
  }

  for (const record of dirtyRecords) {
    try {
      // 清理同步字段后上传
      const { _sync_status, _updated_at_local, ...cleanRecord } = record

      const resp = await fetch(`${supabaseUrl}/rest/v1/${remoteTable(tableName)}?on_conflict=id`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'x-user-id': uid,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(cleanRecord),
      })

      if (!resp.ok) {
        const errBody = await resp.text()
        throw new Error(`${resp.status}: ${errBody}`)
      }

      // 标记为已同步
      await table.update(record.id, {
        _sync_status: 'synced',
        _updated_at_local: new Date().toISOString(),
      })
    } catch (err) {
      console.error(`[Sync] 推送 ${tableName}#${record.id} 失败:`, err)
      // 保持 local_dirty，等下次重试
    }
  }

  // 2. 处理待删除的记录 (pending_delete)
  const deleteRecords = await table
    .where('_sync_status')
    .equals('pending_delete')
    .toArray()

  if (deleteRecords.length > 0) {
    console.log(`[Sync] 删除 ${tableName}: ${deleteRecords.length} 条记录`)
  }

  for (const record of deleteRecords) {
    try {
      const resp = await fetch(`${supabaseUrl}/rest/v1/${remoteTable(tableName)}?id=eq.${encodeURIComponent(record.id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'x-user-id': uid,
        },
      })

      if (!resp.ok) {
        const errBody = await resp.text()
        throw new Error(`${resp.status}: ${errBody}`)
      }

      // 从本地彻底删除
      await table.delete(record.id)
    } catch (err) {
      console.error(`[Sync] 删除 ${tableName}#${record.id} 失败:`, err)
    }
  }
}

/**
 * 推送所有表的本地变更
 */
async function pushAll(userId: string): Promise<void> {
  for (const tableName of TABLE_NAMES) {
    try {
      await pushTable(tableName, userId)
    } catch (err) {
      console.error(`[Sync] 推送 ${tableName} 异常:`, err)
    }
  }
}

// ============================================================
// 启动同步
// ============================================================

/**
 * 启动时同步:
 * 1. 首次使用 → 全量拉取
 * 2. 已有数据 → 先推送本地变更，再增量拉取
 */
async function syncOnStartup(userId: string): Promise<void> {
  // 检查是否首次使用
  const hasData = await db.accounts.count() > 0

  if (!hasData) {
    console.log('[Sync] 首次使用，全量同步...')
    await pullAll(userId)
    console.log('[Sync] ✅ 全量同步完成')
    return
  }

  console.log('[Sync] 增量同步...')

  // 1. 先推送本地未同步的变更
  await pushAll(userId)

  // 2. 再拉取远程变更
  await pullAll(userId)

  console.log('[Sync] ✅ 同步完成')
}

// ============================================================
// 写入后同步 (fire-and-forget)
// ============================================================

/**
 * 单表写入后触发的同步（非阻塞）
 */
async function syncAfterWrite(tableName: TableName, userId: string): Promise<void> {
  try {
    await pushTable(tableName, userId)
  } catch (err) {
    console.error(`[Sync] 写入后同步 ${tableName} 失败:`, err)
  }
}

// ============================================================
// 网络恢复监听
// ============================================================

let onlineCleanup: (() => void) | null = null

function setupNetworkListener(userId: string): void {
  // 防止重复注册
  if (onlineCleanup) {
    onlineCleanup()
  }

  const handleOnline = () => {
    console.log('[Sync] 🌐 网络恢复，开始同步...')
    syncOnStartup(userId).catch(err => {
      console.error('[Sync] 网络恢复同步失败:', err)
    })
  }

  window.addEventListener('online', handleOnline)
  onlineCleanup = () => window.removeEventListener('online', handleOnline)
}

function removeNetworkListener(): void {
  if (onlineCleanup) {
    onlineCleanup()
    onlineCleanup = null
  }
}

// ============================================================
// 清除所有本地数据（退出登录时调用）
// ============================================================

async function clearAllData(): Promise<void> {
  console.log('[Sync] 清除所有本地数据...')
  await db.accounts.clear()
  await db.categories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.subCategories.clear()
  await db.tags.clear()
  await db.profiles.clear()
  // 必须同时清除同步基准，否则 lastSync 残留会让后续同步走"增量"分支，
  // 早于 lastSync 创建的远程数据（如老标签）永远拉不回来。
  await db.syncMeta.clear()
  removeNetworkListener()
  console.log('[Sync] ✅ 本地数据已清除')
}

// ============================================================
// 定时同步
// ============================================================

let timerInterval: ReturnType<typeof setInterval> | null = null

function startPeriodicSync(userId: string, intervalMs: number = 5 * 60 * 1000): void {
  if (timerInterval) clearInterval(timerInterval)

  timerInterval = setInterval(() => {
    if (navigator.onLine) {
      pushAll(userId).then(() => pullAll(userId)).catch(err => {
        console.error('[Sync] 定时同步失败:', err)
      })
    }
  }, intervalMs)
}

function stopPeriodicSync(): void {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

// ============================================================
// 导出
// ============================================================

export const syncEngine = {
  pullAll,
  pushAll,
  syncOnStartup,
  syncAfterWrite,
  setupNetworkListener,
  removeNetworkListener,
  clearAllData,
  startPeriodicSync,
  stopPeriodicSync,
}
