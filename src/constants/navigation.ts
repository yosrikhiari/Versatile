export interface NavItem {
  label: string
  /** Panel id understood by `AppShell.handleSidebarNav`. */
  panel: string
  icon: string
  /** Extra words the command palette should match on, beyond the label. */
  keywords?: string[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * The workspace panels, grouped by what the writer is doing rather than by
 * panel type.
 *
 * Shared by the sidebar and the command palette so a panel cannot be renamed,
 * reordered or added in one and quietly go missing from the other.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Write',
    items: [
      {
        label: 'Generator',
        panel: 'story-generator',
        icon: 'sparkles',
        keywords: ['draft', 'scene', 'chapter', 'ai', 'spark']
      },
      {
        label: 'Polish',
        panel: 'polish',
        icon: 'brush',
        keywords: ['prose', 'revise', 'critique', 'pacing']
      },
      {
        label: 'What If',
        panel: 'whatif',
        icon: 'shuffle',
        keywords: ['branch', 'alternate', 'ripple']
      },
      {
        label: 'Voice Lab',
        panel: 'voice-lab',
        icon: 'message-square',
        keywords: ['style', 'author', 'tone']
      }
    ]
  },
  {
    label: 'Structure',
    items: [
      { label: 'Outline', panel: 'outline', icon: 'list', keywords: ['beats', 'summary'] },
      {
        label: 'Sections',
        panel: 'sections',
        icon: 'book-marked',
        keywords: ['chapters', 'scenes', 'volumes']
      },
      { label: 'Canvas', panel: 'canvas', icon: 'palette', keywords: ['board', 'storyboard'] },
      {
        label: 'Consistency',
        panel: 'consistency',
        icon: 'clipboard-check',
        keywords: ['continuity', 'contradiction']
      },
      {
        label: 'Beta Reader',
        panel: 'beta-reader',
        icon: 'eye',
        keywords: ['feedback', 'review']
      }
    ]
  },
  {
    label: 'World',
    items: [
      {
        label: 'Story Bible',
        panel: 'story-bible',
        icon: 'book-open',
        keywords: ['characters', 'locations', 'plot threads', 'entities']
      },
      { label: 'Network', panel: 'network', icon: 'network', keywords: ['graph', 'relationships'] },
      { label: 'Timeline', panel: 'timeline', icon: 'clock', keywords: ['chronology', 'events'] },
      { label: 'Story Shape', panel: 'story-shape', icon: 'activity', keywords: ['arc', 'tension'] }
    ]
  }
]

/** Pinned below the grouped panels — tools rather than writing surfaces. */
export const SYSTEM_ITEMS: NavItem[] = [
  { label: 'Costs', panel: 'cost-dashboard', icon: 'dollar-sign', keywords: ['spend', 'tokens'] },
  { label: 'Research', panel: 'research', icon: 'search', keywords: ['notes', 'sources'] },
  { label: 'Archive', panel: 'archive', icon: 'archive', keywords: ['history', 'snapshots'] },
  { label: 'Settings', panel: 'settings', icon: 'settings', keywords: ['preferences', 'project'] }
]
