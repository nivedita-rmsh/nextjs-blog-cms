import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PostList } from '@/features/posts/components/PostList'
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

const makePost = (id: string, title: string): PostWithRelations => ({
  id,
  title,
  slug: `post-${id}`,
  content: '<p>Content</p>',
  excerpt: null,
  cover_image: null, cover_image_alt: '',
  status: 'published',
  moderation_status: 'approved',
  is_premium: false,
  published_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  author_id: 'a1',
  category_id: null,
  seo_title: null,
  seo_description: null,
  author: { id: 'a1', full_name: 'Author', avatar_url: null },
  category: null,
  tags: [],
})

describe('PostList', () => {
  it('shows empty state when posts array is empty', () => {
    render(<PostList posts={[]} />)
    expect(screen.getByText('No posts yet.')).toBeInTheDocument()
  })

  it('renders a list of post cards', () => {
    const posts = [makePost('1', 'First Post'), makePost('2', 'Second Post')]
    render(<PostList posts={posts} />)
    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.getByText('Second Post')).toBeInTheDocument()
  })

  it('renders correct number of cards', () => {
    const posts = [makePost('1', 'A'), makePost('2', 'B'), makePost('3', 'C')]
    render(<PostList posts={posts} />)
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(3)
  })
})
