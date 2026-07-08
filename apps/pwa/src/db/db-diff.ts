/**
 * 数据库差异检查工具（本地 Dexie ↔ 远程 Supabase，以远程为准）
 *
 * 用法（浏览器 DevTools Console，需已登录）：
 *    await window.__diffDB.run()          // 执行差异检查并打印报告
 *    await window.__diffDB.run(true)      // 执行检查并自动以远程为准修复本地差异
 *
 * 说明：
 * - 本地数据来自 IndexedDB（Dexie），远程数据通过 Supabase REST（x-user-id RLS）拉取。
 * - “以远程为准”含义：远程是真相源。本地多出但远程没有的记录、以及本地与远程字段
 *   不一致的，以远程覆盖本地；远程有但本地没有的，从远程补回本地。
 * - 不检查 _sync_status / _updated_at_local 这类纯本地同步字段。
 */

import { db } from './database'
import { supabase } from '../services/supabase'
import { getSupabaseUserId } from '../services/supabase'

// 远程表名映射（与 sync-engine 保持一致）
const REMOTE_TABLE_MAP: Record<string, string> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  subCategories: 'sub_categories',
  tags: 'tags',
  profiles: 'profiles',
}

// 每个表需要逐字段对比的业务字段（排除同步/审计字段）
const COMPARE_FIELDS: Record<string, string[]> = {
  accounts: ['name', 'type', 'balance', 'icon', 'color', 'sort_order', 'is_default', 'is_active'],
  categories: ['name', 'icon', 'color', 'type', 'sort_order', 'is_system'],
  transactions: [
    'type', 'amount', 'category_id', 'subcategory_id', 'account_id', 'to_account_id',
    'transaction_date', 'transaction_time', 'tags', 'note', 'images', 'location',
  ],
  budgets: ['month', 'category_id', 'amount'],
  subCategories: ['name', 'color', 'category_id'],
  tags: ['name', 'color'],
  profiles: ['display_name', 'avatar_url', 'currency', 'locale', 'big_expense_threshold'],
}

// 不需要检查的本地内部字段
const LOCAL_ONLY_FIELDS = new Set(['_sync_status', '_updated_at_local', 'created_at', 'updated_at'])

type TableKey = keyof typeof REMOTE_TABLE_MAP

function getClient() {
  const supabaseUrl = (supabase as any)['supabaseUrl']
  const supabaseKey = (supabase as any)['supabaseKey']
  return { supabaseUrl, supabaseKey }
}

/** 从远程拉取某表全部数据（带 x-user-id） */
async function fetchRemote(tableKey: TableKey, userId: string): Promise<any[]> {
  const { supabaseUrl, supabaseKey } = getClient()
  const remoteName = REMOTE_TABLE_MAP[tableKey]
  let url = `${supabaseUrl}/rest/v1/${remoteName}?select=*`
  if (tableKey === 'profiles') {
    url += `&id=eq.${userId}`
  } else {
    url += `&user_id=eq.${userId}`
  }
  const resp = await fetch(url, {
    headers: { apikey: supabaseKey, 'x-user-id': userId },
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`拉取远程 ${remoteName} 失败 ${resp.status}: ${err}`)
  }
  return resp.json() as Promise<any[]>
}

/** 从本地 Dexie 拉取某表全部“有效”数据（排除 pending_delete） */
async function fetchLocal(tableKey: TableKey, userId: string): Promise<any[]> {
  const table: any = (db as any)[tableKey]
  if (tableKey === 'profiles') {
    const rec = await table.get(userId)
    return rec && rec._sync_status !== 'pending_delete' ? [rec] : []
  }
  return table
    .where('user_id').equals(userId)
    .filter((r: any) => r._sync_status !== 'pending_delete')
    .toArray()
}

/** 逐字段对比，返回不一致的字段列表 */
function diffFields(localRow: any, remoteRow: any, fields: string[]): string[] {
  const changed: string[] = []
  for (const f of fields) {
    const lv = localRow[f]
    const rv = remoteRow[f]
    // 数组/对象做 JSON 比较，避免引用差异
    const lvStr = lv == null ? null : (Array.isArray(lv) || typeof lv === 'object') ? JSON.stringify(lv) : String(lv)
    const rvStr = rv == null ? null : (Array.isArray(rv) || typeof rv === 'object') ? JSON.stringify(rv) : String(rv)
    if (lvStr !== rvStr) {
      changed.push(f)
    }
  }
  return changed
}

export interface DiffResult {
  table: TableKey
  localOnly: any[]      // 本地有、远程无（以远程为准 → 应删除本地）
  remoteOnly: any[]     // 远程有、本地无（以远程为准 → 应补回本地）
  mismatched: { id: string; fields: string[]; local: any; remote: any }[] // 字段不一致
  localCount: number
  remoteCount: number
}

async function diffTable(tableKey: TableKey, userId: string): Promise<DiffResult> {
  const [localRows, remoteRows] = await Promise.all([
    fetchLocal(tableKey, userId),
    fetchRemote(tableKey, userId),
  ])
  const fields = COMPARE_FIELDS[tableKey]
  const localMap = new Map(localRows.map(r => [r.id, r]))
  const remoteMap = new Map(remoteRows.map(r => [r.id, r]))

  const localOnly: any[] = []
  const remoteOnly: any[] = []
  const mismatched: DiffResult['mismatched'] = []

  for (const [id, lr] of localMap) {
    if (!remoteMap.has(id)) {
      localOnly.push(lr)
    } else {
      const rr = remoteMap.get(id)!
      const changed = diffFields(lr, rr, fields)
      if (changed.length) mismatched.push({ id, fields: changed, local: lr, remote: rr })
    }
  }
  for (const [id, rr] of remoteMap) {
    if (!localMap.has(id)) remoteOnly.push(rr)
  }

  return {
    table: tableKey,
    localOnly, remoteOnly, mismatched,
    localCount: localRows.length,
    remoteCount: remoteRows.length,
  }
}

/** 把一条远程记录转成本地可 put 的形状（补同步字段） */
function remoteToLocal(remoteRow: any): any {
  return {
    ...remoteRow,
    _sync_status: 'synced',
    _updated_at_local: new Date().toISOString(),
  }
}

/** 以远程为准修复本地：删本地多余、补本地缺失、覆盖字段不一致 */
async function repairTable(result: DiffResult, userId: string): Promise<void> {
  const table: any = (db as any)[result.table]
  // 1. 本地多余 → 删除
  if (result.localOnly.length) {
    await table.bulkDelete(result.localOnly.map((r: any) => r.id))
  }
  // 2. 远程有本地无 → 补回
  const toPut = [
    ...result.remoteOnly.map(remoteToLocal),
    ...result.mismatched.map(m => remoteToLocal(m.remote)),
  ]
  if (toPut.length) {
    await table.bulkPut(toPut)
  }
}

function printReport(results: DiffResult[]): void {
  console.log('%c===== 本地 Dexie ↔ 远程 Supabase 差异报告（以远程为准）=====', 'color:#2563eb;font-weight:bold')
  let totalIssues = 0
  for (const r of results) {
    const issues = r.localOnly.length + r.remoteOnly.length + r.mismatched.length
    totalIssues += issues
    console.log(`\n📋 表 ${r.table}  | 本地 ${r.localCount} 条 / 远程 ${r.remoteCount} 条 | 差异 ${issues} 处`)
    if (r.localOnly.length) {
      console.log(`  ⚠️ 本地多出 ${r.localOnly.length} 条（远程无，应删除本地）:`,
        r.localOnly.map((x: any) => x.id))
    }
    if (r.remoteOnly.length) {
      console.log(`  ⚠️ 本地缺失 ${r.remoteOnly.length} 条（远程有，应补回本地）:`,
        r.remoteOnly.map((x: any) => x.id))
    }
    if (r.mismatched.length) {
      console.log(`  ⚠️ 字段不一致 ${r.mismatched.length} 条:`)
      r.mismatched.forEach(m => {
        console.log(`    - ${m.id} 字段[${m.fields.join(', ')}]`)
        m.fields.forEach(f => {
          console.log(`        本地:`, m.local[f], `|| 远程:`, m.remote[f])
        })
      })
    }
    if (issues === 0) console.log('  ✅ 无差异')
  }
  console.log(`\n===== 总计差异 ${totalIssues} 处 =====`)
  if (totalIssues === 0) console.log('🎉 本地与远程完全一致（以远程为准）')
}

export async function runDiff(repair = false): Promise<DiffResult[]> {
  const userId = getSupabaseUserId()
  if (!userId) throw new Error('未登录：请先在应用中登录，再在 Console 调用 window.__diffDB.run()')

  const tables = Object.keys(REMOTE_TABLE_MAP) as TableKey[]
  const results: DiffResult[] = []
  for (const t of tables) {
    try {
      const res = await diffTable(t, userId)
      results.push(res)
      if (repair && (res.localOnly.length || res.remoteOnly.length || res.mismatched.length)) {
        await repairTable(res, userId)
        console.log(`🔧 已以远程为准修复表 ${t}`)
      }
    } catch (err) {
      console.error(`差异检查表 ${t} 出错:`, err)
    }
  }
  printReport(results)
  return results
}

// 暴露到 window，方便在 DevTools Console 直接调用
;(window as any).__diffDB = {
  run: (repair = false) => runDiff(repair),
}

export const dbDiff = { run: runDiff }
