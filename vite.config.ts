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
 * 线上 /api/* 的可用性取决于两条路径之一，二者必须存在其一：
 *   ① 同源转发层 functions/api/[[path]].ts（经 Service binding 打到 Worker）—— 推荐，默认
 *   ② VITE_FUNCTIONS_URL 指向可直接访问的 Worker 地址（仅用于本地联调/临时场景）
 * 两者都没有时，打出来的包会让全站接口 404，这时宁可构建失败：
 * 线上继续停留在上一个可用版本，好过把坏包发上去。
 *
 * 另外，CI/Pages 环境里若 VITE_FUNCTIONS_URL 指向 localhost 也直接拦下。
 * 应急放行：ALLOW_EMPTY_API_BASE=1
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
      // 转发层路径相对仓库根（vite 由仓库根启动，__dirname 即仓库根）
      const hasProxy = fs.existsSync(path.resolve(__dirname, 'functions/api/[[path]].ts'))

      if (!hasProxy && !base) {
        throw new Error(
          '\n[build guard] 没有任何 /api 后端通路：既没有同源转发层 functions/api/[[path]].ts，\n' +
            '  也没有配置 VITE_FUNCTIONS_URL。这样发布出去所有接口都会 404。\n' +
            '  若确需临时放行：ALLOW_EMPTY_API_BASE=1\n'
        )
      }
      if (isCICloudflare && base && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base)) {
        throw new Error(
          `\n[build guard] VITE_FUNCTIONS_URL 指向本机（${base}），构建线上包会把所有接口打到本机。\n` +
            '  生产请留空走同源转发层，或在 Pages 环境变量里改成真实可访问的地址后重新部署。\n'
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
