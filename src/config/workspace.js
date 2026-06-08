const WORKSPACE_CONFIGS = [
  { key: 'CREATIVE', type: 'creative', label: 'Creative Writing', icon: 'feather', description: 'Stories, poems, and any imaginative writing with characters and plot.', terminology: { bible: 'Story Bible', sections: 'Chapters', generator: 'Story Generator', generatorLabel: 'Story Tools', entityLabel: 'Story Elements', characters: 'Characters', characterRole: 'Role', locations: 'Locations', plotThreads: 'Plot Threads', synopsisLabel: 'Story Synopsis' } },
  { key: 'NOVEL', type: 'novel', label: 'Novel', icon: 'book-open', description: 'Full-length fiction with chapters, character arcs, and narrative structure.', terminology: { bible: 'Story Bible', sections: 'Chapters', generator: 'Chapter Generator', generatorLabel: 'Novel Tools', entityLabel: 'Story Elements', characters: 'Characters', characterRole: 'Role', locations: 'Settings', plotThreads: 'Plot Threads', synopsisLabel: 'Novel Synopsis' } },
  { key: 'SCREENPLAY', type: 'screenplay', label: 'Screenplay / Script', icon: 'clapperboard', description: 'Scripts for film, television, or stage with scene and dialogue formatting.', terminology: { bible: 'Script Bible', sections: 'Scenes', generator: 'Script Generator', generatorLabel: 'Script Tools', entityLabel: 'Script Elements', characters: 'Characters', characterRole: 'Role', locations: 'Settings', plotThreads: 'Storylines', synopsisLabel: 'Logline' } },
  { key: 'LEGAL', type: 'legal', label: 'Legal Contracts & Agreements', icon: 'scale', description: 'Contracts, agreements, NDAs, and legal documents with formal clause structure.', terminology: { bible: 'Contract Knowledge Base', sections: 'Clauses / Sections', generator: 'Contract Generator', generatorLabel: 'Contract Tools', entityLabel: 'Contract Definitions', characters: 'Parties', characterRole: 'Signatory Role', locations: 'Jurisdictions / Assets', plotThreads: 'Key Obligations', synopsisLabel: 'Contract Premise' } },
  { key: 'TECHNICAL', type: 'technical', label: 'Technical Specifications', icon: 'cpu', description: 'System specs, API docs, architecture designs, and engineering documents.', terminology: { bible: 'Architecture & Specifications', sections: 'Sections', generator: 'Spec Builder', generatorLabel: 'Spec Tools', entityLabel: 'Spec Components', characters: 'User Personas', characterRole: 'User Role', locations: 'Environments / Systems', plotThreads: 'Milestones', synopsisLabel: 'System Premise' } },
  { key: 'BUSINESS', type: 'business', label: 'Business Reports & Documentation', icon: 'bar-chart-3', description: 'Reports, proposals, strategic plans, and business correspondence.', terminology: { bible: 'Knowledge Base / Report Intelligence', sections: 'Sections', generator: 'Report Builder', generatorLabel: 'Report Tools', entityLabel: 'Business Entities', characters: 'Stakeholders', characterRole: 'Title / Stake', locations: 'Departments / Channels', plotThreads: 'Strategic Objectives', synopsisLabel: 'Report Synopsis' } },
  { key: 'RESEARCH', type: 'research', label: 'Research & Academic Papers', icon: 'flask-conical', description: 'Academic papers, studies, journal articles, and scientific documentation.', terminology: { bible: 'Research Base', sections: 'Sections', generator: 'Research Assistant', generatorLabel: 'Research Tools', entityLabel: 'Key Variables', characters: 'Subjects / Cohorts', characterRole: 'Function / Group', locations: 'Sources / Facilities', plotThreads: 'Hypotheses', synopsisLabel: 'Abstract' } },
  { key: 'INVOICE', type: 'invoice', label: 'Invoice', icon: 'file-text', description: 'Billing invoices, quotes, estimates, and financial statements.', terminology: { bible: 'Invoice Templates', sections: 'Line Items', generator: 'Invoice Generator', generatorLabel: 'Invoice Tools', entityLabel: 'Line Items', characters: 'Parties', characterRole: 'Role', locations: 'Billing Addresses', plotThreads: 'Payment Milestones', synopsisLabel: 'Invoice Summary' } },
  { key: 'PRESENTATION', type: 'presentation', label: 'Presentation / Slide Deck', icon: 'presentation', description: 'Slide decks, pitch decks, and visual presentation content.', terminology: { bible: 'Slide Library', sections: 'Slides', generator: 'Slide Generator', generatorLabel: 'Presentation Tools', entityLabel: 'Visual Elements', characters: 'Presenters / Stakeholders', characterRole: 'Role', locations: 'Venues / Channels', plotThreads: 'Key Messages', synopsisLabel: 'Presentation Abstract' } },
  { key: 'EMAIL', type: 'email', label: 'Email Campaign', icon: 'mail', description: 'Email campaigns, newsletters, and outreach sequences.', terminology: { bible: 'Campaign Assets', sections: 'Email Sections', generator: 'Campaign Generator', generatorLabel: 'Email Tools', entityLabel: 'Campaign Elements', characters: 'Target Audiences', characterRole: 'Segment Type', locations: 'Distribution Channels', plotThreads: 'Campaign Objectives', synopsisLabel: 'Campaign Brief' } },
  { key: 'DOCUMENTATION', type: 'documentation', label: 'User Guide / Documentation', icon: 'book-copy', description: 'User manuals, how-to guides, FAQs, and product documentation.', terminology: { bible: 'Knowledge Base', sections: 'Topics', generator: 'Doc Generator', generatorLabel: 'Doc Tools', entityLabel: 'Reference Elements', characters: 'User Personas', characterRole: 'User Type', locations: 'Environments', plotThreads: 'Learning Objectives', synopsisLabel: 'Document Abstract' } },
  { key: 'PRESS_RELEASE', type: 'pressRelease', label: 'Press Release', icon: 'megaphone', description: 'Media announcements, news releases, and public statements.', terminology: { bible: 'Media Kit', sections: 'Sections', generator: 'Release Generator', generatorLabel: 'PR Tools', entityLabel: 'Key Elements', characters: 'Spokespersons', characterRole: 'Title', locations: 'Markets / Regions', plotThreads: 'Key Announcements', synopsisLabel: 'Press Summary' } },
  { key: 'GRANT', type: 'grant', label: 'Grant Proposal', icon: 'hand', description: 'Research grants, funding proposals, and sponsorship requests.', terminology: { bible: 'Research Base', sections: 'Proposal Sections', generator: 'Proposal Generator', generatorLabel: 'Grant Tools', entityLabel: 'Proposal Elements', characters: 'Investigators', characterRole: 'Role', locations: 'Institutions', plotThreads: 'Research Objectives', synopsisLabel: 'Proposal Abstract' } },
  { key: 'MEETING', type: 'meeting', label: 'Meeting Notes / Minutes', icon: 'clipboard-pen', description: 'Meeting minutes, agendas, notes, and action item trackers.', terminology: { bible: 'Reference Materials', sections: 'Agenda Items', generator: 'Notes Generator', generatorLabel: 'Meeting Tools', entityLabel: 'Agenda Elements', characters: 'Attendees', characterRole: 'Role', locations: 'Meeting Rooms', plotThreads: 'Action Items', synopsisLabel: 'Meeting Summary' } },
  { key: 'CASE_STUDY', type: 'caseStudy', label: 'Case Study', icon: 'search', description: 'In-depth analysis of projects, customers, or scenarios.', terminology: { bible: 'Reference Cases', sections: 'Sections', generator: 'Case Generator', generatorLabel: 'Case Tools', entityLabel: 'Case Elements', characters: 'Subjects', characterRole: 'Stakeholder Role', locations: 'Contexts', plotThreads: 'Key Findings', synopsisLabel: 'Case Abstract' } },
  { key: 'GENERAL', type: 'general', label: 'General Document', icon: 'file', description: 'Any other type of document not covered above.', terminology: { bible: 'Reference Materials', sections: 'Sections', generator: 'Document Generator', generatorLabel: 'Document Tools', entityLabel: 'Elements', characters: 'People', characterRole: 'Role', locations: 'Places', plotThreads: 'Objectives', synopsisLabel: 'Summary' } }
]

const configByType = {}
for (const cfg of WORKSPACE_CONFIGS) {
  configByType[cfg.key] = cfg.type
}

export const WORKSPACE_TYPES = configByType

export const WORKSPACE_LABELS = WORKSPACE_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.type] = cfg.label
  return acc
}, {})

export const WORKSPACE_ICONS = WORKSPACE_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.type] = cfg.icon
  return acc
}, {})

export const WORKSPACE_DESCRIPTIONS = WORKSPACE_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.type] = cfg.description
  return acc
}, {})

export const WORKSPACE_TERMINOLOGY = WORKSPACE_CONFIGS.reduce((acc, cfg) => {
  acc[cfg.type] = cfg.terminology
  return acc
}, {})
