import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { createPinia, setActivePinia } from 'pinia'
import ChapterGateReport from './ChapterGateReport.vue'
import GenerationSettingsForm from './GenerationSettingsForm.vue'
import { MODE_CHAPTER } from '../../constants/generationModes'

/**
 * The two chapter-mode surfaces worth reviewing in isolation: what the author
 * configures before a run, and what the acceptance gate tells them after one.
 *
 * The panel itself is not storied — it drives two live generation pipelines and
 * a dozen stores, so a story of it would be a mock harness rather than the
 * component.
 */
const meta: Meta<typeof ChapterGateReport> = {
  title: 'Story/Chapter Generation',
  component: ChapterGateReport
}
export default meta

type Story = StoryObj<typeof ChapterGateReport>

const metrics = (over: Record<string, number> = {}) => ({
  sceneCount: 3,
  uniqueWords: 3480,
  targetWords: 3500,
  wordRatio: 0.99,
  chapterDuplicateRatio: 0.02,
  weakestDimension: null,
  scenesBelowFloor: 0,
  continuityIssues: 0,
  ...over
})

export const GatePassed: Story = {
  args: { report: { passed: true, findings: [], metrics: metrics() } }
}

export const GateAdvisoryOnly: Story = {
  args: {
    report: {
      passed: true,
      findings: [
        {
          code: 'chapter_short',
          severity: 'warn',
          message: 'Chapter is 2,100 unique words against a 3,500-word target (60%).'
        },
        {
          code: 'pov_drift',
          severity: 'warn',
          message: '1 scene(s) do not cast the POV character the plan declared.'
        }
      ],
      metrics: metrics({ uniqueWords: 2100, wordRatio: 0.6 })
    }
  }
}

export const GateBlocked: Story = {
  args: {
    report: {
      passed: false,
      findings: [
        {
          code: 'missing_prose',
          severity: 'block',
          message: '1 planned scene(s) never produced prose, even after the repair pass.'
        },
        {
          code: 'continuity_unresolved',
          severity: 'block',
          message: "2 continuity issue(s) survived the audit's bounded fix rounds."
        },
        {
          code: 'weak_dimension',
          severity: 'warn',
          message: 'Weakest dimension across the chapter is voice at 5 (floor 7).'
        }
      ],
      metrics: metrics({ uniqueWords: 2300, wordRatio: 0.66, continuityIssues: 2 })
    }
  }
}

export const SettingsFormChapterMode: StoryObj = {
  render: () => ({
    components: { GenerationSettingsForm },
    setup() {
      setActivePinia(createPinia())
      return {
        MODE_CHAPTER,
        genres: ['Fantasy', 'Sci-Fi', 'Thriller'],
        tones: ['Tense', 'Hopeful', 'Dark']
      }
    },
    template: `
      <div class="space-y-5 p-4 max-w-md">
        <GenerationSettingsForm
          :mode="MODE_CHAPTER"
          :genres="genres"
          :tones="tones"
          :word-target="2400"
          :scenes-per-chapter="3"
          :volumes="1"
          :chapters-per-volume="10"
          :words-per-chapter="2000"
          :has-synopsis="true"
          synopsis="A cartographer is hired to map a coastline that keeps rearranging itself."
          :estimated-total-words="2400"
        />
      </div>
    `
  })
}
