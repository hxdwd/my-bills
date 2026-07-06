# 数据库设计文档

## 数据库：PostgreSQL (Supabase)

### ER 图

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   profiles   │     │   accounts   │     │  categories  │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │     │ id (PK)      │     │ id (PK)      │
│ display_name │     │ user_id (FK) │     │ user_id (FK) │
│ avatar_url   │     │ name         │     │ name         │
│ currency     │     │ type         │     │ icon         │
│ locale       │     │ balance      │     │ color        │
│ created_at   │     │ icon         │     │ type         │
│ updated_at   │     │ color        │     │ sort_order   │
└──────┬───────┘     │ sort_order   │     │ is_system    │
       │             │ is_active    │     │ created_at   │
       │             │ created_at   │     │ updated_at   │
       │             │ updated_at   │     └──────┬───────┘
       │             └──────┬───────┘            │
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  auth.users  │     │ transactions │     │   budgets    │
│  (Supabase)  │     │──────────────│     │──────────────│
│──────────────│     │ id (PK)      │     │ id (PK)      │
│ id (PK)      │────▶│ user_id (FK) │◀────│ user_id (FK) │
│ email        │     │ type         │     │ month        │
│ ...          │     │ amount       │     │ category_id  │
└──────────────┘     │ category_id  │────▶│ amount       │
                     │ account_id   │     │ created_at   │
                     │ to_account_id│     │ updated_at   │
                     │ merchant     │     └──────────────┘
                     │ tags         │
                     │ note         │     ┌──────────────┐
                     │ images       │     │    bills     │
                     │ location     │     │──────────────│
                     │ date/time    │     │ id (PK)      │
                     │ created_at   │     │ user_id (FK) │
                     │ updated_at   │     │ name         │
                     └──────┬───────┘     │ amount       │
                            │             │ type         │
                     ┌──────▼───────┐     │ due_date     │
                     │  transfers   │     │ start_date   │
                     │──────────────│     │ end_date     │
                     │ id (PK)      │     │ remind_days  │
                     │ transaction_id│    │ is_active    │
                     │ user_id (FK) │     │ created_at   │
                     │ from_account │     │ updated_at   │
                     │ to_account   │     └──────────────┘
                     │ amount       │
                     │ fee          │     ┌──────────────┐
                     │ created_at   │     │    tags      │
                     └──────────────┘     │──────────────│
                                          │ id (PK)      │
                                          │ user_id (FK) │
                                          │ name         │
                                          │ color        │
                                          │ created_at   │
                                          └──────────────┘
```

### 表关系说明

| 表 | 主键 | 外键 | 说明 |
|----|------|------|------|
| `profiles` | id (UUID) | id → auth.users.id | 用户档案，1:1 关联 Supabase Auth |
| `accounts` | id (UUID) | user_id → auth.users.id | 账户（银行卡、支付宝等） |
| `categories` | id (UUID) | user_id → auth.users.id | 收支分类 |
| `transactions` | id (UUID) | user_id, category_id, account_id, to_account_id | 交易记录 |
| `transfers` | id (UUID) | transaction_id, user_id, from_account_id, to_account_id | 转账详情 |
| `budgets` | id (UUID) | user_id, category_id | 预算 |
| `bills` | id (UUID) | user_id | 账单/订阅 |
| `tags` | id (UUID) | user_id | 标签 |

### RLS 策略

所有表都启用了 Row Level Security，用户只能访问自己的数据：
- `USING (auth.uid() = user_id)` 用于 SELECT/UPDATE/DELETE
- `WITH CHECK (auth.uid() = user_id)` 用于 INSERT

### 视图

1. **monthly_stats** — 月度收支统计
2. **category_stats** — 分类支出统计

### 函数

1. **get_budget_progress(p_user_id, p_month)** — 计算预算进度
2. **handle_new_user()** — 新用户注册自动创建 profile
3. **update_updated_at_column()** — 自动更新 updated_at 字段
