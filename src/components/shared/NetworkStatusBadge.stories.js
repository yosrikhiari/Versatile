import NetworkStatusBadge from './NetworkStatusBadge.vue'

/**
 * NetworkStatusBadge surfaces offline / syncing / pending-sync state in the app
 * header. It stays silent when online and idle, so in Storybook it renders only
 * when the environment reflects one of those states (e.g. toggle the browser
 * offline in devtools). The Default story documents its placement.
 */
export default {
  title: 'Shared/NetworkStatusBadge',
  component: NetworkStatusBadge,
  parameters: {
    docs: {
      description: {
        component:
          'Reads the sync engine’s online state + pending-sync count. Renders nothing when online and fully synced.'
      }
    }
  }
}

const Template = () => ({
  components: { NetworkStatusBadge },
  template: `
    <div style="display:flex; align-items:center; gap:12px; padding:8px 12px; background:var(--vers-bg-panel); border-radius:8px;">
      <span style="font-size:12px; color:var(--vers-text-muted); font-family:var(--vers-font-ui,sans-serif)">Header slot →</span>
      <NetworkStatusBadge />
    </div>
  `
})

export const Default = Template.bind({})
