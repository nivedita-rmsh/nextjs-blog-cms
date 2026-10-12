import type { Post, Profile, Category, Tag } from '@/lib/supabase/types'

export type PostWithRelations = Post & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  category: Pick<Category, 'id' | 'name' | 'slug'> | null
  tags: Tag[]
}

export type PostFormValues = {
  auto_slug?: boolean
  confirm_slug_change?: boolean
  editorial_reviewed?: boolean
  is_premium?: boolean
  title: string
  slug: string
  excerpt: string
  content: string
  cover_image_alt?: string
  cover_image: string
  category_id: string
  seo_title: string
  seo_description: string
  tag_ids: string[]
}

export type { Post, Category, Tag }
