import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
// 数据库差异检查工具：挂载 window.__diffDB（本地 Dexie ↔ 远程 Supabase，以远程为准）
import './db/db-diff'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
