import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostCard } from '@/features/posts/components/PostCard'
import type { PostWithRelations } from '@/features/posts/types'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const basePost: PostWithRelations = {
  id: '1',
  title: 'Hello World',
  slug: 'hello-world',
  content: '<p>Content</p>',
  excerpt: 'A short excerpt',
  cover_image: null, cover_image_alt: '',
  status: 'published',
  moderation_status: 'approved',
  is_premium: false,
  published_at: '2024-06-01T00:00:00Z',
  created_at: '2024-06-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
  author_id: 'author-1',
  category_id: null,
  seo_title: null,
  seo_description: null,
  author: { id: 'author-1', full_name: 'Jane Doe', avatar_url: null },
  category: null,
  tags: [],
}

describe('PostCard', () => {
  it('renders post title', () => {
    render(<PostCard post={basePost} />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  it('renders post excerpt', () => {
    render(<PostCard post={basePost} />)
    expect(screen.getByText('A short excerpt')).toBeInTheDocument()
  })

  it('renders author full name', () => {
    render(<PostCard post={basePost} />)
    expect(screen.getByRole('link', { name: 'Jane Doe' })).toHaveAttribute('href', '/authors/author-1')
  })

  it('uses a public fallback when full_name is null', () => {
    const post = { ...basePost, author: { ...basePost.author!, full_name: null } }
    render(<PostCard post={post} />)
    expect(screen.getByRole('link', { name: 'Author' })).toHaveAttribute('href', '/authors/author-1')
  })

  it('renders "Unknown" when author is null', () => {
    const post = { ...basePost, author: null }
    render(<PostCard post={post} />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('renders formatted published date', () => {
    render(<PostCard post={basePost} />)
    expect(screen.getByText('Jun 1, 2024')).toBeInTheDocument()
  })

  it('does not render date when published_at is null', () => {
    const post = { ...basePost, published_at: null }
    render(<PostCard post={post} />)
    expect(screen.queryByRole('time')).not.toBeInTheDocument()
  })

  it('renders cover image when provided', () => {
    const post = { ...basePost, cover_image: 'https://example.com/image.jpg' }
    render(<PostCard post={post} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/image.jpg')
  })

  it('does not render cover image when null', () => {
    render(<PostCard post={basePost} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders category badge with link when category exists', () => {
    const post = { ...basePost, category: { id: 'cat-1', name: 'Technology', slug: 'technology' } }
    render(<PostCard post={post} />)
    expect(screen.getByText('Technology')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Technology' })).toHaveAttribute('href', '/blog/category/technology')
  })

  it('links the title to the blog post', () => {
    render(<PostCard post={basePost} />)
    expect(screen.getByRole('link', { name: 'Hello World' })).toHaveAttribute('href', '/blog/hello-world')
  })
})

it('includes relevant tag links when requested by an author listing', () => {
  render(<PostCard post={{ ...basePost, tags: [{ id: 'tag', name: 'Engineering', slug: 'engineering', created_at: '2026-10-07T00:00:00Z' }] }} showTags />)
  expect(screen.getByRole('link', { name: '#Engineering' })).toHaveAttribute('href', '/blog/tag/engineering')
})


describe('cover image metadata', () => {
  it('uses the editor-provided cover description', () => {
    render(<PostCard post={{ ...basePost, cover_image: 'https://images.example.com/board.webp', cover_image_alt: 'A blue circuit board with labeled test points' }} />)
    expect(screen.getByAltText('A blue circuit board with labeled test points')).toBeInTheDocument()
  })
})
