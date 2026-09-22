import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
// 数据库差异检查工具：挂载 window.__diffDB（本地 Dexie ↔ 远程 Supabase，以远程为准）。
// 它只是开发期调试工具，静态 import 会把它（含 Supabase 直连逻辑）打进生产包，故改为
// 仅在开发环境动态引入——生产构建下整个分支会被摇掉。
if (import.meta.env.DEV) {
  void import('./db/db-diff')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
