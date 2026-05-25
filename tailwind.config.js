/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0f0e0d',
        'bg-secondary': '#1a1816',
        'bg-tertiary': '#242220',
        'surface-hover': '#2e2b28',
        'border-subtle': '#3a3632',
        'border-strong': '#4a4540',
        'text-primary': '#e8e0d5',
        'text-secondary': '#a89880',
        'text-hint': '#9e9080',
        accent: '#c9a96e',
        'accent-hover': '#d4b87a',
        'accent-muted': '#5c4a2a',
        'accent-glow': 'rgba(201, 169, 110, 0.15)',
        'accent-glass': 'rgba(201, 169, 110, 0.08)',
        danger: '#d07070',
        success: '#6a9e7a',
        manuscript: '#0f0e0d',
        'manuscript-editor': '#1a1816',
        glow: '#c9a96e',
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      fontFamily: {
        body: ['Crimson Pro', 'Georgia', 'serif'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        spark: ['Playfair Display', 'Georgia', 'serif'],
        flow: ['Lora', 'Georgia', 'serif'],
        polish: ['Libre Baskerville', 'Georgia', 'serif'],
        revise: ['EB Garamond', 'Georgia', 'serif'],
        storybible: ['Merriweather', 'Georgia', 'serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      boxShadow: {
        'warm-sm': '0 1px 2px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,169,110,0.03)',
        'warm-md': '0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(201,169,110,0.04)',
        'warm-lg': '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,169,110,0.05)',
        'warm-xl': '0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,169,110,0.06)',
        'accent-glow': '0 0 20px rgba(201,169,110,0.15), 0 0 40px rgba(201,169,110,0.05)',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
        'out-quart': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'fade-out': 'fade-out 0.15s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.2s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.2s ease-out forwards',
        'slide-in-up': 'slide-in-up 0.2s ease-out forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
