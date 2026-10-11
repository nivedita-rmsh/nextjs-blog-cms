import { expect, test } from '@playwright/test'

for (const path of ['/login', '/register']) {
  for (const provider of ['Google', 'GitHub']) {
    test(`${path}: ${provider} keyboard sign-in and cancellation`, async ({ page, context }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('http://127.0.0.1:54999/auth/v1/authorize**', async route => {
        const url = new URL(route.request().url())
        expect(url.searchParams.get('provider')).toBe(provider.toLowerCase())
        expect(url.searchParams.get('code_challenge')).toBeTruthy()
        expect(url.searchParams.get('code_challenge_method')).toBe('s256')
        const callback = new URL(url.searchParams.get('redirect_to')!)
        expect(callback.toString()).toBe('http://127.0.0.1:3105/auth/callback?flow=oauth')
        callback.searchParams.set('error', 'access_denied')
        callback.searchParams.set('error_description', 'DO_NOT_REFLECT_PROVIDER_TEXT')
        await route.fulfill({ status: 302, headers: { location: callback.toString() } })
      })
      await page.goto(`${path}?next=%2Fdashboard%2Fposts`)
      const google = page.getByRole('button', { name: 'Continue with Google' })
      const github = page.getByRole('button', { name: 'Continue with GitHub' })
      await expect(google).toBeVisible()
      await expect(github).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      for (const button of [google, github]) {
        const box = await button.boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      await page.keyboard.press('Tab')
      await expect(google).toBeFocused()
      if (provider === 'GitHub') {
        await page.keyboard.press('Tab')
        await expect(github).toBeFocused()
      }
      await page.screenshot({ path: testInfo.outputPath('provider-controls.png'), fullPage: true })
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/\/login\?error=oauth_cancelled/)
      await expect(page.getByRole('alert')).toContainText('Sign-in was cancelled')
      await expect(page.getByRole('alert')).not.toContainText('DO_NOT_REFLECT_PROVIDER_TEXT')
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
      expect((await context.cookies()).some(cookie => cookie.name === 'cms-oauth-context')).toBe(false)
      expect(errors).toEqual([])
    })
  }
}
