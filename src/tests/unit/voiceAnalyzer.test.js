import { describe, it, expect } from 'vitest'
import { analyzeVoiceProfile } from '../../services/generation/voiceAnalyzer'

describe('voiceAnalyzer', () => {
  describe('analyzeVoiceProfile', () => {
    it('should return null for empty input', () => {
      expect(analyzeVoiceProfile([])).toBeNull()
      expect(analyzeVoiceProfile(null)).toBeNull()
    })

    it('should return null if text is too short', () => {
      const shortText = 'This is too short.'
      expect(analyzeVoiceProfile([shortText])).toBeNull()
    })

    it('should extract metrics from valid text sample', () => {
      const literarySample = generateLiterarySample()
      const profile = analyzeVoiceProfile([literarySample])

      expect(profile).not.toBeNull()
      expect(profile.vocabulary).toBeDefined()
      expect(profile.sentenceStructure).toBeDefined()
      expect(profile.punctuation).toBeDefined()
      expect(profile.pacing).toBeDefined()
      expect(profile.metadata).toBeDefined()
    })

    it('should calculate vocabulary metrics correctly', () => {
      const text = 'The cat sat. The dog ran. The bird flew. The cat sat again.'
      // Pad to minimum length
      const paddedText = text + '\n' + text.repeat(100)
      const profile = analyzeVoiceProfile([paddedText])

      expect(profile.vocabulary.totalWords).toBeGreaterThan(0)
      expect(profile.vocabulary.uniqueWords).toBeGreaterThan(0)
      expect(parseFloat(profile.vocabulary.uniqueWordRatio)).toBeGreaterThan(0)
      expect(parseFloat(profile.vocabulary.uniqueWordRatio)).toBeLessThanOrEqual(1)
      expect(profile.vocabulary.averageWordLength).toBeGreaterThan(0)
      expect(profile.vocabulary.mostCommonWords.length).toBeGreaterThan(0)
    })

    it('should calculate sentence structure metrics', () => {
      const sample = generateLiterarySample()
      const profile = analyzeVoiceProfile([sample])

      expect(profile.sentenceStructure.sentences.length).toBeGreaterThan(0)
      expect(profile.sentenceStructure.lengths.length).toBeGreaterThan(0)
      expect(parseFloat(profile.sentenceStructure.averageSentenceLength)).toBeGreaterThan(0)
      expect(profile.sentenceStructure.sentenceLengthDistribution).toBeDefined()
      expect(profile.sentenceStructure.sentenceLengthDistribution.length).toBe(4)
      expect(parseFloat(profile.sentenceStructure.dialogueRatio)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(profile.sentenceStructure.dialogueRatio)).toBeLessThanOrEqual(1)
    })

    it('should calculate punctuation metrics', () => {
      const textWithPunctuation = generateTextWithVariedPunctuation()
      const profile = analyzeVoiceProfile([textWithPunctuation])

      expect(profile.punctuation.ellipsisFrequency).toBeDefined()
      expect(profile.punctuation.dashFrequency).toBeDefined()
      expect(profile.punctuation.exclamationFrequency).toBeDefined()
      expect(profile.punctuation.semicolonFrequency).toBeDefined()
      expect(profile.punctuation.commaFrequency).toBeDefined()
    })

    it('should calculate pacing metrics', () => {
      const sample = generateLiterarySample()
      const profile = analyzeVoiceProfile([sample])

      expect(profile.pacing.averageParagraphLength).toBeGreaterThan(0)
      expect(profile.pacing.paragraphLengthDistribution).toBeDefined()
      expect(profile.pacing.paragraphLengthDistribution.length).toBe(4)
      expect(profile.pacing.averageLineBreaks).toBeGreaterThanOrEqual(0)
    })

    it('should calculate confidence based on sample size', () => {
      const smallSample = generateTextOfWordCount(500)
      const largeSample = generateTextOfWordCount(5000)

      const smallProfile = analyzeVoiceProfile([smallSample])
      const largeProfile = analyzeVoiceProfile([largeSample])

      expect(smallProfile.metadata.confidence).toBeGreaterThanOrEqual(0.5)
      expect(largeProfile.metadata.confidence).toBeGreaterThan(smallProfile.metadata.confidence)
      expect(largeProfile.metadata.confidence).toBeLessThanOrEqual(1)
    })

    it('should distinguish between literary and commercial prose', () => {
      const literarySample = generateLiterarySample()
      const commercialSample = generateCommercialSample()

      const literaryProfile = analyzeVoiceProfile([literarySample])
      const commercialProfile = analyzeVoiceProfile([commercialSample])

      // Literary typically has longer sentences
      expect(parseFloat(literaryProfile.sentenceStructure.averageSentenceLength)).toBeGreaterThan(
        parseFloat(commercialProfile.sentenceStructure.averageSentenceLength)
      )

      // Both profiles should be different (commercial is more action-oriented)
      expect(commercialProfile.sentenceStructure.averageSentenceLength).not.toBe(
        literaryProfile.sentenceStructure.averageSentenceLength
      )
    })

    it('should handle multiple text samples by merging them', () => {
      const sample1 = generateTextOfWordCount(500)
      const sample2 = generateTextOfWordCount(500)

      const mergedProfile = analyzeVoiceProfile([sample1, sample2])

      expect(mergedProfile).not.toBeNull()
      expect(mergedProfile.metadata.totalWords).toBeGreaterThanOrEqual(1000)
    })

    it('should calculate consistency score for varied sentence lengths', () => {
      const consistentText = generateConsistentText()
      const variedText = generateVariedText()

      const consistentProfile = analyzeVoiceProfile([consistentText])
      const variedProfile = analyzeVoiceProfile([variedText])

      // Consistent text should have higher consistency score
      expect(parseFloat(consistentProfile.metadata.consistency)).toBeGreaterThan(
        parseFloat(variedProfile.metadata.consistency)
      )
    })

    it('should handle dialogue-heavy prose', () => {
      const dialogueSample = generateDialogueHeavySample()
      const profile = analyzeVoiceProfile([dialogueSample])

      expect(profile.sentenceStructure.hasDialogue).toBe(true)
      expect(parseFloat(profile.sentenceStructure.dialogueRatio)).toBeGreaterThan(0.15)
    })

    it('should handle introspective prose with little dialogue', () => {
      const introspectiveSample = generateIntrospectiveSample()
      const profile = analyzeVoiceProfile([introspectiveSample])

      expect(parseFloat(profile.sentenceStructure.dialogueRatio)).toBeLessThan(0.1)
    })

    it('should handle text with ellipsis and dashes', () => {
      const textWithPunctuation = `
        She stood there... waiting. The wind was cold—too cold.
        He wondered if she would return. The silence stretched between them...
        ${generateTextOfWordCount(600)}
      `

      const profile = analyzeVoiceProfile([textWithPunctuation])

      expect(parseFloat(profile.punctuation.ellipsisFrequency)).toBeGreaterThan(0)
      expect(parseFloat(profile.punctuation.dashFrequency)).toBeGreaterThan(0)
    })

    it('should return metadata with correct word/sentence/character counts', () => {
      const sample = generateLiterarySample()
      const profile = analyzeVoiceProfile([sample])

      expect(profile.metadata.totalCharacters).toBeGreaterThan(0)
      expect(profile.metadata.totalWords).toBeGreaterThan(0)
      expect(profile.metadata.totalSentences).toBeGreaterThan(0)
      expect(profile.metadata.sampleSize).toEqual(profile.metadata.totalWords)
      expect(parseFloat(profile.metadata.consistency)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(profile.metadata.consistency)).toBeLessThanOrEqual(1)
    })

    it('should be stable across multiple analyses of same text', () => {
      const sample = generateLiterarySample()

      const profile1 = analyzeVoiceProfile([sample])
      const profile2 = analyzeVoiceProfile([sample])

      expect(profile1.vocabulary.averageWordLength).toEqual(profile2.vocabulary.averageWordLength)
      expect(profile1.sentenceStructure.averageSentenceLength).toEqual(
        profile2.sentenceStructure.averageSentenceLength
      )
      expect(profile1.pacing.averageParagraphLength).toEqual(profile2.pacing.averageParagraphLength)
    })
  })
})

// ============================================================================
// Test Helper Functions
// ============================================================================

function generateLiterarySample() {
  return `
The morning light filtered through the leaves, casting delicate shadows upon the forest floor. 
She walked slowly, deliberately, each step measured and thoughtful. The world around her seemed 
to pause, waiting for her decision, holding its breath in anticipation.

The trees whispered their ancient secrets. She could almost hear them, almost understand the 
language of wood and root, of growth and time. But perhaps it was only the wind, or her own 
imagination running wild in the quiet of the forest.

She had come here seeking answers, but what she had found instead was something far more valuable: 
a moment of stillness in her restless heart. The forest embraced her, wrapped around her like a 
protective cloak, offering solace in its silence.

He appeared suddenly, stepping from between two oaks as if materializing from the forest itself. 
She turned, unsurprised, as if she had always known he would come. Their eyes met, and in that 
instant, an entire lifetime of understanding passed between them.

"I've been searching for you," he said quietly, each word carefully chosen. The forest listened, 
the trees bending closer to hear his confession. She smiled, a small sad smile that spoke of 
acceptance and resignation.

"I know," she replied. "I've been waiting."

And there, in the dappled light beneath the ancient trees, two souls found what they had been 
seeking all along—not answers, but the comfort of being found.
  `.repeat(3) // Repeat to ensure sufficient length
}

function generateCommercialSample() {
  return `
Sarah burst into the office, coffee in hand and determination in her eyes. The project deadline 
was in two hours, and they were still behind schedule. She had to fix this. Fast.

"Everybody listen up!" she shouted. The team stopped what they were doing. Phones went down. 
Conversations halted. They knew that tone—crisis mode.

"We need to cut the feature set in half. Here's what stays and what goes." Sarah walked them 
through her plan. It was aggressive. It was risky. It might work.

"Can we really do this?" Tom asked, skeptical. Sarah nodded. "We have to. It's the only way."

The next two hours were chaos. Developers typed furiously. Testers ran through scenarios. Sarah 
moved between desks, answering questions, making decisions, keeping everyone focused.

At 4:47 PM, the build went live. The team exhaled. They had done it. It wasn't perfect, but it 
was done. And done was better than perfect when the clock was ticking.

"Great work everyone," Sarah said, finally allowing herself to sit down. "Seriously. I couldn't 
have done this without you." The team cheered. They had survived another crisis. Tomorrow there 
would be new problems to solve. But tonight? Tonight they would celebrate.
  `.repeat(3)
}

function generateDialogueHeavySample() {
  return `
"Where have you been?" Maya demanded, hands on her hips.

"Out," James said simply.

"Out where? I've been worried sick!"

"I just needed some air, okay? Is that so wrong?"

"You could have told me. You could have left a note. You could have done anything except disappear 
without telling me where you were going!"

James sighed. "You're right. I'm sorry."

"Sorry doesn't cut it this time, James. Do you understand how scared I was?"

"Yes, I understand. And I said I was sorry. What more do you want from me?"

"I want you to think about someone other than yourself for once. I want you to consider how your 
actions affect other people."

"That's not fair. You know I care about you."

"Then show it. Don't just say it."

James reached for her, but she stepped back. The distance between them felt vast.

"I don't know what to do here," James whispered.

"Neither do I," Maya replied, and she walked out of the room.
  `.repeat(5)
}

function generateIntrospectiveSample() {
  return `
She stood at the edge of the cliff and wondered what it meant to be alive. Was it the beating 
of her heart? The breath in her lungs? Or was it something more ephemeral, something that couldn't 
be measured or quantified?

The sunset painted the sky in shades of orange and crimson. She had seen sunsets before, many times, 
but this one felt different. This one felt like a beginning and an ending all at once.

What had she accomplished in her life? What mark had she left on the world? These questions haunted 
her, echoing in the chambers of her mind like unanswered prayers.

She thought of her childhood, of the dreams she had held so tightly in her fists. Where had those 
dreams gone? Had she abandoned them, or had they simply slipped away like sand through her fingers?

The wind picked up, carrying with it the scent of earth and sea. She closed her eyes and breathed 
it in, letting it fill her lungs, letting it remind her that she was still alive. Still here. Still 
possible.

But for how much longer? That was the question that kept her awake at night. How much time did she 
have left? How many more sunsets would she see? How many more mornings would she wake to?

She didn't have the answers. But standing there, on the edge of the world, she felt oddly at peace 
with the uncertainty. Life was uncertain. That was its beauty and its terror, all wrapped up together 
in one incomprehensible package.

She turned and walked back toward the town, her footsteps slow and deliberate, her mind still churning 
with these unanswerable questions.
  `.repeat(4)
}

function generateConsistentText() {
  // Sentences of similar length
  const template =
    'The cat sat on the mat. The dog ran through the yard. The bird flew above the trees.'
  return template.repeat(50)
}

function generateVariedText() {
  // Sentences of vastly different lengths
  return `
I went. She walked quickly through the dense forest, her footsteps careful and measured upon the 
winding path. He ran. They wandered through the marketplace, examining the various goods and wares 
displayed by the merchants. It was dark. The ancient cathedral stood silent and magnificent, a 
testament to the devotion and craftsmanship of generations long past, its soaring arches reaching 
toward the heavens in eternal aspiration.
  `.repeat(20)
}

function generateTextOfWordCount(targetWords) {
  let text = ''
  const words = [
    'the',
    'and',
    'a',
    'to',
    'of',
    'in',
    'that',
    'is',
    'was',
    'he',
    'for',
    'it',
    'with',
    'as',
    'I',
    'his',
    'they',
    'be',
    'at',
    'one',
    'all',
    'have',
    'this',
    'from',
    'or',
    'had',
    'by',
    'on',
    'are',
    'but',
    'not',
    'you',
    'can',
    'her',
    'there',
    'been',
    'has',
    'were',
    'said',
    'did',
    'do',
    'who',
    'would',
    'could',
    'their',
    'will',
    'more',
    'when',
    'time',
    'very',
    'what',
    'some',
    'could',
    'them',
    'these',
    'then',
    'now',
    'look',
    'only',
    'come',
    'its',
    'over',
    'think',
    'also',
    'back',
    'after',
    'use',
    'two',
    'how',
    'our',
    'work',
    'first',
    'well',
    'way',
    'even',
    'new',
    'want',
    'because',
    'any',
    'these',
    'give',
    'day',
    'most',
    'us',
    'know',
    'such'
  ]

  let wordCount = 0
  while (wordCount < targetWords) {
    const randomWord = words[Math.floor(Math.random() * words.length)]
    text += randomWord + ' '
    wordCount++
  }

  return text
}

function generateTextWithVariedPunctuation() {
  return `
She wondered if he would return... Perhaps not. The answer was unclear—so very unclear. "Did you 
hear that?" she asked. He didn't respond; instead, he stared at the horizon. She felt frustrated! 
Really, truly frustrated. "This is ridiculous," she muttered. The silence stretched on... and on... 
and on. It was unbearable—absolutely unbearable. She had to do something; anything; something!

${generateTextOfWordCount(600)}
  `
}
