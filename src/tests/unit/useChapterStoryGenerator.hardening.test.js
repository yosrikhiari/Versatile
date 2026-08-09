import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { t, useChapterI18n } from '../../composables/useChapterI18n'
import { useSettingsStore } from '../../stores/settingsStore'
import ChapterGateReport from '../../components/story/ChapterGateReport.vue'

/**
 * The surfaces around the chapter pipeline that are easy to break silently: the
 * label seam, the rollback flag, and the panel that reports what the gate found.
 *
 * Rate limiting and DOMPurify sanitisation, proposed in an earlier draft of the
 * plan, are deliberately absent — there is one `genRun` row per project, so
 * chapter concurrency is 1 by construction, and the inputs are the author's own
 * synopsis and research rather than untrusted markup.
 */

describe('chapter i18n seam', () => {
  it('resolves known keys to their English strings', () => {
    expect(t('chapter.generate')).toBe('Generate Chapter')
    expect(t('chapter.gatePassed')).toBe('Chapter gate passed')
  })

  it('interpolates named slots', () => {
    expect(t('chapter.unfinished', { written: 1, total: 3 })).toBe(
      'Unfinished chapter — 1 of 3 scenes written.'
    )
    expect(t('chapter.perScene', { scenes: 4, words: '600' })).toBe(
      '4 scene(s) · ~600 words per scene'
    )
  })

  it('returns the key itself when there is no string for it', () => {
    expect(t('chapter.doesNotExist')).toBe('chapter.doesNotExist')
  })

  it('is reachable as a composable', () => {
    expect(useChapterI18n().t('chapter.pause')).toBe('Pause')
  })
})

describe('chapter generation feature flag', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults to on', () => {
    expect(useSettingsStore().enableChapterGeneration).toBe(true)
  })

  it('persists an explicit off through save and load', () => {
    const settings = useSettingsStore()
    settings.setEnableChapterGeneration(false)

    setActivePinia(createPinia())
    const reloaded = useSettingsStore()
    reloaded.loadSettings()
    expect(reloaded.enableChapterGeneration).toBe(false)
  })

  it('comes back on after a reset to defaults', () => {
    const settings = useSettingsStore()
    settings.setEnableChapterGeneration(false)
    settings.resetToDefaults()
    expect(settings.enableChapterGeneration).toBe(true)
  })
})

describe('ChapterGateReport', () => {
  const metrics = { sceneCount: 3, uniqueWords: 3480, targetWords: 3500, wordRatio: 0.99 }

  function mountReport(report) {
    return mount(ChapterGateReport, {
      props: { report },
      global: { stubs: { BaseIcon: true } }
    })
  }

  it('renders nothing without a report', () => {
    expect(mountReport(null).find('[data-test="chapter-gate-report"]').exists()).toBe(false)
  })

  it('states the pass and the metrics behind it', () => {
    const wrapper = mountReport({ passed: true, findings: [], metrics })
    expect(wrapper.text()).toContain('Chapter gate passed')
    expect(wrapper.text()).toContain('3 scene(s)')
    expect(wrapper.text()).toContain('3,480 unique words')
    expect(wrapper.text()).toContain('99% of target')
  })

  it('separates blocking findings from advisory ones', () => {
    const wrapper = mountReport({
      passed: false,
      findings: [
        { code: 'missing_prose', severity: 'block', message: 'Scene 2 produced no prose.' },
        { code: 'chapter_short', severity: 'warn', message: 'Chapter is short.' }
      ],
      metrics
    })
    expect(wrapper.text()).toContain('Chapter gate found blocking issues')
    const lists = wrapper.findAll('ul')
    expect(lists).toHaveLength(2)
    expect(lists[0].text()).toContain('Scene 2 produced no prose.')
    expect(lists[1].text()).toContain('Chapter is short.')
  })

  it('shows a warnings-only report as passed', () => {
    const wrapper = mountReport({
      passed: true,
      findings: [{ code: 'pov_drift', severity: 'warn', message: 'POV drifted in scene 1.' }],
      metrics
    })
    expect(wrapper.text()).toContain('Chapter gate passed')
    expect(wrapper.text()).toContain('POV drifted in scene 1.')
    expect(wrapper.findAll('ul')).toHaveLength(1)
  })
})
