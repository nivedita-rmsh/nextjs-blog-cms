import { isCoverImageAllowed, COVER_IMAGE_ERROR } from '@/lib/cover-images'
import slugify from 'slugify'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import type { createServiceClient } from '@/lib/supabase/service'

export const PUBLICATION_LIMITS = { titleMin: 10, titleMax: 160, bodyWords: 200, excerptMin: 40, excerptMax: 500 } as const
export type FieldErrors = Record<string, string[]>
export type PublicationInput = {
  title?: unknown
  slug?: unknown
  content?: unknown
  excerpt?: unknown
  author_id?: unknown
  seo_title?: unknown
  seo_description?: unknown
  cover_image?: unknown
}

// The parser decodes HTML entities and drops non-readable subtrees. Keep block
// boundaries so adjacent paragraphs count as separate words, but inline markup
// cannot inflate counts or conceal placeholder phrases.
export function readableText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'td', 'th'],
    allowedAttributes: { '*': ['hidden', 'aria-hidden', 'style', 'class'] },
    // Keep boolean attributes such as `hidden` visible to the text filter.
    nonBooleanAttributes: [],
    exclusiveFilter: frame => 'hidden' in frame.attribs || frame.attribs['aria-hidden'] === 'true' ||
      /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(frame.attribs.style ?? '') ||
      /(?:^|\s)hidden(?:\s|$)/.test(frame.attribs.class ?? ''),
    nonTextTags: ['script', 'style', 'textarea', 'option', 'template', 'svg', 'math', 'noscript'],
  }).replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[entity]!)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ').trim()
}

export function readableArticleText(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const doc: unknown = JSON.parse(value)
    if (!doc || typeof doc !== 'object' || !('type' in doc) || doc.type !== 'doc') return ''
    const walk = (node: unknown, depth = 0): string => {
      if (depth > 64 || !node || typeof node !== 'object') return ''
      const item = node as { type?: string; text?: unknown; content?: unknown[] }
      if (item.type === 'text') return typeof item.text === 'string' ? item.text : ''
      const text = Array.isArray(item.content) ? item.content.map(child => walk(child, depth + 1)).join('') : ''
      return /^(paragraph|heading|listItem|taskItem|blockquote|codeBlock|tableCell|tableHeader|hardBreak)$/.test(item.type ?? '') ? text + ' ' : text
    }
    return walk(doc).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()
  } catch {
    return readableText(value)
  }
}

function isPlaceholderImage(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try { return /(?:^|\.)(?:placehold\.co|placeholder\.com)$/.test(new URL(value).hostname) } catch { return false }
}

function hasPlaceholderImage(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    const walk = (node: unknown, depth = 0): boolean => {
      if (depth > 64 || !node || typeof node !== 'object') return false
      const item = node as { type?: string; attrs?: { src?: unknown }; content?: unknown[] }
      return (item.type === 'image' && isPlaceholderImage(item.attrs?.src)) ||
        (Array.isArray(item.content) && item.content.some(child => walk(child, depth + 1)))
    }
    return walk(JSON.parse(value))
  } catch {
    let found = false
    sanitizeHtml(value, { allowedTags: ['img'], allowedAttributes: { img: ['src'] },
      exclusiveFilter: frame => { if (frame.tag === 'img' && isPlaceholderImage(frame.attribs.src)) found = true; return false },
    })
    return found
  }
}

const placeholderTitle = /^(?:hello this is for test|test(?: post| article)?|e2e(?: .*)?|untitled(?: post| article)?|sample(?: post| article)?|placeholder(?: .*)?)[.!]*$/i
const filler = /hello this is for test|\blorem ipsum\b|\b(?:insert|add|write) (?:your )?(?:title|content|text|excerpt) here\b|\[(?:insert|add|your) [^\]]+\]/i

function validatePublicationTitle(
  title: string,
  add: (field: string, message: string) => void
): void {
  if (
    title.length < PUBLICATION_LIMITS.titleMin ||
    title.length > PUBLICATION_LIMITS.titleMax
  ) {
    add('title', 'Use a descriptive title of 10–160 readable characters.')
  }

  if (placeholderTitle.test(title) || filler.test(title)) {
    add(
      'title',
      'Replace the test or placeholder title with a meaningful engineering topic.'
    )
  }
}

function validatePublicationContent(
  content: string,
  add: (field: string, message: string) => void
): void {
  const words =
    content.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0

  if (words < PUBLICATION_LIMITS.bodyWords) {
    add(
      'content',
      `Write at least 200 readable words; this article has ${words}. Include practical examples and useful takeaways.`
    )
  }
}

export function publicationErrors(input: PublicationInput, authorName: unknown, editorialReviewed: unknown): FieldErrors {
  const errors: FieldErrors = {}
  const add = (field: string, message: string) => { (errors[field] ??= []).push(message) }
  const title = readableText(input.title)
  const content = readableArticleText(input.content)
  const excerpt = readableText(input.excerpt)
  validatePublicationTitle(title, add)
  if (typeof input.slug !== 'string' || input.slug.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) add('slug', 'Use a unique slug of up to 200 lowercase letters, numbers and hyphens.')
  validatePublicationContent(content, add)
  if (excerpt.length < PUBLICATION_LIMITS.excerptMin || excerpt.length > PUBLICATION_LIMITS.excerptMax) add('excerpt', 'Write an accurate excerpt of 40–500 readable characters.')
  for (const field of ['title', 'content', 'excerpt', 'seo_title', 'seo_description'] as const) {
    const text = field === 'content' ? content : readableText(input[field])
    if (field !== 'title' && filler.test(text)) add(field, 'Remove filler or unfinished template text before publishing.')
  }
  if (typeof authorName !== 'string' || !authorName.trim() || !input.author_id) add('author_id', 'Assign an author with a display name in their profile.')
  if (!isCoverImageAllowed(input.cover_image)) add('cover_image', COVER_IMAGE_ERROR)
  if (isPlaceholderImage(input.cover_image)) add('cover_image', 'Replace the placeholder cover image or remove it.')
  if (hasPlaceholderImage(input.content)) add('content', 'Replace placeholder article images or remove them before publishing.')
  if (editorialReviewed !== true) add('editorial_reviewed', 'A human editor must confirm accuracy, usefulness, attribution, taxonomy and SEO metadata before publishing.')
  return errors
}

export async function validatePublication(
  client: ReturnType<typeof createServiceClient>, input: PublicationInput, editorialReviewed: unknown, excludeId?: string, automaticSlug = false
): Promise<FieldErrors> {
  const { data: author, error: authorError } = await client.from('profiles').select('full_name').eq('id', input.author_id).maybeSingle()
  const errors = publicationErrors(input, authorError ? null : author?.full_name, editorialReviewed)
  if (!errors.slug && !automaticSlug) {
    let query = client.from('posts').select('id').eq('slug', input.slug)
    if (excludeId) query = query.neq('id', excludeId)
    const { data: conflict, error } = await query.maybeSingle()
    if (error) errors.slug = ['Could not verify slug uniqueness. Try again.']
    else if (conflict) errors.slug = ['This slug is already in use. Choose another.']
  }
  return errors
}

// Draft fields may be empty. Validate JSON types before any mutation instead of
// trusting a TypeScript cast or letting malformed input throw a server error.
export const postApiSchema = z.object({
  title: z.string().optional(), content: z.string().optional(), slug: z.string().optional(),
  excerpt: z.string().nullable().optional(), meta_title: z.string().nullable().optional(),
  meta_description: z.string().nullable().optional(), image_url: z.string().nullable().optional(), image_alt: z.string().max(1000).optional(),
  status: z.enum(['draft', 'published']).optional(), category: z.string().nullable().optional(),
  confirm_slug_change: z.boolean().optional(),
  tags: z.array(z.string().refine(name => !name.trim() || Boolean(slugify(name.trim(), { lower: true, strict: true })), 'Tag names must contain letters or numbers.')).optional(), editorial_reviewed: z.boolean().optional(),
})

export type PostApiBody = z.infer<typeof postApiSchema>
