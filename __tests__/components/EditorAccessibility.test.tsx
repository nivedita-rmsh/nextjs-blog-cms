import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@/components/editor/Editor'

const captured = vi.hoisted(() => ({ editor: null as import('@tiptap/react').Editor | null }))
vi.mock('@tiptap/react', async importOriginal => {
  const original = await importOriginal<typeof import('@tiptap/react')>()
  return { ...original, useEditor: (...args: Parameters<typeof original.useEditor>) => {
    const editor = original.useEditor(...args)
    captured.editor = editor
    return editor
  } }
})
vi.mock('@/components/editor/ImageDialog', () => ({ ImageDialog: () => null }))

async function mountEditor() {
  const result = render(<Editor value="<p>First paragraph</p><p>Second paragraph</p>" onChange={() => {}} />)
  await screen.findByRole('textbox', { name: 'Article content' })
  return result
}

describe('real TipTap editor accessibility', () => {
  it('names the editor and updates its validation associations', async () => {
    const { rerender } = render(<>
      <span id="article-label">Article body</span><p id="article-help">Write a useful article.</p>
      <Editor key="editor" id="article" labelledBy="article-label" describedBy="article-help" value="" onChange={() => {}} />
    </>)
    const body = await screen.findByRole('textbox', { name: 'Article body' })
    expect(body).toHaveAttribute('aria-multiline', 'true')
    expect(body).toHaveAccessibleDescription('Write a useful article.')
    rerender(<>
      <span id="article-label">Article body</span><p id="article-help">Write a useful article.</p><p id="article-error">More words needed.</p>
      <Editor key="editor" id="article" labelledBy="article-label" describedBy="article-help article-error" invalid value="" onChange={() => {}} />
    </>)
    await waitFor(() => expect(body).toHaveAttribute('aria-invalid', 'true'))
    expect(body).toHaveAccessibleDescription('Write a useful article. More words needed.')
  })

  it('announces formatting state as the selection moves between formatted and plain text', async () => {
    const { container } = await mountEditor()
    const bold = screen.getByRole('button', { name: 'Bold' })
    expect(bold).toHaveAttribute('aria-pressed', 'false')
    await act(async () => {
      captured.editor!.commands.setTextSelection({ from: 1, to: 6 })
      captured.editor!.commands.toggleBold()
    })
    expect(container.querySelector('strong')).toHaveTextContent('First')
    expect(bold).toHaveAttribute('aria-pressed', 'true')
    await act(async () => { captured.editor!.commands.setTextSelection(20) })
    expect(bold).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['Text color', 'Highlight'])('supports keyboard opening, Escape and focus return for %s', async name => {
    const user = userEvent.setup()
    await mountEditor()
    const trigger = screen.getByRole('button', { name: new RegExp(`^${name}:`) })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'Text color and highlight' })
    const first = screen.getByRole('button', { name: name === 'Text color' ? 'Text color: Black' : 'Highlight: Yellow' })
    await waitFor(() => expect(first).toHaveFocus())
    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('applies color to the saved selection with keyboard input and reports the active swatch', async () => {
    const user = userEvent.setup()
    const { container } = await mountEditor()
    await act(async () => { captured.editor!.commands.setTextSelection({ from: 1, to: 6 }) })
    const trigger = screen.getByRole('button', { name: /^Text color:/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Text color: Black' })).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Text color: Red' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(container.querySelector('[style*="color"]')).toHaveTextContent('First')
    expect(captured.editor!.getAttributes('textStyle').color).toBe('#ef4444')
    expect(trigger).toHaveAccessibleName('Text color: #ef4444')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Text color: Red' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('exposes checked menu options and keyboard-operable custom spacing with validation', async () => {
    const user = userEvent.setup()
    await mountEditor()
    const trigger = screen.getByRole('button', { name: 'Line spacing: Default' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitemradio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'Default' })).toHaveFocus())
    await user.keyboard('{ArrowUp}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Custom…' })).toHaveFocus())
    await user.keyboard('{Enter}')
    const input = await screen.findByRole('spinbutton', { name: 'Line spacing' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.type(input, '0')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('between 0.5 and 10')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await user.clear(input)
    await user.type(input, '1.8')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveAccessibleName('Line spacing: 1.8')
    expect(captured.editor!.getAttributes('paragraph').lineHeight).toBe('1.8')
  })

  it('keeps the word count current after document transactions', async () => {
    await mountEditor()
    await act(async () => { captured.editor!.commands.setContent('<p>One two three</p>') })
    expect(screen.getByText(/3 words · 13 characters/)).toBeInTheDocument()
  })
})
