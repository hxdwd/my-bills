import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// 读取真实应用版本（package.json 的 version），构建时注入前端，
// 使"关于"/页脚版本号随发布自动更新。
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')
)

export default defineConfig({
  root: 'apps/pwa',
  plugins: [
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
  server: {
    port: 5173,
  },
})
