'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { pastedImageFile } from '@/features/posts/media/clipboard'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import slugify from 'slugify'
import {
  Loader2, Check, ImageIcon, Tag, Settings2,
  Search, BarChart3, ChevronLeft, Globe, Send, BookOpen, ExternalLink, ArrowUp,
} from 'lucide-react'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { CoverImagePreview } from '@/components/editor/CoverImagePreview'
import { previewPost } from '@/features/posts/preview'
import { AuthorByline } from '@/features/authors/components/AuthorByline'
import { PostBody } from '@/components/editor/PostBody'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Editor } from '@/components/editor/Editor'
import { createPost, updatePost, publishPost, unpublishPost } from '@/features/posts/actions'
import { useDraftRecovery, type DraftIdentity } from '@/features/posts/drafts/use-draft-recovery'
import type { FieldErrors } from '@/features/posts/publication'
import { TagSelector } from '@/features/taxonomy/TagSelector'
import type { PostWithRelations, Category, Tag as TagType } from '@/features/posts/types'
import type { PostNewsletterState } from '@/features/newsletter/types'
import { PostNewsletter } from './PostNewsletter'

const postSchema = z.object({
  title: z.string(),
  editorial_reviewed: z.boolean(),
  is_premium: z.boolean(),
  slug: z.string(),
  excerpt: z.string(),
  content: z.string(),
  cover_image: z.string(),
  cover_image_alt: z.string().max(1000).optional(),
  category_id: z.string(),
  seo_title: z.string(),
  seo_description: z.string(),
  tag_ids: z.array(z.string()),
})

type PostFormValues = z.infer<typeof postSchema>

interface PostEditorProps {
  readonly authorName?: string | null
  readonly draftIdentity?: DraftIdentity
  readonly post?: PostWithRelations
  readonly categories: Category[]
  readonly tags: TagType[]
  readonly tagsError?: boolean
  readonly canManageTags?: boolean
  readonly newsletter?: PostNewsletterState
}

export function PostEditor({ post: initialPost, categories, tags, tagsError, canManageTags, draftIdentity, newsletter: initialNewsletter, authorName }: PostEditorProps) {
  const [createdPost, setCreatedPost] = useState<PostWithRelations>()
  const createdIsLatest = createdPost && (!initialPost?.updated_at || Date.parse(createdPost.updated_at ?? '') >= Date.parse(initialPost.updated_at))
  const post = createdIsLatest ? createdPost : initialPost
  const [savedNewsletter, setSavedNewsletter] = useState<PostNewsletterState>()
  const newsletter = initialPost ? initialNewsletter : savedNewsletter ?? initialNewsletter
  const [scrollOffset, setScrollOffset] = useState(120)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const pendingErrorFocus = useRef(false)
  const reviewErrorRef = useRef<HTMLDivElement>(null)
  const genericErrorRef = useRef<HTMLParagraphElement>(null)
  const previewTrigger = useRef<HTMLButtonElement>(null)
  const publicationTrigger = useRef<HTMLButtonElement>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [preview, setPreview] = useState<(PostFormValues & { renderedContent: string }) | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const router = useRouter()
  const [manuallyEditedSlug, setManuallyEditedSlug] = useState(false)
  const [generatedSlug, setGeneratedSlug] = useState('')
  const [slugChangeConfirmed, setSlugChangeConfirmed] = useState(false)
  const [allowSlugChange, setAllowSlugChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [newsletterWarning, setNewsletterWarning] = useState<string | null>(null)
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [coverPaste, setCoverPaste] = useState<File>()
  const [publicationError, setPublicationError] = useState<string>()
  const [publicationFieldErrors, setPublicationFieldErrors] = useState<FieldErrors>({})
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 300)
    }
    const options: AddEventListenerOptions = { passive: true }
    window.addEventListener('scroll', onScroll, options)
    return () => window.removeEventListener('scroll', onScroll, options)
  }, [])

  useEffect(() => {
    const bar = actionBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const offset = Math.max(72, bar.getBoundingClientRect().height + 16)
      setScrollOffset(offset)
      formRef.current?.style.setProperty('--post-editor-toolbar-height', `${offset}px`)
    })
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  const isPublished = post?.status === 'published'

  const form = useForm<PostFormValues>({
      resolver: zodResolver(postSchema),
      shouldFocusError: false,
      defaultValues: {
        editorial_reviewed: false,
        is_premium: post?.is_premium ?? false,
        title: post?.title ?? '',
        slug: post?.slug ?? '',
        excerpt: post?.excerpt ?? '',
        content: post?.content ?? '',
        cover_image: post?.cover_image ?? '',
        cover_image_alt: post?.cover_image_alt ?? '',
        category_id: post?.category_id ?? '',
        seo_title: post?.seo_title ?? '',
        seo_description: post?.seo_description ?? '',
        tag_ids: post?.tags?.map((t) => t.id) ?? [],
      },
    })

  const { register, handleSubmit, control, setValue, getValues, formState: { errors } } = form
  const fieldErrors = useMemo<FieldErrors>(() => ({
    ...publicationFieldErrors,
    ...Object.fromEntries(Object.entries(errors).map(([name, error]) => [name, [error.message ?? 'Check this field.']])),
  }), [publicationFieldErrors, errors])
  function describedBy(name: string) {
    return [`${name}-help`, fieldErrors[name]?.length ? `${name}-error` : undefined].filter(Boolean).join(' ')
  }

  function firstErrorTarget() {
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]') ?? genericErrorRef.current
    // Errors in collapsed cards must be visible before focus is restored.
    if (target) for (const details of formRef.current?.querySelectorAll('details') ?? []) {
      if (details.contains(target)) details.open = true
    }
    return target
  }

  useEffect(() => {
    if (!pendingErrorFocus.current || saving || publishing || (!publicationError && !Object.keys(fieldErrors).length)) return
    const target = reviewOpen ? reviewErrorRef.current : firstErrorTarget()
    if (!target) return
    pendingErrorFocus.current = false
    target.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'center', behavior: 'instant' })
  }, [fieldErrors, publicationError, saving, publishing, reviewOpen])

  const recovery = useDraftRecovery(form, draftIdentity, post?.id ?? null, post?.updated_at ?? null)
  const recoveryPending = !recovery.ready || recovery.candidates.length > 0

  const reviewText = useWatch({ control, name: ['title', 'excerpt', 'content'] })
  const flaggedForReview = reviewText.some(text => /\b(?:TODO|TBD)\b|coming soon|work in progress/i.test(text ?? ''))
  const title = useWatch({ control, name: 'title' })
  const slug = useWatch({ control, name: 'slug' })
  const normalizedSlug = slugify(slug ?? '', { lower: true, strict: true })
  const editorialReviewed = useWatch({ control, name: 'editorial_reviewed' })
  const destinationSlug = normalizedSlug || post?.slug || slugify(title ?? '', { lower: true, strict: true }) || 'generated-from-title'
  const destinationUrl = `${(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')}/blog/${destinationSlug}`
  const coverImage = useWatch({ control, name: 'cover_image' })
  const coverImageAlt = useWatch({ control, name: 'cover_image_alt' })
  const selectedTagIds = useWatch({ control, name: 'tag_ids' })

  function autoSlug() {
    const current = getValues('slug')
    // A restored or saved URL is authoritative, even without local edit history.
    if (post || manuallyEditedSlug || (current && current !== generatedSlug)) return
    const nextSlug = slugify(title ?? '', { lower: true, strict: true }).slice(0, 196).replace(/-+$/, '')
    setGeneratedSlug(nextSlug)
    setValue('slug', nextSlug)
  }

  function toggleTag(tagId: string) {
    setValue('editorial_reviewed', false)
    const current = [...new Set((selectedTagIds ?? []).map(id => tags.find(tag => tag.id === id)?.merged_into ?? id))]
    if (current.includes(tagId)) {
      setValue('tag_ids', current.filter((id) => id !== tagId), { shouldDirty: true })
    } else {
      setValue('tag_ids', [...current, tagId], { shouldDirty: true })
    }
  }

  function syncSavedSlug(savedSlug: string, submittedSlug: string) {
    if (getValues('slug') !== submittedSlug) return
    setValue('slug', savedSlug)
    setSlugChangeConfirmed(false)
    setAllowSlugChange(false)
  }

  async function onSubmit(values: PostFormValues, publish = false) {
    if (recoveryPending) return
    setPublicationFieldErrors({})
    setPublicationError(undefined)
    setSaving(!publish)
    setPublishing(publish)
    try {
      const expectedUpdatedAt = await recovery.beginSave()
      const result = post
        ? await updatePost(post.id, { ...values, confirm_slug_change: slugChangeConfirmed }, publish, expectedUpdatedAt, draftIdentity?.userId)
        : publish
          ? await createPost({ ...values, auto_slug: !values.slug.trim() || (!manuallyEditedSlug && values.slug === generatedSlug) }, draftIdentity?.userId, draftIdentity?.documentId, true)
          : await createPost({ ...values, auto_slug: !values.slug.trim() || (!manuallyEditedSlug && values.slug === generatedSlug) }, draftIdentity?.userId, draftIdentity?.documentId)
      if (result.error || !result.data) {
        pendingErrorFocus.current = true
        setPublicationFieldErrors(result.fieldErrors ?? {})
        setPublicationError(result.error ?? 'The post could not be saved. Your input is preserved.')
        toast.error(result.error ?? 'The post could not be saved. Your input is preserved.')
        await recovery.finishSave()
      } else {
        const savedValues = { ...values, slug: result.data.slug }
        syncSavedSlug(result.data.slug, values.slug)
        await recovery.finishSave(savedValues, result.data.updated_at, !post ? result.data.id : undefined)
        if (createdPost || !post) {
          setCreatedPost({ ...result.data, author: post?.author ?? null, category: categories.find(category => category.id === values.category_id) ?? null, tags: tags.filter(tag => values.tag_ids.includes(tag.id)) })
        } else router.refresh()
        const savedMessage = result.data.moderation_status === 'pending' ? 'Submitted for moderation' : isPublished ? 'Published changes saved' : 'Post saved as draft'
        const message = publish && result.data.moderation_status === 'pending' ? 'Submitted for administrator moderation' : publish ? 'Post saved and published!' : savedMessage
        toast.success(message)
        if (result.newsletterState) setSavedNewsletter(result.newsletterState)
        setNewsletterWarning(result.newsletterWarning ?? null)
        if (result.newsletterWarning) toast.warning(result.newsletterWarning)
        if (result.moderationWarning) toast.warning(result.moderationWarning)
        setReviewOpen(false)
      }
    } catch {
      pendingErrorFocus.current = true
      setPublicationError('Save failed. Check your connection or sign in again, then retry. Your input is preserved.')
      toast.error('Save failed. Check your connection or sign in again, then retry. Your input is preserved.')
      await recovery.finishSave()
    } finally { setSaving(false); setPublishing(false) }
  }

  async function handlePublishToggle() {
    if (!post || recoveryPending) return
    setPublishing(true)
    setPublicationFieldErrors({})
    setPublicationError(undefined)
    const values = getValues()
    try {
      const expectedUpdatedAt = await recovery.beginSave()
      const result = isPublished
        ? await unpublishPost(post.id, draftIdentity?.userId)
        : await publishPost(post.id, { ...values, confirm_slug_change: slugChangeConfirmed }, expectedUpdatedAt, draftIdentity?.userId)
      if (result.error || !result.data) {
        pendingErrorFocus.current = true
        setPublicationFieldErrors(result.fieldErrors ?? {})
        setPublicationError(result.error ?? 'The post could not be saved. Your input is preserved.')
        toast.error(result.error ?? 'The post could not be saved. Your input is preserved.')
        await recovery.finishSave()
      } else {
        if (isPublished) {
          recovery.updateBase(result.data.updated_at)
          await recovery.finishSave()
        } else {
          syncSavedSlug(result.data.slug, values.slug)
          await recovery.finishSave({ ...values, slug: result.data.slug }, result.data.updated_at)
        }
        if (createdPost) setCreatedPost({ ...createdPost, ...result.data })
        setReviewOpen(false)
        const message = isPublished ? 'Post unpublished' : result.data.moderation_status === 'pending' ? 'Submitted for administrator moderation' : result.data.status === 'published' ? 'Post saved and published!' : 'Post saved as draft'
        toast.success(message)
        if (result.newsletterState) setSavedNewsletter(result.newsletterState)
        setNewsletterWarning(result.newsletterWarning ?? null)
        if (result.newsletterWarning) toast.warning(result.newsletterWarning)
        if (result.moderationWarning) toast.warning(result.moderationWarning)
        router.refresh()
      }
    } catch {
      pendingErrorFocus.current = true
      setPublicationError('Save failed. Check your connection or sign in again, then retry. Your input is preserved.')
      toast.error('Save failed. Check your connection or sign in again, then retry. Your input is preserved.')
      await recovery.finishSave()
    } finally { setPublishing(false) }
  }

  async function openPreview() {
    if (recoveryPending || previewing) return
    const values = getValues()
    setPreviewing(true)
    try {
      const result = await previewPost(values.content, draftIdentity?.userId, post?.id, values.cover_image)
      if (result.error || result.content === undefined) toast.error(result.error ?? 'Preview unavailable.')
      else setPreview({ ...values, renderedContent: result.content })
    } catch { toast.error('Preview failed. Check your connection and retry.') }
    finally { setPreviewing(false) }
  }

  let progressMessage = ''
  if (saving) progressMessage = 'Saving post…'
  else if (publishing) progressMessage = isPublished ? 'Unpublishing post…' : 'Publishing post…'

  return (
    <>
      <form ref={formRef} className="post-editor" aria-label="Post editor" onFocusCapture={event => {
        const bar = actionBarRef.current
        const target = event.target as HTMLElement
        // TipTap scrolls its caret; centering the entire article would move away from a clicked paragraph.
        if (!bar || bar.contains(target) || target.isContentEditable || target.closest('[contenteditable="true"]') || !window.matchMedia('(min-width: 1024px)').matches) return
        const bounds = target.getBoundingClientRect()
        const barBottom = bar.getBoundingClientRect().bottom
        if (bounds.height <= window.innerHeight - barBottom && bounds.top < barBottom) {
          target.scrollIntoView?.({ block: 'center', behavior: 'instant' })
        }
      }} onSubmit={event => { void handleSubmit(values => onSubmit(values), () => { pendingErrorFocus.current = true })(event) }} onChange={(event) => {
        if (event.target.getAttribute('name') !== 'editorial_reviewed') setValue('editorial_reviewed', false)
      }}>
        {/* ── Sticky action bar ───────────────────────────────────── */}
        <div ref={actionBarRef} data-editor-actions className="lg:sticky lg:top-0 z-20 -mx-4 px-4 md:-mx-8 md:px-8 py-3 mb-6 bg-background/80 backdrop-blur-md border-b border-border/50 flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            disabled={saving || publishing}
            onClick={() => { if (recovery.canLeave()) router.push('/dashboard/posts') }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            All posts
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{isPublished ? 'Published' : 'Draft'}</Badge>
            <Button ref={previewTrigger} type="button" variant="outline" size="sm" onClick={openPreview} disabled={saving || publishing || previewing || recoveryPending}>{previewing ? 'Preparing preview…' : 'Preview'}</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => { if (await recovery.discard()) router.push('/dashboard/posts') }}
              className="text-muted-foreground"
              disabled={saving || publishing || recoveryPending}
            >
              Discard
            </Button>

            {/* View published post */}
            {post && isPublished && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => window.open(`/blog/${post.slug}`, '_blank', 'noopener,noreferrer')}
                disabled={saving || publishing || recoveryPending}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                View Post
              </Button>
            )}

            {/* Saving never changes publication status. */}
            <Button
              type="submit"
              disabled={saving || publishing || recoveryPending}
              size="sm"
              variant="outline"
              className="border-border/70 hover:-translate-y-px transition-all duration-150 px-4 min-w-[110px]"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                  {isPublished ? 'Save Changes' : 'Save Draft'}
                </>
              )}
            </Button>
            {/* Publish / Unpublish — only shown for existing posts */}
            {post && (
              <Button
                type="button"
                disabled={saving || publishing || recoveryPending}
                size="sm"
                ref={publicationTrigger}
                onClick={() => { if (isPublished) void handlePublishToggle(); else setReviewOpen(true) }}
                className={
                  isPublished
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-xs shadow-amber-500/25 hover:-translate-y-px transition-all duration-150 px-5 min-w-[130px]'
                    : 'bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 shadow-xs shadow-blue-500/25 hover:-translate-y-px transition-all duration-150 px-5 min-w-[130px]'
                }
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    {isPublished ? 'Unpublishing…' : 'Publishing…'}
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </>
                )}
              </Button>
            )}

            {!post && <Button ref={publicationTrigger} type="button" size="sm" disabled={saving || publishing || recoveryPending} onClick={() => setReviewOpen(true)}>{publishing ? 'Publishing…' : 'Publish'}</Button>}
          </div>
        </div>

        <p role="status" aria-label="Post save status" aria-live="polite" aria-atomic="true" className="sr-only">{progressMessage}</p>
        {publicationError && !formControlError(fieldErrors) && <p ref={genericErrorRef} tabIndex={-1} role="alert" className="mb-4 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring">{publicationError}</p>}
        {draftIdentity && <DraftRecoveryNotice recovery={recovery} />}

        {/* ── Main layout ─────────────────────────────────────────── */}
        <div className="grid gap-8 lg:grid-cols-[1fr_292px]">

          {/* Left: writing area */}
          <div className="space-y-5 min-w-0">

            {/* Title */}
            <div className="space-y-1">
              <Label htmlFor="post-title" className="sr-only">Post title</Label>
              <input
                id="post-title"
                {...register('title')}
                aria-label="Post title"
                aria-invalid={!!fieldErrors.title}
                aria-describedby={describedBy('title')}
                onBlur={autoSlug}
                placeholder="Post title…"
                className="w-full text-3xl font-bold tracking-tight bg-transparent border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-muted-foreground/40 text-foreground resize-none leading-tight"
              />
              <p id="title-help" className="text-xs text-muted-foreground">Use a descriptive title of 10–160 characters to publish. Drafts may be incomplete.</p>
            </div>

            <FieldError name="title" errors={fieldErrors} />

            {/* Slug row */}
            <div className="flex items-center gap-2 py-2 border-y border-dashed border-border/70">
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0">slug /</span>
              <Label htmlFor="post-slug" className="sr-only">Slug</Label>
              <input
                id="post-slug"
                {...register('slug')}
                aria-label="Slug"
                readOnly={isPublished && !allowSlugChange}
                aria-invalid={!!fieldErrors.slug}
                aria-describedby={describedBy('slug')}
                placeholder="auto-generated-from-title"
                className="flex-1 text-xs text-muted-foreground bg-transparent border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-muted-foreground/40 font-mono"
                onChange={(e) => {
                  setManuallyEditedSlug(true)
                  setSlugChangeConfirmed(false)
                  setValue('slug', e.target.value, { shouldDirty: true })
                }}
              />
            </div>

            <p id="slug-help" className="text-xs text-muted-foreground">URL path using lowercase letters, numbers and hyphens; generated from the title for new posts.</p>
            {normalizedSlug && slug !== normalizedSlug && (
              <p className="text-xs text-muted-foreground" aria-live="polite">URL preview: /blog/{normalizedSlug}</p>
            )}
            {isPublished && !allowSlugChange && (
              <Button type="button" variant="outline" size="sm" onClick={() => setAllowSlugChange(true)}>
                Change published URL
              </Button>
            )}
            {isPublished && allowSlugChange && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={slugChangeConfirmed} onChange={event => setSlugChangeConfirmed(event.target.checked)} />
                <span>Confirm this URL change. The old URL will permanently redirect to the new URL.</span>
              </label>
            )}
            <FieldError name="slug" errors={fieldErrors} />

            <div className="rounded-lg border border-border/70 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" {...register('is_premium')} /> Premium article
              </label>
              <p className="text-xs text-muted-foreground">The full article body is stored separately. Readers need an active premium entitlement; the excerpt remains visible as a preview.</p>
            </div>

            {/* Excerpt */}
            <div className="space-y-1.5">
              <Label htmlFor="post-excerpt" className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Excerpt
              </Label>
              <Textarea
                id="post-excerpt"
                {...register('excerpt')}
                aria-label="Excerpt"
                aria-invalid={!!fieldErrors.excerpt}
                aria-describedby={describedBy('excerpt')}
                placeholder="A short summary displayed in post listings and meta descriptions…"
                rows={3}
                className="resize-none text-sm leading-relaxed bg-muted/30 border-border/60 focus-visible:border-blue-400/60 focus-visible:ring-blue-400/20 placeholder:text-muted-foreground/40"
              />
            </div>

            <p id="excerpt-help" className="text-xs text-muted-foreground">Used in listings and as the default search description. Use 40–500 characters to publish.</p>
            <FieldError name="excerpt" errors={fieldErrors} />

            {/* Content editor */}
            <div className="space-y-1.5">
              <Label id="content-label" className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Content
              </Label>
              <Controller
                name="content"
                control={control}
                render={({ field }) => (
                  <Editor scrollOffset={scrollOffset} id="post-content" labelledBy="content-label" describedBy={describedBy('content')} invalid={!!fieldErrors.content} editorId={draftIdentity?.userId} value={field.value} onChange={(value) => { field.onChange(value); setValue('editorial_reviewed', false) }} />
                )}
              />
              <p id="content-help" className="text-xs text-muted-foreground">Write at least 200 readable words to publish. Use the formatting controls above the article.</p>
              <FieldError name="content" errors={fieldErrors} />
            </div>
          </div>

          {/* Right: sidebar */}
          <div className="space-y-4">

            {newsletter && (
              <SidebarCard icon={Send} title="Newsletter">
                <PostNewsletter key={`${post?.updated_at}:${newsletter.send?.status}:${newsletter.send?.scheduled_at}:${newsletter.send?.delivery_started_at}:${newsletter.error}`} state={newsletter} postId={post?.id} editorId={draftIdentity?.userId} published={isPublished} disabled={saving || publishing || recoveryPending} warning={newsletterWarning} onScheduled={() => setNewsletterWarning(null)} />
              </SidebarCard>
            )}

            <SidebarCard icon={Check} title="Publication readiness">
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-2">
                <li>Descriptive title: 10–160 characters; unique URL-safe slug.</li>
                <li>At least 200 readable body words with examples and useful takeaways.</li>
                <li>Accurate excerpt: 40–500 characters; named author.</li>
                <li>No filler, test posts or placeholder images.</li>
                <li>Relevant category and tags; accurate SEO title and description.</li>
              </ul>
              <p className="text-xs text-muted-foreground">Author: {post?.author?.full_name || 'Your profile display name (required)'}</p>
              <FieldError name="author_id" errors={fieldErrors} />
              {flaggedForReview && (
                <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
                  Review flagged text: TODO, TBD, coming soon or work in progress may indicate unfinished content. Confirm that these terms are appropriate in context before publishing.
                </p>
              )}
              <label className="flex items-start gap-2 text-xs leading-relaxed">
                <input type="checkbox" aria-invalid={!!fieldErrors.editorial_reviewed} {...register('editorial_reviewed')} aria-describedby={describedBy('editorial_reviewed')} className="mt-0.5" />
                <span>I have reviewed this article for accuracy, usefulness, attribution, taxonomy and SEO metadata.</span>
              </label>
              <FieldError name="editorial_reviewed" errors={fieldErrors} />
              <p id="editorial_reviewed-help" className="text-xs text-muted-foreground">Review is required for publication and live edits. Editing clears this confirmation. Incomplete work can be saved as a draft.</p>
            </SidebarCard>

            {/* ── Settings card ──────────────────────────── */}
            <SidebarCard icon={Settings2} title="Settings" expandable forceOpen={!!fieldErrors.cover_image || !!fieldErrors.cover_image_alt || !!fieldErrors.category_id}>
              {/* Cover image */}
              <div className="space-y-2">
                <Label htmlFor="post-cover_image" className="text-xs text-muted-foreground">Cover Image</Label>
                {coverImage && draftIdentity && <CoverImagePreview key={coverImage} src={coverImage} alt={coverImageAlt || 'Cover preview'} editorId={draftIdentity.userId} />}
                <Button type="button" variant="outline" size="sm" disabled={!draftIdentity || recoveryPending} onClick={() => { setCoverPaste(undefined); setCoverDialogOpen(true) }}>Choose cover image</Button>
                {coverImage && <Button type="button" variant="ghost" size="sm" onClick={() => { setValue('cover_image', '', { shouldDirty: true }); setValue('cover_image_alt', '', { shouldDirty: true }); setValue('editorial_reviewed', false) }}>Remove cover image</Button>}
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    id="post-cover_image"
                    {...register('cover_image')}
                    onPaste={event => {
                      const file = pastedImageFile(event.clipboardData)
                      if (file && draftIdentity) { event.preventDefault(); setCoverPaste(file); setCoverDialogOpen(true) }
                    }}
                    aria-invalid={!!fieldErrors.cover_image}
                    aria-label="Cover image"
                    aria-describedby={describedBy('cover_image')}
                    placeholder="https://…"
                    className="pl-9 text-sm h-9 bg-muted/30 border-border/60"
                  />
                </div>
              </div>

              <p id="cover_image-help" className="text-xs text-muted-foreground">Optional. Choose an image or paste an allowed image URL.</p>
              <FieldError name="cover_image" errors={fieldErrors} />
              <Label htmlFor="cover-alt">Cover image description (alt text)</Label>
              <Input id="cover-alt" aria-invalid={!!fieldErrors.cover_image_alt} aria-describedby={describedBy('cover_image_alt')} {...register('cover_image_alt')} maxLength={1000} placeholder="Describe the image for readers who cannot see it" />
              <p id="cover_image_alt-help" className="text-xs text-muted-foreground">Describe meaningful visual details in up to 1,000 characters.</p>
              <FieldError name="cover_image_alt" errors={fieldErrors} />
              {coverDialogOpen && draftIdentity && <ImageDialog cover editorId={draftIdentity.userId} initialFile={coverPaste}
                initial={coverImage ? { src: coverImage, alt: coverImageAlt ?? '' } : undefined}
                onClose={() => setCoverDialogOpen(false)} onSave={image => {
                  setValue('cover_image', image.src, { shouldDirty: true })
                  setValue('cover_image_alt', image.alt, { shouldDirty: true })
                  setValue('editorial_reviewed', false)
                }} />}


              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="post-category_id" className="text-xs text-muted-foreground">Category</Label>
                <select
                  aria-label="Category"
                  aria-invalid={!!fieldErrors.category_id}
                  aria-describedby={describedBy('category_id')}
                  id="post-category_id"
                  {...register('category_id')}
                  className="w-full h-9 rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-sm shadow-none focus:outline-hidden focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20 transition-colors"
                >
                  <option value="">Select category…</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <p id="category_id-help" className="text-xs text-muted-foreground">Choose a relevant category, or leave this blank.</p>
                <FieldError name="category_id" errors={fieldErrors} />
              </div>
            </SidebarCard>

            {/* ── Tags card ──────────────────────────────── */}
            <SidebarCard icon={Tag} title="Tags">
              <fieldset className="min-w-0" tabIndex={-1} aria-label="Post tags" data-invalid={!!fieldErrors.tag_ids} aria-describedby={describedBy('tag_ids')}>
                <TagSelector tags={tags} selectedIds={selectedTagIds ?? []} onToggle={toggleTag} error={tagsError} canManage={canManageTags} />
              </fieldset>
              <p id="tag_ids-help" className="text-xs text-muted-foreground">Select relevant tags. Activate a selected tag to remove it.</p>
              <FieldError name="tag_ids" errors={fieldErrors} />
            </SidebarCard>

            {/* ── SEO card ───────────────────────────────── */}
            <SidebarCard icon={BarChart3} title="SEO" expandable forceOpen={!!fieldErrors.seo_title || !!fieldErrors.seo_description}>
              <p className="text-xs text-muted-foreground">Leave these blank to use the post title and excerpt in search results.</p>
              <FieldError name="seo_title" errors={fieldErrors} />
              <FieldError name="seo_description" errors={fieldErrors} />
              <div className="space-y-2">
                <Label htmlFor="post-seo_title" className="text-xs text-muted-foreground">SEO title</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    id="post-seo_title"
                    {...register('seo_title')}
                    aria-label="SEO title"
                    aria-invalid={!!fieldErrors.seo_title}
                    aria-describedby={describedBy('seo_title')}
                    placeholder="Overrides post title in search…"
                    className="pl-9 text-sm h-9 bg-muted/30 border-border/60"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="post-seo_description" className="text-xs text-muted-foreground">SEO description</Label>
                <Textarea
                  id="post-seo_description"
                  {...register('seo_description')}
                  aria-label="SEO description"
                  aria-invalid={!!fieldErrors.seo_description}
                  aria-describedby={describedBy('seo_description')}
                  placeholder="Concise summary for search results…"
                  rows={3}
                  className="resize-none text-sm leading-relaxed bg-muted/30 border-border/60 focus-visible:border-blue-400/60 focus-visible:ring-blue-400/20 placeholder:text-muted-foreground/40"
                />
              </div>
              <p id="seo_title-help" className="text-xs text-muted-foreground">Optional search title; defaults to the post title.</p>
              <p id="seo_description-help" className="text-xs text-muted-foreground">Optional search description; defaults to the excerpt.</p>
            </SidebarCard>
          </div>
        </div>
      </form>
      <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null) }}>
        <DialogContent finalFocus={previewTrigger} className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Reader preview</DialogTitle><DialogDescription>Private preview of your current input. Previewing does not publish or send a newsletter.</DialogDescription></DialogHeader>
          {preview && <article className="container max-w-3xl mx-auto py-12 px-4">
            <h1 className="text-4xl font-bold mb-4 break-words">{preview.title || 'Untitled draft'}</h1>
            <div className="flex flex-wrap items-center gap-3 mb-8 text-sm text-muted-foreground">
              <AuthorByline author={post?.author ?? initialPost?.author ?? (draftIdentity ? { id: draftIdentity.userId, full_name: authorName ?? null, avatar_url: null } : null)} showAvatar />
              {categories.find(category => category.id === preview.category_id) && <Badge className="rounded-full px-3 text-xs">{categories.find(category => category.id === preview.category_id)?.name}</Badge>}
            </div>
            <PostBody title={preview.title} coverImage={preview.cover_image} coverImageAlt={preview.cover_image_alt} excerpt={preview.excerpt} content={preview.renderedContent} />
            <div className="mt-12 flex flex-wrap gap-2">{tags.filter(tag => preview.tag_ids.includes(tag.id)).map(tag => <Badge key={tag.id} variant="secondary" className="rounded-full px-3 text-xs">#{tag.name}</Badge>)}</div>
          </article>}
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={open => { if (!saving && !publishing) setReviewOpen(open) }}>
        <DialogContent finalFocus={() => publicationError || Object.keys(fieldErrors).length ? firstErrorTarget() ?? publicationTrigger.current : publicationTrigger.current} className="max-h-[90dvh] overflow-y-auto" showCloseButton={!saving && !publishing}>
          <DialogHeader><DialogTitle>Review publication</DialogTitle><DialogDescription>Your current writing will become public after the publication checks pass.</DialogDescription></DialogHeader>
          <p className="break-all">Destination: {destinationUrl}</p>
          {!post && <p className="text-xs text-muted-foreground">An automatically generated URL may receive a suffix if already reserved. View Post shows the final URL after publication.</p>}
          <p className="text-sm text-muted-foreground">{newsletter?.send?.delivery_started_at || newsletter?.send?.sent_at ? 'The newsletter may already have been delivered; publishing again will not resend it.' : `Publishing queues a newsletter for active subscribers after the configured ${newsletter?.delayMinutes ?? 30}-minute delay. Unpublishing cancels a queued send.`}</p>
          <p className="text-xs text-muted-foreground">The readiness checklist requires a descriptive title, unique slug, at least 200 readable body words, an accurate excerpt and a named author. Failed checks preserve your writing and send no newsletter.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" disabled={saving || publishing} checked={editorialReviewed} onChange={event => setValue('editorial_reviewed', event.target.checked)} />
            I have reviewed this article for accuracy, usefulness, attribution, taxonomy and SEO metadata.
          </label>
          {(publicationError || Object.keys(fieldErrors).length > 0) && <div ref={reviewErrorRef} tabIndex={-1} role="alert" className="space-y-2 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring"><p>{publicationError ?? 'Check the highlighted fields before saving.'}</p>{Object.entries(fieldErrors).map(([field, messages]) => <p key={field}>{messages.join(' ')}</p>)}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving || publishing} onClick={() => setReviewOpen(false)}>Keep editing</Button>
            <Button type="button" disabled={saving || publishing || recoveryPending} onClick={() => { if (post) void handlePublishToggle(); else void handleSubmit(values => onSubmit(values, true), () => { pendingErrorFocus.current = true })() }}>{saving || publishing ? 'Publishing…' : 'Confirm publication'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showBackToTop && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-md"
          onClick={() => {
            formRef.current?.querySelector<HTMLElement>('#post-title')?.focus({ preventScroll: true })
            window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
          }}
          aria-label="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </>
  )
}

// ── Shared sidebar card shell ──────────────────────────────────────────────────
function SidebarCard({
  icon: Icon,
  title,
  children,
  expandable = false,
  forceOpen = false,
}: {
  readonly expandable?: boolean
  readonly forceOpen?: boolean
  readonly icon: React.ElementType
  readonly title: string
  readonly children: React.ReactNode
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (forceOpen && detailsRef.current) detailsRef.current.open = true }, [forceOpen])
  if (expandable) return (
    <details ref={detailsRef} className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-widest bg-muted/20">{title}</summary>
      <div className="p-4 space-y-4">{children}</div>
    </details>
  )
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/20">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          {title}
        </span>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  )
}

function FieldError({ name, errors }: { name: string; errors: FieldErrors }) {
  return errors[name]?.length ? <p id={`${name}-error`} role="alert" className="text-xs text-destructive">{errors[name].join(' ')}</p> : null
}

function getRecoveryMessage(recovery: ReturnType<typeof useDraftRecovery>): string {
  if (!recovery.ready) return 'Checking draft recovery…'
  switch (recovery.status) {
    case 'saving': return 'Saving working copy…'
    case 'saved': return 'Working copy saved'
    case 'failed': return 'Autosave failed'
    case 'pending': return 'Unsaved changes'
    default: return 'Changes will autosave as a private working copy.'
  }
}

function DraftRecoveryNotice({ recovery }: { readonly recovery: ReturnType<typeof useDraftRecovery> }) {
  return (
    <div className="mb-5 space-y-3 text-sm" aria-live="polite">
      <p>{getRecoveryMessage(recovery)}</p>
      {recovery.error && <div role="alert"><p>{recovery.error}</p><a className="mr-3 underline" href="/login" target="_blank" rel="noopener noreferrer">Sign in in another tab</a><Button type="button" variant="outline" size="sm" onClick={recovery.retry}>Retry autosave</Button></div>}
      {recovery.storageError && <p role="alert">{recovery.storageError}</p>}
      {recovery.candidates.length > 0 && (
        <section aria-label="Draft recovery" className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">Recover interrupted writing</h2>
          <p>Choose a copy to restore, or discard it. Published content stays unchanged until you save reviewed changes.</p>
          {recovery.candidates.map(candidate => (
            <div key={candidate.id} className="flex flex-wrap items-center gap-2">
              <span>{candidate.values.title || 'Untitled post'} — {candidate.label}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => recovery.restore(candidate.id)}>Restore</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void recovery.discardCandidate(candidate.id)}>Discard copy</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function formControlError(errors: FieldErrors) {
  return ['title', 'slug', 'excerpt', 'content', 'cover_image', 'cover_image_alt', 'category_id', 'tag_ids', 'seo_title', 'seo_description', 'editorial_reviewed'].some(name => errors[name]?.length)
}
