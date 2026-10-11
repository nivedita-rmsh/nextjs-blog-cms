import { createClient } from '@supabase/supabase-js'
import { test, expect } from '../fixtures'
import { readyArticle } from '../publication-fixture'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(process.env.E2E_TEST_EMAIL ?? 'e2e-test@playwright.local')
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('mobile writing keeps unsaved preview private and publishes from the same editor', async ({ page, request, apiKey }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('/dashboard/posts/new')
  await expect(page.locator('.ProseMirror')).toBeVisible()
  const documentId = new URL(page.url()).searchParams.get('draft')!
  const editorUrl = page.url()
  const slug = `editor-preview-${Date.now()}`
  const headers = { Authorization: `Bearer ${apiKey}` }
  let id: string | undefined
  try {
    await page.getByLabel('Post title').fill(readyArticle.title)
    await page.getByLabel('Post title').blur()
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('integration-testing-at-service-boundaries')
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue(slug)
    await page.getByLabel('Excerpt', { exact: true }).fill(readyArticle.excerpt)
    const text = readyArticle.content.replace(/<[^>]+>/g, ' ')
    await page.locator('.ProseMirror').fill(text)
    await expect(page.getByText('Working copy saved', { exact: true })).toBeVisible()
    await page.evaluate(() => { (window as unknown as { issue73Title: Element | null }).issue73Title = document.querySelector('input[name=title]') })
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
    await expect(page.getByText('Post saved as draft', { exact: true })).toBeVisible()
    id = documentId
    expect(page.url()).toBe(editorUrl)
    expect(await page.evaluate(() => (window as unknown as { issue73Title: Element | null }).issue73Title === document.querySelector('input[name=title]'))).toBe(true)
    expect((await request.get(`/blog/${slug}`)).status()).toBe(404)
    const before = (await request.get(`/api/posts/${id}`, { headers }).then(r => r.json())).data
    const unsavedTitle = 'Practical Integration Testing Before Deployment'
    await page.getByLabel('Post title').fill(unsavedTitle)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = page.getByRole('dialog', { name: 'Reader preview' })
    await expect(preview.getByRole('heading', { name: unsavedTitle, exact: true })).toBeVisible()
    await expect(preview.locator('.prose')).toContainText('A reliable integration test')
    const previewBody = await preview.locator('.prose').textContent()
    const after = (await request.get(`/api/posts/${id}`, { headers }).then(r => r.json())).data
    expect(after.updated_at).toBe(before.updated_at)
    expect(after.title).toBe(readyArticle.title)
    expect((await admin().from('newsletter_sends').select('id').eq('post_id', id)).data).toEqual([])
    await page.keyboard.press('Escape')
    await expect(preview).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeFocused()
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    const review = page.getByRole('dialog', { name: 'Review publication' })
    await expect(review).toContainText(`/blog/${slug}`)
    await expect(review).toContainText('active subscribers')
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Post', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Newsletter notification' })).toContainText('Queued')
    const published = (await request.get(`/api/posts/${id}`, { headers }).then(r => r.json())).data
    expect(published).toMatchObject({ status: 'published', title: unsavedTitle })
    await page.getByLabel('Excerpt', { exact: true }).fill(`${readyArticle.excerpt} Updated after publication.`)
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.getByText('Published changes saved', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.goto(`/blog/${slug}`)
    expect(await page.locator('article .prose').textContent()).toBe(previewBody)
    await expect(page.getByRole('heading', { name: unsavedTitle, exact: true })).toBeVisible()
  } finally {
    if (id) await request.delete(`/api/posts/${id}`, { headers })
  }
})

test('new writing can publish directly after human confirmation', async ({ page, request, apiKey }) => {
  await login(page)
  await page.goto('/dashboard/posts/new')
  await expect(page.locator('.ProseMirror')).toBeVisible()
  const documentId = new URL(page.url()).searchParams.get('draft')!
  const slug = `direct-editor-publish-${Date.now()}`
  let id: string | undefined
  try {
    await page.getByLabel('Post title').fill(readyArticle.title)
    await page.getByLabel('Post title').blur()
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue('integration-testing-at-service-boundaries')
    await page.getByLabel('Slug', { exact: true }).fill(slug)
    await expect(page.getByLabel('Slug', { exact: true })).toHaveValue(slug)
    await page.getByLabel('Excerpt', { exact: true }).fill(readyArticle.excerpt)
    await page.locator('.ProseMirror').fill(readyArticle.content.replace(/<[^>]+>/g, ' '))
    await page.getByRole('checkbox', { name: /I have reviewed/ }).check()
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    expect((await request.get(`/blog/${slug}`)).status()).toBe(404)
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Post', exact: true })).toBeVisible()
    id = documentId
    const persisted = await admin().from('posts').select('id, slug, status').eq('id', id).single()
    expect(persisted.data).toMatchObject({ id, slug, status: 'published' })
    const saved = await request.get(`/api/posts/${id}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    expect(saved.status()).toBe(200)
    expect((await saved.json()).data).toMatchObject({ slug, status: 'published' })
    expect((await request.get(`/blog/${slug}`)).status()).toBe(200)
  } finally {
    if (id) await request.delete(`/api/posts/${id}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  }
})

test('clicking into a long article preserves the viewport and keyboard navigation reveals the caret', async ({ page, request, apiKey }) => {
  const headers = { Authorization: `Bearer ${apiKey}` }
  const created = await request.post('/api/posts/create', {
    headers,
    data: {
      title: 'Long article focus regression',
      slug: `long-article-focus-${Date.now()}`,
      content: Array.from({ length: 400 }, (_, index) => `<p>Paragraph ${index + 1}: keep the clicked text in view while editing this long article.</p>`).join(''),
    },
  })
  expect(created.status()).toBe(201)
  const id = (await created.json()).data.post.id as string
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await login(page)
    await page.goto(`/dashboard/posts/${id}/edit`)
    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await page.getByLabel('Post title').focus()
    await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }))
    const before = await page.evaluate(() => window.scrollY)
    expect(before).toBe(3000)
    const bounds = await editor.boundingBox()
    if (!bounds) throw new Error('Article editor is missing')
    await page.mouse.click(bounds.x + 80, 350)
    await expect(editor).toBeFocused()
    expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(5)

    await page.keyboard.press('Control+Home')
    await expect.poll(() => page.evaluate(() => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) return false
      const caret = selection.getRangeAt(0).getBoundingClientRect()
      const bar = document.querySelector('[data-editor-actions]')!.getBoundingClientRect()
      return caret.top >= bar.bottom && caret.bottom <= window.innerHeight
    })).toBe(true)
    await expect(editor).toBeFocused()
  } finally {
    await request.delete(`/api/posts/${id}`, { headers })
  }
})
