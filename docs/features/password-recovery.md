# Password recovery
The login page links to `/forgot-password`. Requests use Supabase Auth and always
show the same confirmation for registered and unregistered email addresses.
Passwords must contain at least eight characters, matching registration and
account settings. The signup server action enforces this policy even when browser
validation is bypassed. Login still accepts older six-character passwords.
Additional Supabase password rules are enforced by Auth and reported during recovery.

Before deploying this feature:

1. Apply the `add_password_recovery_grants` migration. Its table has RLS enabled
   and no `anon`/`authenticated` privileges; only server-side service-role code
   can create and consume grants. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
2. Set `NEXT_PUBLIC_SITE_URL` to the trusted application origin, such as
   `http://localhost:3000` locally or `https://blog.frankmendez.site` in production.
   Do not derive email destinations from incoming request headers.
3. In Supabase **Authentication → URL Configuration**, set the Site URL and allow
   these exact redirects (use your production origin in place of the example):
   - `http://localhost:3000/auth/callback?next=/reset-password`
   - `http://127.0.0.1:3000/auth/callback?next=/reset-password`
   - `https://blog.frankmendez.site/auth/callback?next=/reset-password`
   Keep the existing signup `/auth/callback` redirects allowed as well.
4. In **Authentication → Email Templates → Reset Password**, copy
   `supabase/templates/recovery.html`. Its link must be
   `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery`.
   This verifies the recovery OTP on the server and works when opened in another
   browser. The default `ConfirmationURL` template is not compatible with this
   recovery flow; old/default recovery links show an actionable retry message.
   Local Supabase loads the template from `supabase/config.toml` automatically;
   restart the local stack after changing email templates.
5. Configure production SMTP and appropriate email/OTP rate limits and expiry in
   Supabase. Local email is captured by Mailpit (`supabase status` shows its URL).
   The request action hides address-specific email throttling/account errors;
   global throttling and delivery outages show neutral retry errors.

A verified email creates a 15-minute HttpOnly recovery capability bound to the
Supabase user and session. A normal login session cannot reset a password. The
reset page checks the capability, and the update action atomically deletes its
database row before calling `auth.updateUser`. Expired, invalid, consumed, and
replayed capabilities cannot authorize updates. Provider update failures also
consume the capability and require a new email. Authenticator verification
failures happen before consumption and can be retried. Successful updates request global sign-out, clear browser credentials even
if Auth sign-out is unavailable, and offer a link to sign in with the new
password. Supabase access tokens already issued may remain valid until their
normal expiry.
Deploy migration `20261006152137_limit_recovery_mfa_attempts.sql` before enabling
this flow.

Accounts with a verified TOTP authenticator are prompted for a six-digit code
before the recovery grant is consumed. Invalid or expired codes can be retried
within the grant's 15-minute lifetime, up to five verification attempts. Each
attempt is reserved atomically in the database before calling Auth, including
concurrent requests. The fifth failed code invalidates the grant; a new reset
email is then required. Interrupted verification calls also use an attempt. Supabase verifies the factor and upgrades
the recovery session before the password change. Other verification methods
require administrator assistance. Account-settings password changes remain
outside this flow.

Expired grant rows are unusable and are automatically deleted before a new
recovery grant is issued. This uses the expiry index and removes abandoned grants
across all users. During periods without recovery traffic, expired rows can also
be removed with `delete from public.password_recovery_grants where expires_at < now();`.

Run `pnpm exec vitest run __tests__/auth __tests__/lib/proxy.test.ts` for recovery
unit/component tests. Run
`pnpm exec playwright test e2e/browser/password-recovery.spec.ts --project=browser`
against the dedicated disposable test environment described in [testing](../development/testing.md). Set
`E2E_MAILPIT_URL` to its Mailpit origin (for example `http://127.0.0.1:54324`). The
browser test requests a real email, follows its actual link in a fresh browser,
checks validation, changes the password, verifies new-password sign-in and
old-password rejection, and verifies that the same link cannot be reused.

Accounts with Google/GitHub identities use this same verified email and MFA flow to set a first password or reset an existing one. Their Security panel links here instead of requiring a current password. See [social authentication](../setup/social-auth.md).
