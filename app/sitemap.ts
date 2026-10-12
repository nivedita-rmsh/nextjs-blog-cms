import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('slug, updated_at')
    .eq('status', 'published')
    .eq('moderation_status', 'approved')

  const { data: categories } = await supabase
    .from('categories')
    .select('slug, updated_at')

  const { data: tags } = await supabase
    .from('tags')
    .select('slug, created_at')
    .is('merged_into', null)

  const postUrls: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updated_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const categoryUrls: MetadataRoute.Sitemap = (categories ?? []).map((cat) => ({
    url: `${siteUrl}/blog/category/${cat.slug}`,
    lastModified: new Date(cat.updated_at),
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const tagUrls: MetadataRoute.Sitemap = (tags ?? []).map((tag) => ({
    url: `${siteUrl}/blog/tag/${tag.slug}`,
    lastModified: new Date(tag.created_at),
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...postUrls,
    ...categoryUrls,
    ...tagUrls,
  ]
}
