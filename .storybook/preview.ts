import type { Preview } from '@storybook/vue3-vite'
// Global stylesheet: Tailwind + design tokens (both themes). This is the app's
// real entry stylesheet — the scaffold's `src/assets/main.css` never existed.
import '../src/style.css'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'canvas',
      values: [
        { name: 'canvas', value: '#121214' },
        { name: 'light', value: '#f7f5f0' }
      ]
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;