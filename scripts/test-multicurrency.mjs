// 多币种端到端测试（针对"美股/港股界面不可用"修复）
// 前置：本地 wrangler dev 已在 BASE 上运行（含 Functions）
// 用法：node scripts/test-multicurrency.mjs
//       BASE=http://127.0.0.1:8799 node scripts/test-multicurrency.mjs

const BASE = process.env.BASE || 'http://127.0.0.1:8799'

let pass = 0
let fail = 0
const failures = []

function assert(cond, name, detail) {
  if (cond) {
    pass++
    console.log(`  \u2713 ${name}`)
  } else {
    fail++
    failures.push({ name, detail })
    console.log(`  \u2717 ${name}  -> ${detail}`)
  }
}

async function postJSON(path, body, headers = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: res.status, json, raw: text }
  } finally {
    clearTimeout(t)
  }
}

async function getJSON(path) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(BASE + path, { method: 'GET', signal: ctrl.signal })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { status: res.status, json, raw: text }
  } finally {
    clearTimeout(t)
  }
}

const isNum = (n) => typeof n === 'number' && isFinite(n)

// 构造跨市场持仓（美股/港股/大A/基金各一只）
function sampleItems() {
  return [
    { symbol: '600519', market: 'CN', cost_price: 1800, quantity: 100 },
    { symbol: '00700', market: 'HK', cost_price: 400, quantity: 100 },
    { symbol: 'AAPL', market: 'US', cost_price: 180, quantity: 10 },
    { symbol: '110011', market: 'FUND', cost_price: 3.5, quantity: 1000 },
  ]
}

// 前端折算逻辑（与 src/utils/currency.ts 的 convert 一致）用于交叉验证后端汇率
// rates[x] = 「1 x = ? CNY」：USD=6.8 → 1 USD=6.8 CNY；HKD=0.862 → 1 HKD=0.862 CNY
function convert(amount, from, to, rates) {
  if (from === to) return amount
  const fromToCNY = rates[from] ?? 1 // 1 from = ? CNY
  const cny = amount * fromToCNY
  const cnyToTarget = to === 'CNY' ? 1 : 1 / (rates[to] ?? 1) // 1 CNY = ? to
  return cny * cnyToTarget
}

async function testBackendMultiCurrency() {
  console.log('\n[A] 后端批量估值：多币种原样返回（核心修复点）')
  const r = await postJSON('/api/valuation/batch', { items: sampleItems() })
  assert(r.status === 200, '返回 200', `status=${r.status}`)
  assert(r.json && r.json.code === 0, 'code=0', JSON.stringify(r.json)?.slice(0, 160))
  const results = r.json?.data?.results || []
  assert(results.length === 4, '返回 4 条结果', `len=${results.length}`)
  const bySym = Object.fromEntries(results.map((x) => [x.symbol, x]))

  // 各资产币种必须正确（这是"界面不能用"的根因）
  assert(bySym['600519']?.currency === 'CNY', 'A股 600519 币种=CNY', bySym['600519']?.currency)
  assert(bySym['00700']?.currency === 'HKD', '港股 00700 币种=HKD（修复关键）', bySym['00700']?.currency)
  assert(bySym['AAPL']?.currency === 'USD', '美股 AAPL 币种=USD（修复关键）', bySym['AAPL']?.currency)
  assert(bySym['110011']?.currency === 'CNY', '基金 110011 币种=CNY', bySym['110011']?.currency)

  // 市值必须用自身币种计算（数量 × 原币种现价），不是折算后的 RMB
  // AAPL: 10 股 × 现价(USD) 应为两位数 ~ 千元以下（如 3000USD 量级），绝不应是人民币量级的 1.8万
  const aapl = bySym['AAPL']
  assert(isNum(aapl?.market_value) && aapl.market_value > 0, '美股市值>0 且为数字', String(aapl?.market_value))
  // 港股市值 = 100股 × HKD 现价(几百)，应明显小于同数量 A股（若被错误按人民币展示会极大）
  const hk = bySym['00700']
  assert(isNum(hk?.market_value) && hk.market_value > 0, '港股市值>0', String(hk?.market_value))

  // 后端不再做跨币种合计（各币种相加无意义），total 恒 0
  assert(r.json?.data?.total_market_value === 0, 'total_market_value 恒为 0（前端本地折算）', String(r.json?.data?.total_market_value))
  assert(r.json?.data?.total_profit_loss === 0, 'total_profit_loss 恒为 0', String(r.json?.data?.total_profit_loss))

  // 汇率表必须带回，且 USD/HKD 汇率合理（>0），这是前端折算依据
  const rates = r.json?.data?.exchange_rates || {}
  assert(rates.CNY === 1, '汇率表 CNY 基准=1', JSON.stringify(rates))
  assert(isNum(rates.USD) && rates.USD > 0, '汇率表含 USD 且>0', JSON.stringify(rates))
  assert(isNum(rates.HKD) && rates.HKD > 0, '汇率表含 HKD 且>0', JSON.stringify(rates))

  // target_currency 参数应被忽略（仍返回自身币种）
  const r2 = await postJSON('/api/valuation/batch', { items: sampleItems(), target_currency: 'USD' })
  const bySym2 = Object.fromEntries((r2.json?.data?.results || []).map((x) => [x.symbol, x]))
  assert(bySym2['00700']?.currency === 'HKD', '传 target=USD 时港股仍为 HKD（忽略折算）', bySym2['00700']?.currency)
  assert(bySym2['AAPL']?.currency === 'USD', '传 target=USD 时美股仍为 USD', bySym2['AAPL']?.currency)

  return { rates }
}

async function testDetailCurrency() {
  console.log('\n[B] 单资产行情：币种字段')
  const cases = [
    ['600519', 'CN', 'CNY'],
    ['00700', 'HK', 'HKD'],
    ['AAPL', 'US', 'USD'],
    ['110011', 'FUND', 'CNY'],
  ]
  for (const [sym, mkt, expectCur] of cases) {
    const r = await getJSON(`/api/quote/detail?symbol=${sym}&market=${mkt}`)
    assert(r.status === 200 && r.json?.code === 0, `${mkt} ${sym} detail 成功`, JSON.stringify(r.json)?.slice(0, 120))
    assert(r.json?.data?.currency === expectCur, `${mkt} ${sym} 币种=${expectCur}`, r.json?.data?.currency)
    assert(isNum(r.json?.data?.current_price), `${mkt} ${sym} 现价数字`, String(r.json?.data?.current_price))
  }
}

// 前端折算逻辑交叉验证：用真实汇率把各资产市值折算到 CNY，结果与手算一致
async function testFrontendConversion(rates) {
  console.log('\n[C] 前端折算逻辑交叉验证（convert/toBase）')
  console.log('DBG rates=' + JSON.stringify(rates))
  // 假设后端返回：AAPL 市值 3139.2 USD、00700 市值 52923 HKD、600519 市值 120498 CNY
  const aaplUSD = 3139.2
  const hkHKD = 52923
  const cnCNY = 120498

  const aaplInCNY = convert(aaplUSD, 'USD', 'CNY', rates)
  const hkInCNY = convert(hkHKD, 'HKD', 'CNY', rates)
  const cnInCNY = convert(cnCNY, 'CNY', 'CNY', rates) // 不变

  assert(isNum(aaplInCNY) && aaplInCNY > 0, 'USD→CNY 折算>0', String(aaplInCNY))
  assert(isNum(hkInCNY) && hkInCNY > 0, 'HKD→CNY 折算>0', String(hkInCNY))
  assert(cnInCNY === cnCNY, 'CNY→CNY 不变', `${cnInCNY} vs ${cnCNY}`)

  // 折算后港美股以人民币计应有合理量级（不是原币种错误展示）
  // AAPL 3139 USD × ~7 ≈ 2万 CNY；HKD 52923 × ~0.92 ≈ 4.8万 CNY
  assert(aaplInCNY > aaplUSD, 'USD→CNY 量级放大（USD 价值更高）', `${aaplInCNY} vs ${aaplUSD}`)
  assert(hkInCNY < hkHKD && hkInCNY > 0, 'HKD→CNY 量级缩小', `${hkInCNY} vs ${hkHKD}`)

  // 同币种本币切换（HKD 本位币时，HKD 资产不动、USD 资产折算到 HKD）
  const hkAsBase = convert(aaplUSD, 'USD', 'HKD', rates)
  assert(isNum(hkAsBase) && hkAsBase > 0, 'USD→HKD 折算>0（本位币切换）', String(hkAsBase))

  return { aaplInCNY, hkInCNY, cnInCNY }
}

async function main() {
  console.log(`\n=== 多币种端到端测试 @ ${BASE} ===`)
  let rates
  try {
    const a = await testBackendMultiCurrency()
    rates = a.rates
    await testDetailCurrency()
    await testFrontendConversion(rates)
  } catch (e) {
    console.error('\n测试运行异常:', e)
    fail++
    failures.push({ name: '运行异常', detail: String(e) })
  }
  console.log(`\n=== 结果: 通过 ${pass} / 失败 ${fail} ===`)
  if (fail > 0) {
    console.log('\n失败明细:')
    for (const f of failures) console.log(`  - ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main()
