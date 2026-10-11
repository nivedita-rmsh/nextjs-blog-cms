# Google and GitHub sign-in

Login and registration offer Google and GitHub through Supabase Auth alongside
email/password. Both buttons create an account on first sign-in. The application
uses the existing profile trigger and **immediate author access**, including
publishing and API-key management. Roles come from the database default, never
provider or user-editable metadata. This preserves the current contributor policy;
an invitation/approval workflow is separate work tracked in issue #111. Human
editorial review requirements for AI-assisted posts still apply.

## Provider configuration

Use separate provider applications and a disposable Supabase project for testing.
Never use production accounts for automated checks. Provider client IDs and secrets
belong in Supabase Auth configuration. Do not put secrets in `NEXT_PUBLIC_`
variables, client code, logs, source control, or PR attachments.

1. **Google:** create a Web application OAuth client in Google Cloud, configure the
   consent screen, authorized domains, and test users while the app is in testing.
   Add each application origin to Authorized JavaScript origins. Add the Supabase
   callback below to Authorized redirect URIs. Enable Google in Supabase
   Authentication → Sign In / Providers and enter its client ID and secret.
   Keep nonce checks enabled and do not allow missing emails. The CMS requests
   `openid email profile`; it does not request offline access or Google API scopes.
2. **GitHub:** create an OAuth App under Developer settings. Set Homepage URL to
   the application origin and Authorization callback URL to the Supabase callback
   below. Enable GitHub in Supabase with the client ID and secret. GitHub OAuth Apps
   have one callback URL: use separate apps for different Supabase projects/local
   development. The CMS requests `user:email` so users can keep their public email
   private. A private email is supported; a missing or unverified email is rejected
   with instructions to verify an email and grant email access. No repository scope
   is requested. Keep `email_optional` disabled.
3. **Local:** export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`,
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`,
   `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID`, and
   `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET` for the Supabase CLI. Set `enabled = true`
   in the corresponding `auth.external` sections of `supabase/config.toml` and
   restart your local stack. They are committed disabled so ordinary development
   needs no third-party credentials. The initiation action checks public Auth provider
   availability and presents an in-app error while a provider is disabled. Hosted projects require the dashboard settings;
   editing local TOML does not configure hosted Auth.

The **provider → Supabase** callback is:

- Local Supabase: `http://127.0.0.1:54321/auth/v1/callback`.
- Hosted Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Custom Auth domain: use the exact callback shown in the Supabase dashboard.

This is different from the **Supabase → application** callback below. Do not enter
`/auth/callback` as the provider application's authorization callback.

## Application origins and redirect allowlists

Set `NEXT_PUBLIC_SITE_URL` to the exact trusted application origin. The server
never uses incoming Host/forwarded headers to choose an OAuth callback. HTTPS is
required except for local `localhost` and `127.0.0.1` development.

In Supabase Authentication → URL Configuration, set Site URL and allow these exact
OAuth redirects for the environments you actually use:

| Environment | OAuth redirect |
| --- | --- |
| Local (localhost) | `http://localhost:3000/auth/callback?flow=oauth` |
| Local (IP) | `http://127.0.0.1:3000/auth/callback?flow=oauth` |
| Production example | `https://blog.frankmendez.site/auth/callback?flow=oauth` |
| Dedicated preview example | `https://your-preview.example.com/auth/callback?flow=oauth` |

Use the actual port and hostname for each deployment; add each preview URL
individually, without wildcard hosts or paths. Set that preview's
`NEXT_PUBLIC_SITE_URL` accordingly. Start and finish on the same application
origin/browser: the PKCE verifier cookie does not cross hosts. Keep the existing
signup `/auth/callback` and recovery `/auth/callback?next=/reset-password`
allowlist entries and templates unchanged. Google consent settings must also
permit each preview origin. Provider applications can share one hosted callback
only when the environments intentionally use the same Supabase project.

The pinned Auth SDK returns a PKCE verifier-slot `flowId`. We retain it with the
validated destination and selected provider in a ten-minute HttpOnly SameSite=Lax
cookie and pass it to `exchangeCodeForSession`; the callback URL stays exact.
Supabase owns OAuth state and verifier validation. One pending attempt per browser
is supported: a later attempt replaces its initiation context, and an older
callback fails safely. Starting OAuth clears the SDK's legacy signup verifier, so
an older signup attempt in that browser must be restarted. Removing the OAuth
marker cannot fall back to signup's verifier slot. Restart after cancellation or expiry. Never log callback
queries, authorization codes, cookies, or token responses.

## Identity, sessions, and account security

- Supabase owns automatic linking for matching verified email identities. The CMS
  never searches profiles by email to merge accounts or rewrites a user ID. An
  existing password account and either provider with the same verified email
  should retain one user/profile and its existing role. Different verified emails
  remain separate accounts. Supabase removes unconfirmed identities as part of its
  documented takeover protection. Verify these cases in the designated project
  before rollout; the local application cannot simulate the provider's trust rules.
- Manual linking/unlinking is intentionally unsupported. Keep manual linking
  disabled in both local and hosted Auth. There is no linking UI or endpoint, and
  the initiation action rejects an already signed-in user. Use global application
  sign-out before choosing another account; do not delete identities to resolve a
  collision. Contact an administrator for account recovery.
- The OAuth callback independently verifies the Auth user, confirmed email,
  selected identity, and MFA assurance. Session cookie writes are buffered until
  those checks succeed. Enrolled users continue to `/mfa` before their destination.
  The shared server profile guard also denies AAL1 access for enrolled accounts;
  authorization continues to use database roles and existing ownership checks.
  This does not replace the broader API/database policy audit tracked in #103.
- Provider token fields are removed from the server's token response **before**
  the SDK can persist or broadcast the session. Only Supabase application tokens
  reach session cookies. No provider API tokens are saved in profile rows or client
  context. Do not add client-side code exchange or request provider refresh tokens.
- Profiles are provisioned by the existing Auth-user trigger. Names/avatars are
  untrusted display data; render names as text and retain existing image/public
  projection validation. They never control authorization. Existing profile data
  is not overwritten by subsequent provider sign-ins.
- Accounts with a Google/GitHub identity see **Set or reset password by email** in
  Security, including accounts that also have a password. This uses the existing
  verified, single-use email recovery grant and requires enrolled MFA. It never
  asks OAuth-only users for a nonexistent password or guesses password capability
  from editable metadata. Email-only accounts keep their current-password form.
- The application logout endpoint explicitly requests Supabase `global` sign-out:
  all application refresh sessions are revoked, including other devices. A local
  sign-out revokes only the current application session; this is used internally
  to discard rejected OAuth sessions, not exposed as a settings option. Issued
  access tokens can remain valid until expiry. Neither action signs the user out
  of Google/GitHub, revokes provider consent, or clears the provider's own cookies.

Internal return navigation accepts dashboard paths and rejects external,
protocol-relative, malformed, auth, and API destinations. Signup confirmation and
password recovery keep their separate callback handling; OAuth never mints a
recovery grant. Callback errors use fixed, actionable messages without reflecting
provider text or tokens.

## Verification and rollout

Run the auth tests and the browser suite described in
[testing](../development/testing.md). Unit tests exercise both providers, SDK PKCE
slots, missing verifiers, cookie/token handling, errors, verified/private email
shapes, identity mismatch/collision responses, MFA and safe navigation. Provider
controls have keyboard/duplicate-submit/network tests. These do not prove that a
real provider app is configured or that hosted Auth links accounts correctly.

Before enabling production providers, record results with dedicated test accounts:

1. New Google and GitHub accounts each create exactly one profile with author role.
2. Existing confirmed password account → Google → GitHub with the same verified
   email retains user ID, profile, role, and content. Repeat with an unconfirmed
   password signup to verify Supabase's takeover protection.
3. Different provider emails remain separate. Provider/email collisions produce a
   safe message; manual linking remains disabled and no identity is removed by CMS.
4. GitHub private verified email succeeds; missing/unverified email and refused
   email permission fail safely. Cancel each provider's consent screen.
5. Expired/replayed code, missing verifier/new browser, simultaneous attempts,
   network outage, disabled provider, and invalid return destinations fail safely.
6. Enrolled MFA requires challenge, preserves destination, and blocks sensitive
   shared-server access at AAL1. MFA failures do not grant access.
7. Check cookies/browser storage contain no `provider_token` or
   `provider_refresh_token`; never attach real credentials as evidence.
8. Set a first password by recovery email, including MFA; verify password and
   provider sign-in afterwards. Recheck ordinary signup/confirmation/recovery.
9. Log out on one device and check application refresh sessions on another. Confirm
   the provider remains signed in and its consent is unchanged.
10. Verify both forms at mobile widths, keyboard focus, status/error announcements,
    and provider return navigation on local, a dedicated preview, and production.

Provider-dependent checks require configured external applications and human test
accounts. Record unperformed checks honestly; do not treat mocked tests as live
provider verification.

References: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
[GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
