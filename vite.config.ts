import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// 读取真实应用版本（package.json 的 version），构建时注入前端，
// 使"关于"/页脚版本号随发布自动更新。
const pkg = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
)

export default defineConfig({
  root: 'apps/pwa',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // 开发环境下禁用 SW 注册：否则 dev-sw.js 会被反复轮询，
      // 导致 workbox-*.js 不停 304 请求、needRefresh 频繁触发更新弹窗（页面卡死/崩溃）。
      // 生产构建 (build + preview) 不受影响，仍正常注册 SW 与更新提示。
      devOptions: {
        enabled: false,
      },
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
      },
      workbox: {
        // 新 SW 立即接管页面，无需等待旧页面关闭
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
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
