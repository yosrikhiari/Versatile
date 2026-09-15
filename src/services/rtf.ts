/**
 * RTF escaping, shared by the compiled-manuscript writer and the legacy
 * root-document writer. Kept apart from exportService so the compile module
 * does not pull jsPDF in statically.
 */
export function rtfEscape(text: string): string {
  let out = ''
  for (const ch of String(text ?? '')) {
    if (ch === '\\' || ch === '{' || ch === '}') {
      out += '\\' + ch
      continue
    }
    const code = ch.codePointAt(0)!
    if (code < 128) {
      out += ch
    } else if (code <= 0xffff) {
      // \uN carries a *signed* 16-bit value, so anything above 32767 wraps
      // negative. The trailing `?` is the substitute a reader that cannot do
      // Unicode falls back to — without it the next character is eaten.
      out += `\\u${code > 32767 ? code - 65536 : code}?`
    } else {
      // Astral characters go as the surrogate pair RTF readers expect.
      const v = code - 0x10000
      const hi = 0xd800 + (v >> 10)
      const lo = 0xdc00 + (v & 0x3ff)
      out += `\\u${hi > 32767 ? hi - 65536 : hi}?\\u${lo > 32767 ? lo - 65536 : lo}?`
    }
  }
  return out
}
