// ── Providers ──

export type ProviderName = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq'

export interface ProviderOptions {
  apiKey?: string
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  stop?: string[]
  timeout?: number
}

export interface ProviderModule {
  generate(
    prompt: string,
    systemPrompt: string,
    model: string | null,
    options: ProviderOptions
  ): Promise<string>
  stream(
    prompt: string,
    systemPrompt: string,
    model: string | null,
    onChunk: ((chunk: string, full: string) => void) | undefined,
    options: ProviderOptions
  ): Promise<string>
  /** Optional native structured-output path (tool-use / json_schema / format). */
  generateStructured?(
    prompt: string,
    systemPrompt: string,
    model: string | null,
    schema: Record<string, unknown>,
    options: ProviderOptions & { schemaName?: string }
  ): Promise<Record<string, unknown>>
  testConnection(apiKey?: string): Promise<boolean>
}

export type ProviderMap = Record<ProviderName, ProviderModule>

// ── Features ──

export type FeatureName =
  | 'spark'
  | 'polish'
  | 'content'
  | 'worldbuilding'
  | 'compaction'
  | 'story_generation'
  | 'network'
  | 'tagging'
  | 'character_chat'
  | 'pov_writing'
  | 'shape_analysis'
  | 'blurb'

export interface FeatureDefault {
  provider: ProviderName
  model: string | null
}

export type FeatureDefaults = Record<FeatureName, FeatureDefault>

// ── AI Generate options ──

export interface FeatureOverride {
  provider?: string
  model?: string | null
}

export interface AiGenerateOptions {
  feature?: FeatureName
  model?: string | null
  provider?: ProviderName
  signal?: AbortSignal
  temperature?: number
  maxTokens?: number
  stop?: string[]
  timeout?: number
  maxRetries?: number
  retryDelay?: number
  /** Injected settings — read from store by callers, consumed by aiGenerate/aiStream */
  defaultProvider?: ProviderName
  defaultModel?: string
  featureModels?: Record<string, FeatureOverride>
  fallbackProvider?: string
  /** JSON schema for structured output (aiGenerateStructured / aiGenerateJson). */
  schema?: Record<string, unknown>
  /** Name for the structured-output tool / schema (provider-dependent). */
  schemaName?: string
}

// ── Director ──

export interface DirectorGoalStructure {
  chapters: number
  scenesPerChapter?: number
  wordsPerChapter?: number
  volumes?: number
  chaptersPerVolume?: number
}

export interface DirectorGoal {
  premise: string
  genre?: string
  tone?: string
  wordTarget?: number
  structure?: DirectorGoalStructure
  horizon?: 'short_term' | 'long_term'
}

export interface DirectorScene {
  sceneNumber: number
  title: string
  emotionalGoal: string
  whatChanges: string
  obstacle: string
  sceneFunction: string
  charactersPresent: string[]
  characterWants: Record<string, unknown>
  location: string
  setup: string
  payoff: string
  sensoryAnchor: string
  arcPosition: string
  tension: string
  pacing: string
  estimatedWords: number
}

export interface DirectorChapter {
  chapterNumber: number
  title: string
  goal: string
  arcPosition: string
  emotionalTarget: string
  hookEnding: string
  estimatedWords: number
  volumeIndex?: number
  scenes: DirectorScene[]
}

export interface StoryArc {
  premise: string
  genre: string
  tone: string
  emotionalJourney: string
  centralConflict: string
  resolution: string
  totalChapters: number
  totalScenes: number
  totalEstimatedWords: number
}

export interface DirectorOutput {
  chapters: DirectorChapter[]
  scenes: DirectorScene[]
  storyArc: StoryArc
}

// ── Writer ──

export interface WriterStructuredOutput {
  prose: string
  usedEntities: {
    characterNames: string[]
    locationNames: string[]
    plotThreadTitles: string[]
  }
  newEntities: {
    characters: Array<{ name: string; role: string; description: string }>
    locations: Array<{ name: string; type: string; description: string }>
    plotThreads: Array<{ title: string; status: string; summary: string }>
  }
  networkEvents: Array<{
    type: string
    from: string
    to: string
    label: string
  }>
}

export interface WriterOutput {
  prose: string
  structured: WriterStructuredOutput
}

export interface WriterParams {
  sceneBrief: Record<string, unknown>
  storyArc?: StoryArc
  chapterLog?: string
  storyBible?: string
  onChunk?: (chunk: string, fullText: string) => void
  embeddingContext?: string
  storyContract?: string
  rejectedPatterns?: Array<{ context: string }>
  existingEntitiesJson?: string
  voiceProfile?: string
  completedScenes?: Array<{ prose: string; characters?: string[]; location?: string }>
  characters?: Array<{ name: string; role?: string }>
}

export interface WriterStructuredParams extends WriterParams {
  onRawChunk?: (chunk: string) => void
  spineContext?: string
  anchorRole?: string
  anchorConstraints?: string
  pastEvalResults?: string
}

// ── Critic ──

export interface CriticIssue {
  severity: 'major' | 'minor'
  type: string
  description: string
}

export interface CriticOutput {
  pass: boolean
  score: number | null
  evalUnavailable?: boolean
  dimensionScores?: Record<string, number | null>
  issues: CriticIssue[]
  strengths: string[]
}

export interface ContradictionDetail {
  type: string
  description: string
  between: [string, string]
}

export interface ContradictionReport {
  characterIssues: Array<{
    character: string
    contradictions: ContradictionDetail[]
  }>
  locationIssues: Array<{
    location: string
    contradictions: ContradictionDetail[]
  }>
  error?: string
}

export interface CriticParams {
  draft: string
  sceneBrief: {
    title: string
    emotionalGoal?: string
    charactersPresent: string[]
    payoff: string
    tension: string
  }
  storyBible?: string
  chapterLog?: string
  existingEntitiesJson?: string
}

export interface CheckContradictionsParams {
  characters: Array<{ name: string; role?: string; goal?: string; voice?: string; notes?: string; traits?: string[] }>
  locations: Array<{ name: string; description?: string; notes?: string; traits?: string[] }>
  sceneProse: Array<{ prose: string; characters?: string[]; location?: string }>
  synopsis?: string
}

// ── Revisor ──

export interface RevisorParams {
  draft: string
  critiqueResult: {
    issues: CriticIssue[]
    score?: number | null
  }
  sceneBrief: {
    title: string
    emotionalGoal?: string
    charactersPresent: string[]
    tension: string
  }
  storyBible?: string
  existingEntitiesJson?: string
}

// ── Prompts ──

export interface PromptSet {
  director: string
  writer: string
  critic: string
  revisor: string
}

// ── Embedding ──

export type EmbeddingProviderName = 'ollama' | 'mistral'

export interface EmbeddingCapabilities {
  maxBatchSize: number
  supportsBatching: boolean
  maxInputTokens: number
  maxConcurrentRequests: number
}
