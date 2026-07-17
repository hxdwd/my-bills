# 长期记忆（指导性原则，不是事件记录）

## 与用户协作的方式
- **先确认真实需求再动手**。用户骂"听不懂人话"时，问题几乎都不在"某个具体 bug"，而在我自作主张拍脑袋、没照他明确的指令做。他给的指令（如"放一行"）就是唯一标准，不要套 AI 默认范式去"优化"。
- **记忆要写指导性原则，不写具体事件/坑**。记录"下次遇到 X 类问题该怎么做"，而不是"某天改了什么、踩了什么"。事件会过期，原则能复用。
- **交付前必须自测交互逻辑**，尤其是"点击/长按/双击"这类事件组合——用事件时序推演（按下→立即触发？松开→补发？按住时长 vs 连发间隔）预判双发/漏发，不要等用户报 bug。

## 前端 UI 一致性（硬约束）
- 做任何组件前，**先读现有同类组件**（Card/Modal/Button 等）的真实 className，照着它的圆角/底色/阴影/间距范式写，**禁止自创碎块样式**（如自己拼 border + 小圆角，而全站是 rounded-3xl + bg-surface + shadow-soft）。
- 同一语义的控件在视觉上要紧凑统一，不要为了"功能清晰"就把简单东西拆成多个带底色的方块。

## 长按/连发类交互的标准实现
- **把"单步"和"长按连发"拆到不同元素上**，不要叠加在同一个按钮：单步控件只绑 `onClick`（确定性单次）；长按连发控件只绑按下/松开事件、不绑 `onClick`。这样从结构上根除双发，不需要 suppressClick 之类的补丁。
- 连发用 `setTimeout` 延迟（~450ms）启动 `setInterval`，松手清掉二者。
- 触屏用 `onTouchStart + preventDefault` 阻止后续 click 补发。

## 技术流程
- 改完 React/TSX 前端必须同时跑 `npx tsc --noEmit` 和 `npx vite build`（项目根目录）才能交付——tsc 不校验 JSX 嵌套/括号。
- PowerShell 读文件用 `Get-Content ... -Encoding utf8`，否则 GBK 解码被拦截。

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
