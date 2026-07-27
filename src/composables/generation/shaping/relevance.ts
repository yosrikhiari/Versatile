export function sortByRelevance(entities: any, type: any) {
  switch (type) {
    case 'plotThread':
      return [...entities].sort((a, b) => (a.timelineOrder ?? 0) - (b.timelineOrder ?? 0))
    case 'character':
    case 'location':
    default:
      return [...entities].sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0))
  }
}
