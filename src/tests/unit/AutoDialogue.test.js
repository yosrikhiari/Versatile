import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { AutoDialogue } from '../../extensions/AutoDialogue'

function createEditor(content) {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        codeBlock: false,
        blockquote: false,
        dropcursor: false,
        gapCursor: false,
      }),
      AutoDialogue,
    ],
    content: content || '',
  })
}

function getDecos(editor) {
  const plugin = editor.state.plugins.find(
    p => p.key.startsWith('autoDialogue$')
  )
  if (!plugin) throw new Error('autoDialogue plugin not found')
  const state = plugin.getState(editor.state)
  if (!state) throw new Error('plugin state is null/undefined')
  return state.find()
}

describe('AutoDialogue', () => {
  let editor

  afterEach(() => {
    editor?.destroy()
  })

  it('highlights double-quoted text', () => {
    editor = createEditor('<p>"Hello there," he said.</p>')
    // Diagnostic: what text nodes does the doc contain?
    const texts = []
    editor.state.doc.descendants((n, p) => { if (n.isText) texts.push({t: n.text, p}) })
    const hasQuote = texts.some(t => t.t.includes('"'))
    expect(texts.length).toBeGreaterThan(0)
    expect(hasQuote).toBe(true)
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
    expect(decos[0].type.attrs.class).toBe('dialogue-text')
  })

  it('highlights curly double-quoted text', () => {
    editor = createEditor('<p>\u201cHow are you?\u201d she asked.</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
  })

  it('highlights low-double-quoted text', () => {
    editor = createEditor('<p>\u201eHow are you?\u201d she asked.</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
  })

  it('highlights angle-quoted text', () => {
    editor = createEditor('<p>\u00abBonjour\u00bb dit-il.</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
  })

  it('highlights multiple dialogue segments in one paragraph', () => {
    editor = createEditor('<p>"First," he said. "Second," she replied.</p>')
    const decos = getDecos(editor)
    expect(decos.length).toBeGreaterThanOrEqual(2)
  })

  it('creates no decorations for plain text without quotes', () => {
    editor = createEditor('<p>The cat sat on the mat.</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(0)
  })

  it('creates no decorations for empty content', () => {
    editor = createEditor('')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(0)
  })

  it('highlights multi-line dialogue', () => {
    editor = createEditor('<p>"This is a long dialogue \nthat spans two lines."</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
  })

  it('updates decorations when content changes', () => {
    editor = createEditor('<p>No quotes here.</p>')
    expect(getDecos(editor)).toHaveLength(0)

    editor.commands.setContent('<p>"Now with quotes."</p>')
    const decos = getDecos(editor)
    expect(decos).toHaveLength(1)
  })
})
