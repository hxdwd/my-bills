/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./apps/pwa/index.html",
    "./apps/pwa/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': '#f5f4ed',
        'bg-secondary': '#faf9f5',
        'bg-elevated': '#ffffff',
        'surface-warm': '#e8e6dc',
        'brand': '#c96442',
        'brand-secondary': '#d97757',
        'brand-tertiary': '#8b5a3c',
        'income': '#2d8a5e',
        'expense': '#e05555',
        'transfer': '#5b8dee',
        'text-primary': '#141413',
        'text-secondary': '#5e5d59',
        'text-tertiary': '#87867f',
        'border-light': '#f0eee6',
        'border-warm': '#e8e6dc',
        'dark-bg': '#141413',
        'dark-surface': '#30302e',
        'dark-border': '#3d3d3a',
        'dark-text': '#b0aea5',
      },
      fontFamily: {
        'serif': ['Georgia', '"Source Han Serif SC"', 'serif'],
        'sans': ['-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        'mono': ['"Roboto Mono"', 'monospace'],
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
      animation: {
        'slide-up': 'slideUp 300ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fadeIn 200ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
        'bounce-subtle': 'bounceSubtle 150ms ease-out',
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
      },
    },
  },
  plugins: [],
}
