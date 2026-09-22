/**
 * 同步引擎
 *
 * 负责 IndexedDB ↔ Supabase 之间的数据同步：
 * - pull:  从 Supabase 拉取变更 → 合并到 IndexedDB
 * - push:  将 IndexedDB 中 dirty 记录 → 推送到 Supabase
 * - sync:  启动时同步
 * - 网络监听: 网络恢复时自动触发同步
 *
 * 拉取策略（v2，解决"每次刷新都全量重拉几千条交易"）：
 * 1. 启动先发 **1 次 RPC** `get_sync_meta`，拿到每张表的指纹（行数 + max(updated_at)）；
 * 2. 与本地记的指纹比对：两者都没变 → 该表**直接跳过（0 请求）**；
 * 3. 变了 → 只对该表做**增量拉取**（`updated_at >= 本地游标`），游标 = 数据里的 max(updated_at)；
 * 4. 兜底：本地没游标 / 距上次全量超过 24h / 本地行数少于远程 → 退回全量拉取；
 * 5. 全量拉取时顺手用拉到的 id 集合清理孤儿，不再额外发一轮"拉全部 id"的请求；
 * 6. 表与表之间限量并发（页内保持串行，游标有依赖）。
 */

import { db, SyncStatus } from './database'
import { supabase, getSupabaseUserId } from '../services/supabase'

// 需要同步的表名列表
const TABLE_NAMES = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'budgets',
  'subCategories',
  'tags',
  'profiles',
  'holdings_transactions',
] as const

type TableName = (typeof TABLE_NAMES)[number]

// 本地 Dexie 表名使用驼峰（如 subCategories），但远程 Supabase 表名为蛇形
// （sub_categories）。拉取/推送 REST URL 需映射到远程真实表名。
const REMOTE_TABLE_MAP: Record<TableName, string> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  transfers: 'transfers',
  budgets: 'budgets',
  subCategories: 'sub_categories',
  tags: 'tags',
  profiles: 'profiles',
  holdings_transactions: 'holdings_transactions',
}

function remoteTable(tableName: TableName): string {
  return REMOTE_TABLE_MAP[tableName] ?? tableName
}

// 反向映射：RPC 返回的是**远程表名**（sub_categories），本地 Dexie 表名是驼峰（subCategories），
// 两边必须映射，否则该表指纹会缺失、每次启动都被当成"没指纹"而全量拉一遍。
const LOCAL_BY_REMOTE: Record<string, TableName> = Object.fromEntries(
  (Object.entries(REMOTE_TABLE_MAP) as [TableName, string][]).map(([local, remote]) => [remote, local]),
) as Record<string, TableName>

const PAGE_SIZE = 1000
/** 表间并发度（页内必须串行：id 游标依赖上一页结果） */
const TABLE_CONCURRENCY = 4
/** 每表全量兜底周期：超过这个时间没做过全量，就强制全量一次 */
const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000
/** syncMeta 里存同步指纹的 key 前缀 */
const FP_KEY_PREFIX = 'fp'

export type PullProgress = {
  /** 当前进度 0-100 */
  percent: number
  /** 当前状态描述 */
  status: 'counting' | 'pulling' | 'done' | 'error'
}

// ============================================================
// 通用小工具
// ============================================================

function restInfo(tableName: TableName, uid: string) {
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']
  return {
    url: `${supabaseUrl}/rest/v1/${remoteTable(tableName)}`,
    headers: { apikey: supabaseKey, 'x-user-id': uid } as Record<string, string>,
  }
}

/** 显式按用户过滤（profiles 用 id，其余用 user_id），让 PostgREST 走 user_id 索引 */
function userFilter(tableName: TableName, uid: string): string {
  const col = tableName === 'profiles' ? 'id' : 'user_id'
  return `&${col}=eq.${uid}`
}

/** 限量并发跑任务（保持与传入顺序无关；单个任务抛错由 worker 自己处理） */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Math.min(Math.max(limit, 1), items.length)
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const i = cursor++
        if (i >= items.length) return
        await worker(items[i])
      }
    }),
  )
}

// ============================================================
// 本地指纹（syncMeta）
// ============================================================

export interface TableFingerprint {
  /** 上次同步后远程该表的行数 */
  cnt: number
  /** 增量游标 = 远程数据的 max(updated_at)；null 表示没有可用游标 → 走全量 */
  maxUpdatedAt: string | null
  /** 上次全量拉取的时间（本地时钟，仅用于兜底计时） */
  fullSyncedAt: number
}

async function getFingerprint(tableName: TableName): Promise<TableFingerprint | null> {
  try {
    const row = await db.syncMeta.get(`${FP_KEY_PREFIX}:${tableName}`)
    if (!row) return null
    const parsed = JSON.parse(row.value) as TableFingerprint
    return typeof parsed?.cnt === 'number' ? parsed : null
  } catch {
    return null
  }
}

async function setFingerprint(tableName: TableName, fp: TableFingerprint): Promise<void> {
  await db.syncMeta.put({ key: `${FP_KEY_PREFIX}:${tableName}`, value: JSON.stringify(fp) })
}

// ============================================================
// 远程指纹：1 次 RPC 拿到所有表的 行数 + max(updated_at)
// ============================================================

interface TableMeta {
  cnt: number
  maxUpdatedAt: string | null
}
type TableMetaMap = Partial<Record<TableName, TableMeta>>

async function fetchTableMeta(uid: string): Promise<TableMetaMap> {
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/get_sync_meta`, {
    method: 'POST',
    headers: { apikey: supabaseKey, 'x-user-id': uid, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: uid }),
  })
  if (!resp.ok) throw new Error(`[Sync] get_sync_meta 失败: ${resp.status}`)
  const rows = (await resp.json()) as Array<{ tbl: string; cnt: number; max_updated_at: string | null }>
  const map: TableMetaMap = {}
  for (const r of rows) {
    const local = LOCAL_BY_REMOTE[r.tbl]
    if (local) map[local] = { cnt: Number(r.cnt), maxUpdatedAt: r.max_updated_at ?? null }
  }
  return map
}

// 失败兜底：逐表 COUNT（旧逻辑，按用户过滤；拿不到 max(updated_at)）
async function fetchTableCountsLegacy(uid: string): Promise<TableMetaMap> {
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']
  const headers: Record<string, string> = { apikey: supabaseKey, 'x-user-id': uid }
  const map: TableMetaMap = {}
  await Promise.all(
    TABLE_NAMES.map(async (tn) => {
      try {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/${remoteTable(tn)}?select=id${userFilter(tn, uid)}&limit=1`,
          // 必须带 Prefer: count=exact，否则 PostgREST 不返回真实总数的 Content-Range
          { headers: { ...headers, Prefer: 'count=exact' } },
        )
        if (resp.ok) {
          const cr = resp.headers.get('content-range')
          const m = cr?.match(/\/(\d+)$/)
          if (m) map[tn] = { cnt: parseInt(m[1], 10), maxUpdatedAt: null }
        }
      } catch {
        /* 忽略单表失败 */
      }
    }),
  )
  return map
}

/**
 * 供 checkForUpdates（报表页的轻量检查）使用。
 *
 * ⚠️ 只用来"数行数"，**不要**在 pullAll 里用它取指纹：兜底分支拿不到
 * max(updated_at)（恒为 null），会被指纹比对误判成"远程没变"而整表跳过，
 * 导致数据永远同步不下来。pullAll 必须直接用 fetchTableMeta，
 * 失败就让 meta 为 null、整体退回全量拉取。
 */
async function getTableCountMap(uid: string): Promise<TableMetaMap> {
  try {
    return await fetchTableMeta(uid)
  } catch (e) {
    console.warn('[Sync] 合并指纹 RPC 失败，回退逐表 COUNT', e)
    return fetchTableCountsLegacy(uid)
  }
}

// ============================================================
// Pull
// ============================================================

interface PullResult {
  /** 本次实际拉到的行数 */
  count: number
  /** 本次拉到的数据里最大的 updated_at（用于推进游标） */
  maxUpdatedAt: string | null
}

/** 读出本地待删除记录（拉取时不能覆盖本地删除操作） */
async function loadLocalDeletedIds(table: any): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const rows = await table.where('_sync_status').equals('pending_delete').toArray()
    rows.forEach((r: any) => out.add(r.id))
  } catch {
    /* 忽略 */
  }
  return out
}

function markSynced(rows: any[], localDeletedIds: Set<string>) {
  return rows
    .filter((row) => !localDeletedIds.has(row.id))
    .map((row) => ({
      ...row,
      _sync_status: 'synced' as SyncStatus,
      _updated_at_local: new Date().toISOString(),
    }))
}

/**
 * 全量拉取单表（id 游标分页），并在结束时顺手清理孤儿记录。
 *
 * 孤儿清理直接用**本次已经拉到的 id 集合**比对，不再像旧实现那样
 * 额外发一轮 `select=id` 把全部 id 再拉一遍（transactions 要 5 个请求）。
 * 只清理本地标记为 synced 的记录：local_dirty 是"本地新增但还没推上去"的，
 * 远程当然没有，绝不能被当成孤儿删掉。
 */
async function pullTableFull(tableName: TableName, uid: string): Promise<PullResult> {
  const table = (db as any)[tableName]
  const { url: baseUrl, headers } = restInfo(tableName, uid)
  const localDeletedIds = await loadLocalDeletedIds(table)

  const remoteIds = new Set<string>()
  let lastId: string | null = null
  let pulled = 0
  let maxUpdatedAt: string | null = null

  while (true) {
    let url = `${baseUrl}?select=*&order=id.asc&limit=${PAGE_SIZE}${userFilter(tableName, uid)}`
    if (lastId) url += `&id=gt.${encodeURIComponent(lastId)}`

    const resp = await fetch(url, { headers })
    if (!resp.ok) {
      throw new Error(`[Sync] 拉取 ${tableName} 失败: ${resp.status} ${await resp.text()}`)
    }
    const data = (await resp.json()) as any[]
    if (!data || data.length === 0) break

    for (const row of data) {
      remoteIds.add(row.id)
      if (row.updated_at && (!maxUpdatedAt || row.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = row.updated_at
      }
    }
    const records = markSynced(data, localDeletedIds)
    if (records.length > 0) await table.bulkPut(records)

    pulled += data.length
    lastId = data[data.length - 1].id
    if (data.length < PAGE_SIZE) break
  }

  await deleteOrphans(tableName, table, remoteIds)
  return { count: pulled, maxUpdatedAt }
}

/**
 * 增量拉取单表：只取 `updated_at >= 游标` 的行。
 *
 * 为什么用 gte 而不是 gt：updated_at 有大量重复值（历史导入按批次插入，
 * 同一批几百行共享同一个 now()），用 gt 会把整个边界批次漏掉。
 * gte 会重复拉一次边界批次，但 bulkPut 是幂等的，代价远小于漏数据。
 *
 * 分页用 offset：增量结果通常只有一页，且同一批数据在拉取期间是稳定的。
 */
async function pullTableIncremental(
  tableName: TableName,
  uid: string,
  since: string,
): Promise<PullResult> {
  const table = (db as any)[tableName]
  const { url: baseUrl, headers } = restInfo(tableName, uid)
  const localDeletedIds = await loadLocalDeletedIds(table)

  let offset = 0
  let pulled = 0
  let maxUpdatedAt: string | null = null

  while (true) {
    const url =
      `${baseUrl}?select=*&updated_at=gte.${encodeURIComponent(since)}` +
      `&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}${userFilter(tableName, uid)}`

    const resp = await fetch(url, { headers })
    if (!resp.ok) {
      throw new Error(`[Sync] 增量拉取 ${tableName} 失败: ${resp.status} ${await resp.text()}`)
    }
    const data = (await resp.json()) as any[]
    if (!data || data.length === 0) break

    for (const row of data) {
      if (row.updated_at && (!maxUpdatedAt || row.updated_at > maxUpdatedAt)) {
        maxUpdatedAt = row.updated_at
      }
    }
    const records = markSynced(data, localDeletedIds)
    if (records.length > 0) await table.bulkPut(records)

    pulled += data.length
    offset += data.length
    if (data.length < PAGE_SIZE) break
  }

  return { count: pulled, maxUpdatedAt }
}

/** 用远程 id 集合删掉本地残留（远程已删、本地还在）的记录；返回实际删除条数 */
async function deleteOrphans(tableName: TableName, table: any, remoteIds: Set<string>): Promise<number> {
  // 空集合说明这次一个远程 id 都没取到（网络/接口异常），此时绝不能清空本地库
  if (remoteIds.size === 0) return 0
  try {
    // 只比对 synced 的记录：local_dirty 是本地待推送的，远程没有属正常
    const localIds: string[] = await table.where('_sync_status').equals('synced').primaryKeys()
    const orphans = localIds.filter((id) => !remoteIds.has(id))
    if (orphans.length > 0) {
      await table.bulkDelete(orphans)
      console.log(`[Sync] 清理 ${tableName} 孤儿记录: ${orphans.length} 条`)
      return orphans.length
    }
  } catch (e) {
    console.warn(`[Sync] 清理 ${tableName} 孤儿失败`, e)
  }
  return 0
}

/**
 * 拉取指定单表的孤儿：仅用于「检测到远程行数变少」时。
 * 需要把远程 id 全量拉一遍，所以只在真的发生删除时调用（低频）。
 */
async function cleanOrphans(tableName: TableName, uid: string): Promise<void> {
  const table = (db as any)[tableName]
  const { url: baseUrl, headers } = restInfo(tableName, uid)
  const remoteIds = new Set<string>()
  let offset = 0
  while (true) {
    const url =
      `${baseUrl}?select=id${userFilter(tableName, uid)}&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`
    const resp = await fetch(url, { headers })
    if (!resp.ok) return
    const data = (await resp.json()) as any[]
    if (!data || data.length === 0) break
    for (const row of data) remoteIds.add(row.id)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  await deleteOrphans(tableName, table, remoteIds)
}

interface PullAllResult {
  /** 远程总行数（与 checkForUpdates 口径一致，Reports 页用作增量判断基准） */
  total: number
  /** 本次实际拉回的行数 */
  pulled: number
  /**
   * 本次因「远程已删除」而清掉的本地行数。
   * 必须单独统计：删除不会体现在「拉回的行数」里，只看 pulled 会把
   * 「远程纯删除」误判成「本地毫无变化」，调用方便不重读本地库、UI 残留已删记录。
   * 即：**只有 `pulled === 0 && deleted === 0` 才代表本地数据没变**。
   */
  deleted: number
}

/**
 * 从 Supabase 拉取所有表的变更。
 *
 * 核心优化：先取一次远程指纹，只拉真正变更的表；remote 无变更且本地不缺数据时，
 * 该表一个请求都不发。
 */
async function pullAllWithStats(userId: string, onProgress?: (p: PullProgress) => void): Promise<PullAllResult> {
  const uid = getSupabaseUserId() || userId

  onProgress?.({ percent: 0, status: 'counting' })

  // 1 次 RPC 拿远程指纹；失败则本次全部退回全量（保守但正确）
  let meta: TableMetaMap | null = null
  try {
    meta = await fetchTableMeta(uid)
  } catch (e) {
    console.warn('[Sync] 取远程指纹失败，本次回退全量拉取', e)
  }

  let fetched = 0
  let deleted = 0
  let done = 0

  await runWithConcurrency(TABLE_NAMES, TABLE_CONCURRENCY, async (tableName) => {
    try {
      const table = (db as any)[tableName]
      const fp = await getFingerprint(tableName)
      const remote = meta?.[tableName]

      const localCnt: number = await table.count()
      // 本地记录数还没"上次同步时远程的行数"多 → 本地数据可能被清过，强制全量修回来
      const localSuspect = !fp || localCnt < fp.cnt

      const changed =
        !fp ||
        !remote ||
        fp.cnt !== remote.cnt ||
        (fp.maxUpdatedAt ?? null) !== (remote.maxUpdatedAt ?? null)
      // 注意：兜底条件不能写成 `!fp.maxUpdatedAt`——空表的 max(updated_at) 本来就是 null，
      // 那样会让空表（如 profiles）每次启动都全量拉一遍。
      const fullDue = !fp || Date.now() - (fp.fullSyncedAt ?? 0) > FULL_SYNC_INTERVAL_MS
      // 拿不到 updated_at（例如回退到逐表 COUNT）时无法做增量
      const hasCursor = !!fp?.maxUpdatedAt

      let res: PullResult
      let fullDone = false

      if (!meta || !remote || !fp || fullDue || localSuspect) {
        // 拿不到远程指纹 / 首次同步 / 到全量兜底周期 / 本地疑似缺数据
        res = await pullTableFull(tableName, uid)
        fullDone = true
      } else if (!changed) {
        // 远程无变更 → 真正 0 请求（空表也走这里）
        return
      } else if (!hasCursor) {
        // 检测到变更但没有游标 → 保守全量
        res = await pullTableFull(tableName, uid)
        fullDone = true
      } else {
        res = await pullTableIncremental(tableName, uid, fp.maxUpdatedAt!)
        // 远程行数变少 → 有删除，用一次 id 全量比对清理本地孤儿
        if (remote.cnt < fp.cnt) await cleanOrphans(tableName, uid)
      }

      fetched += res.count

      if (remote) {
        await setFingerprint(tableName, {
          cnt: remote.cnt,
          // 游标只推进到「本次确实拉到的最大 updated_at」，绝不越过已覆盖范围
          maxUpdatedAt: res.maxUpdatedAt ?? fp?.maxUpdatedAt ?? null,
          fullSyncedAt: fullDone ? Date.now() : (fp?.fullSyncedAt ?? 0),
        })
      }
    } catch (err) {
      // 单表失败不影响其它表；指纹未更新，下次启动会重试该表
      console.error(`[Sync] 拉取 ${tableName} 异常:`, err)
    } finally {
      done++
      onProgress?.({
        percent: Math.round((done / TABLE_NAMES.length) * 100),
        status: 'pulling',
      })
    }
  })

  onProgress?.({ percent: 100, status: 'done' })

  // total 保持与 checkForUpdates 同口径（远程总行数），Reports 页用作增量判断基准
  const total = meta ? TABLE_NAMES.reduce((s, tn) => s + (meta?.[tn]?.cnt ?? 0), 0) : fetched
  return { total, pulled: fetched, deleted }
}

/** 对外保持"返回远程总行数"的原契约（Reports 页依赖） */
async function pullAll(userId: string, onProgress?: (p: PullProgress) => void): Promise<number> {
  return (await pullAllWithStats(userId, onProgress)).total
}

/**
 * 后台轻量检查：仅做一次合并指纹请求（RPC get_sync_meta），返回远程总行数。
 * 用于判断自上次同步以来是否有新增数据，不拉取全量，节省流量。
 */
async function checkForUpdates(userId: string): Promise<number> {
  const uid = getSupabaseUserId() || userId
  const map = await getTableCountMap(uid)
  return TABLE_NAMES.reduce((s, tn) => s + (map[tn]?.cnt ?? 0), 0)
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

  // 清理同步字段后上传（去掉本地专用字段）
  const clean = (record: any) => {
    const { _sync_status, _updated_at_local, ...rest } = record
    return rest
  }
  const markSyncedLocally = async (ids: string[]) => {
    const now = new Date().toISOString()
    for (const id of ids) {
      await table.update(id, { _sync_status: 'synced', _updated_at_local: now })
    }
  }
  // 一次 POST 推多条（PostgREST 支持数组 body 批量 upsert，return=minimal 不回传行）
  const postRecords = async (records: any[]) => {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${remoteTable(tableName)}?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'x-user-id': uid,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates, return=minimal',
      },
      body: JSON.stringify(records),
    })
    if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`)
  }

  if (dirtyRecords.length > 0) {
    // 原来逐条 POST：导入 30 条持仓就是 30 次请求。这里常见路径压成 1 次。
    try {
      await postRecords(dirtyRecords.map(clean))
      await markSyncedLocally(dirtyRecords.map((r: any) => r.id))
    } catch (err) {
      // 整批失败可能是里面混了一条脏数据 → 退回逐条，把坏的隔离出来，
      // 其余照常推送（与原来的逐条语义一致，只是不再是无条件的 N 次请求）。
      console.warn(`[Sync] 批量推送 ${tableName} 失败，改为逐条重试`, err)
      for (const record of dirtyRecords) {
        try {
          await postRecords([clean(record)])
          await markSyncedLocally([record.id])
        } catch (e) {
          console.error(`[Sync] 推送 ${tableName}#${record.id} 失败:`, e)
          // 保持 local_dirty，等下次重试
        }
      }
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
 * 1. 首次使用（本地无数据）→ 全量拉取
 * 2. 已有数据 → 先推送本地变更，再按指纹做增量拉取
 *
 * @returns `pulled` 本次实际拉回的行数、`deleted` 因远程删除而清掉的本地行数。
 *          **只有两者都为 0 才代表本地数据毫无变化**，调用方此时才可跳过重读本地库
 *          （重读 9 张表含 4000+ 条交易纯属浪费）。只看 `pulled` 会漏掉「远程纯删除」。
 */
async function syncOnStartup(userId: string): Promise<{ pulled: number; deleted: number }> {
  // 检查是否首次使用（本地无数据则跳过 push）
  const hasData = await db.accounts.count() > 0

  if (!hasData) {
    console.log('[Sync] 首次使用，全量同步...')
    const { pulled, deleted } = await pullAllWithStats(userId)
    console.log('[Sync] ✅ 全量同步完成')
    return { pulled, deleted }
  }

  console.log('[Sync] 同步中...')

  // 1. 先推送本地未同步的变更
  await pushAll(userId)

  // 2. 按远程指纹增量拉取（无变更的表直接跳过）
  const { pulled, deleted } = await pullAllWithStats(userId)

  console.log('[Sync] ✅ 同步完成')
  return { pulled, deleted }
}

// ============================================================
// 写入后同步 (fire-and-forget)
// ============================================================

// 同一个表在短时间内的多次写入合并成一次推送。
// 批量导入时「每写一条就 push 一次」会退化成 O(N²) 次请求（每次 push 都要
// 全表扫 dirty 并逐条 POST），去抖后一轮导入只需 1 次推送。
const WRITE_PUSH_DEBOUNCE_MS = 400
const pushTimers = new Map<TableName, ReturnType<typeof setTimeout>>()
const pushWaiters = new Map<TableName, Array<() => void>>()

/**
 * 单表写入后触发的同步（非阻塞，且短时间内的多次调用会合并）
 */
function syncAfterWrite(tableName: TableName, userId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const waiters = pushWaiters.get(tableName) ?? []
    waiters.push(resolve)
    pushWaiters.set(tableName, waiters)

    const existing = pushTimers.get(tableName)
    if (existing) clearTimeout(existing)
    pushTimers.set(
      tableName,
      setTimeout(async () => {
        pushTimers.delete(tableName)
        const pending = pushWaiters.get(tableName) ?? []
        pushWaiters.delete(tableName)
        try {
          await pushTable(tableName, userId)
        } catch (err) {
          console.error(`[Sync] 写入后同步 ${tableName} 失败:`, err)
        } finally {
          // 所有被合并的调用方都要 resolve，避免留下永不落定的 Promise
          pending.forEach((r) => r())
        }
      }, WRITE_PUSH_DEBOUNCE_MS),
    )
  })
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
  await db.transfers.clear()
  await db.budgets.clear()
  await db.subCategories.clear()
  await db.tags.clear()
  await db.profiles.clear()
  await db.holdings_transactions.clear()
  // 必须同时清掉同步指纹：否则下次登录会以为"远程没变"而跳过拉取，
  // 导致本地空库一直空着（指纹里的 cnt 还在，但数据已被清空）。
  await db.syncMeta.clear()
  removeNetworkListener()
  console.log('[Sync] ✅ 本地数据已清除')
}

// ============================================================
// 定时同步
// ============================================================

let timerInterval: ReturnType<typeof setInterval> | null = null

// S1（简单版）：关闭 5 分钟定时全量拉取，避免无变更时也每 5 分钟把全部
// 交易（数千条）重拉一遍。远程变更改为在「App 启动 (syncOnStartup)」与
// 「网络恢复 (online 事件)」两个时机拉回（现已带指纹判断，无变更时 0 请求）；
// 本地增改删仍由 syncAfterWrite 即时推送。后台不再自动轮询，需等下次启动/联网。
function startPeriodicSync(userId: string, intervalMs: number = 5 * 60 * 1000): void {
  void userId
  void intervalMs
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
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
  checkForUpdates,
  pushAll,
  syncOnStartup,
  syncAfterWrite,
  setupNetworkListener,
  removeNetworkListener,
  clearAllData,
  startPeriodicSync,
  stopPeriodicSync,
}
