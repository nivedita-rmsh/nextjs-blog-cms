import { getPublishedPosts } from '@/features/posts/queries'
import { PostList } from '@/features/posts/components/PostList'
import { rankRelatedPosts } from '@/features/posts/recommendations'
import type { PostWithRelations } from '@/features/posts/types'

export async function RelatedPosts({
  currentPost,
}: {
  currentPost: PostWithRelations
}) {
  const { posts } = await getPublishedPosts(1, 50)
  const recommendations = rankRelatedPosts(currentPost, posts, 3)

  if (recommendations.length === 0) return null

  return (
    <section className="mt-12 border-t pt-8" aria-labelledby="related-posts-title">
      <h2 id="related-posts-title" className="mb-6 text-2xl font-bold">
        Related Articles
      </h2>
      <PostList posts={recommendations} />
    </section>
  )
}
