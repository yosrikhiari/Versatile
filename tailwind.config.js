/**
 * Every color below resolves through a space-separated rgb triplet so Tailwind's
 * `<alpha-value>` placeholder works: `bg-accent/15` compiles to
 * `rgb(var(--vers-accent-primary-rgb) / 0.15)`. Mapping a token straight to a
 * hex `var()` (as this file did) makes every opacity modifier on it invalid CSS,
 * so the declaration is dropped and the element renders transparent.
 *
 * @param {string} name custom property holding an `R G B` triplet
 */
const alpha = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  safelist: ['animate-spin'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': alpha('--vers-bg-base-rgb'),
        'bg-secondary': alpha('--vers-bg-panel-rgb'),
        'bg-tertiary': alpha('--vers-bg-canvas-rgb'),
        'bg-elevated': alpha('--vers-bg-elevated-rgb'),
        'surface-hover': alpha('--vers-bg-hover-rgb'),
        'border-subtle': 'var(--vers-border-subtle)',
        'border-strong': 'var(--vers-border)',
        'text-primary': alpha('--vers-text-primary-rgb'),
        'text-secondary': alpha('--vers-text-secondary-rgb'),
        'text-hint': alpha('--vers-text-muted-rgb'),
        'text-faint': alpha('--vers-text-faint-rgb'),
        accent: alpha('--vers-accent-primary-rgb'),
        'accent-hover': alpha('--vers-accent-hover-rgb'),
        'accent-muted': alpha('--vers-accent-secondary-rgb'),
        'accent-foreground': alpha('--vers-text-on-accent-rgb'),
        danger: alpha('--vers-status-danger-rgb'),
        success: alpha('--vers-status-success-rgb'),
        info: alpha('--vers-status-info-rgb'),
        warning: alpha('--vers-status-warning-rgb'),
        'status-open': alpha('--vers-status-open-rgb'),
        'status-progress': alpha('--vers-status-in_progress-rgb'),
        'status-resolved': alpha('--vers-status-resolved-rgb'),
        'status-closed': alpha('--vers-status-closed-rgb'),
        'entity-character': alpha('--vers-entity-character-rgb'),
        'entity-location': alpha('--vers-entity-location-rgb'),
        'entity-thread': alpha('--vers-entity-plotThread-rgb'),
        manuscript: alpha('--vers-bg-base-rgb'),
        'manuscript-editor': alpha('--vers-bg-panel-rgb'),
        glow: alpha('--vers-accent-primary-rgb')
      },
      spacing: {
        4.5: '1.125rem',
        18: '4.5rem'
      },
      fontSize: {
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        label: ['0.75rem', { lineHeight: '1rem' }],
        '11px': ['0.6875rem', { lineHeight: '0.875rem' }]
      },
      fontFamily: {
        body: ['Crimson Pro', 'Georgia', 'serif'],
        ui: ['"Geist Variable"', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'Geist Mono', 'JetBrains Mono', 'monospace'],
        spark: ['Playfair Display', 'Georgia', 'serif'],
        flow: ['Lora', 'Georgia', 'serif'],
        polish: ['Libre Baskerville', 'Georgia', 'serif'],
        revise: ['EB Garamond', 'Georgia', 'serif'],
        display: ['Playfair Display', 'Georgia', 'serif']
      },
      boxShadow: {
        'warm-sm': '0 1px 2px rgba(0,0,0,0.4)',
        'warm-md': '0 4px 12px rgba(0,0,0,0.4)',
        'warm-lg': '0 8px 24px rgba(0,0,0,0.5)',
        'warm-xl': '0 12px 40px rgba(0,0,0,0.6)',
        'accent-glow': '0 0 0 1px rgb(var(--vers-accent-primary-rgb) / 0.4)'
      },
      backdropBlur: {
        xs: '2px'
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        250: '250ms'
      },
      // Enters decelerate on `out-expo`; exits use `standard`. The overshoot
      // curve that lived here (and its `spring-in` animation) was unused and
      // contradicted the motion rule in DESIGN.md, so both are gone.
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
        'out-quart': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        standard: 'cubic-bezier(0.4, 0, 0.2, 1)'
      },
      animation: {
        spin: 'spin 1s linear infinite',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'fade-out': 'fade-out 0.15s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.2s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.2s ease-out forwards',
        'slide-in-up': 'slide-in-up 0.2s ease-out forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'stagger-fade-in': 'stagger-fade-in 0.4s ease-out forwards'
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        'slide-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' }
        },
        'stagger-fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
