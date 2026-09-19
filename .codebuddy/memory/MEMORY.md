# 长期记忆（指导性原则，不是事件记录）

## 记忆书写纪律（重要）
- **日常代码改动不要自动写 memory**。只有用户**明确说"记一下 / 写到 memory"**时才动 memory 文件，否则不写。每改一点就往 memory 里塞会导致不可维护，这是用户明确批评过的。
- 仍遵循「记原则、不记事件」的总体要求（见下「与用户协作的方式」）。

## 与用户协作的方式
- **先确认真实需求再动手**。用户骂"听不懂人话"时，问题几乎都不在"某个具体 bug"，而在我自作主张拍脑袋、没照他明确的指令做。他给的指令（如"放一行"）就是唯一标准，不要套 AI 默认范式去"优化"。
- **记忆要写指导性原则，不写具体事件/坑**。记录"下次遇到 X 类问题该怎么做"，而不是"某天改了什么、踩了什么"。事件会过期，原则能复用。
- **交付前必须自测交互逻辑**，尤其是"点击/长按/双击"这类事件组合——用事件时序推演（按下→立即触发？松开→补发？按住时长 vs 连发间隔）预判双发/漏发，不要等用户报 bug。

## 前端 UI 一致性（硬约束）
- 做任何组件前，**先读现有同类组件**（Card/Modal/Button 等）的真实 className，照着它的圆角/底色/阴影/间距范式写，**禁止自创碎块样式**（如自己拼 border + 小圆角，而全站是 rounded-3xl + bg-surface + shadow-soft）。
- 同一语义的控件在视觉上要紧凑统一，不要为了"功能清晰"就把简单东西拆成多个带底色的方块。
- **并列的多张指标卡字号必须一致，不给某张卡"主指标特权"**。财富页四卡（总市值/今日收益/持仓收益/清仓收益）统一用 `.amount-fluid-lg`（390px 视口 ≈21.84px）；曾因总市值走 `large` 分支用 lg、其余用 `.amount-fluid-sm`，导致同屏出现 21.84px vs 12.09px（差 1.8 倍）——这两个类的 vw 系数是 5.6 与 3.1，天然差近一倍，不可混用。
- `.amount-fluid-lg` 支持 `--amount-scale` CSS 变量（默认 1）用于超长数字兜底：单卡约容 11 个等宽字符，超出时按 `11/len` 等比缩小（下限 0.6），见 `WealthHome` 的 `amountScale`。用 CSS 变量而非内联 `font-size`，是为了让移动端 media query 仍生效。

## 长按/连发类交互的标准实现
- **把"单步"和"长按连发"拆到不同元素上**，不要叠加在同一个按钮：单步控件只绑 `onClick`（确定性单次）；长按连发控件只绑按下/松开事件、不绑 `onClick`。这样从结构上根除双发，不需要 suppressClick 之类的补丁。
- 连发用 `setTimeout` 延迟（~450ms）启动 `setInterval`，松手清掉二者。
- 触屏用 `onTouchStart + preventDefault` 阻止后续 click 补发。

## React 异步 effect 的正确写法（硬约束）
- **不要在 effect 里用 `let cancelled` 来丢弃异步更新**。本项目 `main.tsx` 启用了 `StrictMode`，effect 会执行两次：第二次常因 `useRef` 守卫提前 return，此时第一次的结果若被 `cancelled` 判定失效，所有 `setState` 被跳过 → UI 永久停在 loading（财富页收益曲线踩过此坑）。
- 正确做法：`useRef` 保存「当前请求的 key」，异步返回后判 `ref.current === myKey` 再写入；key 变化即天然作废旧结果，无需 cancelled 标记。

## 用户提示词的执行策略（防 AI 夹带私货）

这是从时间选择器 7 轮迭代中沉淀的最重要原则：

### 判断提示词类型
- **精确代码片段**（用户给了完整 JSX / CSS）→ **只做复制粘贴，连空格都不改**。不要"理解后重写"，不要"根据意图生成等效代码"。用户的代码就是唯一正确答案。
- **自然语言描述 + 精确数值**（如"w-[80px]、justify-center、17px/14px"）→ 按数值原样写入，不擅自替换等价表述（如 17px 不要转成 1.1rem）。
- **纯自然语言、无精确数值** → 先做一道自检：「这个描述在当前项目的什么位置？应该用项目里哪个现有的样式 token？」再去写。

### 盲写 UI 的硬约束（看不到渲染时）
- **绝对像素优先**：用户指定了 px 就用 px，rem/% 在不同根字号下结果不可控。
- **写完后必须验证物理尺寸**：拿到目标屏幕宽度（如 375px），心算自己写的宽度占比。`width:260px` 在 375px 上占 70%，写出这个数之前就要发现不对。
- **不要用「感觉合理」的整数**。没有视觉反馈时，自己拍脑袋的整数几乎必然错。

### 数学 / 逻辑自检（1 分钟原则）
- 写完任何涉及坐标系、映射关系、比例计算的函数后，**用两组边界数据手算验证**输出是否等于预期。
- 案例：`translateY = halfVisible - renderOffset` 映射已完成，则 `getItemVisual` 中心位置 = `renderOffset`（不是 +halfVisible）。拿 `renderOffset=0` 一算就知道——这个自检花 30 秒，当时若做了，省 2 轮迭代。

### 禁止的行为
- 用户给了完整代码片段，AI「优化」变量名、调整缩进风格、改用"更优雅"的写法
- 用户指定了具体颜色/字号/间距数值，AI 判断"这个值看起来不太合适"然后擅自改成自以为更好的值
- 写完新组件后不做边界值心算验证就直接交付

## 历史账单导入（my-bills 项目）
- 旧 APP 迁移账单优先让用户转 **CSV**（GBK 编码，9列：时间,收支类型,账目分类,金额,账户,账户类型,账本,成员,备注），比 OLE2 老 .xls 易解析（Python 3.7 无 xlrd/openpyxl/pandas，pip 不可用）。
- 处理脚本放 `history-bills/`，**新建独立 py**（如 `process_history_csv.py`），不破坏原有 `process_bills.py` 体系。
- 输出 `import_bills_history.csv`，**列必须与现有 `import_bills.csv` 完全一致**：`date,time,type,amount,category,subcategory,tags,merchant,note,account,original_category,original_note`（UTF-8-SIG，`subcategory` 与 `tags` 同值，`time` 留空由 gen_import_sql 补 00:00:00）。
- 分类必须严格对齐数据库（支出12 + 收入5：工资/奖金/兼职/礼金）。**用户自定义确认过的映射**：餐饮→饮食/大餐；酒水饮料/零食饮料/零食→饮食/零食饮料；菜肉→饮食/居家饮食；旅游系旧分类按名选子标签(交通/住宿/餐饮/门票/购物)；淘宝/购物按备注细分归衣服鞋包或生活用品；大件/一般按备注逐条映射。
- **收入要计算**（不像 README 旧流程跳过）；但"余额变更"(v2平账)属资产转移非真实收入，跳过。
- **红包/人情要分清收支**：发出去的红包、给家人的人情钱是**支出**→归"人情世故"分类（expense，is_system=false，user_id=38c16ed7-...）；收到的红包/开工红包是**收入**→归"礼金"。两者不能混。
- 数据库分类名以 **MCP 查线上 categories 表**为准（项目 my-bills / wiswizwwqtqbkuhgawgh），不要凭 seed.sql 猜——user 自建分类(人情世故)只在真实 uid 下有，demo uid 没有；导入脚本写死 uid=38c16ed7-7aa2-4287-afd3-412fecdd913f 与该用户一致。
- 交付前必须校验：category 全在合法集合（含人情世故）、金额已取绝对值（amount>=0）、无兜底未匹配项。
- **生成导入 SQL 的确认规则（用户拍板，勿自作主张）**：
  - **金额符号：数据库约束 `CHECK (amount >= 0)`，金额必须非负**，方向靠 `type`(expense/income) 区分，**不是靠正负号**。CSV 里支出为负、收入为正，生成 SQL 时务必取绝对值 `abs(amount)` 写入（曾因按"支出负/收入正"原样写导致违反 check constraint 整块失败）。
  - `time` 缺失默认填 `09:00:00`（历史数据无具体时刻），不是 00:00:00。
  - `merchant` 列视为原账单备注，**直接并入 `note`**（transactions 表无 merchant 列，旧脚本曾丢弃，现改为并入）。
  - **tags 表只写白名单**：高频可复用平台/品牌/商超/连锁餐饮（如美团买菜/京东/汉堡王/肯德基/真功夫/永辉/钱大妈/大仟里/优衣库/班尼路/移动/联通）；**不写**：视频订阅类、交通类、会员/月卡类；宽泛场景词（晚餐/吃的/房租等）一律不写。
  - 生成前**先查远程库现有 tags**（MCP），用 `ON CONFLICT (user_id,name) DO NOTHING` 避免重复；已有 tag 不重复插入。
  - 生成脚本命名 `gen_import_sql_<批次>.py`，写入 tags 的白名单写死在脚本里，可复跑。
  - 用户原则：有分歧疑惑的问题**必须问**，不要自行处理。
- **版本号机制（已修复"关于版本不随发布更新"）**：`package.json` 的 `version` 是**唯一真相源**。`vite.config.ts` 用 `define: { __APP_VERSION__: JSON.stringify(pkg.version) }` 注入；`apps/pwa/src/vite-env.d.ts` 声明 `declare const __APP_VERSION__: string`；`Settings.tsx` 的 `APP_VERSION = __APP_VERSION__`，"关于"与 footer 均用之。**每次发布：bump `package.json` version + 在 `VERSION_LOGS` 头部追加一条**，版本号自动跟随，无需手改显示处。注意 `import.meta.env.VITE_*` 这种 define 键不稳，必须用裸全局 `__APP_VERSION__`。
- **版本更新说明（CHANGELOG）维护约定**：入口在设置页"其他"板块的"版本更新"（BottomSheet 展示），数据在 `apps/pwa/src/pages/Settings.tsx` 顶部的 `VERSION_LOGS` 常量。**每次发布(push)在数组【头部】追加一条**，其 `version` 应与 `package.json` 的 `version` 一致。内容**只面向用户**说明"新增/优化/修复了什么功能"，**绝不泄露开发细节**。目前种子为 v1.0.1–v1.1.0 共 10 条，日期取自真实 git 提交历史（2026-07-06 首发 ~ 2026-07-18），功能均对应真实提交。

## 账户余额模型（my-bills，架构约定，勿改回）
- **账户余额是用户维护的独立数字**，`accounts.balance` 直接就是「当前余额」，**不再用「本金 + 流水净额」动态叠加**（曾因历史导入流水收支不严格合一，导致余额被流水反复污染、编辑余额不生效）。
- 记账/转账时由 `applyAccountBalanceDelta` 显式增减 `balance`：收入 `+amount`、支出 `-amount`、转账转出账户 `-fromAmount`、转入账户 `+toAmount`；删除交易反向回补；更新交易先撤旧再施新。
- `getTotalAssets/getTotalLiabilities/getAssetTrend` 等计算属性**直接读 `accounts`**，不再有 `accountsWithBalance` 中间层。
- 历史导入的流水（SQL 脚本直插 transactions 表）**只进报表/统计，不碰余额**，这是预期行为，不是 bug。

## 财富收益模型（my-bills，架构约定，勿改回）
- **财富页收益卡片只有两个终值口径：`持仓收益`（当前持仓浮盈）与 `清仓收益`（已实现收益），不再出现「累计收益」**。用户明确否决「累计收益 = 持仓 + 清仓」这种需要心算相加的展示（参考券商 App 的「持仓盈亏 + 已实现盈亏」并列，而非基金平台的「持有收益 + 累计收益」）。
- **成本冲减口径必须与 `aggregateHoldings` 完全一致**（冲减均价 = 当前剩余总成本 / 累计买入数量）。这是硬约束：持仓收益 = 市值 − 剩余成本，若两边冲减口径不同，「持仓收益 + 清仓收益」会对不上实际总收益；口径一致时两者之和恒等于「Σ卖出回款 + 期末市值 − Σ买入成本」。
- **已实现收益（`computeRealizedProfit`）必须遍历全部流水（含清仓归档 `is_active=false` 的记录）**，这是它与 `aggregateHoldings`（只算 `is_active !== false`）最大的不同；同时要跳过 `archiveHolding` 写入的 `quantity=0` 清仓节点。
- **两个收益卡片的内容必须区分（用户明确要求，勿做成一样）**：`持仓收益` → **走势曲线**（只画当前持仓的逐日浮盈，单线）；`清仓收益` → **逐笔清仓记录列表**（支持时间段筛选 + 收益升/降序切换，折算本位币比较，附原币种小字）。两者都用底部弹窗（`BottomSheet`）呈现，不是内联展开。
- **列表/筛选类控件必须照抄 `Search.tsx` 筛选面板的样式，禁止自创**（用户明确要求"UI 要统一、文字提示简洁、不许风格东一块西一块"）：chip = `px-4 py-2 rounded-full text-sm font-medium border`，选中 `bg-brand text-ink border-brand-strong`、未选 `bg-surface text-ink-2 border-[#e6e3da]`；分组标题 = `text-sm font-medium text-ink mb-2`；date input = `px-3 py-2.5 rounded-xl bg-surface border border-[#e6e3da] text-sm text-ink outline-none`。
- **持仓收益曲线**：持仓量 `q(t)` / 成本 `C(t)` 由本地流水按日重建（0 请求）；历史价走批量接口 `POST /api/quote/history-batch`（`runHistoryBatch`，内部限量并发 6，N 只持仓 → 1 次请求）；缺失日（周末/假期/停牌）用最近交易日价**前向填充**；Y 轴用 `LineChart` 的 `yTickFormatter` 按整轴量级统一单位（默认 `formatCompact` 会在同一轴混出「1.20万」与「10,000.00」）。
- **曲线时间档位：「近一周」/「近一月」/ 滚轮选任意自然月**（不再有「近3月」——一次性拉 90 天属大批量）。用户说的**「一周」指 5 个交易日、不是 5 个自然日**：做法是请求 15 个自然日以保证覆盖 5 个交易日，再前端 `slice(-5)` 展示（**接口无需改动**）。
- **月份选择器不要用 `input[type=date]`**（会带出具体日期、精度不对），改用 `WheelPicker` 年+月双滚轮 + 下拉浮层（照抄 `Reports.tsx` 490-528 的写法：透明遮罩关闭 + `absolute top-full` 浮层 + 两列 `w-[80px] visibleCount={3}`）。
- **历史行情支持按日期区间查询**（`fetchHistoryRange`；接口 `start`/`end` 优先于 `period`，缓存 key 含区间）：A股走**东方财富 K线**（`push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600519&klt=101&fqt=1&beg=YYYYMMDD&end=YYYYMMDD`，因为**新浪 K线只能取「最近 N 条」、无法定位历史区间**）；美股/港股/黄金走 Yahoo `period1`/`period2`；基金走东财 `lsjz` 的 `startDate`/`endDate`。
- **曲线交互（`LineChart` + `ProfitTrend`）：必须「铺满容器宽度 + 左右滑动平移时间窗口」，禁止做成「内容超宽横向滚动」**。用户先后否决过两种错误做法：①把内容宽写死 → 大屏右侧大片空白；②内容超宽可横向滚动 → **小屏只能看到一部分数据**。正确做法：图表宽度恒等于容器宽（X 轴 `autoSkip` 自动抽稀标签），水平拖动（≥40px 阈值，`touch-action: pan-y`）由调用方**整体平移数据窗口**：每次 15 天，向前看更早、向后看更晚且不超过今天（滑动后清掉 chip 选中态，mode 置 `custom`）。
- **滑动/切月都只请求目标区间**：段结果按「标的 + 区间」缓存在内存与 localStorage（纯历史区间永久有效、含今天的当天有效），来回滑动命中缓存即 0 请求。Y 轴用 canvas 原生绘制即可（不滚动自然不会跑，无需 DOM 复刻）。
- **月份滚轮必须防抖，避免"滚一次发一次请求"**：滚动过程中只更新「待选月份」（chip 实时反馈、**不发请求**），停止 400ms 后才真正加载；收起浮层时若有待选值则**立即应用**（不必等防抖）。实测：滚 3 次 → 原来 3 次请求，现在只 1 次。
- **历史请求统一透传 `AbortSignal`**（`fetchQuoteHistoryBatch(items, { start, end, signal })`）：新请求发起前 `abort()` 旧的，`AbortError` 静默忽略。注意 `quoteApi` 的网络错误兜底 catch 里要先判断 `e?.name === 'AbortError'` 再抛中文提示，否则取消会被误报成"连接失败"。
- **筛选类 UI 的 className 统一收在 `apps/pwa/src/utils/ui.ts`**（`filterChipCls` / `FILTER_LABEL_CLS` / `FILTER_INPUT_CLS`，源自 `Search.tsx` 筛选面板）。新做筛选控件直接用这些，**不要各处复制粘贴或自创**。

## Supabase RLS 约定（my-bills，硬约束）
- 本项目的离线同步引擎（sync-engine.ts）用**anon key + 自定义请求头 `x-user-id`** 直连 REST，并不携带已登录用户的 JWT。因此**所有表的 RLS 策略必须用 `public.get_current_user_id()`（读取 `x-user-id` 头），绝不能写 `auth.uid() = user_id`**——后者返回 anon key 的 sub（或 null），插入/更新会被 42501 RLS 拦截报 401。
- 新建任何表的 RLS 时，USING 与 WITH CHECK 都用 `user_id = public.get_current_user_id()`，与 accounts/categories/transactions/budgets 等现有表保持一致（见 `002_simple_auth.sql` 的 `get_current_user_id` 函数）。曾因转账表 transfers 误用 `auth.uid()` 导致同步全部 401。

## 构建命令（my-bills，防误判）
- **`vite build` 必须从项目根目录用 `npm run build` 跑**（根 `package.json` 的 script，根 `vite.config.ts` 配置了 `root: 'apps/pwa'`）。
- **在 `apps/pwa` 子目录直接跑 `vite build` 会静默退化为默认配置**：Vite 在子目录找不到根配置文件 → 不加载 VitePWA → 报 `Rollup failed to resolve import "virtual:pwa-register/react"`。这是假阳性，不是真 bug，**不要因此改 vite.config.ts 或 PWA 配置**。
- 验证构建是否真通过：从根目录跑，看是否 `✓ built` + 生成 `dist/sw.js`/`workbox-*`；若只从子目录跑出错，先怀疑是跑错目录。

## 文件写入与编码（反复踩坑，硬约束）
- **核心雷区**：PowerShell 的 `[System.Text.Encoding]::UTF8` 在 .NET 里**本质是 UTF-8 带 BOM**（`EF BB BF`）。一旦用它写 `package.json`/`.json`/源码并 commit，本地 `.ts` 容忍 BOM 不报错，但 CI/Cloudflare 的 `JSON.parse` 严格拒绝 BOM → 构建直接 `SyntaxError: Unexpected token '﻿'` 失败。本项目已因此炸过多次部署。
- **首选：用编辑工具做改动**（`replace_in_file`/`write_to_file`）——它按文件真实换行处理、默认无 BOM，从根上规避编码问题，不要为精准替换去写 shell 脚本。
- **必须写脚本时优先 Python**：`open(f,'w',encoding='utf-8')` 在所有平台/版本**默认绝不写 BOM**，确定性强。PowerShell 7 只是 `Set-Content`/`Out-File` 默认改无 BOM，但 `.NET [Encoding]::UTF8` 仍是带 BOM，换 PS7 不等于真解决。
- **若非用 PowerShell 不可**：锁死无 BOM 写法 `[System.Text.UTF8Encoding]::new($false)`，且**绝不碰** `[System.Text.Encoding]::UTF8`。批量去 BOM 用 Python 脚本扫 tracked 文件首 3 字节更稳。
