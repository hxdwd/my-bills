# Cloudflare Pages 部署问题与解决方法

> 本文记录本项目部署到 Cloudflare Pages 过程中遇到的错误及对应解决方法。
> 仅包含部署/构建/运行相关，不涉及 Git 操作。

## 1. 构建失败：TypeScript 类型检查报错（`never` 类型 / TS2339 / TS2345）

**现象**
构建日志报错，指向 `apps/pwa/src/stores/useAuthStore.ts` 等文件，提示
`error TS2339: ... 类型为 never` 以及 RPC 返回推断为 `never`。

**原因**
- `supabase.rpc('login_user')` 返回类型推断为 `never`，因为 `database.types.ts` 的
  `Functions` 中缺少 `login_user` / `register_user` 的 RPC 类型定义。
- `tsconfig` 开启了 `noUnusedLocals` / `noUnusedParameters`，`tsc -b` 阶段因大量
  未使用变量（TS6133）直接失败。

**解决方法**
1. 补全 `apps/pwa/src/types/database.types.ts` 中 `Functions` 的
   `login_user` 和 `register_user` RPC 类型定义。
2. 将 `package.json` 的 build 脚本由 `tsc -b && vite build` 改为 `vite build`，
   跳过 `tsc` 类型检查，由 Vite（esbuild）直出 `dist`。
   （注意：这只是绕开构建期类型检查，类型问题仍需后续修复。）

---

## 2. 构建成功但 Deploy 阶段报错（wrangler 版本校验）

**现象**
Build 已成功，但 Deploying 阶段报错，提示需要 Vite ≥ 6.0.0（项目为 Vite 5.4.21）。

**原因**
在 Cloudflare 构建配置里填写了 `Deploy command: npx wrangler deploy`，
wrangler 对 Vite 版本有校验要求，与项目版本冲突。

**解决方法**
- Pages 项目的 **Deploy command / Version command 应留空**（在已存在项目的
  Settings → Build & deployments 里允许留空），由 Pages 自动上传 `dist` 产物。
- 不要手动填 `npx wrangler deploy`。

---

## 3. Deploy command 表单报错（Required / Invalid request body）

**现象**
在创建向导或 Settings 中填写 Deploy command 时：
- 留空 → 提示 `Required`
- 填 `echo "deploy"` 或 `true` → 提示 `Invalid request body`
- 保存时偶发 `An internal error prevented the form from submitting`

**原因**
Cloudflare Pages 的 Deploy command 字段对占位命令校验失败；创建向导对该字段
强制必填，形成死结。

**解决方法**
- 在**已存在项目**的 `Settings → Build & deployments` 中将 Deploy command / Version
  command **清空（留空）** 保存，通常是允许的。
- 若卡在创建向导：先建一个不连接框架的空项目，再进 Settings 手动填构建配置
  （Build command `npm run build`、Build output directory `apps/pwa/dist`），
  Deploy/Version command 留空。
- 表单偶发内部错误可刷新页面、换无痕窗口重试。

---

## 4. 部署成功但页面显示 “Hello world” 占位页

**现象**
访问 `*.workers.dev` 显示默认 Hello world，而非应用。

**原因**
- 项目被误建为 **Workers**（域名 `*.workers.dev`，走 `wrangler deploy`），
  Workers 默认 Serve 占位页，没有用 Vite 产物。
- 或 Build output directory 配置不正确，Pages 找不到 `apps/pwa/dist`，
  fallback 到默认占位。

**解决方法**
- 应使用 **Cloudflare Pages**（域名 `*.pages.dev`），而非 Workers。
  在控制台 `Workers & Pages → 创建 → Pages` 连接 GitHub 仓库。
- Pages 创建向导中 **Build output directory 填 `apps/pwa/dist`**
  （该字段在创建向导有，在 Settings 里不单独显示）。
- 旧的 `*.workers.dev` 项目可删除。
- 注意：Pages 的 Settings 里没有独立的 “Build output directory” 输入框，
  它是在创建/编辑构建配置时指定的。

---

## 5. 线上运行时报错：请在 .env 配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

**现象**
页面打开后控制台报 `Uncaught Error: 请在 .env 文件中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY`。

**原因**
- `VITE_` 前缀的变量由 Vite 在**构建时**注入 `import.meta.env`，必须配置在
  Cloudflare 的 **Environment variables** 中，且**配完必须重新部署**才会打进产物。
- 误把变量配到了 “数据库 / D1 / Supabase 集成” 里，不会自动映射成 `VITE_` 变量。

**解决方法**
1. `Pages 项目 → Settings → Environment variables` 添加：
   - `VITE_SUPABASE_URL` = 你的 Supabase 项目 URL
   - `VITE_SUPABASE_ANON_KEY` = 该项目的 anon key
   （变量名必须带 `VITE_` 前缀，大小写一致）
2. **先加好变量，再触发重新部署**（push 代码，或 Deployments 中 Retry）。
3. Pages 没有 “Retry” 按钮（那是 Workers 的），触发重新部署靠 push 新提交。

---

## 6. 登录提示 “用户名或密码错误”（账号不对）

**现象**
页面能打开，但登录报错。

**原因**
- 线上 `VITE_SUPABASE_URL` 指向的 Supabase project 与本地/预期不一致，
  目标 project 的 `users` 表里没有该账号。
- 登录逻辑走 `login_user` RPC（bcrypt 哈希比对），账号需在对应 project 的
  `users` 表中存在（初始化 SQL 会写入 `admin / 123456` 测试账号）。

**解决方法**
- 确认 Cloudflare 环境变量 `VITE_SUPABASE_URL` 指向**正确的 project**
  （与本地 `.env` 一致）。
- 到对应 Supabase 控制台 `Table Editor → users` 确认账号存在；
  可用默认 `admin / 123456` 验证。
- 变量改完后重新部署。

---

## 推荐的最终 Cloudflare Pages 配置

| 配置项 | 值 |
|--------|-----|
| 项目类型 | Cloudflare **Pages**（非 Workers） |
| Root directory | 留空（仓库根） |
| Build command | `npm run build` |
| Build output directory | `apps/pwa/dist` |
| Deploy command | 留空 |
| Version command | 留空 |
| Environment variables | `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（值同本地 `.env`） |

修改环境变量或构建配置后，需重新部署（push 新提交）才能生效。
