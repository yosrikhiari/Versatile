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
        danger: '#d07070',
        success: '#6a9e7a',
        manuscript: '#0f0e0d',
        'manuscript-editor': '#1a1816',
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
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
