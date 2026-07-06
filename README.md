# 钱盒子 (My Bills)

> 温暖的个人财务管家 — 基于 React + Supabase 的 PWA 记账应用

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **状态管理**: React Context + Zustand
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **图表**: Chart.js + react-chartjs-2
- **PWA**: vite-plugin-pwa

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
├── supabase/
│   ├── migrations/             # 数据库迁移文件
│   │   └── 001_initial_schema.sql
│   ├── edge-functions/         # Supabase Edge Functions
│   └── seed.sql                # 种子数据
│
├── docs/                       # 文档
│   └── database.md             # 数据库设计文档
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

```bash
npm run dev
```

访问 http://localhost:5173

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
