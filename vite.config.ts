import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// 读取真实应用版本（package.json 的 version），构建时注入前端，
// 使"关于"/页脚版本号随发布自动更新。
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
)

/**
 * 生产构建护栏（fail-closed）
 *
 * 本仓库的 Pages Functions 已移除，前端 /api/* 不再有「同源兜底」，
 * 只能靠 VITE_FUNCTIONS_URL 指向独立的共享 Worker。
 * 若生产构建拿不到这个地址（或拿到 localhost），打出来的包必然全站接口 404。
 * 此时宁可构建失败 —— 线上会停留在上一个可用版本，好过把坏包发上去。
 *
 * 本地 `npm run build` 不会被 localhost 拦下（只拦 CI/Pages 环境），
 * 真有特殊情况可用 ALLOW_EMPTY_API_BASE=1 强制跳过。
 */
function guardApiBase(): Plugin {
  return {
    name: 'guard-api-base',
    configResolved(config) {
      if (config.command !== 'build') return
      if (process.env.ALLOW_EMPTY_API_BASE) return

      const base = (
        process.env.VITE_FUNCTIONS_URL ||
        loadEnv(config.mode, config.envDir, 'VITE_').VITE_FUNCTIONS_URL ||
        ''
      ).trim().replace(/\/$/, '')
      const isCICloudflare = process.env.CF_PAGES === '1' || !!process.env.CI

      if (!base) {
        throw new Error(
          '\n[build guard] 缺少 VITE_FUNCTIONS_URL：Pages Functions 已移除，前端接口只能走共享 Worker。\n' +
            '  请在该环境设置 VITE_FUNCTIONS_URL=https://<worker 域名>（不要带尾斜杠）后重新构建。\n' +
            '  若确需临时放行：ALLOW_EMPTY_API_BASE=1\n'
        )
      }
      if (isCICloudflare && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base)) {
        throw new Error(
          `\n[build guard] VITE_FUNCTIONS_URL 指向本机（${base}），构建线上包会把所有接口打到本机。\n` +
            '  请在 Cloudflare Pages 环境变量里改成共享 Worker 的生产域名，且改完必须重新部署。\n'
        )
      }
    },
  }
}

export default defineConfig({
  root: 'apps/pwa',
  plugins: [
    guardApiBase(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 开发环境下禁用 SW 注册
      devOptions: { enabled: false },
      // 自销毁 SW，避免 workbox-build v7 ESM 兼容问题
      selfDestroying: true,
      includeAssets: ['favicon.ico', 'favicon.svg', 'pwa-512x512.svg'],
      manifest: {
        name: '钱盒子 - 个人记账',
        short_name: '钱盒子',
        description: '温暖的个人财务管家',
        theme_color: '#F4D77C',
        background_color: '#FAFAF8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/pwa/src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        // 把 vendor 拆成独立 chunk。总体积不变，但：
        // ① 浏览器可并行下载、且 vendor 很少变动，发新版时用户只需重下业务代码，
        //    不必每次部署都重下整个 1.1MB；
        // ② 单个 chunk 超过 500KB 的构建告警也会消失。
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-chart': ['chart.js', 'react-chartjs-2'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dexie': ['dexie'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // 显式监听所有网卡（IPv4 + IPv6）。Vite 默认只绑 IPv6 [::1]，
    // 浏览器把 localhost 解析成 127.0.0.1 时会导致打不开。
    host: '0.0.0.0',
  },
})
