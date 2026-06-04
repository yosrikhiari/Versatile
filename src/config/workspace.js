export const WORKSPACE_TYPES = {
  CREATIVE: 'creative',
  LEGAL: 'legal',
  TECHNICAL: 'technical',
  BUSINESS: 'business',
  RESEARCH: 'research'
}

export const WORKSPACE_LABELS = {
  [WORKSPACE_TYPES.CREATIVE]: 'Creative Writing',
  [WORKSPACE_TYPES.LEGAL]: 'Legal Contracts & Agreements',
  [WORKSPACE_TYPES.TECHNICAL]: 'Technical Specifications',
  [WORKSPACE_TYPES.BUSINESS]: 'Business Reports & Documentation',
  [WORKSPACE_TYPES.RESEARCH]: 'Research & Academic Papers'
}

export const WORKSPACE_TERMINOLOGY = {
  [WORKSPACE_TYPES.CREATIVE]: {
    bible: 'Story Bible',
    sections: 'Chapters',
    generator: 'Story Generator',
    generatorLabel: 'Story Tools',
    entityLabel: 'Story Elements',
    characters: 'Characters',
    characterRole: 'Role',
    locations: 'Locations',
    plotThreads: 'Plot Threads',
    synopsisLabel: 'Story Synopsis'
  },
  [WORKSPACE_TYPES.LEGAL]: {
    bible: 'Contract Knowledge Base',
    sections: 'Clauses / Sections',
    generator: 'Contract Generator',
    generatorLabel: 'Contract Tools',
    entityLabel: 'Contract Definitions',
    characters: 'Parties',
    characterRole: 'Signatory Role',
    locations: 'Jurisdictions / Assets',
    plotThreads: 'Key Obligations',
    synopsisLabel: 'Contract Premise'
  },
  [WORKSPACE_TYPES.TECHNICAL]: {
    bible: 'Architecture & Specifications',
    sections: 'Sections',
    generator: 'Spec Builder',
    generatorLabel: 'Spec Tools',
    entityLabel: 'Spec Components',
    characters: 'User Personas',
    characterRole: 'User Role',
    locations: 'Environments / Systems',
    plotThreads: 'Milestones',
    synopsisLabel: 'System Premise'
  },
  [WORKSPACE_TYPES.BUSINESS]: {
    bible: 'Knowledge Base / Report Intelligence',
    sections: 'Sections',
    generator: 'Report Builder',
    generatorLabel: 'Report Tools',
    entityLabel: 'Business Entities',
    characters: 'Stakeholders',
    characterRole: 'Title / Stake',
    locations: 'Departments / Channels',
    plotThreads: 'Strategic Objectives',
    synopsisLabel: 'Report Synopsis'
  },
  [WORKSPACE_TYPES.RESEARCH]: {
    bible: 'Research Base',
    sections: 'Sections',
    generator: 'Research Assistant',
    generatorLabel: 'Research Tools',
    entityLabel: 'Key Variables',
    characters: 'Subjects / Cohorts',
    characterRole: 'Function / Group',
    locations: 'Sources / Facilities',
    plotThreads: 'Hypotheses',
    synopsisLabel: 'Abstract'
  }
}
