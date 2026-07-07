/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./apps/pwa/index.html",
    "./apps/pwa/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ===== 背景 / 表面 =====
        bg: '#FAFAF8',
        surface: '#FFFFFF',
        // ===== 品牌金（唯一有色来源）=====
        brand: '#F4D77C',
        'brand-strong': '#E5C45E',
        'brand-soft': '#F8E8B0',
        'brand-tint': '#FFF7E6',
        // ===== 文字 =====
        ink: '#222222',
        'ink-2': '#888888',
        // ===== 状态色 =====
        ok: '#4CAF50',
        danger: '#FF6B6B',
      },
      fontFamily: {
        'serif': ['Georgia', '"Source Han Serif SC"', 'serif'],
        'sans': ['-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        'mono': ['"Roboto Mono"', '"DIN Alternate"', 'monospace'],
      },
      borderRadius: {
        'sm': '12px',
        'md': '16px',
        'lg': '20px',
        'xl': '24px',
        '2xl': '28px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
      boxShadow: {
        // 统一极淡悬浮感：blur 20, opacity 0.05
        'soft': '0 8px 20px rgba(34,34,34,0.05)',
        'soft-lg': '0 12px 28px rgba(34,34,34,0.06)',
        'soft-brand': '0 8px 24px rgba(244,215,124,0.45)',
      },
      animation: {
        'slide-up': 'slideUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fadeIn 200ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
        'bounce-subtle': 'bounceSubtle 150ms ease-out',
        'fade-up': 'fadeUp 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'page-fade': 'pageFade 300ms ease-out both',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pageFade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
