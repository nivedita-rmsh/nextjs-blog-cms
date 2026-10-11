import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { readyArticle } from '../publication-fixture'

test.describe.configure({ mode: 'serial' })

const email = 'e2e-test@playwright.local'
const password = process.env.E2E_TEST_PASSWORD ?? 'E2eTestPassword123!'
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

let runtimeErrors: string[]
let draftId: string

test.beforeAll(async () => {
  const { userId } = JSON.parse(readFileSync('.e2e-state.json', 'utf8')) as { userId: string }
  const { data, error } = await admin().from('posts').insert([
    { author_id: userId, title: 'Browser Public Article', slug: 'browser-public-article', content: '<p>Public browser content</p>', status: 'published', published_at: new Date().toISOString() },
    { author_id: userId, title: 'Browser Draft', slug: 'browser-draft', content: '<p>Draft browser content</p>', status: 'draft' },
  ]).select('id')
  if (error || !data) throw new Error(error?.message ?? 'Browser fixtures were not created')
  draftId = data[1].id
})

test.beforeEach(async ({ page }) => {
  runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|hydrated|Minified React error/i.test(message.text())) {
      runtimeErrors.push(message.text())
    }
  })
})

test.afterEach(() => {
  expect(runtimeErrors).toEqual([])
})

test('public navigation, registration validation and newsletter subscription', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '✏️ Articles' }).click()
  await expect(page).toHaveURL(/\/blog$/)
  await page.goto('/blog/browser-public-article')
  await expect(page.getByRole('heading', { name: 'Browser Public Article', exact: true })).toBeVisible()
  const subscriber = 'browser-newsletter@playwright.local'
  try {
    await page.getByLabel('Email address', { exact: true }).fill(subscriber)
    await page.getByRole('button', { name: 'Subscribe', exact: true }).click()
    await expect(page.getByText("You're subscribed!", { exact: true })).toBeVisible()
    const { data } = await admin().from('newsletter_subscriptions').select('email').eq('email', subscriber).single()
    expect(data?.email).toBe(subscriber)
  } finally {
    await admin().from('newsletter_subscriptions').delete().eq('email', subscriber)
  }
  await page.goto('/register')
  await page.getByLabel('Full name', { exact: true }).fill('Browser User')
  await page.getByLabel('Email address', { exact: true }).fill('browser-registration@playwright.local')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill('DifferentPassword!')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible()
  try {
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible()
    const { data, error } = await admin().auth.admin.listUsers()
    expect(error).toBeNull()
    expect(data.users.some((user) => user.email === 'browser-registration@playwright.local')).toBe(true)
  } finally {
    const { data } = await admin().auth.admin.listUsers()
    const registered = data.users.find((user) => user.email === 'browser-registration@playwright.local')
    if (registered) await admin().auth.admin.deleteUser(registered.id)
  }
})

test('author can edit, save, reload, publish and read an article', async ({ page }) => {
  await login(page)
  await page.goto(`/dashboard/posts/${draftId}/edit`)
  // TipTap's client-only surface confirms that the form has hydrated.
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.getByPlaceholder('Post title…').fill('Browser Migration Article')
  await page.locator('.ProseMirror').fill(readyArticle.content.replace(/<[^>]+>/g, ' '))
  await page.getByLabel('Excerpt', { exact: true }).fill(readyArticle.excerpt)
  await page.getByPlaceholder('auto-generated-from-title').fill('browser-migration-article')
  await expect(page.locator('.ProseMirror')).toContainText('A reliable integration test')
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click()
  await expect(page.getByText('Post saved as draft', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.ProseMirror')).toContainText('A reliable integration test')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
  await page.goto('/blog/browser-migration-article')
  await expect(page.getByRole('heading', { name: 'Browser Migration Article', exact: true })).toBeVisible()
  await expect(page.locator('article')).toContainText('A reliable integration test')
})

test('profile changes persist across reloads', async ({ page }) => {
  await login(page)
  await page.goto('/dashboard/profile')
  // MFA status resolves after the profile's client effects have hydrated.
  await expect(page.getByRole('button', { name: 'Enable 2FA', exact: true })).toBeEnabled()
  await page.getByLabel('Full Name', { exact: true }).fill('Migration Browser Author')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).first().click()
  await expect(page.getByText('Profile updated', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Migration Browser Author')
})

// PDF with an accurate xref table, enough text to pass book upload validation.
function bookPdf() {
  const text = 'BT /F1 12 Tf 72 720 Td (Browser migration document for book upload.) Tj 0 -20 Td (A conversation about testing modern frameworks.) Tj 0 -20 Td (PDF parsing should preserve these three lines.) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

test('book upload and chat UI work with a stubbed provider response', async ({ page }) => {
  await login(page)
  // Provider billing/network calls are stubbed; auth, PDF parsing, books and chats use the real API/database.
  await page.route('**/api/developer/llm-keys', (route) => route.fulfill({ json: { keys: [{ provider: 'gemini', is_valid: true }] } }))
  await page.route('**/api/ai-assistant/chats/*/messages', (route) => route.request().method() === 'POST'
    ? route.fulfill({ contentType: 'text/plain', body: 'The migrated chat streams a provider response.' })
    : route.continue())
  await page.goto('/dashboard/ai-assistant')
  await page.getByRole('button', { name: 'New Chat', exact: true }).first().click()
  const uploaded = page.waitForResponse((response) => response.url().endsWith('/api/ai-assistant/books') && response.request().method() === 'POST')
  await page.locator('input[type=file]').setInputFiles({ name: 'migration.pdf', mimeType: 'application/pdf', buffer: bookPdf() })
  const uploadResponse = await uploaded
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(201)
  await page.getByRole('button', { name: /Gemini 3.5 Flash-Lite/ }).click()
  await expect(page.getByRole('button', { name: 'Start Chat', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Start Chat', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/ai-assistant\/.+/)
  await page.getByPlaceholder('Ask something about the document…').fill('What is this document about?')
  await page.getByPlaceholder('Ask something about the document…').press('Enter')
  await expect(page.getByText('The migrated chat streams a provider response.', { exact: true })).toBeVisible()
})

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', key).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

test('MFA enrollment and login challenge preserve the session', async ({ page }) => {
  await login(page)
  await page.goto('/dashboard/profile')
  await page.getByRole('button', { name: 'Enable 2FA', exact: true }).click()
  const secret = await page.locator('[role="dialog"] .font-mono').innerText()
  await page.getByLabel('Verification Code', { exact: true }).fill(totp(secret))
  await page.getByRole('button', { name: 'Verify & Enable', exact: true }).click()
  await expect(page.getByText('Two-factor authentication enabled', { exact: true })).toBeVisible()
  await page.request.post('/api/auth/signout')
  await page.context().clearCookies()
  await page.goto('/login')
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/mfa\?next=%2Fdashboard$/)
  await page.getByLabel('Verification Code', { exact: true }).fill(totp(secret))
  await page.getByRole('button', { name: /Verify/ }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard$/)
})
