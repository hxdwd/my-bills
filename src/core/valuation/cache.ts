import type { QuoteCacheValue } from '../../types/api'

// Cloudflare Pages Functions 通过 env 注入的 KV 绑定
export interface KVBindings {
  QUOTE_CACHE: KVNamespace
}

export const QUOTE_TTL = 300 // 5 分钟
export const HISTORY_TTL = 86400 // 1 天

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
