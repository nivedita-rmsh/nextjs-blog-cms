import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Metadata } from 'next'
import { getPostBySlug, getAllPublishedSlugs, getPostRedirect } from '@/features/posts/queries'
import { PostBody } from '@/components/editor/PostBody'
import { Badge } from '@/components/ui/badge'
import { AuthorByline } from '@/features/authors/components/AuthorByline'
import { BackToTopButton } from '@/components/BackToTopButton'
import { CommentSection } from '@/features/comments/components/CommentSection'
import { ShareButton } from '@/components/ShareButton'
import { ChevronLeftIcon } from 'lucide-react'
import { SubscribeForm } from '@/components/newsletter/SubscribeForm'
import { RelatedPosts } from '@/features/posts/components/RelatedPosts'
import { getProfile } from '@/lib/auth/session'
import { getPremiumPostBody } from '@/features/premium/access'

export const revalidate = 0

interface PostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || '',
    openGraph: {
      title: post.seo_title || post.title,
      description: post.seo_description || post.excerpt || '',
      images: post.cover_image ? [post.cover_image] : [],
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      authors: post.author?.full_name ? [post.author.full_name] : undefined,
    },
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) {
    const currentSlug = await getPostRedirect(slug)
    if (currentSlug) permanentRedirect(`/blog/${currentSlug}`)
    notFound()
  }

  const profile = await getProfile()
  const premiumBody = post.is_premium ? await getPremiumPostBody(post.id, profile?.id, post.author_id) : null
  const canReadArticle = !post.is_premium || premiumBody !== null
  const articleContent = post.is_premium ? premiumBody : post.content

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? post.seo_description ?? '',
    image: post.cover_image ? [post.cover_image] : [],
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: post.author?.full_name
      ? [{ '@type': 'Person', name: post.author.full_name }]
      : [],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="container max-w-3xl mx-auto py-12 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
            Back to Blog
          </Link>
          {post.category && (
            <Link href={`/blog/category/${post.category.slug}`}>
              <Badge className="rounded-full px-3 text-xs">{post.category.name}</Badge>
            </Link>
          )}
        </div>

        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3 mb-8 text-sm text-muted-foreground">
          <AuthorByline author={post.author} showAvatar />
          {post.published_at && (
            <>
              <span>·</span>
              <time dateTime={post.published_at}>
                {format(new Date(post.published_at), 'MMMM d, yyyy')}
              </time>
            </>
          )}
          <div className="ml-auto">
            <ShareButton
              url={`${baseUrl}/blog/${post.slug}`}
              title={post.title}
            />
          </div>
        </div>

        {canReadArticle ? (
          <PostBody title={post.title} coverImage={post.cover_image} coverImageAlt={post.cover_image_alt} excerpt={post.excerpt} content={articleContent ?? ''} />
        ) : (
          <section className="rounded-2xl border p-6 md:p-8 space-y-4" aria-labelledby="premium-access-title">
            <Badge variant="secondary">Premium article</Badge>
            <h2 id="premium-access-title" className="text-2xl font-semibold">Premium access required</h2>
            <p className="text-muted-foreground">{post.excerpt || 'This article is available to readers with an active premium entitlement.'}</p>
            <p className="text-sm text-muted-foreground">Sign in with an active premium entitlement to read the complete article. This demo checks an entitlement record; it does not process payments.</p>
            <Link className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground" href={`/login?next=${encodeURIComponent(`/blog/${post.slug}`)}`}>Sign in to check access</Link>
          </section>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link key={tag.id} href={`/blog/tag/${tag.slug}`}>
                <Badge variant="secondary" className="rounded-full px-3 text-xs">#{tag.name}</Badge>
              </Link>
            ))}
          </div>
        )}

        <SubscribeForm />

        <RelatedPosts currentPost={post} />

        <CommentSection postId={post.id} postSlug={post.slug} />
      </article>
      <BackToTopButton />
    </>
  )
}
