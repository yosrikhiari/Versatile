const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'although', 'since', 'while',
  'also', 'however', 'therefore', 'thus', 'hence', 'otherwise', 'any', 'both',
  'down', 'up', 'out', 'off', 'over', 'until', 'against', 'about',
  'around', 'among', 'without', 'within', 'along', 'across', 'behind', 'beyond',
  'near', 'toward', 'towards', 'upon', 'one', 'two', 'three', 'four', 'five',
  'first', 'second', 'third', 'last', 'next', 'another', 'what', 'which', 'who',
  'realm', 'world', 'land', 'country', 'empire', 'kingdom', 'province', 'region',
  'territory', 'domain', 'grounds', 'gate', 'gate'
])

const VERB_INDICATORS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must', 'need', 'dare', 'ought', 'used',
  'seems', 'appears', 'remains', 'becomes', 'feels', 'looks', 'sounds', 'smells',
  'tastes', 'grows', 'gets', 'goes', 'comes', 'makes', 'takes', 'gives', 'finds',
  'knows', 'thinks', 'wants', 'needs', 'loves', 'hates', 'fears', 'hopes',
  'tries', 'asks', 'tells', 'asks', 'says', 'uses', 'helps', 'shows', 'plays',
  'lives', 'believes', 'holds', 'brings', 'begins', 'keeps', 'lets', 'means',
  'meets', 'puts', 'reads', 'moves', 'walks', 'runs', 'travels', 'arrives',
  'leaves', 'departs', 'returns', 'follows', 'joins', 'saves', 'trusts', 'talks'
])

const STRONG_CHARACTER_INDICATORS = [
  'named', 'called', 'meets', 'helps', 'saves', 'trusts', 'follows', 'joins',
  'talks', 'loves', 'hates', 'fears', 'finds', 'seeks', 'chases', 'guides',
  'protects', 'attacks', 'betrays', 'serves', 'sells', 'buys', 'creates',
  'destroys', 'controls', 'commands', 'leads', 'serves'
]

const STRONG_LOCATION_INDICATORS = [
  'travels to', 'moves to', 'goes to', 'arrives at', 'departs from', 'leaves from',
  'returns to', 'at the', 'in the', 'on the', 'to the', 'from the', 'near the',
  'beyond the', 'within the', 'under the', 'through the'
]

export function useEntityExtractor() {
  
  function isValidEntityName(name) {
    if (!name || typeof name !== 'string') return false
    
    const trimmed = name.trim()
    
    if (trimmed.length < 2 || trimmed.length > 40) return false
    if (/^\d/.test(trimmed)) return false
    if (/^\s+$/.test(trimmed)) return false
    
    const words = trimmed.split(/\s+/)
    if (words.length > 4) return false
    
    if (COMMON_WORDS.has(trimmed.toLowerCase())) return false
    
    const firstWord = words[0]?.toLowerCase()
    if (COMMON_WORDS.has(firstWord)) return false
    
    const lower = trimmed.toLowerCase()
    for (const verb of VERB_INDICATORS) {
      if (lower.startsWith(verb + ' ') || lower.includes(' ' + verb + ' ')) {
        return false
      }
    }
    
    if (trimmed.endsWith('.') || trimmed.endsWith(',') || trimmed.endsWith(':')) {
      return false
    }
    
    if (trimmed.match(/^(the|a|an)\s+.+/i)) {
      const rest = trimmed.replace(/^(the|a|an)\s+/i, '').trim()
      if (COMMON_WORDS.has(rest.split(/\s+/)[0]?.toLowerCase())) return false
    }
    
    const singleWord = trimmed.split(/\s+/).length === 1
    if (singleWord) {
      const lower = trimmed.toLowerCase()
      const genericLocations = ['realm', 'world', 'land', 'gate', 'grounds', 'domain', 'territory', 'grounds', 'gate']
      if (genericLocations.includes(lower)) return false
    }
    
    return true
  }

  function extractNameFromPattern(text, pattern) {
    const regex = new RegExp(pattern, 'gi')
    const matches = []
    let match
    
    while ((match = regex.exec(text)) !== null) {
      const raw = match[1]?.trim() || match[0]?.trim()
      if (raw && isValidEntityName(raw)) {
        const cleaned = cleanEntityName(raw)
        if (cleaned && isValidEntityName(cleaned)) {
          matches.push(cleaned)
        }
      }
    }
    
    return matches
  }

  function cleanEntityName(name) {
    let cleaned = name.trim()
    
    cleaned = cleaned.replace(/^(the|a|an)\s+/i, '')
    
    cleaned = cleaned.replace(/[.,;:!?'"]+$/, '')
    
    cleaned = cleaned.replace(/\s+/g, ' ')
    
    cleaned = cleaned.trim()
    
    return cleaned
  }

  function extractPotentialEntities(text) {
    if (!text || typeof text !== 'string') {
      return { characters: [], locations: [] }
    }

    const characters = new Set()
    const locations = new Set()
    
    const characterPatterns = [
      /(?:character|Character|CHARACTER)[:\s]+([A-Z][a-zA-Z]{1,20}(?:\s+[A-Z][a-zA-Z]{1,20}){0,2})/g,
      /(?:named|calls herself|calls himself|called)[:\s]+["']?([A-Z][a-zA-Z]{2,20}(?:\s+[A-Z][a-zA-Z]{2,20}){1,2})["']?(?=\s|,|\.|$)/gi,
      /(?:Lady|Lord|Sir|Mister|Miss|Doctor|Professor|Captain|King|Queen|Prince|Princess|Duke|Baron|Wizard|Witch|Mage|Warrior|Knight|Soldier|Guard|Thief|Merchant|Blacksmith|Priest|Priestess|Commander|General|Admiral)[\s]+([A-Z][a-zA-Z]{2,20})(?:\s+[A-Z][a-zA-Z]{2,20})?/gi,
      /(?:meet|meets|met|help|helps|helped|save|saves|saved|trust|trusts|trusted|follow|follows|followed|join|joins|joined|talk|talks|talked|love|loves|loved|hate|hates|hated|fear|fears|feared|find|finds|found|seek|seeks|sought|chase|chases|chased|guide|guides|guided|protect|protects|protected|attack|attacks|attacked|betray|betrays|betrayed|serve|serves|served|command|commands|commanded|lead|leads|led)[\s]+([A-Z][a-zA-Z]{2,20}(?:\s+[A-Z][a-zA-Z]{2,20}){1,2})/gi,
      /\b([A-Z][a-zA-Z]{2,20}(?:\s+[A-Z][a-zA-Z]{2,20}){1,2})\s+(?:is|was|are|were|seems|appears|remains)\s+(?:a|an|the)/g,
    ]
    
    const locationPatterns = [
      /(?:location|Location|LOCATION)[:\s]+([A-Z][a-zA-Z]{1,30}(?:\s+[A-Z][a-zA-Z]{1,30}){0,2})/g,
      /(?:travels? to|moves? to|goes? to|arrives? at|departs? from|leaves? from|returns? to|escapes? to)[\s]+([A-Z][a-zA-Z]{1,30}(?:\s+[a-zA-Z]{1,30}){0,2})/gi,
      /(?:the\s+)?(?:old|new|ancient|dark|mysterious|hidden|secret|abandoned|ruined|haunted|forgotten|enchanted|magical|small|large|great|grim|dreadful|bleak|hidden|forbidden|cursed|blessed)[\s]+(?:[a-z]+\s+)?(?:[a-z]+\s+)?(castle|palace|tower|fortress|dungeon|prison|temple|shrine|church|monastery|forest|woods|river|mountain|valley|cave|cavern|mine|graveyard|cemetery|tomb|ruins|tavern|inn|hotel|mansion|estate|manor|house|cottage|village|town|city|kingdom|world|plane|dimension|domain|grounds|garden|chamber|hall|room|corridor|gate|wall|bridge|port|harbor|market|square|district|quarter|heights|spire|dome|sanctum|vault|citadel|keep|gate|portal|shrine|altar|throne|library|armory|barracks|tower|spire|dungeon|sewers|mines|cavern)/gi,
    ]
    
    for (const pattern of characterPatterns) {
      pattern.lastIndex = 0
      const names = extractNameFromPattern(text, pattern.source)
      for (const name of names) {
        if (name.length >= 2) {
          characters.add(name)
        }
      }
    }
    
    for (const pattern of locationPatterns) {
      pattern.lastIndex = 0
      const names = extractNameFromPattern(text, pattern.source)
      for (const name of names) {
        if (name.length >= 2) {
          locations.add(name)
        }
      }
    }
    
    const capitalizedPattern = /\b([A-Z][a-zA-Z]{2,20}(?:\s+[A-Z][a-zA-Z]{2,20}){0,2})\b/g
    let match
    while ((match = capitalizedPattern.exec(text)) !== null) {
      const name = match[1].trim()
      if (!isValidEntityName(name)) continue
      
      const before = text.substring(Math.max(0, match.index - 50), match.index).toLowerCase()
      const after = text.substring(match.index + name.length, match.index + name.length + 50).toLowerCase()
      
      let characterScore = 0
      let locationScore = 0
      
      for (const indicator of STRONG_CHARACTER_INDICATORS) {
        if (before.includes(indicator) || after.includes(indicator)) {
          characterScore += 2
        }
      }
      
      for (const indicator of STRONG_LOCATION_INDICATORS) {
        if (before.includes(indicator) || after.includes(indicator)) {
          locationScore += 2
        }
      }
      
      if (after.startsWith(' is ') || after.startsWith(' was ') || after.startsWith(' are ') || after.startsWith(' were ')) {
        characterScore += 1
      }
      if (after.startsWith(' where ') || after.startsWith(' when ') || after.startsWith(' that ')) {
        locationScore += 1
      }
      
      if (characterScore > locationScore && characterScore >= 2) {
        characters.add(name)
      } else if (locationScore > characterScore && locationScore >= 2) {
        locations.add(name)
      }
    }
    
    const filteredCharacters = [...characters]
      .filter(name => {
        if (!isValidEntityName(name)) return false
        const lower = name.toLowerCase()
        if (COMMON_WORDS.has(lower)) return false
        for (const verb of VERB_INDICATORS) {
          if (lower.includes(' ' + verb + ' ') || lower.startsWith(verb + ' ')) {
            return false
          }
        }
        const words = name.split(/\s+/)
        const firstWord = words[0]?.toLowerCase()
        const invalidStarts = ['named', 'called', 'meets', 'helps', 'saves', 'trusts', 'follows', 'joins', 'talks', 'loves', 'hates', 'fears', 'finds', 'seeks', 'chases', 'guides', 'protects', 'attacks', 'betrays', 'serves', 'commands', 'leads']
        if (invalidStarts.includes(firstWord)) return false
        const singleHonorifics = ['sir', 'lord', 'lady', 'king', 'queen', 'duke', 'baron']
        if (words.length === 1 && singleHonorifics.includes(lower)) return false
        if (words.length === 1 && /^[A-Z][a-z]+$/.test(name) && name.length > 4) {
          return true
        }
        return true
      })
    
    const filteredLocations = [...locations]
      .filter(name => {
        if (!isValidEntityName(name)) return false
        const lower = name.toLowerCase()
        if (COMMON_WORDS.has(lower)) return false
        for (const verb of VERB_INDICATORS) {
          if (lower.includes(' ' + verb + ' ') || lower.startsWith(verb + ' ')) {
            return false
          }
        }
        const singleGeneric = ['realm', 'world', 'land', 'gate', 'grounds', 'domain', 'territory', 'gate', 'woods', 'forest', 'river', 'sea', 'ocean']
        if (name.split(/\s+/).length === 1 && singleGeneric.includes(lower)) return false
        return true
      })
    
    return {
      characters: [...new Set(filteredCharacters)],
      locations: [...new Set(filteredLocations)]
    }
  }

  function getNewEntities(extracted, existingCharacters, existingLocations) {
    const characterMap = new Map(
      existingCharacters.map(c => [c.name?.toLowerCase().trim(), c])
    )
    const locationMap = new Map(
      existingLocations.map(l => [l.name?.toLowerCase().trim(), l])
    )

    const newCharacters = []
    const existingCharactersList = []
    for (const name of extracted.characters) {
      const cleanName = name.toLowerCase().trim()
      const existing = characterMap.get(cleanName)
      if (existing) {
        existingCharactersList.push({ name, isNew: false, id: existing.id })
      } else {
        newCharacters.push({ name, isNew: true })
      }
    }

    const newLocations = []
    const existingLocationsList = []
    for (const name of extracted.locations) {
      const cleanName = name.toLowerCase().trim()
      const existing = locationMap.get(cleanName)
      if (existing) {
        existingLocationsList.push({ name, isNew: false, id: existing.id })
      } else {
        newLocations.push({ name, isNew: true })
      }
    }

    return {
      characters: [...newCharacters, ...existingCharactersList],
      locations: [...newLocations, ...existingLocationsList]
    }
  }

  return {
    extractPotentialEntities,
    getNewEntities,
    isValidEntityName
  }
}
