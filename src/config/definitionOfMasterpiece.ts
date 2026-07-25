export const DEFINITION_OF_MASTERPIECE = {
  proseQuality: {
    minAvgDimensionScore: 7,
    lengthRatio: {
      min: 0.8,
      max: 1.2
    }
  },
  proseBaseline: {
    minWordCount: 150,
    maxWordCount: 1500,
    qualityThreshold: 7,
    description: 'Absolute expected prose range for a single scene — catches pathological first-attempt truncation (e.g. 16-word bug, Stage 6)'
  }
}
