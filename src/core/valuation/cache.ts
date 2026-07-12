import type { QuoteCacheValue } from '../../types/api'

// Cloudflare Pages Functions 通过 env 注入的 KV 绑定
export interface KVBindings {
  QUOTE_CACHE: KVNamespace
}

export const QUOTE_TTL = 300 // 5 分钟
export const HISTORY_TTL = 86400 // 1 天
// 黄金价格变化慢，且单源回源约 1.5s 是 batch 的主要耗时来源，
// 故黄金行情缓存用更长的 TTL，显著减少回源次数。
export const GOLD_TTL = 10 * 60 // 10 分钟

// 读取行情缓存；未命中或解析失败返回 null
export async function getQuoteCache(
  kv: KVNamespace,
  key: string
): Promise<QuoteCacheValue | null> {
  try {
    const raw = await kv.get(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as QuoteCacheValue
    if (typeof parsed.price !== 'number' || typeof parsed.timestamp !== 'number') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// 写入行情缓存（TTL 300s）。失败仅记录，不抛出（缓存是优化项）。
export async function setQuoteCache(
  kv: KVNamespace,
  key: string,
  value: QuoteCacheValue
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: QUOTE_TTL })
  } catch (e) {
    console.error('[cache] setQuoteCache failed', key, e)
  }
}

export async function getHistoryCache(
  kv: KVNamespace,
  key: string
): Promise<string | null> {
  try {
    return await kv.get(key)
  } catch {
    return null
  }
}

export async function setHistoryCache(
  kv: KVNamespace,
  key: string,
  value: string
): Promise<void> {
  try {
    await kv.put(key, value, { expirationTtl: HISTORY_TTL })
  } catch (e) {
    console.error('[cache] setHistoryCache failed', key, e)
  }
}

// ============ 汇率缓存 ============

const FX_CACHE_KEY = 'fx:latest'

export interface FxCache {
  rates: Record<string, number> // 以 CNY 为基准：rates['USD'] 表示 1 CNY = ? USD
  timestamp: number
}

export async function getFxCache(kv: KVNamespace): Promise<FxCache | null> {
  try {
    const raw = await kv.get(FX_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FxCache
    if (typeof parsed.rates !== 'object' || parsed.rates === null) return null
    return parsed
  } catch {
    return null
  }
}

export async function setFxCache(kv: KVNamespace, fx: FxCache): Promise<void> {
  try {
    await kv.put(FX_CACHE_KEY, JSON.stringify(fx), { expirationTtl: QUOTE_TTL })
  } catch (e) {
    console.error('[cache] setFxCache failed', e)
  }
}

// ============ 黄金专用缓存（长 TTL + 允许过期降级） ============
// 黄金单源回源约 1.5s，是 batch 主要耗时；且价格变化慢。
// 用独立的 gold: 前缀 key，TTL 较长；读取时即使超过 TTL 也允许在
// GOLD_STALE_GRACE 内返回旧价（stale-while-error 兜底），避免回源失败时报错。

const GOLD_CACHE_KEY = 'gold:AU9999'
// 超过 TTL 但在该宽限期内，仍返回旧价（视为可用降级值）
const GOLD_STALE_GRACE_MS = 6 * 60 * 60 * 1000 // 6 小时

export interface GoldCacheResult {
  value: QuoteCacheValue | null
  // 'fresh' = TTL 内; 'stale' = 超 TTL 但在宽限期内（降级可用）; 'none' = 无缓存
  state: 'fresh' | 'stale' | 'none'
}

export async function getGoldCache(kv: KVNamespace): Promise<GoldCacheResult> {
  try {
    const raw = await kv.get(GOLD_CACHE_KEY)
    if (!raw) return { value: null, state: 'none' }
    const parsed = JSON.parse(raw) as QuoteCacheValue
    if (typeof parsed.price !== 'number' || typeof parsed.timestamp !== 'number') {
      return { value: null, state: 'none' }
    }
    const age = Date.now() - parsed.timestamp
    if (age < GOLD_TTL * 1000) return { value: parsed, state: 'fresh' }
    if (age < GOLD_STALE_GRACE_MS) return { value: parsed, state: 'stale' }
    return { value: null, state: 'none' }
  } catch {
    return { value: null, state: 'none' }
  }
}

export async function setGoldCache(kv: KVNamespace, val: QuoteCacheValue): Promise<void> {
  try {
    await kv.put(GOLD_CACHE_KEY, JSON.stringify(val), { expirationTtl: GOLD_TTL })
  } catch (e) {
    console.error('[cache] setGoldCache failed', e)
  }
}
