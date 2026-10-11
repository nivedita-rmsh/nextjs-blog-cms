import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorOptions } from '@tiptap/core'
import { Editor } from '@/components/editor/Editor'

const mocks = vi.hoisted(() => ({ options: undefined as Partial<EditorOptions> | undefined, setEditable: vi.fn() }))
vi.mock('@tiptap/react', () => ({
  useEditor: (options: Partial<EditorOptions>) => {
    mocks.options = options
    return { getJSON: () => ({ type: 'doc', content: [] }), commands: { setContent: vi.fn() }, setEditable: mocks.setEditable, storage: {} }
  },
  useEditorState: ({ editor, selector }: { editor: { storage: object }; selector: (state: { editor: { storage: object } }) => unknown }) => selector({ editor }),
  EditorContent: () => null,
}))
vi.mock('@/components/editor/Toolbar', () => ({ Toolbar: () => null }))
vi.mock('@/components/editor/ImageDialog', () => ({ ImageDialog: ({ initialFile }: { initialFile: File }) => <div role="dialog">{initialFile.name}</div> }))

const view = { state: { selection: { from: 12 } }, posAtCoords: vi.fn(() => ({ pos: 24 })) }
const file = new File(['image'], 'pasted.png', { type: 'image/png' })

beforeEach(() => { vi.clearAllMocks() })

describe('editor media clipboard and drop handling', () => {
  it.each(['text/plain', 'text/html'])('leaves %s with an accompanying image to normal paste', type => {
    render(<Editor value="" onChange={vi.fn()} editorId="author" />)
    const event = { clipboardData: { files: [file], getData: (format: string) => format === type ? 'Copied text' : '' }, preventDefault: vi.fn() }
    const handled = mocks.options!.editorProps!.handlePaste!(view as never, event as never, {} as never)
    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens metadata for a pure image paste without changing the document', () => {
    const onChange = vi.fn()
    render(<Editor value="" onChange={onChange} editorId="author" />)
    const event = { clipboardData: { files: [file], getData: () => '' }, preventDefault: vi.fn() }
    act(() => { expect(mocks.options!.editorProps!.handlePaste!(view as never, event as never, {} as never)).toBe(true) })
    expect(screen.getByRole('dialog')).toHaveTextContent('pasted.png')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens dropped files at the drop position without changing the document', () => {
    const onChange = vi.fn()
    render(<Editor value="" onChange={onChange} editorId="author" />)
    const event = { dataTransfer: { files: [file] }, clientX: 10, clientY: 20, preventDefault: vi.fn() }
    act(() => { expect(mocks.options!.editorProps!.handleDrop!(view as never, event as never, {} as never, false)).toBe(true) })
    expect(screen.getByRole('dialog')).toHaveTextContent('pasted.png')
    expect(view.posAtCoords).toHaveBeenCalledWith({ left: 10, top: 20 })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('preserves internal drag moves', () => {
    render(<Editor value="" onChange={vi.fn()} editorId="author" />)
    const event = { dataTransfer: { files: [file] }, preventDefault: vi.fn() }
    expect(mocks.options!.editorProps!.handleDrop!(view as never, event as never, {} as never, true)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
