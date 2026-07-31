/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>
  export default component
}

// Fontsource packages ship stylesheets only — no type declarations and no
// `types` entry. `vite/client`'s `*.css` glob covers `import './style.css'` but
// not a bare package specifier like `@fontsource-variable/geist`, so the
// side-effect import in main.ts had nothing to resolve to.
declare module '@fontsource-variable/*'
declare module '@fontsource/*'
