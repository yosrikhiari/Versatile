import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const create = vi.fn(async () => ({ projectId: 42, chapters: 2, scenes: 3, words: 9 }))
vi.mock('@/services/import/writeProject', () => ({ createProjectFromBook: (...a) => create(...a) }))

import ImportNovelModal from '@/components/import/ImportNovelModal.vue'

const TEXT = ['CHAPTER 1', 'It began.', '***', 'It went on.', 'CHAPTER 2', 'It ended.'].join('\n\n')

async function open() {
  const w = mount(ImportNovelModal, { props: { show: true }, attachTo: document.body })
  await flushPromises()
  return w
}

async function pick(w, name = 'book.txt', text = TEXT) {
  const input = document.body.querySelector('input[type="file"]')
  const file = new File([text], name, { type: 'text/plain' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  await vi.waitFor(() =>
    expect(document.body.querySelector('[data-test="chapter-list"]')).not.toBeNull()
  )
}

beforeEach(() => {
  setActivePinia(createPinia())
  push.mockClear()
  create.mockClear()
  document.body.innerHTML = ''
})

describe('ImportNovelModal', () => {
  it('shows the chapters found, lets the author rename one, and imports the edited book', async () => {
    const w = await open()
    await pick(w)
    const stats = document.body.querySelector('[data-test="stats"]').textContent
    expect(stats).toMatch(/2 chapters · 3 scenes · 7 words/)

    const title = document.body.querySelector('input[aria-label="Title of chapter 2"]')
    title.value = 'The End of It'
    title.dispatchEvent(new Event('change'))
    await flushPromises()

    document.body.querySelector('[data-test="do-import"]').click()
    await flushPromises()
    expect(create).toHaveBeenCalledTimes(1)
    const [book, opts] = create.mock.calls[0]
    expect(book.parts[0].chapters.map((c) => c.title)).toEqual(['Chapter 1', 'The End of It'])
    expect(opts.name).toBe('Imported book')
    expect(push).toHaveBeenCalledWith('/editor/42')
    w.unmount()
  })

  it('says so when the file is not a manuscript format, and writes nothing', async () => {
    const w = await open()
    const input = document.body.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.pdf')], configurable: true })
    input.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/not a manuscript format/))
    expect(create).not.toHaveBeenCalled()
    w.unmount()
  })
})
