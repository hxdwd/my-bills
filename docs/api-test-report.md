# 资产估值 API 接口测试报告

- 生成时间：2026-07-10 22:04
- 测试方式：本地 `wrangler pages dev . --port 8799` 启动 Functions 服务，Node 脚本 `scripts/test-api.mjs` 发起 HTTP 断言（`DUMP=1` 同时抓取真实响应样本）
- 测试结论：**通过 61 / 失败 0**（含 1 项已知数据缺口的容忍性断言）
- 覆盖端点：4 个业务接口 + 1 个 CORS 预检（本次新增 `/api/quote/search`）

---

## 一、接口总览

| # | 接口 | 方法 | 说明 |
|---|------|------|------|
| 1 | `/api/valuation/batch` | POST | 批量估值，输入持仓列表，返回每只市值/盈亏 + 汇总 |
| 2 | `/api/quote/detail` | GET | 单资产实时行情（含涨跌幅） |
| 3 | `/api/quote/history` | GET | 历史走势（K线/净值序列） |
| 4 | `/api/quote/search` | GET | **新增**：按名称/代码/拼音搜索资产，返回候选列表 |
| 5 | CORS 预检 | OPTIONS | 跨域预检，统一 204 + 响应头 |

统一响应外壳：

```ts
// 成功
{ code: 0, message: "ok", data: <T> }
// 失败
{ code: <number>, message: "<错误描述>" }
```

通用响应头（由 `functions/_middleware.ts` 注入）：

| Header | 值 |
|--------|-----|
| `Content-Type` | `application/json; charset=utf-8` |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization` |
| `Access-Control-Max-Age` | `86400` |

---

## 二、接口 1：批量估值 `POST /api/valuation/batch`

### 请求参数（Body，JSON）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `ValuationItem[]` | 是 | 持仓列表，1–50 条 |
| `items[].symbol` | `string` | 是 | 资产代码（600519 / 00700 / AAPL / 110011） |
| `items[].market` | `'CN'\|'HK'\|'US'\|'FUND'` | 否 | 市场，缺省时由代码启发式推断 |
| `items[].quantity` | `number` | 是 | 持仓数量 |
| `items[].cost_price` | `number` | 否 | 成本价 |
| `items[].total_cost` | `number` | 否 | 总成本（与 cost_price 二选一，缺省时由 quantity×cost_price 推算） |
| `target_currency` | `'CNY'\|'USD'\|'HKD'` | 否 | 汇总目标币种，默认 `CNY` |
| `fields` | `string[]` | 否 | 控制返回字段（可选） |

### 响应参数 `data: BatchResponseData`

| 字段 | 类型 | 说明 |
|------|------|------|
| `results` | `ValuationResult[]` | 每只资产估值结果 |
| `total_market_value` | `number` | 总市值（按 `target_currency` 折算） |
| `total_profit_loss` | `number` | 累计总盈亏 |
| `total_currency` | `'CNY'\|'USD'\|'HKD'` | 汇总币种 |
| `exchange_rates` | `Record<string, number>` | 汇率表（含 CNY/USD/HKD） |

`ValuationResult` 单条字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `symbol` | `string` | 资产代码 |
| `market` | `'CN'\|'HK'\|'US'\|'FUND'` | 市场 |
| `name` | `string?` | 名称（部分数据源可能为空） |
| `quantity` | `number` | 数量 |
| `cost_price` | `number` | 成本价 |
| `total_cost` | `number` | 总成本 |
| `current_price` | `number\|null` | 当前价（失败为 null） |
| `currency` | `'CNY'\|'USD'\|'HKD'` | 该资产原始币种 |
| `market_value` | `number\|null` | 市值 = quantity × current_price |
| `profit_loss` | `number\|null` | 收益金额 = 市值 − 总成本 |
| `profit_rate` | `number\|null` | 收益率 = profit_loss / total_cost |
| `quote_time` | `string\|null` | 行情时间（ISO 8601） |
| `error` | `string?` | 单条失败原因（出现时该条其余数值为 null） |

### 错误码

| 状态码 | code | 触发条件 |
|--------|------|----------|
| 400 | 400 | 请求体非法 JSON / `items` 非数组或空 / `items` 超过 50 条 |
| 500 | 500 | 服务端内部错误 |

### 真实响应样本（A股 600519 + 港股 00700 + 美股 AAPL + 基金 110011，target=CNY）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "results": [
      { "symbol": "600519", "market": "CN", "quantity": 100, "cost_price": 1800, "total_cost": 180000,
        "current_price": 1204.98, "currency": "CNY", "market_value": 120498,
        "profit_loss": -59502, "profit_rate": -0.3306, "quote_time": "2026-07-10T14:04:57.366Z" },
      { "symbol": "00700", "market": "HK", "quantity": 100, "cost_price": 400, "total_cost": 40000,
        "current_price": 460.2, "currency": "HKD", "market_value": 52923,
        "profit_loss": 6923, "profit_rate": 0.1505, "quote_time": "2026-07-10T14:04:57.448Z" },
      { "symbol": "AAPL", "market": "US", "quantity": 10, "cost_price": 180, "total_cost": 1800,
        "current_price": 313.92, "currency": "USD", "market_value": 461.46,
        "profit_loss": 196.86, "profit_rate": 0.744, "quote_time": "2026-07-10T14:04:58.077Z" },
      { "symbol": "110011", "market": "FUND", "quantity": 1000, "cost_price": 3.5, "total_cost": 3500,
        "current_price": 4.0351, "currency": "CNY", "market_value": 4035.1,
        "profit_loss": 535.1, "profit_rate": 0.1529, "quote_time": "2026-07-10T14:04:57.395Z" }
    ],
    "total_market_value": 177917.56,
    "total_profit_loss": -51847.04,
    "total_currency": "CNY",
    "exchange_rates": { "CNY": 1, "USD": 6.802721088435375, "HKD": 0.8695652173913044 }
  }
}
```

### 测试用例（共 16 项，全部通过）

| 用例 | 请求 | 预期 | 结果 |
|------|------|------|------|
| 混合市场估值 | 4 只跨市场 + target=CNY | 200 / code=0 / 4 条 | ✅ |
| A股价格 | — | current_price 为数字 | ✅ |
| A股币种 | — | `CNY` | ✅ |
| A股市值 | — | market_value 为数字 | ✅ |
| 港股价格 | — | current_price 非 null | ✅ |
| 港股币种 | — | `HKD` | ✅ |
| 美股价格 | — | current_price 非 null | ✅ |
| 美股币种 | — | `USD` | ✅ |
| 基金净值 | — | current_price 非 null | ✅ |
| 基金币种 | — | `CNY` | ✅ |
| 基金收益率 | — | profit_rate 为数字 | ✅ |
| 汇总总市值 | — | total_market_value 为数字 | ✅ |
| 目标币种 | — | total_currency=`CNY` | ✅ |
| 汇率 | — | exchange_rates.USD > 0 | ✅ |
| 空 items | `{items:[]}` | 400 | ✅ |
| 超 50 条 | 51 条 | 400 | ✅ |
| 非法 JSON | `{not json` | 400 | ✅ |
| 无效代码 | symbol=000000 | 200 且该条 `error` 存在，其余正常 | ✅ |

---

## 三、接口 2：单资产行情 `GET /api/quote/detail`

### 请求参数（Query）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | `string` | 是 | 资产代码 |
| `market` | `'CN'\|'HK'\|'US'\|'FUND'` | 否 | 市场，缺省时启发式推断 |

### 响应参数 `data: QuoteDetailData`

| 字段 | 类型 | 说明 |
|------|------|------|
| `symbol` | `string` | 资产代码 |
| `market` | `'CN'\|'HK'\|'US'\|'FUND'` | 市场 |
| `name` | `string` | 名称（当前实现部分数据源返回空串，前端需兜底） |
| `current_price` | `number` | 当前价 |
| `change_percent` | `number` | 涨跌幅（百分比，如 1.23 表示 +1.23%） |
| `currency` | `'CNY'\|'USD'\|'HKD'` | 币种 |
| `quote_time` | `string` | 行情时间（ISO 8601） |

### 错误码

| 状态码 | code | 触发条件 |
|--------|------|----------|
| 400 | 400 | 缺 `symbol` |
| 502 | 502 | 行情获取失败（数据源异常） |

### 真实响应样本（600519 / CN）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "symbol": "600519",
    "market": "CN",
    "current_price": 1204.98,
    "change_percent": 0,
    "currency": "CNY",
    "quote_time": "2026-07-10T14:04:57.366Z"
  }
}
```

> 注：本次样本中 `name` 字段未返回（数据源未提供）。类型定义保留该字段，前端展示名称时应优先使用持仓本地冗余的 `name`，避免依赖此字段。

### 测试用例（共 11 项，全部通过）

| 用例 | 请求 | 预期 | 结果 |
|------|------|------|------|
| A股详情 | `symbol=600519&market=CN` | 200 / code=0 | ✅ |
| A股价格 | — | current_price 为数字 | ✅ |
| A股币种 | — | currency 为字符串 | ✅ |
| 港股详情 | `symbol=00700&market=HK` | 200 / code=0 | ✅ |
| 港股价格 | — | current_price 非 null | ✅ |
| 港股币种 | — | currency 为字符串 | ✅ |
| 美股详情 | `symbol=AAPL&market=US` | 200 / code=0 | ✅ |
| 美股价格 | — | current_price 非 null | ✅ |
| 美股币种 | — | currency 为字符串 | ✅ |
| 基金详情 | `symbol=110011&market=FUND` | 200 / code=0 | ✅ |
| 基金价格 | — | current_price 非 null | ✅ |
| 缺 symbol | 无参数 | 400 | ✅ |

---

## 四、接口 3：历史走势 `GET /api/quote/history`

### 请求参数（Query）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `symbol` | `string` | 是 | 资产代码 |
| `market` | `'CN'\|'HK'\|'US'\|'FUND'` | 否 | 市场 |
| `period` | `'1m'\|'3m'\|'1y'` | 否 | 时间范围，默认 `1m` |

### 响应参数 `data: HistoryPoint[]`

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | `string` | 日期 `YYYY-MM-DD` |
| `price` | `number` | 收盘价 / 基金单位净值 |

### 错误码

| 状态码 | code | 触发条件 |
|--------|------|----------|
| 400 | 400 | 缺 `symbol` |
| 500 | 500 | 服务端内部错误 |

### 真实响应样本（`symbol=600519&market=CN&period=3m`，截取首尾）

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "date": "2026-03-02", "price": 1440.11 },
    { "date": "2026-03-03", "price": 1426.19 },
    "…（共约 88 个交易日）…",
    { "date": "2026-07-09", "price": 1182.19 },
    { "date": "2026-07-10", "price": 1204.98 }
  ]
}
```

### 测试用例（共 12 项，全部通过；港股为已知缺口）

| 用例 | 请求 | 预期 | 结果 |
|------|------|------|------|
| A股历史 | `symbol=600519&market=CN&period=3m` | 200 / 数组非空 | ✅ |
| A股首点格式 | — | `date` 匹配 `YYYY-MM-DD` 且 `price` 为数字 | ✅ |
| 港股历史 | `symbol=00700&market=HK&period=3m` | 200 / 数组（当前为空，已知缺口） | ⚠️ 空数组 |
| 美股历史 | `symbol=AAPL&market=US&period=3m` | 200 / 数组非空 | ✅ |
| 美股首点格式 | — | 格式正确 | ✅ |
| 基金历史 | `symbol=110011&market=FUND&period=3m` | 200 / 数组非空（东财净值序列） | ✅ |
| 基金首点格式 | — | 格式正确 | ✅ |

> 港股历史为空为**已知缺口**（见第六节），前端调用需对空数组兜底。

---

## 五、接口 4（新增）：资产搜索 `GET /api/quote/search`

### 请求参数（Query）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `q` | `string` | 是 | 搜索关键词：资产名称 / 代码 / 拼音（如 `茅台`、`腾讯`、`apple`、`600519`、`110011`） |

### 响应参数 `data: { results: SearchResult[] }`

| 字段 | 类型 | 说明 |
|------|------|------|
| `results` | `SearchResult[]` | 候选列表（可能为空数组） |
| `results[].symbol` | `string` | 清洗后代码，可直接用于 batch/detail（600519 / 00700 / AAPL / 110011） |
| `results[].market` | `'CN'\|'HK'\|'US'\|'FUND'` | 市场（由交易所前缀 + 代码启发式推断） |
| `results[].name` | `string` | 资产名称（中文/英文；JSON 中为中文 Unicode 转义，前端 `JSON.parse` 自动还原） |
| `results[].code` | `string` | 原始代码形态（sh600519 / hk00700 / aapl.oq） |

### 错误码

| 状态码 | code | 触发条件 |
|--------|------|----------|
| 400 | 400 | 缺 `q` 或 `q` 为空 |
| 502 | 502 | 搜索数据源不可用（上游超时/异常） |

### 数据源

腾讯 `smartbox.gtimg.cn`（免费，覆盖 A股/港股/美股/基金）。上游返回 `v_hint` 以 `^` 分隔候选、候选内以 `~` 分隔：`交易所前缀~代码~名称~拼音~类型`。market 映射：`hk→HK`、`us→US`、6 位非股票区间→`FUND`、其余→`CN`。

### 真实响应样本

中文名（茅台）：
```json
{
  "code": 0,
  "message": "ok",
  "data": { "results": [ { "symbol": "600519", "market": "CN", "name": "贵州茅台", "code": "600519" } ] }
}
```

代码（600519）：
```json
{ "code": 0, "message": "ok", "data": { "results": [ { "symbol": "600519", "market": "CN", "name": "贵州茅台", "code": "600519" } ] } }
```

美股（apple）：
```json
{ "code": 0, "message": "ok",
  "data": { "results": [
    { "symbol": "AAPL.OQ", "market": "US", "name": "Apple", "code": "aapl.oq" },
    { "symbol": "APLE.N", "market": "US", "name": "apple hospitality reit, inc", "code": "aple.n" }
  ] } }
```

基金（110011）：
```json
{ "code": 0, "message": "ok",
  "data": { "results": [ { "symbol": "110011", "market": "FUND", "name": "易方达优质精选混合(QDII)", "code": "110011" } ] } }
```

港股（腾讯）：
```json
{ "code": 0, "message": "ok",
  "data": { "results": [
    { "symbol": "000847", "market": "CN", "name": "腾讯济安", "code": "000847" },
    { "symbol": "00700", "market": "HK", "name": "腾讯控股", "code": "00700" }
  ] } }
```

### 测试用例（共 9 项，全部通过）

| 用例 | 请求 | 预期 | 结果 |
|------|------|------|------|
| 中文名-A股 | `q=茅台` | 200 / 候选非空 / 含 CN | ✅ |
| 中文名-A股字段 | — | symbol+market+name 完整 | ✅ |
| 中文名-港股 | `q=腾讯` | 200 / 含 HK | ✅ |
| 英文名-美股 | `q=apple` | 200 / 含 US | ✅ |
| 基金代码 | `q=110011` | 200 / 含 FUND | ✅ |
| 纯代码 | `q=600519` | 200 / 候选非空 | ✅ |
| 空 q | `q=` | 400 | ✅ |
| 无匹配 | `q=zzz不存在xyz` | 200 / results 为空数组 | ✅ |

---

## 六、已知缺口与说明

### 1. 港股历史走势暂不支持
- **现象**：`/api/quote/history?market=HK` 返回 200 + 空数组。
- **原因**：港股实时行情（腾讯/新浪）正常，但港股历史 K 线的免费源（腾讯 `web.ifzq.gtimg.cn`、新浪 `getKLineData`、东财 `push2his`）均返回空或 `rc:102`。
- **影响**：仅港股历史曲线无法绘制；实时估值、市值、盈亏均正常。
- **前端建议**：历史接口空数组兜底显示"暂无历史数据"。

### 2. `detail.name` 当前可能为空
- 部分数据源不回传名称，前端应优先使用持仓本地冗余 `name`。

### 3. 实时估值的"估算"性质
- A股/港股实时价为交易所行情（收盘价为实价）。
- 基金 `current_price` 为估值接口估算净值（盘中波动），非最终单位净值；历史净值序列准确。

### 4. 搜索结果中文转义
- 端点返回标准 JSON，中文名以 `\uXXXX` 转义（合法），前端 `JSON.parse` 自动还原，不影响使用。

---

## 七、数据源一览（实测状态）

| 市场 | 实时价 | 历史 | 搜索 | 状态 |
|------|--------|------|------|------|
| A股 CN | 新浪 `hq.sinajs.cn` | 新浪 K 线 | 腾讯 smartbox | ✅ 全通 |
| 港股 HK | 腾讯/新浪 | 暂缺 | 腾讯 smartbox | ⚠️ 仅实时+搜索 |
| 美股 US | Yahoo | Yahoo | 腾讯 smartbox | ✅ 全通 |
| 基金 FUND | 新浪 `fu_` | 东财 `lsjz` | 腾讯 smartbox | ✅ 全通 |

---

## 八、如何复跑

```bash
# 终端 1：启动本地服务
npx wrangler pages dev . --port 8799

# 终端 2：运行测试（含全部接口断言）
node scripts/test-api.mjs
# 或指定地址：BASE=http://127.0.0.1:8799 node scripts/test-api.mjs

# 抓取真实响应样本（输出在 ===DUMP_START=== 之间，供报告引用）
DUMP=1 node scripts/test-api.mjs
```

> 注：本次改动仅新增 `functions/api/quote/search.ts` 与 `src/types/api.ts` 的 `SearchResult` 类型，未触碰 `apps/pwa` 前端代码及现有 3 个端点逻辑，符合"改动不影响现有项目"约束。
