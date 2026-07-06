# 个人记账 PWA 应用 - 产品规格说明书

## 1. Concept & Vision

**「钱盒子」** —— 一款融合 ChatGPT 温暖设计语言与中国用户记账习惯的个人财务管家。它不仅仅是冰冷的数字记录，而是像一位贴心的财务顾问，用温暖的方式帮你理解每一分钱的流向。

设计理念：**温暖·专业·懂你**

## 2. Design Language

### 2.1 Aesthetic Direction
融合 Claude 温暖的设计语言（Parchment 色调、Serif 标题）与随手记等国内记账应用的实用主义，打造既有品质感又接地气的记账体验。

### 2.2 Color Palette

```css
/* Light Theme */
--bg-primary: #f5f4ed;        /* 羊皮纸主背景 */
--bg-secondary: #faf9f5;      /* 象牙卡片 */
--bg-elevated: #ffffff;        /* 纯白高亮 */
--surface-warm: #e8e6dc;       /* 暖沙色按钮 */

/* Brand & Accent */
--brand-primary: #c96442;      /* 赤陶品牌色 */
--brand-secondary: #d97757;     /* 珊瑚强调 */
--brand-tertiary: #8b5a3c;     /* 深陶 */

/* Semantic Colors */
--income: #2d8a5e;             /* 收入绿 */
--expense: #e05555;            /* 支出红 */
--transfer: #5b8dee;           /* 转账蓝 */

/* Text */
--text-primary: #141413;       /* 主文字 */
--text-secondary: #5e5d59;     /* 次要文字 */
--text-tertiary: #87867f;      /* 弱化文字 */
--text-inverse: #faf9f5;       /* 反色文字 */

/* Dark Theme */
--dark-bg: #141413;            /* 深色背景 */
--dark-surface: #30302e;       /* 深色卡片 */
--dark-border: #3d3d3a;        /* 深色边框 */
--dark-text: #b0aea5;          /* 深色文字 */

/* Borders & Shadows */
--border-light: #f0eee6;       /* 浅色边框 */
--border-warm: #e8e6dc;        /* 暖色边框 */
--shadow-ring: rgba(0,0,0,0.05);
```

### 2.3 Typography

- **Headlines**: Georgia / "Source Han Serif SC", serif — 权威感
- **Body / UI**: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif — 清晰可读
- **Numbers**: "DIN Alternate", "Roboto Mono", monospace — 金额专业感

### 2.4 Spacing System
- Base: 4px
- Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- Border Radius: 8px (small), 12px (medium), 16px (large), 24px (pill)

### 2.5 Motion Philosophy
- 页面切换: slide-in 300ms ease-out
- 卡片展开: scale 0.95→1 + fade, 200ms
- 数字变化: 计数动画 600ms
- 底部弹窗: slide-up 300ms cubic-bezier(0.32, 0.72, 0, 1)
- 成功反馈: 轻微弹跳 150ms + scale 1.05→1

## 3. Information Architecture

```
钱盒子 (My Bills)
├── 首页 (Home)
│   ├── 本月收支概览
│   ├── 今日收支
│   ├── 预算进度
│   ├── 最近交易列表
│   └── 快捷功能入口
│
├── 记账 (Add Transaction)
│   ├── 快速记账 (金额 + 分类 + 账户)
│   ├── 支出/收入/转账
│   └── 完整表单 (商家/标签/备注/图片/定位)
│
├── 资产 (Assets)
│   ├── 总览仪表盘
│   ├── 账户管理
│   └── 资产趋势图
│
├── 报表 (Reports)
│   ├── 月度统计
│   ├── 年度统计
│   └── 自定义筛选
│
├── 日历 (Calendar)
│   └── 日历视图 + 每日流水
│
├── 预算 (Budget)
│   ├── 月预算设置
│   ├── 分类预算
│   └── 超支预警
│
├── 账单 (Bills)
│   ├── 分期管理
│   ├── 订阅管理
│   └── 到期提醒
│
├── AI 助手 (AI)
│   ├── 消费分析
│   ├── 预算建议
│   └── 月报生成
│
├── 搜索 (Search)
│   └── 全局搜索
│
├── 设置 (Settings)
│   ├── 主题切换
│   ├── 账户管理
│   ├── 分类管理
│   ├── 数据导入/导出
│   └── 安全设置
│
└── PWA 安装提示
```

## 4. Layout & Structure

### 4.1 移动端优先布局
- 安全区域: env(safe-area-inset-*)
- 底部导航: 固定 56px + 安全区
- 顶部状态栏: 固定 44px + 安全区
- 内容区: calc(100vh - nav - status)

### 4.2 页面结构
```
┌─────────────────────────┐
│      Status Bar        │  44px
├─────────────────────────┤
│                         │
│                         │
│      Content Area       │  flex-1
│                         │
│                         │
├─────────────────────────┤
│      Bottom Nav        │  56px + safe
└─────────────────────────┘
```

### 4.3 记账弹窗结构
```
┌─────────────────────────┐
│    ▼ 支出    收入    转移  │  Tab切换
├─────────────────────────┤
│      ¥ 0.00            │  大号金额输入
├─────────────────────────┤
│  [分类] [账户] [日期]   │  快捷选择
├─────────────────────────┤
│  [商家] [标签] [备注]   │  可选字段
├─────────────────────────┤
│  [📎] [📍] [💬]        │  附加功能
├─────────────────────────┤
│      [保存]            │  主按钮
└─────────────────────────┘
```

## 5. Features & Interactions

### 5.1 首页
- **本月收支**: 收入/支出双栏显示，对比上月百分比
- **今日收支**: 时间线形式，金额突出
- **预算进度**: 环形进度条 + 剩余天数
- **最近交易**: 时间分组，最新在上
- **快捷入口**: 4宫格 (记账/报表/预算/日历)

### 5.2 记账流程
1. 点击底部「+」启动记账弹窗
2. 默认「支出」，金额键盘自动弹出
3. 快速模式: 金额 → 分类 → 保存 (3步)
4. 完整模式: 展开全部字段
5. 长按分类可收藏常用分类
6. 滑动选择日期/时间

### 5.3 账户系统
- 预设账户类型: 现金、银行卡、信用卡、微信、支付宝、数字货币、投资、负债
- 账户图标使用 Emoji + 品牌色
- 支持账户间转账，实时更新余额

### 5.4 分类管理
- 支出分类 (20+): 餐饮、交通、购物、娱乐、医疗、教育、居住、通讯...
- 收入分类 (10+): 工资、奖金、投资、兼职、礼金...
- 自定义分类: 图标(emoji) + 颜色 + 名称
- 支持拖拽排序

### 5.5 报表功能
- **饼图**: 支出/收入分布
- **柱状图**: 月度对比
- **折线图**: 趋势走向
- 支持切换时间维度 (周/月/季/年)
- 支持按分类/账户筛选

### 5.6 AI 助手
- 消费习惯分析 (你上个月在餐饮上花了...)
- 智能预算建议 (建议餐饮预算 ¥1500)
- 月度财务报告 (生成可分享的图片)
- 异常消费提醒

### 5.7 状态处理
- **空状态**: 友好插画 + 引导文案 + 主按钮
- **加载状态**: 骨架屏 + 数字跳动效果
- **错误状态**: 重试按钮 + 错误说明
- **成功反馈**: Toast + 轻微动画

## 6. Component Inventory

### 6.1 Button
- Primary: 品牌色背景 + 白色文字
- Secondary: 暖沙色背景 + 深色文字
- Ghost: 透明背景 + 边框
- 尺寸: small(28px), medium(36px), large(44px)
- 状态: default, hover(scale 1.02), active(scale 0.98), disabled(opacity 0.5)

### 6.2 Card
- 背景: 象牙色 + 1px 边框
- 圆角: 12px
- 内边距: 16px
- 悬停: 轻微上浮 + 阴影

### 6.3 Input
- 金额输入: 大号字体(32px) + 居中 + 货币符号
- 文字输入: 标准表单风格
- 圆角: 12px
- 聚焦: 蓝色边框 + 轻微阴影

### 6.4 BottomSheet
- 圆角: 24px (顶部)
- 拖动条: 40px × 4px, 居中
- 背景: 白色/深色卡片色
- 动效: slide-up + backdrop fade

### 6.5 TabBar
- 高度: 56px + 安全区
- 图标: 24px + 标签文字
- 选中: 品牌色 + 放大效果
- 中间凸起: + 号按钮 (记账入口)

### 6.6 Transaction Item
- 左侧: 分类图标(40px圆角)
- 中间: 分类名 + 备注
- 右侧: 金额 + 账户标签
- 滑动操作: 编辑/删除

### 6.7 Progress Ring
- 尺寸: 80px / 120px
- 线宽: 8px
- 颜色: 进度(品牌色) / 背景(边框色)
- 中心: 百分比文字

### 6.8 Chart Components
- 饼图: 带图例 + 百分比
- 柱状图: 圆角顶部 + 数值标签
- 折线图: 平滑曲线 + 渐变填充 + 数据点

## 7. Technical Approach

### 7.1 技术栈
- **框架**: React 18 + TypeScript
- **样式**: Tailwind CSS + CSS Variables
- **状态**: React Context + LocalStorage
- **图表**: Chart.js + react-chartjs-2
- **PWA**: Vite PWA Plugin
- **图标**: Lucide React

### 7.2 PWA 配置
- Manifest: 图标 + 启动屏 + 主题色
- Service Worker: 离线缓存
- 安装提示: 自定义 UI

### 7.3 数据模型
```typescript
interface Account {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'credit' | 'wechat' | 'alipay' | 'crypto' | 'investment' | 'debt';
  balance: number;
  icon: string;
  color: string;
}

interface Transaction {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  categoryId: string;
  accountId: string;
  toAccountId?: string; // 转账专用
  date: string;
  time: string;
  merchant?: string;
  tags?: string[];
  note?: string;
  images?: string[];
  location?: { lat: number; lng: number; name: string };
}

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income';
  order: number;
}

interface Budget {
  id: string;
  month: string; // YYYY-MM
  categoryId?: string; // 空表示总预算
  amount: number;
}

interface Bill {
  id: string;
  name: string;
  amount: number;
  type: 'subscription' | 'installment';
  dueDate: number; // 每月几号
  startDate: string;
  endDate?: string;
  remindDays: number[]; // 提前提醒天数
}
```

### 7.4 目录结构
```
src/
├── components/
│   ├── ui/           # 基础组件
│   ├── layout/       # 布局组件
│   ├── charts/       # 图表组件
│   └── features/     # 功能组件
├── pages/            # 页面
├── hooks/             # 自定义 Hooks
├── context/           # Context Providers
├── utils/             # 工具函数
├── data/              # 静态数据
├── styles/            # 全局样式
└── types/             # TypeScript 类型
```

## 8. Mock Data Strategy

### 8.1 示例账户
- 招商银行储蓄卡: ¥45,230.00
- 微信钱包: ¥3,850.50
- 支付宝: ¥12,680.00
- 现金: ¥1,200.00
- 交通银行信用卡: -¥2,350.00

### 8.2 示例交易
- 支出: 星巴克 ¥38 / 美团外卖 ¥56.8 / 地铁 ¥4 / 淘宝 ¥299
- 收入: 工资 ¥15,000 / 奖金 ¥5,000
- 转账: 银行卡→微信 ¥500

### 8.3 示例分类图标
- 🍜 餐饮 (红色)
- 🚗 交通 (蓝色)
- 🛒 购物 (紫色)
- 🎮 娱乐 (粉色)
- 💊 医疗 (橙色)
- 📚 教育 (青色)
