import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { createPost, publishPost, updatePost, retryNewsletterScheduling } from '@/features/posts/actions'
import { toast } from 'sonner'
import { previewPost } from '@/features/posts/preview'
import type { NewsletterSend } from '@/features/newsletter/types'
import { validPost } from '../helpers/publication'
import type { PostWithRelations } from '@/features/posts/types'
import { PostEditor } from '@/components/dashboard/PostEditor'

// Server Actions are mocked in this component suite; Next enforces this boundary at build time.
vi.mock('server-only', () => ({}))

// ── Mock next/navigation ──────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// ── Mock server actions ───────────────────────────────────────────────────────
vi.mock('@/features/posts/actions', () => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
  retryNewsletterScheduling: vi.fn(),
}))

// ── Mock sonner ───────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

vi.mock('@/features/posts/preview', () => ({ previewPost: vi.fn() }))

// ── Mock TipTap Editor ────────────────────────────────────────────────────────
vi.mock('@/components/editor/Editor', () => ({
  Editor: ({ value, onChange, id, describedBy, invalid }: { value: string; onChange: (value: string) => void; id?: string; describedBy?: string; invalid?: boolean }) => <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} aria-label="Article body" value={value} onChange={event => onChange(event.target.value)} />,
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => ({ matches: false })) })
})

const minimalProps = {
  categories: [],
  tags: [],
}

describe('PostEditor — back to top button', () => {
  beforeEach(() => {
    // Reset scroll position before each test
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 0 })
  })

  it('does not show the back-to-top button at scroll position 0', () => {
    render(<PostEditor {...minimalProps} />)
    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument()
  })

  it('shows the back-to-top button after scrolling past 300px', () => {
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })

    expect(screen.getByRole('button', { name: /back to top/i })).toBeInTheDocument()
  })

  it('hides the back-to-top button when scrolling back above 300px', () => {
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })
    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 100 })
      fireEvent.scroll(window)
    })

    expect(screen.queryByRole('button', { name: /back to top/i })).not.toBeInTheDocument()
  })

  it('calls window.scrollTo when the back-to-top button is clicked', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<PostEditor {...minimalProps} />)

    act(() => {
      Object.defineProperty(window, 'scrollY', { writable: true, configurable: true, value: 301 })
      fireEvent.scroll(window)
    })

    fireEvent.click(screen.getByRole('button', { name: /back to top/i }))
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })

    scrollToSpy.mockRestore()
  })
})

const editorPost = { ...validPost, author: { id: 'user-1', full_name: 'Frank Mendez', avatar_url: null }, category: null, tags: [] } as PostWithRelations

describe('newsletter visibility and scheduling recovery', () => {
  beforeEach(() => vi.clearAllMocks())
  const newsletter = { delayMinutes: 45, send: null }
  const send = { id: 'send-1', post_id: editorPost.id, status: 'pending', scheduled_at: '2026-10-08T00:00:00Z', sending_started_at: null, sent_at: null, created_at: '2026-10-07T00:00:00Z' } as NewsletterSend
  it('discloses the notification consequence and delay before publishing', () => {
    render(<PostEditor {...minimalProps} post={editorPost} newsletter={newsletter} />)
    expect(screen.getByRole('region', { name: 'Newsletter notification' })).toHaveTextContent('Publishing will notify active subscribers')
    expect(screen.getByText(/Configured delay: 45 minutes/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Retry newsletter scheduling' })).not.toBeInTheDocument()
  })
  it.each(['pending', 'sending', 'sent', 'failed'] as const)('shows %s queue status and forbids retries after delivery starts', status => {
    render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={{ ...newsletter, send: { ...send, status, sending_started_at: '2026-10-07T00:00:00Z', delivery_started_at: '2026-10-07T00:00:00Z' } }} />)
    expect(screen.getByRole('region', { name: 'Newsletter notification' })).toHaveTextContent({ pending: 'Queued', sending: 'Sending', sent: 'Sent', failed: 'Failed' }[status])
    expect(screen.queryByRole('button', { name: 'Retry newsletter scheduling' })).not.toBeInTheDocument()
  })
  it('reports publication success separately from scheduling failure and preserves input', async () => {
    const warning = 'Post published, but newsletter scheduling could not be confirmed.'
    vi.mocked(publishPost).mockResolvedValueOnce({ data: { ...editorPost, status: 'published' }, newsletterWarning: warning })
    render(<PostEditor {...minimalProps} post={editorPost} newsletter={newsletter} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'My Reviewed Engineering Article' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(warning))
    expect(toast.success).toHaveBeenCalledWith('Post saved and published!')
    expect(toast.warning).toHaveBeenCalledWith(warning)
    expect(screen.getByLabelText('Post title')).toHaveValue('My Reviewed Engineering Article')
  })
  it('distinguishes preparing from provider handoff and permits a failed preparation retry', () => {
    const claimed = { ...send, sending_started_at: '2026-10-07T00:00:00Z', delivery_started_at: null }
    const { rerender } = render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={{ ...newsletter, send: { ...claimed, status: 'sending' } }} />)
    expect(screen.getByRole('region', { name: 'Newsletter notification' })).toHaveTextContent('Preparing')
    expect(screen.getByText('No emails have been handed off yet.', { exact: false })).toBeVisible()
    rerender(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={{ ...newsletter, send: { ...claimed, status: 'failed' } }} />)
    expect(screen.getByRole('button', { name: 'Retry newsletter scheduling' })).toBeVisible()
    expect(screen.queryByText(/Delivery may have started/)).not.toBeInTheDocument()
  })
  it('retries only newsletter scheduling without saving or publishing unsaved editor input', async () => {
    vi.mocked(retryNewsletterScheduling).mockResolvedValueOnce({})
    render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={newsletter} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'Unsaved correction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry newsletter scheduling' }))
    await waitFor(() => expect(retryNewsletterScheduling).toHaveBeenCalledExactlyOnceWith(editorPost.id, undefined))
    expect(updatePost).not.toHaveBeenCalled()
    expect(publishPost).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Post title')).toHaveValue('Unsaved correction')
  })
  it('shows retry errors and fails closed when queue status is unavailable', async () => {
    vi.mocked(retryNewsletterScheduling).mockResolvedValueOnce({ error: 'The post remains published.' })
    const { rerender } = render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={newsletter} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry newsletter scheduling' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The post remains published.'))
    rerender(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} newsletter={{ ...newsletter, error: 'Newsletter status is unavailable.' }} />)
    expect(screen.queryByRole('button', { name: 'Retry newsletter scheduling' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh status' })).toBeVisible()
  })
})

describe('PostEditor publication readiness', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('shows the checklist and an unchecked editorial review confirmation', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    expect(screen.getByText(/At least 200 readable body words/)).toBeVisible()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('preserves input and displays field errors when publication is blocked', async () => {
    vi.mocked(publishPost).mockResolvedValue({ error: 'Publication blocked', fieldErrors: { content: ['Write at least 200 readable words.'] } })
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: '<p>My unfinished article</p>' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Write at least 200 readable words.'))
    expect(screen.getByLabelText('Article body')).toHaveValue('<p>My unfinished article</p>')
    expect(publishPost).toHaveBeenCalledWith('post-1', expect.objectContaining({ content: '<p>My unfinished article</p>', editorial_reviewed: true }), editorPost.updated_at, undefined)
    expect(updatePost).not.toHaveBeenCalled()
  })
  it('clears editorial confirmation when the author edits reviewed content', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).toBeChecked()
    fireEvent.change(screen.getByLabelText('Excerpt'), { target: { value: 'Changed excerpt' } })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('does not silently change an existing slug when the title loses focus', () => {
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'A Different Useful Engineering Title' } })
    fireEvent.blur(screen.getByLabelText('Post title'))
    expect(screen.getByLabelText('Slug')).toHaveValue(validPost.slug)
  })
  it('preserves invalid live edits on the form while showing corrective errors', async () => {
    vi.mocked(updatePost).mockResolvedValue({ error: 'Publication blocked', fieldErrors: { title: ['Replace the placeholder title.'] } })
    render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'hello this is for test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Replace the placeholder title.'))
    expect(screen.getByLabelText('Post title')).toHaveValue('hello this is for test')
  })
})


describe('editorial flags', () => {
  it('shows contextual unfinished-text warnings before review and keeps them visible after confirmation', () => {
    render(<PostEditor {...minimalProps} />)
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: 'Explain why TODO comments should be tracked.' } })
    expect(screen.getByText(/Review flagged text:/)).toHaveTextContent('Review flagged text')
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByText(/Review flagged text:/)).toHaveTextContent('appropriate in context')
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: 'The article is complete.' } })
    expect(screen.queryByText(/Review flagged text:/)).not.toBeInTheDocument()
  })
})

describe('slug editing', () => {
  beforeEach(() => vi.clearAllMocks())
  it('regenerates on title blur only until the slug is explicitly edited', () => {
    render(<PostEditor {...minimalProps} />)
    const title = screen.getByLabelText('Post title')
    const slug = screen.getByLabelText('Slug')
    fireEvent.change(title, { target: { value: 'First Engineering Title' } })
    fireEvent.blur(title)
    expect(slug).toHaveValue('first-engineering-title')
    fireEvent.change(title, { target: { value: 'Second Engineering Title' } })
    fireEvent.blur(title)
    expect(slug).toHaveValue('second-engineering-title')
    fireEvent.change(slug, { target: { value: 'custom-url' } })
    fireEvent.focus(title)
    fireEvent.blur(title)
    expect(slug).toHaveValue('custom-url')
    fireEvent.change(slug, { target: { value: '' } })
    fireEvent.blur(title)
    expect(slug).toHaveValue('')
  })
  it('locks a published URL until the author deliberately enables editing', async () => {
    vi.mocked(updatePost).mockResolvedValue({ error: 'Confirm the URL change' })
    render(<PostEditor {...minimalProps} post={{ ...editorPost, status: 'published' }} />)
    expect(screen.getByLabelText('Slug')).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button', { name: 'Change published URL' }))
    expect(screen.getByLabelText('Slug')).not.toHaveAttribute('readonly')
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-published-url' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Confirm this URL change/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(updatePost).toHaveBeenCalledWith(editorPost.id, expect.objectContaining({ slug: 'new-published-url', confirm_slug_change: true }), false, editorPost.updated_at, undefined))
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'another-url' } })
    expect(screen.getByRole('checkbox', { name: /Confirm this URL change/ })).not.toBeChecked()
  })
})

it('preserves slug edits made while creation is in flight', async () => {
  vi.clearAllMocks()
  let finish!: (result: Awaited<ReturnType<typeof createPost>>) => void
  vi.mocked(createPost).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  render(<PostEditor {...minimalProps} />)
  fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'First Engineering Title' } })
  fireEvent.blur(screen.getByLabelText('Post title'))
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ auto_slug: true, slug: 'first-engineering-title' }), undefined, undefined))
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'newer-custom-url' } })
  await act(async () => finish({ data: { ...editorPost, slug: 'first-engineering-title-2' } }))
  expect(screen.getByLabelText('Slug')).toHaveValue('newer-custom-url')
})

it('generates a new URL on save after an author edits and clears the slug', async () => {
  vi.clearAllMocks()
  vi.mocked(createPost).mockResolvedValueOnce({ data: { ...editorPost, slug: 'useful-engineering-title' } })
  render(<PostEditor {...minimalProps} />)
  fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'Useful Engineering Title' } })
  fireEvent.blur(screen.getByLabelText('Post title'))
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: ' My Custom URL ' } })
  expect(screen.getByText('URL preview: /blog/my-custom-url')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
  await waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ slug: '', auto_slug: true }), undefined, undefined))
  await waitFor(() => expect(screen.getByLabelText('Slug')).toHaveValue('useful-engineering-title'))
})


describe('writing screen actions and private preview', () => {
  beforeEach(() => vi.resetAllMocks())
  it('keeps the same writing form after Save Draft and updates that post on the next save', async () => {
    vi.mocked(createPost).mockResolvedValueOnce({ data: editorPost })
    vi.mocked(updatePost).mockResolvedValueOnce({ data: editorPost })
    render(<PostEditor {...minimalProps} />)
    const body = screen.getByLabelText('Article body')
    fireEvent.change(body, { target: { value: 'Unfinished writing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Post saved as draft'))
    expect(screen.getByLabelText('Article body')).toBe(body)
    expect(body).toHaveValue('Unfinished writing')
    fireEvent.change(body, { target: { value: 'More writing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(updatePost).toHaveBeenCalledWith(editorPost.id, expect.objectContaining({ content: 'More writing' }), false, editorPost.updated_at, undefined))
    expect(createPost).toHaveBeenCalledOnce()
  })
  it('shows a destination review before directly publishing a new post', async () => {
    vi.mocked(createPost).mockResolvedValueOnce({ data: { ...editorPost, status: 'published' } })
    render(<PostEditor {...minimalProps} newsletter={{ delayMinutes: 45, send: null }} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'Practical Engineering Article' } })
    fireEvent.blur(screen.getByLabelText('Post title'))
    fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(createPost).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('/blog/practical-engineering-article')
    expect(screen.getByRole('dialog')).toHaveTextContent('45-minute delay')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ editorial_reviewed: true }), undefined, undefined, true))
    await waitFor(() => expect(screen.getByRole('button', { name: 'View Post' })).toBeVisible())
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeVisible()
    expect(toast.success).toHaveBeenCalledWith('Post saved and published!')
  })
  it('previews current unsaved input without saving or publishing and restores focus on close', async () => {
    vi.mocked(previewPost).mockResolvedValueOnce({ content: '<h2>Unsaved body heading</h2>' })
    render(<PostEditor {...minimalProps} post={editorPost} />)
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'Unsaved reader title' } })
    fireEvent.change(screen.getByLabelText('Article body'), { target: { value: 'Unsaved body' } })
    const trigger = screen.getByRole('button', { name: 'Preview' })
    trigger.focus()
    fireEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.getByRole('heading', { name: 'Unsaved reader title' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Unsaved body heading' })).toBeVisible()
    expect(previewPost).toHaveBeenCalledWith('Unsaved body', undefined, editorPost.id, '')
    expect(createPost).not.toHaveBeenCalled()
    expect(updatePost).not.toHaveBeenCalled()
    expect(publishPost).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Article body')).toHaveValue('Unsaved body')
  })
  it('keeps publication review open while saving and displays failed checks without remounting settings', async () => {
    let finish!: (result: Awaited<ReturnType<typeof createPost>>) => void
    vi.mocked(createPost).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(<PostEditor {...minimalProps} />)
    const cover = screen.getByLabelText('Cover image')
    const details = cover.closest('details')!
    fireEvent.change(cover, { target: { value: 'https://unsupported.example/cover.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(createPost).toHaveBeenCalled())
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeDisabled()
    await act(async () => finish({ error: 'Publication blocked', fieldErrors: { cover_image: ['Choose an allowed cover host'] } }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an allowed cover host')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(details).toHaveAttribute('open')
    expect(screen.getByLabelText('Cover image')).toBe(cover)
    expect(cover).toHaveValue('https://unsupported.example/cover.jpg')
    vi.mocked(createPost).mockResolvedValueOnce({ error: 'Connection failed' })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Connection failed'))
    expect(cover.closest('details')).toBe(details)
    expect(details).toHaveAttribute('open')
  })
  it('collapses optional settings and explains SEO fallbacks', () => {
    render(<PostEditor {...minimalProps} />)
    expect(screen.getByLabelText('SEO title').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByLabelText('Cover image').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText('Leave these blank to use the post title and excerpt in search results.')).toBeInTheDocument()
  })
})

describe('post editor accessibility', () => {
  beforeEach(() => vi.clearAllMocks())
  it('pairs visible labels with fields and connects guidance without dangling error IDs', () => {
    render(<PostEditor {...minimalProps} />)
    for (const name of ['Post title', 'Slug', 'Excerpt', 'Cover image', 'Category', 'SEO title', 'SEO description']) {
      const field = screen.getByLabelText(name)
      expect(field.id).not.toBe('')
      expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull()
      for (const id of field.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull()
    }
  })
  it('focuses the first failed field after a rejected draft save', async () => {
    vi.mocked(createPost).mockResolvedValueOnce({ error: 'Invalid fields', fieldErrors: { excerpt: ['Fix the excerpt'], title: ['Fix the title'] } })
    render(<PostEditor {...minimalProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(screen.getByLabelText('Post title')).toHaveFocus())
    expect(screen.getByLabelText('Post title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Post title')).toHaveAccessibleDescription(/Fix the title/)
    const excerpt = screen.getByLabelText('Excerpt')
    excerpt.focus()
    fireEvent.change(excerpt, { target: { value: 'Revising a different field' } })
    expect(excerpt).toHaveFocus()
  })
  it('focuses publication feedback then returns to the invalid content when editing resumes', async () => {
    vi.mocked(createPost).mockResolvedValueOnce({ error: 'Publication blocked', fieldErrors: { content: ['Write at least 200 words'] } })
    render(<PostEditor {...minimalProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.getByLabelText('Article body')).toHaveFocus())
    expect(screen.getByLabelText('Article body')).toHaveAccessibleDescription(/Write at least 200 words/)
  })
  it('opens a collapsed settings card before returning focus to its error', async () => {
    vi.mocked(createPost).mockResolvedValueOnce({ error: 'Publication blocked', fieldErrors: { cover_image: ['Choose an allowed cover host'] } })
    render(<PostEditor {...minimalProps} />)
    const field = screen.getByLabelText('Cover image')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(field).toHaveFocus())
    expect(field.closest('details')).toHaveAttribute('open')
  })
  it('reports client validation and focuses the invalid alt text without submitting', async () => {
    render(<PostEditor {...minimalProps} />)
    fireEvent.change(screen.getByLabelText('Cover image description (alt text)'), { target: { value: 'x'.repeat(1001) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(screen.getByLabelText('Cover image description (alt text)')).toHaveFocus())
    expect(createPost).not.toHaveBeenCalled()
  })
  it('announces progress locally and completion only through the toast', async () => {
    let finish!: (result: Awaited<ReturnType<typeof createPost>>) => void
    vi.mocked(createPost).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    render(<PostEditor {...minimalProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    await waitFor(() => expect(screen.getByRole('status', { name: 'Post save status' })).toHaveTextContent('Saving post…'))
    await act(async () => finish({ data: editorPost }))
    expect(screen.getByRole('status', { name: 'Post save status' })).toBeEmptyDOMElement()
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Post saved as draft')
    expect(screen.queryByText('Post saved as draft')).not.toBeInTheDocument()
  })
  it.each([
    { name: 'ordinary controls', height: 40, editable: false, shouldScroll: true },
    { name: 'tall controls', height: 2000, editable: false, shouldScroll: false },
    { name: 'editable article content', height: 40, editable: true, shouldScroll: false },
  ])('only corrects obscured focus for $name when appropriate', ({ height, editable, shouldScroll }) => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    const { container } = render(<PostEditor {...minimalProps} />)
    const bar = container.querySelector('[data-editor-actions]')!
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ bottom: 100 } as DOMRect)
    const target = screen.getByLabelText('Post title')
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 20, height } as DOMRect)
    if (editable) target.setAttribute('contenteditable', 'true')
    const scroll = vi.fn()
    target.scrollIntoView = scroll
    fireEvent.focus(target)
    if (shouldScroll) expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'center', behavior: 'instant' })
    else expect(scroll).not.toHaveBeenCalled()
  })
  it('honors reduced motion and moves focus to the title for back to top', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList)
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<PostEditor {...minimalProps} />)
    act(() => { Object.defineProperty(window, 'scrollY', { configurable: true, value: 301 }); fireEvent.scroll(window) })
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(screen.getByLabelText('Post title')).toHaveFocus()
    scroll.mockRestore()
  })
})
