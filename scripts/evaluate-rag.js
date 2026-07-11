import 'fake-indexeddb/auto'

import { db } from '../src/services/db-core'
import {
  addResearchDocument,
  addResearchChunks,
  updateChunkEmbeddings,
  searchLexical,
  semanticSearch
} from '../src/services/researchDb'
import { runEvaluation, formatReport } from '../src/evaluation/ragEvaluator'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROJECT_ID = 'eval-production'

const TOPIC_NAMES = [
  'fantasy',
  'mystery',
  'romance',
  'sciFi',
  'historical',
  'horror',
  'adventure',
  'thriller',
  'drama',
  'comedy'
]

const KEYWORDS = {
  fantasy: [
    'magic',
    'wizard',
    'dragon',
    'spell',
    'enchanted',
    'sword',
    'quest',
    'kingdom',
    'prophecy',
    'mythical',
    'sorcerer',
    'castle',
    'amulet',
    'tower',
    'goblin',
    'elf',
    'rune',
    'staff',
    'ancient',
    'realm',
    'champion',
    'battle',
    'darkness',
    'mage',
    'wand',
    'crystal',
    'portal',
    'fairy',
    'beast',
    'armor'
  ],
  mystery: [
    'detective',
    'clue',
    'suspect',
    'murder',
    'investigation',
    'motive',
    'evidence',
    'alibi',
    'whodunit',
    'mystery',
    'crime',
    'victim',
    'poison',
    'forensic',
    'interrogation',
    'witness',
    'fingerprint',
    'case',
    'detective',
    'killer',
    'dead',
    'weapon',
    'scene',
    'examiner',
    'trace',
    'rare',
    'toxin',
    'death',
    'planned',
    'elusive'
  ],
  romance: [
    'love',
    'heart',
    'passion',
    'embrace',
    'devotion',
    'romance',
    'soulmate',
    'chemistry',
    'courtship',
    'attraction',
    'relationship',
    'connection',
    'warmth',
    'tender',
    'kiss',
    'affection',
    'intimacy',
    'partner',
    'emotion',
    'desire',
    'together',
    'marriage',
    'proposal',
    'vulnerability',
    'devotion',
    'healing',
    'love',
    'accidental',
    'perfect',
    'certain'
  ],
  sciFi: [
    'space',
    'robot',
    'alien',
    'quantum',
    'futuristic',
    'starship',
    'dimension',
    'technology',
    'cyborg',
    'artificial',
    'exoplanet',
    'spacecraft',
    'sensors',
    'orbital',
    'hologram',
    'neural',
    'plasma',
    'gravity',
    'cosmic',
    'interstellar',
    'subspace',
    'intelligence',
    'network',
    'entanglement',
    'communication',
    'fundamental',
    'universe',
    'station',
    'combat',
    'data'
  ],
  historical: [
    'medieval',
    'ancient',
    'empire',
    'throne',
    'revolution',
    'century',
    'era',
    'kingdom',
    'heritage',
    'ancestor',
    'coronation',
    'dynasty',
    'monarch',
    'peasant',
    'noble',
    'castle',
    'army',
    'treaty',
    'crown',
    'rebellion',
    'tradition',
    'centuries',
    'border',
    'fractured',
    'treasury',
    'declaration',
    'whisper',
    'movement',
    'printer',
    'secret'
  ],
  horror: [
    'dark',
    'shadow',
    'monster',
    'ghost',
    'haunted',
    'blood',
    'terror',
    'scream',
    'creature',
    'nightmare',
    'corridor',
    'door',
    'memory',
    'conscious',
    'dream',
    'pursued',
    'footsteps',
    'inevitable',
    'undead',
    'supernatural',
    'whisper',
    'patient',
    'changing',
    'profound',
    'dread',
    'menace',
    'moonlight',
    'cemetery',
    'howl',
    'possession'
  ],
  adventure: [
    'journey',
    'expedition',
    'treasure',
    'explore',
    'survive',
    'discover',
    'voyage',
    'wilderness',
    'peril',
    'quest',
    'uncharted',
    'jungle',
    'desert',
    'island',
    'map',
    'discovery',
    'survivors',
    'cave',
    'temple',
    'uncharted',
    'territory',
    'dangerous',
    'storm',
    'knowledge',
    'precious',
    'stranded',
    'volcanic',
    'chamber',
    'rescue',
    'ancient'
  ],
  thriller: [
    'conspiracy',
    'chase',
    'agent',
    'secret',
    'mission',
    'pursuit',
    'undercover',
    'hostage',
    'cover',
    'intrigue',
    'extraction',
    'operation',
    'compromised',
    'mole',
    'surveillance',
    'encrypted',
    'safehouse',
    'covert',
    'hunted',
    'operative',
    'dangerous',
    'paranoia',
    'tunnel',
    'midnight',
    'betrayal',
    'organization',
    'network',
    'survival',
    'instinct',
    'shadow'
  ],
  drama: [
    'conflict',
    'betrayal',
    'struggle',
    'sacrifice',
    'redemption',
    'emotional',
    'tragedy',
    'crisis',
    'family',
    'relationship',
    'marriage',
    'special',
    'needs',
    'eroded',
    'responsibility',
    'career',
    'accumulated',
    'mirror',
    'unravel',
    'revelation',
    'lies',
    'anger',
    'silence',
    'survive',
    'together',
    'weight',
    'connection',
    'breaking',
    'pieces',
    'build'
  ],
  comedy: [
    'funny',
    'humor',
    'wit',
    'satire',
    'irony',
    'comic',
    'absurd',
    'quirky',
    'laugh',
    'joke',
    'comedian',
    'audience',
    'punchline',
    'standup',
    'hilarious',
    'entertaining',
    'amusing',
    'ridiculous',
    'sarcasm',
    'laughter',
    'newsletter',
    'material',
    'performance',
    'humiliated',
    'cultivating',
    'workshopped',
    'polished',
    'tragicomic',
    'subscribers',
    'disaster'
  ]
}

const PROSE_CHUNKS = [
  {
    topic: 'fantasy',
    text: `The old wizard ran his fingers along the spine of the grimoire, feeling the spell within pulse like a second heartbeat. Beyond the tower window, a dragon circled the kingdom's highest spire, its shadow rippling across the cobblestones below. The prophecy spoke of a child born under the wandering moon, one who would wield a sword of pure starlight against the encroaching dark. Kaelen had always thought it myth — until the runes on his palm began to glow.`
  },
  {
    topic: 'fantasy',
    text: `The enchanted forest whispered secrets to those who knew how to listen. Lyra had spent her whole life learning the language of the trees, the silent communication of root and leaf that bound the mythical realm together. When the ancient sword appeared embedded in the stone at the heart of the grove, she knew the quest had truly begun. The kingdom needed a champion, and the prophecy had chosen her — whether she was ready or not.`
  },
  {
    topic: 'fantasy',
    text: `Merrick the wizard stood at the edge of the battlefield, his staff crackling with stored spell energy that would soon be released upon the goblin horde. Behind him, the castle's defenders gripped their enchanted blades and whispered prayers to the old gods. The dragon overhead released a column of fire that turned the night sky to amber, and in that terrible light, Merrick saw the face of the enemy commander in his dreams when the prophecy had first been spoken.`
  },

  {
    topic: 'mystery',
    text: `Detective Chen knelt beside the body, noting the position of the hands, the single shell casing, the absence of forced entry. The evidence told a story, but not the whole story. Someone had cleaned the wound before the police arrived — an act of care that contradicted the violence of the murder itself. She scanned the room for anything out of place, searching for the one clue the killer had overlooked. The motive was personal; she could feel it in her gut.`
  },
  {
    topic: 'mystery',
    text: `The suspect had an alibi that seemed ironclad — dinner with three respected colleagues, receipts from a restaurant across town, CCTV footage showing him entering his apartment at midnight. But Detective Marquez had learned to distrust perfect stories. The murder weapon was a letter opener from the victim's own desk, wiped clean of prints and placed carefully in the evidence bag. Whoever had done this knew police procedure.`
  },
  {
    topic: 'mystery',
    text: `The investigation had stalled until the medical examiner found the trace of poison in the victim's coffee. It was a rare toxin, difficult to obtain, and that narrowed the list of suspects dramatically. But motive remained elusive — the victim was beloved by everyone who knew her, a philanthropist with no known enemies. Someone had wanted her dead badly enough to plan meticulously, to acquire exotic poisons and execute a near-perfect murder.`
  },

  {
    topic: 'romance',
    text: `She had not expected to find love in a city of strangers, but his laugh found her across the crowded gallery and something in her chest unlocked. Their courtship unfolded in stolen glances and accidental brushes at the coat check, each encounter deepening the quiet chemistry between them. When he finally took her hand beneath the amber lights of the museum atrium, she felt the unmistakable pull of true attraction — not the fireworks of storybooks, but something warmer, quieter, more real.`
  },
  {
    topic: 'romance',
    text: `The attraction between them was immediate and unsettling. Elena had not come to the coastal village looking for love — she had come to heal, to escape the debris of a failed relationship that had left her heart in fragments. But the innkeeper's son had a way of looking at her that made her feel seen in a way she had never experienced before. Their courtship was slow, deliberate, each conversation peeling back another layer.`
  },
  {
    topic: 'romance',
    text: `He proposed on a Tuesday afternoon, in the middle of a thunderstorm, with no ring and no plan. Just the words, raw and unpolished, offered with the same vulnerability that had defined their entire relationship. She said yes before the thunder could swallow his question, her devotion to this imperfect, wonderful man the most certain thing she had ever felt. They laughed about how the romance of the moment had been entirely accidental — and somehow all the more perfect for it.`
  },

  {
    topic: 'sciFi',
    text: `The starship descended through the methane clouds of the exoplanet, its quantum drive humming at a frequency just below human hearing. Commander Reyes studied the alien structure on the viewscreen — a lattice of geometric spires that predated human civilization by millennia. The ship's artificial intelligence had detected signs of technology far beyond anything in the fleet's databases. First contact was no longer a question of if, but of what they would find looking back at them.`
  },
  {
    topic: 'sciFi',
    text: `The cyborg's optical sensors adjusted automatically to the low light of the derelict space station. Lieutenant Park moved through the corridors with the practiced silence of someone who had spent years in zero-g combat operations, her artificial limbs responding with inhuman precision. The alien technology that lined the walls pulsed with an organic rhythm, as if the station itself were alive and breathing. First contact protocols had gone out the window hours ago.`
  },
  {
    topic: 'sciFi',
    text: `Dr. Nkosi had theorized that quantum entanglement could be used for instantaneous communication across vast distances, but even she had not anticipated finding a naturally occurring quantum network woven into the fabric of this dimension. The robots she had deployed to map the subspace topology returned data that suggested intelligence — not artificial, but something older, stranger, woven into the fundamental equations of reality itself.`
  },

  {
    topic: 'historical',
    text: `In the winter of 1347, the ancient city of Florence found itself at the mercy of a foe no army could defeat. The great empire of commerce and art that had taken centuries to build now crumbled beneath the weight of plague and superstition. Mattea watched from her father's apothecary as the last surviving member of the Medici line was carried past, his throne abandoned for a sickbed. The revolution that would follow would not be of swords but of ideas.`
  },
  {
    topic: 'historical',
    text: `The revolution began not with a declaration but with a whisper, passed from shopkeeper to scholar in the narrow streets of the ancient city. The empire had ruled for centuries, its throne secured by tradition and terror in equal measure. But now, as crops failed and the treasury emptied, the whispers grew louder. Elara, a printer's daughter who had learned to read in secret, found herself at the center of a movement that would reshape the medieval world.`
  },
  {
    topic: 'historical',
    text: `The coronation ceremony had lasted six hours, every gesture heavy with centuries of tradition. King Aldric sat upon the throne of his ancestors, the weight of the crown pressing against his brow like a question he could not answer. His kingdom was fractured, his treasury depleted, and on the northern border, an army gathered that threatened to erase everything his dynasty had built. The era of peace was over, and the era of upheaval had begun.`
  },

  {
    topic: 'horror',
    text: `The house remembered. Eleanor felt it the moment she stepped through the front door — a presence coiled in the dark corners where the gaslight did not reach. At first she dismissed the whispers as old timber settling, the creak of a hundred years of weather and neglect. But when she woke to find bloody footprints leading from the basement to her bedside, the comfortable explanations dissolved into terror. Something had been waiting for her.`
  },
  {
    topic: 'horror',
    text: `The screaming started at midnight, always from the direction of the old well. Sarah had learned to ignore it by the third night, had taught herself to stay in bed even when every instinct screamed at her to run. But the creature that lived in the shadows beneath the house was patient. It had waited decades for someone sensitive enough to hear its call, and now that Sarah had heard, it would never let her go.`
  },
  {
    topic: 'horror',
    text: `The nightmare always began the same way: a long corridor with doors on either side, each one slightly ajar, each one containing a memory so terrible that Dr. Marasco's conscious mind had locked it away. He walked the corridor in his dreams every night, a silent scream caught in his throat, knowing that one day he would run out of doors and be forced to face what lay behind the last one.`
  },

  {
    topic: 'adventure',
    text: `The expedition had set out at dawn, a dozen souls carrying little more than rope, resolve, and a weathered map that promised treasure buried somewhere in the uncharted jungle. By the third day they had lost two members to the treacherous river crossing and their guide to a mysterious illness. But the thrill of discovery pushed them onward through the wilderness, each step deeper into peril. Somewhere ahead, in a temple swallowed by vines, the prize awaited.`
  },
  {
    topic: 'adventure',
    text: `The map led them through three countries and into the heart of a desert so vast it felt like another world. Kira's expedition had dwindled from twenty to seven, the others turned back by heat, injury, or fear of what they might find. The treasure, if it existed, was not gold or jewels but knowledge — a library of pre-civilization texts that could rewrite human history. Surviving the journey meant crossing territories where no modern foot had stepped.`
  },
  {
    topic: 'adventure',
    text: `The survivors had been stranded on the island for forty-three days when they discovered the cave system. It was not rescue they sought in those dark tunnels, but shelter from the relentless tropical storm. What they found instead was a network of passages leading deep into the volcanic heart of the island, chambers filled with ancient carvings and the skeletal remains of a vanished civilization. The journey out was no longer their primary concern.`
  },

  {
    topic: 'thriller',
    text: `The undercover agent had spent eighteen months building his cover, every detail of his false identity curated and tested against the organization's relentless scrutiny. Now, with the extraction window closing and a hostage's life hanging in the balance, a single mistake could end the mission. He activated the transmitter concealed in his watch and whispered the code phrase that would launch the pursuit team into action. Somewhere in the building, someone was coming for him.`
  },
  {
    topic: 'thriller',
    text: `The conspiracy reached higher than anyone had anticipated. Agent Morrison had started with a simple data leak investigation, but each layer he peeled back revealed a deeper cover, a more intricate web of secrets and lies. Now he was in a safe house in Prague, a hostage's life depending on his ability to stay off the grid while decoding the encrypted files that would expose the entire operation. The chase was on.`
  },
  {
    topic: 'thriller',
    text: `The extraction went wrong at 0300 hours. The agent on the ground had been compromised, her cover blown by a mole deep inside the organization. Now the pursuit team was closing in, and the only way out was through a maze of underground tunnels that might or might not lead to the extraction point. Every shadow could be an enemy, every sound a bullet waiting to find its mark. Paranoia was the only reliable survival instinct.`
  },

  {
    topic: 'drama',
    text: `The betrayal had not been dramatic — no shouting, no slammed doors, just a quietly signed divorce paper left on the kitchen counter where Nora would find it after her shift. The family she had sacrificed everything to hold together was fracturing, and the conflict between her husband's ambitions and her own needs had finally reached its breaking point. She stared at the document for a long time, the emotional weight of ten years compressed into a single page.`
  },
  {
    topic: 'drama',
    text: `The struggle of raising a child with special needs had tested Claire's marriage to its breaking point. She and her husband had once been partners in everything, but the sleepless nights and endless appointments had eroded their connection until only the shared responsibility remained. The sacrifice of her career, her friendships, her sense of self — she had made it willingly, but the emotional toll had accumulated silently, and now she was not sure she recognized the woman in the mirror.`
  },
  {
    topic: 'drama',
    text: `The crisis came at dinner, as these things often do. What started as a discussion about grades escalated into a revelation about lies and betrayals that none of them would recover from. Marcus watched his family unravel across the table — his wife's tears, his daughter's anger, his son's silence — and knew that he was the cause. The redemption he sought would not come from apology alone. Some actions could not be undone, only survived.`
  },

  {
    topic: 'comedy',
    text: `Barry's stand-up career was going exactly nowhere, which he supposed was technically better than going somewhere and then falling off a cliff. His material — a deeply researched bit about the absurdity of artisan toast — had killed exactly once, at an open mic where the previous comic had fled the stage mid-set. The irony of making people laugh for a living while being profoundly unhappy was not lost on him; it was, in fact, the basis for his entire second act.`
  },
  {
    topic: 'comedy',
    text: `Gerald's attempt at satire was, by all objective measures, a disaster. His newsletter — 'The Weekly Snark' — had exactly four subscribers, three of whom were his mother using different email addresses. But the absurdity of the situation was not lost on him. Here he was, a man in his forties with a degree in political science, writing jokes about municipal zoning laws that exactly nobody found funny.`
  },
  {
    topic: 'comedy',
    text: `The irony of being a comedian who could not make his own daughter laugh was the kind of material that wrote itself. Stan stood at the edge of the schoolyard, watching his seven-year-old perform stand-up routines for her friends with a natural wit that he had spent twenty years cultivating. His jokes were labored constructions, each punchline workshopped and polished until all the life had been smoothed out. Hers were pure and brilliant.`
  }
]

const NOISE_CHUNKS = [
  `The afternoon sun cast long shadows across the kitchen floor as Maria arranged flowers in a ceramic vase she had bought at the farmer's market. Outside, children played in the street, their laughter rising and falling like waves. She paused to watch them, her hands resting on the rim of the vase, and thought about how ordinary moments like this were the ones that stayed with you longest.`,
  `The lecture hall was nearly empty, which suited Professor Okonkwo just fine. He preferred the intimacy of a small group, the way a handful of engaged students could transform a lecture into a conversation. He wrote the day's equation on the board — a simple quadratic, beautiful in its symmetry — and turned to face the four young people who had chosen to spend their Friday afternoon talking about mathematics.`,
  `The recipe had been passed down through four generations, each cook adding their own modification — a pinch more salt, a different herb, a new technique learned from a neighbor or a travel encounter. Amara stirred the stew slowly, the aromas transporting her back to her grandmother's kitchen, where the same pot had simmered on the same stove for decades.`,
  `The train pulled into the station exactly on time, which surprised no one more than Thomas himself. He gathered his briefcase and overcoat, checked his pocket for the ticket that would take him to a city he had never visited, and stepped onto the platform. The air smelled of diesel and rain and the particular melancholy of departure.`,
  `The artist stepped back from the canvas and studied what she had made. It was not good — she knew that with the certainty of someone who had spent a lifetime learning to see clearly. But it was honest, and honesty in art was rarer than technical skill. She mixed another color, a blue so deep it seemed to absorb light, and added it to the corner of the painting.`
]

function buildTermFreq(text) {
  const lower = text.toLowerCase()
  const freq = {}
  for (const topic of TOPIC_NAMES) {
    for (const word of KEYWORDS[topic]) {
      if (!freq[word]) {
        const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = lower.match(re)
        freq[word] = matches ? matches.length : 0
      }
    }
  }
  return freq
}

function getUniqueKeywords() {
  const set = new Set()
  for (const topic of TOPIC_NAMES) {
    for (const word of KEYWORDS[topic]) {
      set.add(word)
    }
  }
  return [...set]
}

function computeTfIdfVector(tf, idf, allKeywords) {
  const vec = new Array(TOPIC_NAMES.length).fill(0)
  for (let i = 0; i < TOPIC_NAMES.length; i++) {
    const topic = TOPIC_NAMES[i]
    let score = 0
    for (const word of KEYWORDS[topic]) {
      const termFreq = tf[word] || 0
      if (termFreq > 0) {
        const tfWeight = 1 + Math.log2(termFreq)
        score += tfWeight * (idf[word] || 0)
      }
    }
    vec[i] = score
  }
  return normalizeVector(vec)
}

function cosineSim(a, b) {
  let dot = 0,
    magA = 0,
    magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

function normalizeVector(vec) {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return mag === 0 ? vec.map(() => 0) : vec.map((v) => v / mag)
}

function buildDataset() {
  const allKeywords = getUniqueKeywords()
  const docCount = PROSE_CHUNKS.length + NOISE_CHUNKS.length
  const docFreq = {}
  for (const kw of allKeywords) docFreq[kw] = 0

  const chunkData = []

  for (const { topic, text } of PROSE_CHUNKS) {
    chunkData.push({ text, topic, isNoise: false })
  }
  for (const text of NOISE_CHUNKS) {
    chunkData.push({ text, topic: null, isNoise: true })
  }

  for (const { text } of chunkData) {
    const lower = text.toLowerCase()
    for (const kw of allKeywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      if (lower.match(re)) docFreq[kw]++
    }
  }

  const idf = {}
  for (const kw of allKeywords) {
    idf[kw] = Math.log2((docCount + 1) / (docFreq[kw] + 1)) + 1
  }

  const chunks = []
  for (let i = 0; i < chunkData.length; i++) {
    const { text, topic, isNoise } = chunkData[i]
    const tf = buildTermFreq(text)
    const vec = computeTfIdfVector(tf, idf, allKeywords)
    const id = isNoise ? `chunk-noise-${i}` : `chunk-${topic}-${i}`
    chunks.push({
      id,
      projectId: PROJECT_ID,
      documentId: 'doc-synthetic',
      chunkIndex: i,
      text,
      tokenCount: text.split(/\s+/).length,
      embedding: vec,
      embeddingStatus: 'PENDING',
      topic,
      isNoise
    })
  }
  return { chunks, idf, allKeywords }
}

const SINGLE_TOPIC_QUERIES = [
  {
    query: 'A wizard with a staff defends a kingdom alongside a dragon against an ancient prophecy',
    label: 'fantasy'
  },
  {
    query:
      'Detectives investigate a murder using forensic evidence and a poisoned victim with a perfect alibi',
    label: 'mystery'
  },
  {
    query:
      'A woman finds unexpected love and a deep connection while healing from a past relationship',
    label: 'romance'
  },
  {
    query:
      'A cyborg and a scientist discover alien intelligence on a derelict space station using advanced technology',
    label: 'sciFi'
  },
  {
    query:
      'A princess witnesses the fall of an ancient empire and the revolution that reshapes the medieval world',
    label: 'historical'
  },
  {
    query:
      'A woman is haunted by a creature that whispers from the dark and leaves bloody footprints in her home',
    label: 'horror'
  },
  {
    query:
      'An expedition braves the wilderness to discover a lost treasure hidden in an ancient temple',
    label: 'adventure'
  },
  {
    query:
      'An undercover agent on a covert mission uncovers a conspiracy while being hunted by a pursuit team',
    label: 'thriller'
  },
  {
    query:
      'A marriage crumbles under the weight of betrayal, sacrifice, and the struggle of raising a special needs child',
    label: 'drama'
  },
  {
    query:
      'A struggling comedian writes satire and performs stand-up, finding humor in the irony of his own failure',
    label: 'comedy'
  }
]

const CROSS_TOPIC_QUERIES = [
  {
    query:
      'A king sits on his throne while a wizard casts a spell to protect the kingdom from invaders',
    labels: ['historical', 'fantasy']
  },
  {
    query: 'A detective and a secret agent team up to unravel a conspiracy and catch a killer',
    labels: ['mystery', 'thriller']
  },
  {
    query:
      'A couple falls in love during a dangerous expedition through the wilderness searching for treasure',
    labels: ['romance', 'adventure']
  },
  {
    query:
      'A family living in a dark old house uncovers terrible secrets that destroy their relationships',
    labels: ['drama', 'horror']
  },
  {
    query:
      'A scientist discovers alien technology on a space station that could revolutionize human civilization',
    labels: ['sciFi', 'thriller']
  }
]

const NOISE_QUERIES = [
  {
    query:
      'A woman cooks a family recipe in her kitchen while children play outside on a quiet afternoon',
    labels: []
  },
  {
    query: 'A professor teaches mathematics to a small group of students in an empty lecture hall',
    labels: []
  },
  {
    query: 'An artist paints a canvas trying to capture an honest emotion with each brushstroke',
    labels: []
  }
]

const RELEVANCE_THRESHOLD = 0.25

function determineRelevance(query, chunks, idf, allKeywords) {
  const queryTf = buildTermFreq(query)
  const queryVec = computeTfIdfVector(queryTf, idf, allKeywords)
  const relevant = []
  for (const chunk of chunks) {
    const sim = cosineSim(queryVec, chunk.embedding)
    if (sim >= RELEVANCE_THRESHOLD) {
      relevant.push(chunk.id)
    }
  }
  return { queryVec, relevantIds: relevant }
}

async function clearDb() {
  await db.researchChunks.where({ projectId: PROJECT_ID }).delete()
  await db.researchDocuments.where({ projectId: PROJECT_ID }).delete()
}

async function seed(chunks, idf, allKeywords) {
  await clearDb()
  await addResearchDocument({
    id: 'doc-synthetic',
    projectId: PROJECT_ID,
    title: 'Synthetic Evaluation Document',
    type: 'text',
    importedAt: Date.now()
  })
  await addResearchChunks(
    chunks.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      documentId: c.documentId,
      chunkIndex: c.chunkIndex,
      text: c.text,
      tokenCount: c.tokenCount,
      embedding: c.embedding,
      embeddingStatus: 'PENDING'
    }))
  )
  await updateChunkEmbeddings(
    chunks.map((c) => ({ id: c.id, embedding: c.embedding })),
    { provider: 'synthetic', model: 'tfidf-topic', version: 1 }
  )
  const genreCount = chunks.filter((c) => !c.isNoise).length
  const noiseCount = chunks.filter((c) => c.isNoise).length
  console.log(
    `Seeded ${genreCount} genre chunks + ${noiseCount} noise chunks = ${chunks.length} total`
  )
  return chunks
}

function buildTestCases(queries, chunks, idf, allKeywords) {
  const results = []
  for (const q of queries) {
    const { relevantIds, queryVec } = determineRelevance(q.query, chunks, idf, allKeywords)
    if (relevantIds.length > 0 || q.labels === undefined || q.labels.length === 0) {
      results.push({
        query: q.query,
        label: q.label || (q.labels || []).join('+'),
        relevantChunkIds: relevantIds,
        queryVec
      })
    }
  }
  return results
}

async function runLexicalEval(testCases) {
  const report = await runEvaluation({
    searchFn: (q, pid, opts) => searchLexical(pid, q, opts?.k || 20),
    testCases: testCases.map((tc) => ({
      query: tc.query,
      relevantChunkIds: tc.relevantChunkIds,
      label: tc.label
    })),
    projectId: PROJECT_ID,
    k: 5
  })
  return report
}

async function runSemanticEval(testCases) {
  const results = []
  for (const tc of testCases) {
    const retrieved = await semanticSearch(PROJECT_ID, tc.queryVec, 10)
    const { computeAll } = await import('../src/evaluation/ragMetrics')
    const metrics = computeAll(retrieved, tc.relevantChunkIds, { k: 5 })
    results.push({
      label: tc.label,
      query: tc.query,
      expected: tc.relevantChunkIds.length,
      retrieved: retrieved.length,
      retrievedIds: retrieved.map((r) => r.id),
      metrics
    })
  }
  return results
}

async function main() {
  console.log('=== RAG Evaluation (TF-IDF ground truth, realistic prose) ===\n')

  const { chunks, idf, allKeywords } = buildDataset()
  await seed(chunks, idf, allKeywords)

  const reportsDir = resolve(__dirname, '..', 'reports')
  if (!existsSync(reportsDir)) mkdirSync(reportsDir)

  for (const [group, queries, filename] of [
    ['Single-topic', SINGLE_TOPIC_QUERIES, 'eval-lexical-single.md'],
    ['Cross-topic', CROSS_TOPIC_QUERIES, 'eval-lexical-cross.md'],
    ['Noise', NOISE_QUERIES, 'eval-lexical-noise.md']
  ]) {
    const testCases = buildTestCases(queries, chunks, idf, allKeywords)
    const report = await runLexicalEval(testCases)
    writeFileSync(resolve(reportsDir, filename), formatReport(report), 'utf-8')
    console.log(
      `Lexical ${group}: pass=${(report.summary.passRate * 100).toFixed(0)}%  hit=${(report.summary.avgHitRate * 100).toFixed(0)}%  MRR=${report.summary.avgMrr.toFixed(3)}  NDCG=${report.summary.avgNdcg.toFixed(3)}`
    )
  }

  for (const [group, queries, filename] of [
    ['Single-topic', SINGLE_TOPIC_QUERIES, 'eval-semantic-single.md'],
    ['Cross-topic', CROSS_TOPIC_QUERIES, 'eval-semantic-cross.md'],
    ['Noise', NOISE_QUERIES, 'eval-semantic-noise.md']
  ]) {
    const testCases = buildTestCases(queries, chunks, idf, allKeywords)
    const results = await runSemanticEval(testCases)
    const { aggregateMetrics } = await import('../src/evaluation/ragEvaluator')
    const summary = aggregateMetrics(results)
    const report = { results, summary, config: { k: 5 } }
    writeFileSync(resolve(reportsDir, filename), formatReport(report), 'utf-8')
    console.log(
      `Semantic ${group}: pass=${(summary.passRate * 100).toFixed(0)}%  hit=${(summary.avgHitRate * 100).toFixed(0)}%  MRR=${summary.avgMrr.toFixed(3)}  NDCG=${summary.avgNdcg.toFixed(3)}`
    )
  }

  console.log('\nReports written to reports/')
}

main().catch((err) => {
  console.error('Eval failed:', err)
  process.exit(1)
})
