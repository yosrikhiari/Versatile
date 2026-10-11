export type OverallLabel = 'pass' | 'revise' | 'rewrite'

export interface SceneLabel {
  id: string
  storyId: string
  sceneTitle: string
  reviewerName: string
  overallLabel: OverallLabel
  dimensionLabels: Record<string, string>
  dimensionScores: Record<string, number>
  notes: string
  wordCount: number
  sceneExcerpt: string
  createdAt: string
}

export interface SceneLabelInput {
  storyId: string
  sceneTitle: string
  reviewerName: string
  overallLabel: OverallLabel
  dimensionLabels: Record<string, string>
  dimensionScores: Record<string, number>
  notes: string
  wordCount: number
  sceneExcerpt: string
}

export const OVERALL_LABELS: { value: OverallLabel; label: string; description: string }[] = [
  { value: 'pass', label: 'Pass', description: 'Scene is good as-is' },
  { value: 'revise', label: 'Revise', description: 'Scene needs minor revision' },
  { value: 'rewrite', label: 'Rewrite', description: 'Scene needs full rewrite' }
]

export const DIMENSION_LABEL_VALUES = ['problem', 'fine', 'unsure'] as const
export type DimensionLabelValue = (typeof DIMENSION_LABEL_VALUES)[number]
