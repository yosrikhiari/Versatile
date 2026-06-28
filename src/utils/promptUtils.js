/**
 * @param {string[]} chapterLog
 * @returns {string}
 */
export function summarizeLog(chapterLog) {
  if (!chapterLog || !Array.isArray(chapterLog)) return ''
  if (chapterLog.length <= 5) return chapterLog.join('\n')
  const recent = chapterLog.slice(-3)
  return [...recent, `(... plus ${chapterLog.length - 3} earlier scenes summarized)`].join('\n')
}
