# 钱盒子 (My Bills)

> 温暖的个人财务管家 — 基于 React + Supabase 的 PWA 记账应用

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **状态管理**: React Context + Zustand
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **图表**: Chart.js + react-chartjs-2
- **PWA**: vite-plugin-pwa

## 系统架构

```
浏览器 / PWA（React SPA + IndexedDB 本地主数据源）
        │
        │ ① 同源 /api/*（浏览器视角无跨域）
        ▼
Cloudflare Pages（本仓库）
 · 静态产物 apps/pwa/dist
 · functions/api/[[path]].ts —— 纯转发层，不含业务逻辑
        │
        │ ② Service binding（不经公网；Worker 公网入口已关闭）
        ▼
共享后端 Worker（独立仓库）
 · /api/health       探活
 · /api/quote/*      行情搜索 / 详情 / 历史
 · /api/valuation/*  批量估值 + 汇率折算
 · /api/wealth/*     财富 AI 分析 / 截图导入
 · /api/expend/*     目标对话
        │
        ├──▶ 行情数据源（A股 / 基金 / 美股 / 黄金）
        └──▶ AI 服务（分析 / 对话 / OCR）

旁路：账户、交易、预算等业务数据由前端直接访问数据库 REST 接口，不经 Worker
     （按行级权限隔离）；离线读写 IndexedDB，联网后增量同步。
```

**三条硬约束**

1. 本仓库**不含业务后端**。`functions/api/[[path]].ts` 只做原样转发，新增接口请改 Worker，不要往转发层写逻辑。
2. 共享 Worker 的**公网入口是关闭的**（配置里 `workers_dev = false`），只能被 Pages 经 Service binding 调用 —— 防止有人直接刷 AI 接口产生真实费用。转发层也刻意没有"公网兜底"：绑定缺失时直接报错，而不是偷偷改走公网。
3. Worker 与其它前端产品**共用同一个 Worker、同一套数据库 schema**，接口契约（路径、返回字段）变更前必须核对所有消费方。

**部署形态**

| 组成部分 | 部署方式 | push 到仓库会自动发布吗 |
|---|---|---|
| 前端（本仓库） | Cloudflare Pages，Git 集成，构建 `npm run build` → `apps/pwa/dist` | **会**（`main` 分支自动构建；构建失败不会顶掉线上现有版本） |
| 后端 Worker | 独立仓库源码，命令行手动 `wrangler deploy` | **不会**，必须手动部署 |

Worker 发版后 **Pages 不需要重新部署**：binding 按 service 名解析，立即指向新版本。

## 项目结构

```
my-bills/
├── apps/
│   └── pwa/                    # PWA 前端应用
│       ├── src/
│       │   ├── components/     # 共享 UI 组件
│       │   │   ├── ui/         # 基础组件 (Button, Card, Modal...)
│       │   │   ├── layout/     # 布局组件 (Header, TabBar...)
│       │   │   └── charts/     # 图表组件
│       │   ├── pages/          # 页面组件
│       │   ├── stores/         # Zustand 状态管理
│       │   ├── services/       # Supabase API 服务层
│       │   ├── composables/    # 可复用逻辑
│       │   ├── router/         # 路由配置
│       │   ├── types/          # TypeScript 类型定义
│       │   ├── utils/          # 工具函数
│       │   ├── styles/         # 全局样式
│       │   ├── context/        # React Context (主题、App状态)
│       │   └── data/           # 静态数据/常量
│       ├── public/             # 静态资源
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── tailwind.config.js
│
├── functions/
│   └── api/[[path]].ts         # /api/* 同源转发层（业务后端在独立 Worker）
│
├── supabase/
│   ├── migrations/             # 数据库迁移文件（schema 真相源）
│   │   └── 001_initial_schema.sql
│   └── seed.sql                # 种子数据
│
├── docs/                       # 文档
│   ├── database.md             # 数据库设计文档
│   └── summary.md              # 工作记录（时间倒序）
│
├── scripts/                    # 本地 e2e / 冒烟脚本
│   └── e2e-env.mjs             # 起 Worker + vite 并跑冒烟
│
├── .env                        # 环境变量
├── .env.example                # 环境变量示例
├── .gitignore
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，填入 Supabase 项目配置：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 初始化数据库

在 Supabase SQL Editor 中依次执行：
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/seed.sql`（可选，需要替换 user_id）

或使用 Supabase CLI：

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

### 4. 启动开发服务器

后端（行情 / 估值 / 财富 AI）已迁到独立共享 Worker `my-bills-api`，本仓库只剩
`functions/api/[[path]].ts` 这一层同源转发（线上经 Service binding 调 Worker）。
因此本地要跑**两个**进程 —— 前端 vite + Worker 的 `wrangler dev`：

```bash
# 终端 1：共享 Worker（源码在独立仓库，当前为 ../jijibao/worker）
cd ../jijibao/worker
npx wrangler dev --port 8799

# 终端 2：前端
npm run dev            # 依赖 apps/pwa/.env 里的 VITE_FUNCTIONS_URL=http://localhost:8799
```

访问 http://localhost:5173

> `wrangler pages dev` 在本地无法代替 Worker：Service binding 在本地是
> `[not connected]`，/api/* 会直接 503。

端到端冒烟（自动起 Worker + vite，跑财富首页用例）：

```bash
npm run e2e            # Worker 目录可用 MY_BILLS_API_DIR 覆盖
```

### 5. 构建

```bash
npm run build
npm run preview
```

## 功能模块

- **首页仪表盘** — 资产概览、最近交易、月度统计
- **记一笔** — 快速记账（支持支出/收入/转账）
- **资产管理** — 账户管理、总资产/负债/净资产
- **统计报表** — 支出分布、收支趋势、分类分析
- **日历视图** — 按日查看交易记录
- **预算管理** — 设置月度预算、跟踪进度
- **账单管理** — 订阅/分期账单提醒
- **分类管理** — 自定义收支分类
- **深色模式** — 亮色/暗色主题切换
- **PWA** — 可安装到手机桌面

## 数据库表

| 表名 | 说明 |
|------|------|
| profiles | 用户档案 |
| accounts | 账户 |
| categories | 分类 |
| transactions | 交易记录 |
| transfers | 转账记录 |
| budgets | 预算 |
| bills | 账单/订阅 |
| tags | 标签 |

详见 [docs/database.md](docs/database.md)
