<script setup>
import { ref } from 'vue'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  activePanel: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['navigate'])

const activeTab = ref('panels')

const tabs = [
  { id: 'panels', label: 'Panels' },
  { id: 'system', label: 'System' },
]

const panelsTabItems = [
  { label: 'Generator', panel: 'story-generator', icon: 'sparkles' },
  { label: 'Polish', panel: 'polish', icon: 'brush' },
  { label: 'Story Bible', panel: 'story-bible', icon: 'book-open' },
  { label: 'Canvas', panel: 'canvas', icon: 'palette' },
  { label: 'Outline', panel: 'outline', icon: 'list' },
  { label: 'Chapters', panel: 'chapters', icon: 'book-marked' },
  { label: 'Network', panel: 'network', icon: 'network' },
  { label: 'Timeline', panel: 'timeline', icon: 'clock' },
]

const systemTabItems = [
  { label: 'Archive', panel: 'archive', icon: 'archive' },
  { label: 'Research', panel: 'research', icon: 'search' },
  { label: 'Settings', panel: 'settings', icon: 'settings' },
]

function switchTab(tabId) {
  activeTab.value = tabId
}

function onNavClick(panel) {
  emit('navigate', panel)
}

function isActive(panel) {
  return props.activePanel === panel
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="logo-dot"></span>
      <span>Versatile</span>
    </div>

    <div class="sidebar-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['sidebar-tab', { active: activeTab === tab.id }]"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="sidebar-content">
      <div :class="['sidebar-panel', { active: activeTab === 'panels' }]">
        <button
          v-for="item in panelsTabItems"
          :key="item.panel"
          :class="['nav-item', { active: isActive(item.panel) }]"
          @click="onNavClick(item.panel)"
        >
          <span class="nav-icon"><BaseIcon :name="item.icon" :size="18" /></span>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div :class="['sidebar-panel', { active: activeTab === 'system' }]">
        <button
          v-for="item in systemTabItems"
          :key="item.panel"
          :class="['nav-item', { active: isActive(item.panel) }]"
          @click="onNavClick(item.panel)"
        >
          <span class="nav-icon"><BaseIcon :name="item.icon" :size="18" /></span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--vers-bg-panel);
  border-right: 1px solid var(--vers-border-subtle);
  display: flex;
  flex-direction: column;
  user-select: none;
}

.brand {
  padding: 14px 16px;
  border-bottom: 1px solid var(--vers-border-subtle);
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--vers-accent-primary);
  min-height: 44px;
}

.logo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vers-accent-primary);
  box-shadow: 0 0 8px rgba(200, 146, 42, 0.4);
}

.sidebar-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vers-border-subtle);
}

.sidebar-tab {
  flex: 1;
  padding: 5px 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--vers-text-muted);
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.12s ease;
  font-family: Inter, system-ui, sans-serif;
}

.sidebar-tab:hover {
  color: var(--vers-text-secondary);
  background: rgba(200, 146, 42, 0.08);
}

.sidebar-tab.active {
  background: rgba(200, 146, 42, 0.08);
  color: var(--vers-accent-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.sidebar-panel {
  display: none;
  padding: 4px 0;
}

.sidebar-panel.active {
  display: block;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  margin: 1px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
  font-size: 0.8125rem;
  color: var(--vers-text-secondary);
  border: none;
  background: transparent;
  width: calc(100% - 16px);
  text-align: left;
  font-family: inherit;
}

.nav-item:hover {
  background: rgba(200, 146, 42, 0.08);
  color: var(--vers-text-primary);
}

.nav-item.active {
  background: rgba(200, 146, 42, 0.08);
  color: var(--vers-accent-primary);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: var(--vers-accent-primary);
}

.nav-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.7;
}

.nav-item.active .nav-icon,
.nav-item:hover .nav-icon {
  opacity: 1;
}
</style>
