import { describe, expect, it } from 'vitest'
import { rankRelatedPosts } from '@/features/posts/recommendations'
import type { PostWithRelations } from '@/features/posts/types'

function makePost(
  id: string,
  options: {
    status?: 'draft' | 'published'
    categoryId?: string | null
    tagIds?: string[]
    publishedAt?: string | null
  } = {},
): PostWithRelations {
  const tagIds = options.tagIds ?? []

  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    content: null,
    excerpt: null,
    cover_image: null,
    cover_image_alt: '',
    status: options.status ?? 'published',
    moderation_status: options.status === 'draft' ? 'not_submitted' : 'approved',
    is_premium: false,
    published_at: options.publishedAt ?? '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    author_id: null,
    category_id: options.categoryId ?? null,
    seo_title: null,
    seo_description: null,
    author: null,
    category: options.categoryId
      ? { id: options.categoryId, name: options.categoryId, slug: options.categoryId }
      : null,
    tags: tagIds.map((tagId) => ({
      id: tagId,
      name: tagId,
      slug: tagId,
      created_at: '2026-01-01T00:00:00Z',
    })),
  }
}

describe('rankRelatedPosts', () => {
  const current = makePost('current', {
    categoryId: 'tech',
    tagIds: ['typescript', 'nextjs'],
  })

  it('ranks shared tags above a category-only match', () => {
    const categoryOnly = makePost('category', { categoryId: 'tech' })
    const sharedTag = makePost('tag', { tagIds: ['typescript'] })

    expect(rankRelatedPosts(current, [categoryOnly, sharedTag]).map((p) => p.id))
      .toEqual(['tag', 'category'])
  })

  it('excludes the current article and unpublished drafts', () => {
    const draft = makePost('draft', {
      status: 'draft',
      tagIds: ['typescript'],
    })

    expect(rankRelatedPosts(current, [current, draft])).toEqual([])
  })

  it('returns only relevant posts and respects the limit', () => {
    const posts = [
      makePost('one', { tagIds: ['typescript'] }),
      makePost('two', { categoryId: 'tech' }),
      makePost('unrelated', { categoryId: 'food' }),
    ]

    expect(rankRelatedPosts(current, posts, 1).map((p) => p.id)).toEqual(['one'])
  })

  it('returns an empty list when no candidates are relevant', () => {
    expect(rankRelatedPosts(current, [makePost('unrelated')])).toEqual([])
  })
})
