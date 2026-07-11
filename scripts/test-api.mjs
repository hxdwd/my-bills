// 资产估值 API 接口测试脚本（本地 wrangler dev 模式运行）
// 用法：先启动 `npx wrangler pages dev apps/pwa/dist --port 8799`，
//       另开终端运行 `node scripts/test-api.mjs`
// 本脚本假设服务已运行在 BASE 上。

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
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, raw: text }
}

async function getJSON(path) {
  const res = await fetch(BASE + path, { method: 'GET' })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, raw: text }
}

const isNum = (n) => typeof n === 'number' && isFinite(n)

async function testBatch() {
  console.log('\n[1] POST /api/valuation/batch')
  // 1.1 混合市场正常估值
  const r = await postJSON('/api/valuation/batch', {
    items: [
      { symbol: '600519', market: 'CN', cost_price: 1800, quantity: 100 },
      { symbol: '00700', market: 'HK', cost_price: 400, quantity: 100 },
      { symbol: 'AAPL', market: 'US', cost_price: 180, quantity: 10 },
      { symbol: '110011', market: 'FUND', cost_price: 3.5, quantity: 1000 },
    ],
    target_currency: 'CNY',
  })
  assert(r.status === 200, '返回 200', `status=${r.status}`)
  assert(r.json && r.json.code === 0, 'code=0', JSON.stringify(r.json))
  const results = r.json?.data?.results || []
  assert(results.length === 4, '返回 4 条结果', `len=${results.length}`)
  const bySym = Object.fromEntries(results.map((x) => [x.symbol, x]))
  // A股
  assert(bySym['600519']?.current_price != null && isNum(bySym['600519'].current_price), 'A股 600519 有价格', JSON.stringify(bySym['600519']))
  assert(bySym['600519']?.currency === 'CNY', 'A股币种 CNY', bySym['600519']?.currency)
  assert(isNum(bySym['600519']?.market_value), 'A股有市值', bySym['600519']?.market_value)
  // 港股
  assert(bySym['00700']?.current_price != null, '港股 00700 有价格', JSON.stringify(bySym['00700']))
  assert(bySym['00700']?.currency === 'HKD', '港股币种 HKD', bySym['00700']?.currency)
  // 美股
  assert(bySym['AAPL']?.current_price != null, '美股 AAPL 有价格', JSON.stringify(bySym['AAPL']))
  assert(bySym['AAPL']?.currency === 'USD', '美股币种 USD', bySym['AAPL']?.currency)
  // 基金
  assert(bySym['110011']?.current_price != null, '基金 110011 有净值', JSON.stringify(bySym['110011']))
  assert(bySym['110011']?.currency === 'CNY', '基金币种 CNY', bySym['110011']?.currency)
  assert(isNum(bySym['110011']?.profit_rate), '基金有收益率', bySym['110011']?.profit_rate)
  // 汇总
  assert(isNum(r.json?.data?.total_market_value), '汇总总市值存在', r.json?.data?.total_market_value)
  assert(r.json?.data?.total_currency === 'CNY', '目标币种 CNY', r.json?.data?.total_currency)
  assert(r.json?.data?.exchange_rates?.USD > 0, '含 USD 汇率', JSON.stringify(r.json?.data?.exchange_rates))

  // 1.2 空 items -> 400
  const r2 = await postJSON('/api/valuation/batch', { items: [] })
  assert(r2.status === 400, '空 items 返回 400', `status=${r2.status}`)

  // 1.3 超过 50 条 -> 400
  const many = Array.from({ length: 51 }, (_, i) => ({ symbol: '600519', market: 'CN', quantity: 1 }))
  const r3 = await postJSON('/api/valuation/batch', { items: many })
  assert(r3.status === 400, '超 50 条返回 400', `status=${r3.status}`)

  // 1.4 非法 JSON -> 400
  const r4 = await fetch(BASE + '/api/valuation/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  })
  assert(r4.status === 400, '非法 JSON 返回 400', `status=${r4.status}`)

  // 1.5 不存在的代码 -> 该条 error，不整体失败
  const r5 = await postJSON('/api/valuation/batch', {
    items: [{ symbol: '000000', market: 'CN', quantity: 1 }],
  })
  const item5 = r5.json?.data?.results?.[0]
  assert(r5.status === 200 && item5?.error, '无效代码单条报错但不整体失败', JSON.stringify(item5))
}

async function testDetail() {
  console.log('\n[2] GET /api/quote/detail')
  const cases = [
    ['600519', 'CN'],
    ['00700', 'HK'],
    ['AAPL', 'US'],
    ['110011', 'FUND'],
  ]
  for (const [sym, mkt] of cases) {
    const r = await getJSON(`/api/quote/detail?symbol=${sym}&market=${mkt}`)
    assert(r.status === 200 && r.json?.code === 0, `${mkt} ${sym} detail 成功`, JSON.stringify(r.json))
    assert(isNum(r.json?.data?.current_price), `${mkt} ${sym} 有价格`, r.json?.data?.current_price)
    assert(typeof r.json?.data?.currency === 'string', `${mkt} ${sym} 有币种`, r.json?.data?.currency)
  }
  // 缺 symbol -> 400
  const rMiss = await getJSON('/api/quote/detail')
  assert(rMiss.status === 400, '缺 symbol 返回 400', `status=${rMiss.status}`)
}

async function testHistory() {
  console.log('\n[3] GET /api/quote/history')
  // 已知缺口：港股历史源（腾讯/新浪/东财港股K线）在本环境均不可用，
  // 接口会正常返回 200 + 空数组（前端需对此兜底）。其余市场应有真实数据。
  const cases = [
    ['600519', 'CN', true],
    ['00700', 'HK', false], // 预期可能为空（已知缺口）
    ['AAPL', 'US', true],
    ['110011', 'FUND', true],
  ]
  for (const [sym, mkt, expectData] of cases) {
    const r = await getJSON(`/api/quote/history?symbol=${sym}&market=${mkt}&period=3m`)
    assert(r.status === 200 && r.json?.code === 0, `${mkt} ${sym} history 接口正常`, JSON.stringify(r.json)?.slice(0, 120))
    const arr = r.json?.data || []
    assert(Array.isArray(arr), `${mkt} ${sym} 返回数组`, `type=${typeof arr}`)
    if (expectData) {
      assert(arr.length > 0, `${mkt} ${sym} 返回走势点`, `len=${arr.length}`)
      if (arr.length > 0) {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(arr[0].date) && isNum(arr[0].price), `${mkt} ${sym} 首点格式正确`, JSON.stringify(arr[0]))
      }
    } else {
      console.log(`  (i) ${mkt} ${sym} 历史数据为空（已知缺口：港股历史源暂不可用，前端需兜底）`)
    }
  }
}

async function testSearch() {
  console.log('\n[4] GET /api/quote/search')
  // 4.1 中文名搜索 A股
  const r1 = await getJSON('/api/quote/search?q=' + encodeURIComponent('茅台'))
  assert(r1.status === 200 && r1.json?.code === 0, '茅台 搜索成功', JSON.stringify(r1.json)?.slice(0, 200))
  const a = r1.json?.data?.results || []
  assert(a.length > 0, '茅台 返回候选', `len=${a.length}`)
  assert(a[0].symbol && a[0].market && a[0].name, '茅台 字段完整', JSON.stringify(a[0]))
  assert(a.some((x) => x.market === 'CN'), '茅台 含 CN 市场', JSON.stringify(a[0]))
  if (a.length) console.log('    样本:', JSON.stringify(a.slice(0, 2)))

  // 4.2 港股中文名
  const r2 = await getJSON('/api/quote/search?q=' + encodeURIComponent('腾讯'))
  const hk = r2.json?.data?.results || []
  assert(r2.status === 200 && r2.json?.code === 0, '腾讯 搜索成功', `status=${r2.status}`)
  assert(hk.some((x) => x.market === 'HK'), '腾讯 含 HK 市场', JSON.stringify(hk[0]))
  if (hk.length) console.log('    样本:', JSON.stringify(hk.slice(0, 2)))

  // 4.3 美股英文名
  const r3 = await getJSON('/api/quote/search?q=apple')
  const us = r3.json?.data?.results || []
  assert(r3.status === 200 && r3.json?.code === 0, 'apple 搜索成功', `status=${r3.status}`)
  assert(us.some((x) => x.market === 'US'), 'apple 含 US 市场', JSON.stringify(us[0]))
  if (us.length) console.log('    样本:', JSON.stringify(us.slice(0, 2)))

  // 4.4 基金（代码 110011）
  const r4 = await getJSON('/api/quote/search?q=110011')
  const fund = r4.json?.data?.results || []
  assert(r4.status === 200 && r4.json?.code === 0, '110011 搜索成功', `status=${r4.status}`)
  if (fund.length) console.log('    样本:', JSON.stringify(fund.slice(0, 2)))

  // 4.5 代码搜索（纯数字 A股代码）
  const r5 = await getJSON('/api/quote/search?q=600519')
  assert(r5.status === 200 && r5.json?.code === 0, '600519 代码搜索成功', `status=${r5.status}`)

  // 4.6 空 q -> 400
  const r6 = await getJSON('/api/quote/search?q=')
  assert(r6.status === 400, '空 q 返回 400', `status=${r6.status}`)

  // 4.7 无匹配关键词 -> 200 + 空数组
  const r7 = await getJSON('/api/quote/search?q=' + encodeURIComponent('zzz不存在xyz'))
  assert(r7.status === 200 && Array.isArray(r7.json?.data?.results) && r7.json.data.results.length === 0, '无匹配返回空数组', JSON.stringify(r7.json))
}

async function testCORS() {
  console.log('\n[4] CORS 预检')
  const res = await fetch(BASE + '/api/valuation/batch', {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.com' },
  })
  assert(res.status === 204, 'OPTIONS 返回 204', `status=${res.status}`)
  assert(res.headers.get('access-control-allow-origin') != null, '带 CORS 头', res.headers.get('access-control-allow-origin'))
}

async function main() {
  console.log(`\n=== 资产估值 API 测试 @ ${BASE} ===`)
  try {
    await testBatch()
    await testDetail()
    await testHistory()
    await testSearch()
    await testCORS()
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

  // DUMP 模式：额外抓取各接口真实响应样本，供测试报告引用
  if (process.env.DUMP) {
    const samples = {}
    const b = await postJSON('/api/valuation/batch', {
      items: [
        { symbol: '600519', market: 'CN', cost_price: 1800, quantity: 100 },
        { symbol: '00700', market: 'HK', cost_price: 400, quantity: 100 },
        { symbol: 'AAPL', market: 'US', cost_price: 180, quantity: 10 },
        { symbol: '110011', market: 'FUND', cost_price: 3.5, quantity: 1000 },
      ],
      target_currency: 'CNY',
    })
    samples.batch = b.json
    const d = await getJSON('/api/quote/detail?symbol=600519&market=CN')
    samples.detail = d.json
    const h = await getJSON('/api/quote/history?symbol=600519&market=CN&period=3m')
    samples.history = h.json
    const s = await getJSON('/api/quote/search?q=' + encodeURIComponent('茅台'))
    samples.search = s.json
    console.log('\n===DUMP_START===')
    console.log(JSON.stringify(samples, null, 2))
    console.log('===DUMP_END===')
  }
}

main()
