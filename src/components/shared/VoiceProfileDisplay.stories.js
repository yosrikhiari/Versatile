import { setActivePinia, createPinia } from 'pinia'
import VoiceProfileDisplay from './VoiceProfileDisplay.vue'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'

export default {
  title: 'Shared/VoiceProfileDisplay',
  component: VoiceProfileDisplay,
  argTypes: {
    profile: { control: 'object' },
    locked: { control: 'boolean' }
  }
}

const fullProfile = {
  metadata: {
    confidence: 0.85,
    totalSentences: 1200,
    consistency: 0.78
  },
  vocabulary: {
    uniqueWords: 3400,
    uniqueWordRatio: 0.45,
    averageWordLength: 4.2,
    totalWords: 15000,
    mostCommonWords: ['the', 'and', 'was', 'she', 'her', 'he', 'had', 'said', 'in', 'that']
  },
  sentenceStructure: {
    averageSentenceLength: 14.3,
    dialogueRatio: 0.35,
    hasDialogue: true,
    sentenceLengthDistribution: [
      { range: '1-5', percentage: 0.08 },
      { range: '6-10', percentage: 0.22 },
      { range: '11-15', percentage: 0.35 },
      { range: '16-20', percentage: 0.22 },
      { range: '21+', percentage: 0.13 }
    ]
  },
  punctuation: {
    ellipsisFrequency: 0.03,
    dashFrequency: 0.05,
    exclamationFrequency: 0.02,
    semicolonFrequency: 0.01,
    commaFrequency: 0.12
  },
  pacing: {
    averageParagraphLength: 120,
    averageLineBreaks: 2.5
  }
}

const sparseProfile = {
  metadata: {
    confidence: 0.45,
    totalSentences: 150,
    consistency: 0.4
  },
  vocabulary: {
    uniqueWords: 600,
    uniqueWordRatio: 0.5,
    averageWordLength: 3.9,
    totalWords: 1200,
    mostCommonWords: ['the', 'he', 'she', 'and', 'was', 'it', 'had', 'in', 'a', 'to']
  },
  sentenceStructure: {
    averageSentenceLength: 12.1,
    dialogueRatio: 0.2,
    hasDialogue: false,
    sentenceLengthDistribution: [
      { range: '1-5', percentage: 0.12 },
      { range: '6-10', percentage: 0.28 },
      { range: '11-15', percentage: 0.3 },
      { range: '16-20', percentage: 0.18 },
      { range: '21+', percentage: 0.12 }
    ]
  },
  punctuation: {
    ellipsisFrequency: 0.01,
    dashFrequency: 0.02,
    exclamationFrequency: 0.01,
    semicolonFrequency: 0.005,
    commaFrequency: 0.08
  },
  pacing: {
    averageParagraphLength: 90,
    averageLineBreaks: 1.8
  }
}

const Template = (args) => ({
  components: { VoiceProfileDisplay },
  setup() {
    setActivePinia(createPinia())

    const bibleStore = useStoryBibleStore()
    const msStore = useManuscriptStore()

    bibleStore.voiceProfile.profile = args.profile
    bibleStore.voiceProfile.locked = args.locked
    bibleStore.voiceProfile.lastUpdated = Date.now() - 120000
    bibleStore.voiceProfile.supplementaryMergeCount = args.supplementaryMergeCount ?? 0
    bibleStore.voiceProfile.manuscriptSizeAtExtraction = args.manuscriptSizeAtExtraction

    msStore.setManuscriptContent(' '.repeat(args.manuscriptWordCount ?? 15000))

    return {}
  },
  template: '<VoiceProfileDisplay />'
})

export const FullProfile = Template.bind({})
FullProfile.args = {
  profile: fullProfile,
  locked: false,
  manuscriptWordCount: 15000,
  manuscriptSizeAtExtraction: 15000,
  supplementaryMergeCount: 2
}

export const LockedWithGrowthWarning = Template.bind({})
LockedWithGrowthWarning.args = {
  profile: fullProfile,
  locked: true,
  manuscriptWordCount: 28000,
  manuscriptSizeAtExtraction: 15000,
  supplementaryMergeCount: 2
}

export const LowConfidence = Template.bind({})
LowConfidence.args = {
  profile: sparseProfile,
  locked: false,
  manuscriptWordCount: 1200,
  manuscriptSizeAtExtraction: 1200,
  supplementaryMergeCount: 0
}

export const Empty = Template.bind({})
Empty.args = {
  profile: null,
  locked: false,
  manuscriptWordCount: 100,
  manuscriptSizeAtExtraction: 0,
  supplementaryMergeCount: 0
}
