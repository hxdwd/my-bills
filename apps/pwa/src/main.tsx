import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { bootstrapDevTools } from './utils/devtools'
// 数据库差异检查工具：挂载 window.__diffDB（本地 Dexie ↔ 远程 Supabase，以远程为准）。
// 它只是开发期调试工具，静态 import 会把它（含 Supabase 直连逻辑）打进生产包，故改为
// 仅在开发环境动态引入——生产构建下整个分支会被摇掉。
if (import.meta.env.DEV) {
  void import('./db/db-diff')
}

// 开发者工具：若此前解锁过，启动时同步恢复 fetch 录制（刷新后仍然生效）。
// 未启用时只读一次 localStorage，不挂钩任何东西；放在 render 之前，
// 保证首个请求（如 initAuth）也能被记录下来。
bootstrapDevTools()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
