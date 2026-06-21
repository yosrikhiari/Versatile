import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

function getDecorations(doc) {
  if (!doc) return DecorationSet.empty
  const decorations = []
  const OPEN = '"\u201c\u201e\u00ab'
  const CLOSE = '"\u201d\u201d\u00bb'
  const re = new RegExp(`[${OPEN}](?:[^${CLOSE}\n]*(?:\n[^${CLOSE}\n]*)*)[${CLOSE}]`, 'g')
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      let match
      while ((match = re.exec(node.text)) !== null) {
        const from = pos + match.index
        const to = from + match[0].length
        decorations.push(
          Decoration.inline(from, to, { class: 'dialogue-text' })
        )
      }
    }
  })
  return DecorationSet.create(doc, decorations)
}

export const AutoDialogue = Extension.create({
  name: 'autoDialogue',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoDialogue'),
        state: {
          init(config, instance) {
            // NOTE: config.doc is undefined during EditorState.reconfigure
            // (which TipTap calls in createView). instance.doc is always
            // available because 'doc' is the first base field initialized.
            return getDecorations(instance.doc)
          },
          apply(tr, oldSet) {
            if (!tr.docChanged) return oldSet.map(tr.mapping, tr.doc)
            const result = getDecorations(tr.doc)
            return result
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})
