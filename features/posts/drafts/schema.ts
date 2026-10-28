import { z } from 'zod'
import type { PostWithRelations } from '../types'

// Recovery never restores a previous editorial approval.
export const draftValuesSchema = z.object({
  title: z.string(), slug: z.string(), excerpt: z.string(), content: z.string(),
  cover_image_alt: z.string().optional(), cover_image: z.string(), category_id: z.string(), seo_title: z.string(),
  seo_description: z.string(), is_premium: z.boolean().default(false), tag_ids: z.array(z.string()),
})
export type DraftValues = z.infer<typeof draftValuesSchema>
export type WorkingCopy = {
  document_id: string
  post_id: string | null
  values: DraftValues
  revision: string
  base_updated_at: string | null
  updated_at: string
}
export function draftValues(post?: PostWithRelations): DraftValues {
  return {
    title: post?.title ?? '', slug: post?.slug ?? '', excerpt: post?.excerpt ?? '',
    content: post?.content ?? '', cover_image_alt: post?.cover_image_alt ?? '', cover_image: post?.cover_image ?? '', category_id: post?.category_id ?? '',
    seo_title: post?.seo_title ?? '', seo_description: post?.seo_description ?? '',
    is_premium: post?.is_premium ?? false,
    tag_ids: post?.tags?.map(tag => tag.id) ?? [],
  }
}
export function snapshot(values: DraftValues): string {
  return JSON.stringify(draftValuesSchema.parse(values))
}

// Leave room for Server Action framing and JSONB whitespace within the 1 MB
// request limit and 2 MB database constraint. Count UTF-8 bytes, not characters.
export const MAX_DRAFT_BYTES = 750_000
export const DRAFT_TOO_LARGE = 'This draft is too large to autosave (750 KB limit). Shorten it before retrying. Your writing is preserved on this device.'
export function draftTooLarge(serialized: string): boolean {
  return new TextEncoder().encode(serialized).byteLength > MAX_DRAFT_BYTES
}
