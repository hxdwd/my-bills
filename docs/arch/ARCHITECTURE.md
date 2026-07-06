# my-bills 系统架构文档

## 1. 系统概述

my-bills 是一款个人记账 PWA 应用，采用 React + TypeScript + Supabase + IndexedDB 架构，支持离线使用和多端数据同步。

## 2. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript 5 | SPA |
| 路由 | react-router-dom v6 | 客户端路由 |
| 样式 | TailwindCSS 3 | 原子化 CSS |
| 图表 | Chart.js + react-chartjs-2 | 数据可视化 |
| 图标 | lucide-react | SVG 图标 |
| 日期 | date-fns | 日期格式化 |
| 状态管理 | Zustand (认证) + React Context (数据) | 分层状态管理 |
| 远程数据库 | Supabase (PostgreSQL) | 数据持久化 + RLS |
| 本地数据库 | IndexedDB (Dexie.js) | 离线缓存 |
| PWA | vite-plugin-pwa + Workbox | 离线安装 + 静态资源缓存 |
| 构建 | Vite 5 | 开发/构建工具 |

## 3. 系统架构图

```
┌──────────────────────────────────────────────────────────┐
│                    UI 层 (Pages)                          │
│  Home │ AddTransaction │ Assets │ Reports │ Budget │ ...  │
├──────────────────────────────────────────────────────────┤
│                  AppContext (数据总线)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ 读: IndexedDB│  │ 计算属性     │  │ 写: 本地优先    │  │
│  │ (秒开)       │  │ (纯内存计算) │  │ 异步同步Supabase│  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                   数据层                                  │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  IndexedDB        │  │  Supabase (PostgreSQL)      │  │
│  │  (Dexie.js)       │  │  - 8 tables + 2 views       │  │
│  │  - 本地主数据源    │  │  - RLS via session var      │  │
│  │  - sync_status 标记│  │  - updated_at 增量同步      │  │
│  └──────────────────┘  └─────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│                Sync Engine (同步引擎)                      │
│  - 启动时: 读缓存 + 后台增量同步                           │
│  - 写入后: 立即推送到 Supabase                            │
│  - 网络恢复: 批量同步 pending 数据                         │
│  - 定时: 每5分钟后台增量拉取                               │
└──────────────────────────────────────────────────────────┘
```

## 4. 数据库设计

### 4.1 Supabase 远程数据库

| 表名 | 说明 | 关键索引 |
|------|------|----------|
| users | 自建用户表 | username (UNIQUE) |
| profiles | 用户档案 | id (PK, FK→users) |
| accounts | 账户 | user_id, sort_order |
| categories | 收支分类 | user_id, user_id+type |
| transactions | 交易记录 | user_id, user_id+transaction_date, user_id+category_id, user_id+type, user_id+account_id |
| transfers | 转账记录 | transaction_id (UNIQUE) |
| budgets | 预算 | user_id+month, user_id+month+category_id (UNIQUE) |
| bills | 账单/订阅 | user_id |
| tags | 标签 | user_id+name (UNIQUE) |

视图: `monthly_stats`, `category_stats`

### 4.2 IndexedDB 本地数据库

| 表名 | 对应远程表 | 额外字段 |
|------|-----------|----------|
| accounts | accounts | sync_status, updated_at_local |
| categories | categories | sync_status, updated_at_local |
| transactions | transactions | sync_status, updated_at_local |
| budgets | budgets | sync_status, updated_at_local |
| bills | bills | sync_status, updated_at_local |
| tags | tags | sync_status, updated_at_local |
| profiles | profiles | sync_status, updated_at_local |
| sync_meta | — | key, value (存储 last_sync 等元数据) |

**sync_status 枚举:**
- `synced` — 本地与远程一致
- `local_dirty` — 本地有未同步的修改
- `pending_delete` — 本地已删除，待同步到远程

## 5. 数据流

### 5.1 启动流程

```
App启动
  │
  ├─ 1. useAuthStore.initAuth() — 从 localStorage 恢复用户
  │
  ├─ 2. AppProvider 初始化
  │     ├─ 打开 IndexedDB (Dexie)
  │     ├─ 从 IndexedDB 读取所有数据 → setState → 页面秒开
  │     └─ 触发后台同步
  │           ├─ 读取 sync_meta.last_sync
  │           ├─ 对每张表: Supabase SELECT WHERE updated_at > last_sync
  │           ├─ 合并到 IndexedDB (upsert)
  │           └─ 更新 last_sync
  │
  └─ 3. UI 渲染完成
```

### 5.2 写入流程（乐观更新）

```
用户操作 (新增/修改/删除)
  │
  ├─ 1. 生成 UUID (如需要)
  ├─ 2. 立即写入 IndexedDB
  │     ├─ 新增/修改: sync_status = 'local_dirty'
  │     └─ 删除: sync_status = 'pending_delete'
  ├─ 3. 立即更新 React state → UI 即时响应
  ├─ 4. 后台尝试同步到 Supabase
  │     ├─ 成功: sync_status = 'synced', 更新 updated_at
  │     └─ 失败: 保持 'local_dirty', 等下次同步重试
  └─ 5. (可选) 失败时静默重试 3 次
```

### 5.3 同步触发时机

| 时机 | 同步内容 |
|------|----------|
| App 启动 | 增量拉取 (pull) |
| 写入操作后 | 推送变更 (push) |
| 网络恢复 (`online` 事件) | 批量推送 pending + 增量拉取 |
| 每 5 分钟定时 | 增量拉取 (pull) |

### 5.4 账户余额计算策略

**不再维护 `accounts.balance` 存储字段**，改为动态计算:

```
账户余额 = SUM(该账户所有交易的金额影响)
  - expense: -amount
  - income: +amount
  - transfer (转出): -amount
  - transfer (转入): +amount
```

每次 transactions 变更后，在 `useMemo` 中重新计算各账户余额，确保一致性。

## 6. 目录结构

```
apps/pwa/src/
├── context/
│   └── AppContext.tsx          # 数据总线 (重构后)
├── db/
│   ├── database.ts             # Dexie 数据库定义 + 表结构
│   ├── sync-engine.ts          # 同步引擎 (pull/push/merge)
│   ├── account.db.ts           # 账户本地 CRUD
│   ├── transaction.db.ts       # 交易本地 CRUD
│   ├── category.db.ts          # 分类本地 CRUD
│   ├── budget.db.ts            # 预算本地 CRUD
│   ├── bill.db.ts              # 账单本地 CRUD
│   ├── tag.db.ts               # 标签本地 CRUD
│   └── profile.db.ts           # 用户设置本地 CRUD
├── services/
│   ├── supabase.ts             # Supabase client
│   ├── account.service.ts      # 账户远程 API (简化，仅同步用)
│   ├── transaction.service.ts  # 交易远程 API
│   ├── ...                     # 其他 service 文件
├── stores/
│   └── useAuthStore.ts         # Zustand 认证状态
├── pages/                      # UI 页面
├── components/                 # 通用组件
└── types/                      # 类型定义
```

## 7. 关键设计决策

| 决策 | 理由 |
|------|------|
| IndexedDB 作为主数据源 | 页面秒开，离线可用 |
| 乐观更新 | 即时 UI 反馈，不需要等待网络 |
| updated_at 增量同步 | 避免全量拉取，减少网络开销 |
| 去掉 200 条交易限制 | 本地存储没有此限制，按需分页加载 |
| 账户余额动态计算 | 避免存储值与交易记录不一致 |
| Last Write Wins 冲突处理 | 个人记账场景，多端同时修改概率极低 |
| 暂不实现 SW 后台同步 | 当前单用户场景不需要，后续可渐进增强 |
| 暂不实现实时同步 | 无多端协同需求，增量拉取已足够 |

## 8. 路由设计

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | Home | 仪表盘 |
| `/add` | AddTransaction | 记账弹窗 |
| `/assets` | Assets | 资产管理 |
| `/reports` | Reports | 报表统计 |
| `/budget` | Budget | 预算管理 |
| `/bills` | Bills | 账单管理 |
| `/calendar` | Calendar | 日历视图 |
| `/search` | Search | 搜索 |
| `/transactions` | TransactionList | 交易列表 |
| `/categories` | Categories | 分类管理 |
| `/ai` | AI | AI 分析 |
| `/settings` | Settings | 设置 |
| `/login` | Login | 登录/注册 |
