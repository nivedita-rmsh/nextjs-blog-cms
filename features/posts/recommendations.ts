import type { PostWithRelations } from './types'

/**
 * Rank published articles by relevance to the current article.
 * Shared tags carry more weight than a shared category.
 */
export function rankRelatedPosts(
  currentPost: PostWithRelations,
  candidates: PostWithRelations[],
  limit = 3,
): PostWithRelations[] {
  const currentTagIds = new Set(currentPost.tags.map((tag) => tag.id))

  return candidates
    .filter(
      (candidate) =>
        candidate.id !== currentPost.id &&
        candidate.status === 'published' &&
        candidate.moderation_status === 'approved',
    )
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) =>
        currentTagIds.has(tag.id),
      ).length

      const sharedCategory =
        currentPost.category?.id != null &&
        candidate.category?.id === currentPost.category.id

      return {
        post: candidate,
        score: sharedTags * 2 + (sharedCategory ? 1 : 0),
      }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score

      const aDate = a.post.published_at
        ? new Date(a.post.published_at).getTime()
        : 0
      const bDate = b.post.published_at
        ? new Date(b.post.published_at).getTime()
        : 0

      return bDate - aDate
    })
    .slice(0, Math.max(0, limit))
    .map(({ post }) => post)
}
