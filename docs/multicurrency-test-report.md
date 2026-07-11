# 多币种（美股/港股）端到端测试报告

- 生成时间：2026-07-11 21:26
- 测试方式：WSL2 内用 Windows node 启动 `wrangler pages dev . --port 8799`（Functions 本地服务），
  Node 脚本 `scripts/test-multicurrency.mjs` 与回归 `scripts/test-api.mjs` 发起 HTTP 断言。
- 测试结论：**多币种改动全部可用；过程中发现并修复 1 个真实折算方向 bug。**
- 后端 Functions 需重新 `wrangler deploy` 才生效（本地 dev 已验证）。

---

## 一、发现并修复的真实 Bug（核心）

### 前端 `apps/pwa/src/utils/currency.ts` 的 `convert` 汇率方向写反

改动前（错误）：

```ts
const fromToCNY = from === 'CNY' ? 1 : 1 / (rates[from] ?? 1)  // 错：除
```

后端 `loadExchangeRates` 返回的 `exchange_rates` 含义是 **「1 x = ? CNY」**
（实测 `rates.USD = 6.8027` 即 1 USD = 6.80 CNY；`rates.HKD = 0.862` 即 1 HKD = 0.862 CNY）。

原代码把 USD→CNY 算成 `amount / 6.80`，导致：
- 美股 10 股（$315.32）→ 应 ≈ ¥21,355，但被错误缩成 ¥463
- 港股市值被错误放大

**这正是"美股/港股界面数值不对"的隐患**——财富首页"总市值(¥)"里美股/港股部分会严重失真。

修复（已改 + 同步修后端 `src/core/valuation/index.ts` 的同名函数及误导注释）：

```ts
const fromToCNY = rates[from] ?? 1        // 1 from = ? CNY（乘）
const cnyToTarget = to === 'CNY' ? 1 : 1 / (rates[to] ?? 1)
```

实测折算（用真实汇率）：
- `3139.2 USD → 21355 CNY`（放大 ✅）
- `52923 HKD → 45623 CNY`（缩小 ✅）

---

## 二、多币种端到端测试（`test-multicurrency.mjs`）

**通过 34 / 失败 0**

| 区块 | 验证点 | 结果 |
|------|--------|------|
| A 后端批量估值 | 返回 200 / code=0 / 4 条 | ✅ |
| | A股 600519 币种=CNY | ✅ |
| | 港股 00700 币种=HKD（修复关键） | ✅ |
| | 美股 AAPL 币种=USD（修复关键） | ✅ |
| | 基金 110011 币种=CNY | ✅ |
| | 美股市值>0 / 港股市值>0 | ✅ |
| | total_market_value 恒为 0（前端本地折算） | ✅ |
| | total_profit_loss 恒为 0 | ✅ |
| | 汇率表含 CNY=1 / USD>0 / HKD>0 | ✅ |
| | 传 `target_currency=USD` 仍返回自身币种（忽略折算） | ✅ |
| B 单资产行情 | CN/HK/US/FUND 四市场币种字段均正确 | ✅ |
| C 前端折算交叉验证 | USD→CNY 放大 / HKD→CNY 缩小 / CNY 不变 / USD→HKD 切换 | ✅ |

> 说明：港股历史走势为空为已知缺口（见 api-test-report），前端已兜底"暂无数据"，与本次无关。

---

## 三、回归测试（`test-api.mjs`，旧接口未改动）

**通过 61 / 失败 0** —— 确认本次后端改动未破坏既有 batch/detail/history/search/CORS 四个接口。

---

## 四、类型与构建验证

| 检查 | 命令 | 结果 |
|------|------|------|
| 后端类型 | `tsc --noEmit -p tsconfig.functions.json` | ✅ 零错误（顺手清掉 2 个历史 unused：`search.ts` 死函数 `looksLikeFund`、`adapter.ts` 的 `fetchGold(symbol)` 参数 typo） |
| 前端构建 | `vite build` | ✅ `dist/` 生成成功（1679 模块，无错误，仅 chunk 体积/动态导入提醒） |

> 注：根 `tsconfig.json` 的 `tsc --noEmit` 仍报一批**历史既有**告警（React unused、`ui/index.ts` 导出名 typo、`AppContext` duplicate、`useAuthStore` 的 `never` 类型等），**均非本次多币种改动引入**（本次所改 `currency.ts`/`useWealthValuation.ts`/`quoteApi.ts`/各 Wealth 页面未出现在报错列表）。这些是财富模块早期会话的存量问题，未在本次范围，未扩大改动。

---

## 五、结论与交付清单

1. **多币种展示可用**：美股($)/港股(HK$)/A股·基金·黄金(¥) 各自按真实币种展示，符号不再错位。
2. **顶层本位币汇总可用**：财富首页三卡片 + 分布图按本位币（默认 ¥，可切 $ / HK$）本地折算，折算方向已修正。
3. **折算 bug 已修**：`currency.ts` 的 `convert` 方向错误已修正并加注，后端同名函数同步修正。
4. **回归安全**：旧 4 接口 61 断言全过；前后端构建/类型检查通过（后端零错误，前端 build 成功）。

**仍需你确认的事**：
- 后端 Functions 部署：本地 `wrangler dev` 已验证，但生产环境需重新 `wrangler deploy`（或 Pages 重新构建）才能让"不折算"生效。
- 浏览器内交互（点击本位币切换按钮、新增持仓时的币种符号预览）为纯前端逻辑，已随 `vite build` 编译通过，但建议你在真机点一遍确认手感。
