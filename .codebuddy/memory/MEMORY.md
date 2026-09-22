# 长期记忆（指导性原则）

## 记忆纪律
- **日常改动不自动写 memory**，只有用户明确说「记一下 / 写到 memory」才动 memory 文件。
- 只记**可复用的原则**，不记具体事件/某天踩的坑。

## 与用户协作
- **先确认真实需求再动手**：用户骂「听不懂人话」时，几乎都是我自作主张拍脑袋、没照明确指令做。他给的指令（如「放一行」）是唯一标准，不要套 AI 默认范式「优化」。
- **交付前用事件时序推演自测交互**（按下→触发？松开→补发？按住时长 vs 连发间隔），预判双发/漏发，别等用户报 bug。
- **用户给了 ASCII 图/图示就是唯一标准**，必须按图中元素位置摆放，禁止用 AI 默认范式（如 FAB 经典凸出半嵌入式）覆盖图的意图。涉及底部导航/TabBar 改动前先读代码确认真实渲染高度（`.safe-area-bottom` 的 padding-bottom 含 `calc(env(safe-area-inset-bottom) + 96px)`，会把 bar 撑高约 96px）。
- **提示词类型判断**：①精确代码片段 → 只复制粘贴，连空格都不改；②自然语言+精确数值（`w-[80px]`、17px）→ 原样写入，不擅自转 rem/等价表述；③纯自然语言 → 先自检「这在项目什么位置？用哪个现有 token？」再写。
- **盲写 UI 硬约束**：用绝对 px；写完后按目标屏宽心算物理占比（`260px` on 375px = 70%，写前就该发现不对）；不要用「感觉合理」的整数。
- **数学/逻辑自检**：写完坐标系/映射/比例函数，用两组边界数据手算验证。
- **禁止**：改用户给的变量名/缩进/「更优雅写法」；擅自改用户指定的颜色字号间距；不做边界心算就交付。
- **有分歧疑惑必须问**，不要自行处理。

## 前端 UI 一致性（硬约束）
- 做组件前先读现有同类组件真实 className（圆角/底色/阴影/间距），照它的范式写，**禁止自创碎块样式**（全站是 `rounded-3xl + bg-surface + shadow-soft`）。
- 同语义控件视觉紧凑统一，不把简单东西拆成多个带底色方块。
- **并列指标卡字号必须一致**，无「主指标特权」：财富页四卡统一 `.amount-fluid-lg`（390px ≈21.84px）。`.amount-fluid-lg`(vw 5.6) 与 `.amount-fluid-sm`(3.1) 差近一倍，不可混用。
- `.amount-fluid-lg` 支持 `--amount-scale`（默认 1）做超长数字兜底（单卡约 11 等宽字符，超出按 `11/len` 缩，下限 0.6）。用 CSS 变量而非内联 font-size，保证移动端 media query 生效。
- 筛选类 UI 的 className 统一收在 `apps/pwa/src/utils/ui.ts`（`filterChipCls` / `FILTER_LABEL_CLS` / `FILTER_INPUT_CLS`，源自 `Search.tsx`），新控件直接用，不要各处复制粘贴或自创。

## 交互实现原则
- **长按/连发**：把「单步」与「长按连发」拆到不同元素——单步只绑 `onClick`；连发只绑按下/松开、不绑 `onClick`（结构上根除双发，无需 suppressClick 补丁）。连发用 `setTimeout`(~450ms) 延迟启动 `setInterval`，松手全清；触屏 `onTouchStart + preventDefault` 阻止 click 补发。
- **React 异步 effect**：不要用 `let cancelled` 丢弃异步更新（`StrictMode` 下 effect 跑两次，第二次常因 `useRef` 守卫提前 return，第一次结果被判失效 → UI 永久 loading）。正确做法：`useRef` 存「当前请求 key」，返回后判 `ref.current === myKey` 再 setState。

## 财富收益模型（架构约定，勿改回）
- 只有两个终值口径：**持仓收益**（当前浮盈）与**清仓收益**（已实现），不再出现「累计收益」（用户明确否决需心算相加的展示）。
- **成本冲减口径必须与 `aggregateHoldings` 完全一致**（冲减均价 = 当前剩余总成本 / 累计买入数量），否则「持仓收益 + 清仓收益」对不上实际总收益。
- `computeRealizedProfit` 必须遍历**全部流水**（含清仓归档 `is_active=false`），并跳过 `quantity=0` 清仓节点；`aggregateHoldings` 只算 `is_active !== false`。
- 两卡内容必须区分：持仓收益 → 逐日浮盈**走势曲线**；清仓收益 → **逐笔清仓记录列表**（时间段筛选 + 升降序、折算本位币、附原币种小字）。都用 `BottomSheet` 呈现。
- **曲线时间档位**：「近一周」（= 5 个**交易日**：请求 15 自然日再前端 `slice(-5)`）/「近一月」/ 滚轮选任意自然月。无「近 3 月」。
- 月份选择器用 `WheelPicker` 年+月双滚轮 + 下拉浮层（照抄 `Reports.tsx` 490-528：透明遮罩 + `absolute top-full` + 两列 `w-[80px] visibleCount={3}`），**不要 `input[type=date]`**。
- 月份滚轮**必须防抖**：滚动中只更新「待选月份」（chip 即时反馈、不发请求），停 400ms 才加载；收起浮层时若有待选值立即应用。
- **历史行情按日期区间查询**（`fetchHistoryRange`；接口 `start`/`end` 优先于 `period`，缓存 key 含区间）：A股走东财 K线（`push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&fqt=1&beg=&end=`；新浪 K线只能取「最近 N 条」无法定位历史）；美股/港股/黄金走 Yahoo `period1/period2`；基金走东财 `lsjz` 的 `startDate/endDate`。
- **曲线必须「铺满容器宽度 + 左右滑动平移时间窗口」**，禁止「内容超宽横向滚动」（小屏只能看到一部分）或「内容宽写死」（大屏右侧留白）。图表宽 = 容器宽，X 轴 `autoSkip` 抽稀；水平拖动（≥40px，`touch-action: pan-y`）整体平移数据窗口（每次 15 天，不超今天，滑动后清 chip 选中态、mode 置 `custom`）。
- **滑动/切月只请求目标区间**：段结果按「标的+区间」缓存在内存与 localStorage（纯历史区间永久、含今天的仅当天有效），命中即 0 请求。
- **历史请求统一透传 `AbortSignal`**，新请求先 `abort()` 旧的，`AbortError` 静默忽略；注意 `quoteApi` 的网络错误兜底 catch 要先判 `e?.name === 'AbortError'` 再抛中文提示，否则取消会被误报成「连接失败」。
- **曲线末点与顶部卡片数值天然对不上（口径差异，非 bug）**：曲线取「各标的最近一条历史行情」（美股用最近收盘、基金用 **T+1 官方净值**），卡片用实时行情（基金为**盘中估算净值**）。日期轴取各标的日期**并集**并对缺失日**前向填充**，末点是混合口径——实测 09-22 这一天**只有黄金**有当日点（Yahoo GC=F 美东交易日跨到北京时间次日），4 只基金 + 3 只美股全部沿用 09-21 收盘。
- **港股历史已改用东财 K 线**（`secid=116.<5位代码>`，见 `eastmoneySecidHK`）：Yahoo 对 5 位港股代码（如 07266/07709）恒 404/400，导致港股历史长期为空数组；而 `buildProfitCurve` 对空序列直接 `continue` **静默跳过**整只标的 → 曲线**整条**都缺港股浮盈且无任何提示。现在 A股与港股共用 `fetchEastmoneyKline`（klt=101、fqt=1），只有 secid 前缀不同（沪 `1.`/深 `0.`/港股 `116.`）。
- **东财基金净值接口 `lsjz` 单页硬截断为 20 条**（实测 `pageSize=50/200` 均无效仍返回 20，而 `TotalCount` 是对的）。已按 `pageIndex` 循环翻页修复（`fetchFundNav`，4 路并发；`TotalCount` 缺失时退回只取首页）。**改动上游取数逻辑后必须同时递增 `HISTORY_CACHE_VERSION`（后端 KV key）与 `SEG_CACHE_VERSION`（前端段缓存），否则旧缓存会让修复"看起来没生效"。**
- **曲线日期轴只取「已收盘」交易日**（截止到昨天）：今天各标的数据不同步（基金 T+1 无当日净值、美股/黄金北京时间白天未收盘、港股可能有盘中价），纳入会得到「昨日收盘组合 + 今日已开市市场」的混合末点。`buildProfitCurve` 用 `localYMD(Date.now() - 86400000)` 做 cutoff（**不要用 `toISOString`，那是 UTC，东八区凌晨会差一天**）。

## 账户余额模型（架构约定，勿改回）
- `accounts.balance` **就是当前余额**，不再用「本金 + 流水净额」动态叠加（历史导入流水收支不严格合一，会污染余额、编辑余额不生效）。
- 记账/转账由 `applyAccountBalanceDelta` 显式增减 `balance`：收入 `+amount`、支出 `-amount`、转出 `-fromAmount`、转入 `+toAmount`；删交易反向回补，改交易先撤旧再施新。
- `getTotalAssets/getTotalLiabilities/getAssetTrend` 直接读 `accounts`，无中间层。
- 历史导入流水（SQL 直插）**只进报表，不碰余额**，是预期行为。

## 版本号与发布（my-bills）
- `package.json` 的 `version` 是**唯一真相源**：`vite.config.ts` 用 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` 注入，`vite-env.d.ts` 声明 `declare const __APP_VERSION__`，`Settings.tsx` 直接用。发布时 bump version + 在 `VERSION_LOGS` **头部**追加一条即可。（`import.meta.env.VITE_*` 这种 define 键不稳，必须用裸全局。）
- `VERSION_LOGS` 在 `apps/pwa/src/pages/Settings.tsx`，内容**只面向用户**讲「新增/优化/修复了什么」，绝不泄露开发细节。
- **push 必须显式写 SSH**：`git push git@github.com:hxdwd/my-bills.git main`（直接 `git push` 会落到 HTTPS 凭据报 `Invalid username or token`）。

## 历史账单导入（my-bills）
- 优先让用户转 **CSV**（GBK，9 列），比 OLE2 老 .xls 易解析（Python 无 xlrd/openpyxl/pandas，pip 不可用）。
- 处理脚本放 `history-bills/`，**新建独立 py**，不破坏原有体系；输出列必须与 `import_bills.csv` 完全一致：`date,time,type,amount,category,subcategory,tags,merchant,note,account,original_category,original_note`（UTF-8-SIG；`subcategory` 与 `tags` 同值）。
- 分类以 **MCP 查线上 categories 表**为准（不凭 seed.sql 猜：用户自建分类「人情世故」只在真实 uid 下有）；uid 固定 `38c16ed7-7aa2-4287-afd3-412fecdd913f`。
- 用户确认过的映射：餐饮→饮食/大餐；酒水饮料/零食→饮食/零食饮料；菜肉→饮食/居家饮食；旅游系按名选子标签；淘宝/购物按备注细分；收入要计算；「余额变更」属资产转移跳过。
- **红包/人情分收支**：发出的是**支出**→「人情世故」；收到的是**收入**→「礼金」。
- 生成 SQL 规则：金额必须**非负**（`CHECK amount>=0`，方向靠 `type`，取 `abs`）；`time` 缺失填 `09:00:00`；`merchant` 并入 `note`（表无 merchant 列）；tags 只写白名单（平台/品牌/商超/连锁餐饮），不写视频订阅/交通/会员/宽泛场景词；生成前先查远程库现有 tags 并用 `ON CONFLICT (user_id,name) DO NOTHING`；脚本名 `gen_import_sql_<批次>.py`，可复跑。
- 交付前校验：category 合法、amount>=0、无兜底未匹配项。

## Supabase / 离线同步（硬约束）
- 同步引擎用 **anon key + 自定义头 `x-user-id`** 直连 REST，**不携带用户 JWT**。因此所有表 RLS 必须用 `public.get_current_user_id()`，**绝不能写 `auth.uid() = user_id`**（会返回 anon 的 sub 或 null → 42501/401）。USING 与 WITH CHECK 都要写。
- **任何 DDL / RPC 签名改动后三步自检**：①对照原始定义逐列比对（尤其 `RETURNS TABLE` 列名）；②搜前端所有 `row.xxx` 取值点，确认与返回列名一一匹配；③线上 `execute_sql` 后补一条 `SELECT * FROM fn LIMIT 1` 验证返回 key。
- **线上 DDL 优先"新增式"而非"替换式"**：新功能用新函数/新索引，不去 `create or replace` 改既有 RPC 签名（Postgres 改返回类型必须先 DROP，会有窗口期）。已验证行为可用事务包裹做「改一行再 rollback」的验证，绝不真的写线上数据。

### 离线同步引擎（migration `021_sync_incremental.sql` 起）
- **指纹驱动的按需增量**：启动先发 **1 次** RPC `get_sync_meta(p_user_id)` 拿每表 `{cnt, max_updated_at}`，与本地 `syncMeta` 的 `fp:<表名>` 比对；两者都没变 → 该表 **0 请求**；变了 → 只对该表 `updated_at=gte.<游标>` 增量拉。兜底：无指纹 / 距上次全量 >24h / 本地行数 < `fp.cnt`（本地被清空）→ 全量。
- **增量游标必须 `gte` 不能用 `gt`**：`updated_at` 大量重复（历史导入按批插入，同批几百行共享同一个 `now()`），`gt` 会整批漏掉；`gte` 只重复拉边界批次（实测该用户 1 行 / 0.5KB），幂等 `bulkPut` 无副作用。
- **`pullAll` 必须直接用 `fetchTableMeta`**，**不能**走 `getTableCountMap` 的逐表 COUNT 兜底：兜底拿不到 `max(updated_at)`（恒 null），会被指纹比对误判成"远程没变"而整表跳过 → 数据永远同步不下来。失败就让 `meta = null`、整体退回全量。
- **远程表名 ↔ 本地 Dexie 表名必须映射**（`sub_categories` ↔ `subCategories`）：RPC 回的是远程表名，用 `TABLE_NAMES.includes()` 直接过滤会漏掉驼峰表，让它每次启动都被当成"没指纹"而全量。
- **孤儿清理必须排除 `local_dirty`**：本地新增但还没推送的记录远程当然没有，按"本地有、远程无"判孤儿会把它们删掉（真数据丢失）。只比对 `synced` 的记录。全量拉取时用刚拉到的 id 集合顺手算孤儿，不要再单独发一轮"拉全部 id"。
- **`useWealthValuation` 是模块级共享单例**（`useSyncExternalStore` + 单一 60s 定时器 + 挂载 2s 去抖）：它被 Home/Assets/WealthHome/WealthDetail/WealthCategory 五处使用，"谁调用谁起实例"会导致页面跳转重复请求同一份估值并各起一个定时器。
- **`pullAll` 的返回值口径是「远程总行数」**（不是本次拉取条数），Reports 页的"远程是否有新数据"判断依赖它与 `checkForUpdates` 一致。
- **`syncOnStartup` 返回 `{ pulled }`**：`pulled === 0` 表示远程无变更、本地也没被改动，调用方**不得重读本地库**（`AppContext` 曾无条件把 9 张表含 4000+ 条交易重读一遍 + 全量 setState）。
- **`pushTable` 用数组 body 一次 POST 多条**（失败再逐条兜底以隔离坏数据）；**`syncAfterWrite` 有 400ms 去抖**，把同一张表的连续写入合并成一次推送。批量导入必须走 `addHoldingTransactions`（一次 `bulkPut` + 一次同步），**不要**在循环里 `await addHoldingTransaction`——每次都会触发一轮推送，N 行退化成 O(N²) 次请求。
- **前端"重活"必须带条件**：无条件全量拉取 / 无条件重读全库 / 无条件重算聚合，是这个项目反复出现的同一类缺陷。改任何"每次启动/每次渲染都会跑"的代码前，先自问一句「数据没变化时它还会跑吗」。
- **渲染层两条硬约束**：①**禁止在 render 体里直接调用会扫全表的聚合函数**（`Reports` 曾一次渲染跑 ~32 次全表扫描；`Calendar` 曾每格做一次全表 `some`+正则 ≈ 12.6 万次/渲染），必须 `useMemo`；聚合内部要**一次遍历建 Map** 再查表，不要「天数/月数/分类数 × 全表 filter」。②**Context Provider 的 `value` 必须 `useMemo`**，否则任何 state 变化都会让所有 `useApp()` 消费者整树重渲染。
- **改财务/统计聚合后必须做"新旧实现逐值对比"**：把改动前后的实现并排跑同一份边界数据（空日期、非法日期、非零填充月份 `2026-9-05`、跨年跨月、同日多笔），断言结果完全一致。仅靠 tsc/build 无法发现聚合算错。

### 体积 / 耗电 / 死代码（P2 起）
- **已删除的死代码**（删前均全仓 grep 确认 0 引用）：`services/index.ts` + 5 个 `*.service.ts`（直连 Supabase 的**第二套数据层**，误引用会绕过 Dexie+同步引擎）、`hooks/useLocalStorage.ts`、`hooks/usePullToRefresh.ts`、`components/ui/SyncIndicator.tsx`、`data/mockData.ts`、`TabBar` 的 `MiniTabBar`、`local-operations` 的 `getByAccount`/`hasLocalData` 与一条不可达 `return`、`AppContextType.deleteBill`（只声明未实现，也是那条预存 TS 类型错误的来源）。
- **构建产物已拆包**（`vite.config.ts` 的 `build.rollupOptions.output.manualChunks`）：index 业务代码 460KB / gzip 124KB，另拆 `vendor-react|chart|supabase|dexie`。**目的是缓存命中率**——发新版时用户只需重下 460KB 业务代码，而不是整个 1.1MB。`db/db-diff.ts`（调试工具）已改为 `import.meta.env.DEV` 下动态引入，不再进生产包。
- **定时器 / 动画必须看页面可见性**：`LifeProgress` 的每秒 `setInterval`、`StarField` 的 `requestAnimationFrame` 都已在 `visibilitychange` 时暂停（回前台补一次）。新增任何秒级定时器或持续动画前，先确认隐藏时会不会继续跑。
- **删除文件/函数前的验证套路**：①全仓 grep 符号名（含 `services/index`、被 re-export 的名字，别只看文件名）；②删完跑 `npm run build`（构建会立刻暴露未解析 import）；③用 `git stash push -m base -- <改动文件>` 拿 HEAD 版本跑 `tsc` 做**报错基线对比**（本项目长期有 84 条预存 tsc 噪音，不比基线根本看不出是不是自己引入的；行号位移属正常）。

### 数据源（历史行情）
- **A股 / 港股历史一律走东财 K 线**（`push2his.eastmoney.com/api/qt/stock/kline/get`，`klt=101&fqt=1`，`fields2=f51,f52,f53` → 每行"日期,开盘,收盘"，取 `parts[2]`）。secid 前缀：**港股 `116.`+5位**（`116.07709`）、**沪市 `1.`、深市/北交所 `0.`**。**不要再回退 Yahoo**：它对 5 位港股代码恒 404/400，这正是"曲线整块缺港股"的根因。实测：07709/07266 各 22 条，**实时价 = 历史末点（比值 1.000）**，且 400 天区间取到 230 条（**不传 `lmt` 也不会被截断**）。
- **东财基金净值 `lsjz` 单页硬截断 20 条**（`pageSize=50/200` 无效，`TotalCount` 正确）→ 必须 `pageIndex` 翻页（`fetchFundNav`，4 路并发）。
- **改任何上游取数逻辑后，必须同时递增 `HISTORY_CACHE_VERSION`（后端 KV）与 `SEG_CACHE_VERSION`（前端段缓存）**，否则旧缓存会让修复"看起来没生效"。
- **增量同步依赖迁移 021**（已应用线上）：缺 `update_*_updated_at` 触发器会导致行更新时 `updated_at` 不变 → 指纹不变 → **其他设备永远拉不到该更新**，且不报错。新增可同步的表时必须同步补触发器。

### 审查清单（今天实际踩到的回归模式，改"批量化/记忆化/门控"时逐条对照）
1. **批量写入后副作用仍无条件执行**：把逐条 `await X()` 改成"先构建 payloads → 一次 bulkPut"时，原先"写在成功之后"的副作用（如扣款）会**提前到写入之前**，失败时照跑 → 钱/状态凭空变化。副作用必须包在 `if (ok > 0)` 里。
2. **"无变化就跳过重载"的门控漏掉删除路径**：只统计"拉回的行数"会把远程**纯删除**误判成"无变化"（删除不产生拉回行）。凡是"跳过重读"的优化，都必须确认**所有会改本地库的路径**都被计入。
3. **`useMemo` 依赖里有每次 render 新建的引用**（`.filter()`/`.map()`/对象字面量）→ `Object.is` 永不相等 → 缓存永久失效（注释里写着的优化其实是假的）。包一层 `useMemo` 或用稳定引用。
4. 其他同类：`if (x.length === 0) return` 的提前退出是否漏了"全空但该清空本地"的场景；`refCount` 递减后是否可能变负。

### 已知预存缺陷（非本轮引入，尚未修，避免误判为自己改坏）
- `AppContext.getBudgetProgress` 用 `toISOString().slice(0,7)`（**UTC 月份**），与同函数内 `totalSpentThisMonth` 的**本地**月份口径不一致；东八区每月 1 号 00:00–08:00 匹配错月。`Budget.tsx` 用的是正确本地 `YYYY-MM`。
- `Calendar.tsx` 按「M月D日」分组**忽略年份**，跨年同月会被并进当月。
- `useHabitBadge.anyHabitEnabled` 恒为 `true`（`results` 恒等于 `HABITS` 长度）。
- `lib/db/local-operations.ts` 有 15 条 `markDirty()` 返回类型不匹配的 tsc 报错（`{_sync_status,_updated_at_local}` 推不出记录类型），属长期噪音，不是新问题。

### 项目约定
- **`docs/summary.md` 是「时间倒序」：最新一天的记录放在文件最上方**（紧跟 `# 工作记录汇总` + 引用块 + `---` 之后，插在**第一个 `## ` 标题之前**），不是追加到末尾。文件第 3 行已明写"按时间倒序追加，最新在最上方"。条目格式：`## YYYY-MM-DD：标题` / `## YYYY-MM-DD — 标题`，下面用 `### 一、…`、`### 二、…` 分节；日期间用 `---` 分隔。
- **本仓库的 git 提交信息**：`fix:` / `feat:` / `refactor:` / `docs:` + 中文描述，允许一条大提交覆盖当天多块改动（参照 `d328bc4`）。
- **push 需要显式使用 SSH 地址**（见提交 `cfb29a0` 的说明）。
- **判断 tsc 报错是否自己引入**：`git stash push -m baseline -- <文件>` → 跑 tsc → `git stash pop`，用 HEAD 版本做基线。本项目 `AppContext.tsx` 长期存在 3 个预存类型错误（`big_expense_threshold` 赋值、`string|null`、Provider 缺 `deleteBill`），不是新引入的。

## 构建 / 验证（防误判）
- **`vite build` 必须从项目根跑 `npm run build`**（根 `package.json` script + 根 `vite.config.ts` 设了 `root: 'apps/pwa'`）。
- 在 `apps/pwa` 子目录直接跑 `vite build` 会**静默退化为默认配置** → 报 `Rollup failed to resolve import "virtual:pwa-register/react"`，属假阳性，不要因此改 PWA 配置。
- 改完 React/TSX **必须跑 `tsc --noEmit` + 实际 `vite build`**。`vite build` 只静态打包不执行代码，「未定义引用」类运行期崩溃（`X is not defined` / `Cannot find name X`）它露不出来，要靠 dev 实际点页面。**`X is not defined` 类名称解析失败必须修**（曾把 `toYMD` 缺失当噪音忽略 → 搜索页选时间区间整页崩）；纯类型噪音（隐式 any、未用变量、`FilterState` 不匹配）才可忽略。

## 文件写入与编码（反复踩坑，硬约束）
- **雷区**：PowerShell `[System.Text.Encoding]::UTF8` 在 .NET 里**本质是 UTF-8 带 BOM**（`EF BB BF`）。写 `package.json`/源码并 commit 后，本地 `.ts` 容忍，但 CI/Cloudflare 的 `JSON.parse` 严格拒绝 → 构建 `SyntaxError: Unexpected token ''` 失败（已炸过多次）。
- **首选编辑工具**（`replace_in_file`/`write_to_file`）：按文件真实换行处理、默认无 BOM，从根上规避。**不要为 TS/源文件的精确替换去写 node 补丁脚本**（要自己处理 CRLF/LF、分号差异，反复 MISS，催生一堆 `_probe/_peek/_fix_xxx` 临时脚本）。
- 必须写脚本时**优先 Python**（`open(f,'w',encoding='utf-8')` 默认绝不写 BOM）。非用 PowerShell 不可时锁死 `[System.Text.UTF8Encoding]::new($false)`。
- 工具调用失败（ENOENT、锚点不匹配、把目录当文件）时**立刻停止重试**，先读文件确认真实状态（行尾/路径/锚点），定位根因再发下一次。绝不带同样错误参数反复重试（用户明确批评过的「打转」）。
- **同一次批量里不要对同一个文件发多个 `replace_in_file`**：后面的编辑基于同一份快照写回，会**静默覆盖**掉前面的改动（工具报成功、文件里却没有）。同一文件的多处改动要么合并成一次编辑，要么**分轮次串行**执行；改完用 `search_content` 复查锚点是否真的落地（`read_file` 有缓存，不能作准）。
- 临时脚本一次写完、用完即清；清理时一次性列全正确绝对路径。
- PowerShell 里 `Select-Object -First N` 会提前终止上游进程，给有副作用的脚本接它会中途打断 → 要截断输出就重定向到文件。
- `read_file` 有缓存，内容变了仍可能返回旧内容 → 复制成新文件名再读可绕过。
