# Publication readiness and editorial review

Drafts may have empty titles, bodies or excerpts. A draft becomes public only after
server validation succeeds. Published edits validate the complete resulting article
before changing any live fields or tags; rejected requests preserve the previous
publication and do not queue newsletter emails. The dashboard retains unsaved input
and displays actionable field errors. Its post-list publish action opens the editor
for review instead of publishing immediately.

The post editor associates fields with their labels, guidance and validation errors.
The article body is a named multiline textbox. Formatting buttons announce their
selected state as the caret or selection moves; paragraph style and line-spacing
menus expose their checked option. Text-color and highlight controls open a named
palette dialog: Tab moves through swatches, Enter or Space applies a color, and
Escape dismisses the dialog and returns focus to its opening control.

Save progress is announced through a live status region; completion is announced once through the success toast. Failed
saves focus the first invalid field, opening its settings card when needed. Failed
publication checks focus the review dialog's feedback; **Keep editing** returns
focus to the first invalid field. Input remains available throughout. The action
bar stays in normal flow on smaller screens, desktop focus targets account for the
sticky bar, and reduced-motion preferences disable smooth scrolling and animation.

The shared policy in `features/posts/publication.ts` requires:

- A descriptive title of **10–160 readable characters**.
- A unique slug, up to **200 characters**, using lowercase letters, numbers and
  single hyphen separators. Empty draft slugs are generated automatically.
- At least **200 readable body words**, with practical examples and useful takeaways.
  HTML markup, comments, scripts, styles, TipTap JSON node names/attributes, empty blocks and whitespace entities do
  not count. Inline markup does not conceal placeholder phrases.
- An accurate excerpt of **40–500 readable characters** and an existing author
  whose profile has a non-empty display name.
- No obvious test titles, lorem ipsum, unfinished template instructions or
  placeholder cover or inline images. Articles about testing are welcome: the word “test”
  alone is never grounds for rejection.
- Explicit human editorial review of accuracy, usefulness, attribution, relevant
  taxonomy and consistent SEO metadata. The editor clears the confirmation when
  content changes. Ambiguous flags such as `TODO`, `TBD` or “work in progress” stay
  visible as non-blocking warnings before and after confirmation so a human can review their context. Obvious filler still must be removed.

These thresholds are minimum readiness checks, not measures of accuracy or quality.
An editor must assess originality, sources, appropriate examples, category/tags and
assets before confirming review. SEO title/description may use the site's title and
excerpt fallbacks; editors must check their rendered meaning.

REST `POST /api/posts/create` and `PATCH /api/posts/{id}` require
`"editorial_reviewed": true` when the resulting article is published, including
PATCH requests that omit `status` while editing a published article. This is an
attestation by a human reviewer, not permission for an AI pipeline to assert review
automatically. AI generation routes continue to create drafts and must go through
the same publishing checks. There is currently no scheduled article-publication
flow; any future flow must reuse `validatePublication` and require prior human
review. Newsletter scheduling and dispatch independently check readiness and current
publication state.

Public cache invalidation covers the root layout (home, blog, author and taxonomy
pages), affected old/new article URLs and the sitemap. Changing a slug is deliberate;
the editor locks published URLs until you choose **Change published URL** and
confirm the permanent redirect. REST PATCH requests that change a published slug
must include `confirm_slug_change: true` as well as `editorial_reviewed: true`.
Former published URLs return **308** and resolve directly to the current published
URL. They remain reserved through unpublish/republish; unpublished destinations
return 404, and deleting a post removes its reservations. Title edits and clearing
an existing slug preserve the saved URL.

Slugs are normalized server-side to lowercase letters, numbers and single hyphens,
with a 200-character limit. Automatic new-post slugs follow the title until manually
edited and retry actual unique-constraint conflicts up to 20 times (`-2`, `-3`, …).
Titles with no usable slug characters receive a `draft-<UUID>` fallback. Custom slug
conflicts preserve input and return an actionable `slug` field error (HTTP 409 for
write conflicts); a chosen URL is never silently suffixed.

Apply `supabase/migrations/20261007055822_post_slug_routes.sql` **before deploying**
this code. It backfills current URL reservations without rewriting existing URLs.
Historical URL changes made before this migration cannot be reconstructed.
Reservations and post writes commit together, so a failed reservation leaves the
post unchanged. The route table has read-only public access for published posts;
only the database trigger maintains it.

Verify the database behavior, including concurrent creates and URL hijacking,
with `bash database/tests/verify-slug-routes.sh` (isolated local PostgreSQL). The
browser flow is covered by `e2e/browser/slug-safety.spec.ts` on a dedicated test
Supabase project.

See [API publication and write contracts](../api/publication-and-writes.md) for errors, optimistic concurrency, atomic saves and idempotency.


## Writing, preview and publication review

The writing screen exposes **Save Draft**, **Preview** and **Publish** for new posts. Saving creates the draft without replacing the active editor; subsequent saves update the same post. The new-post recovery URL remains stable while writing; reloading it reopens the same persisted post in place, including any recovery copies. The posts list also links to its edit URL. Recovery continues under the persisted post identity. Published posts expose **Save Changes**, **View Post** and **Unpublish**, with an explicit publication status.

**Preview** opens a private reader view of the current unsaved title, excerpt, cover and body. It shares the public article body and TipTap renderer. The preview action checks authentication, the opened editor account, and ownership (or administrator access) for an existing post. It does not save the article, change publication status, create a public preview URL, or schedule a newsletter. Legacy HTML is sanitized before it enters the dashboard. Closing the preview returns to the current writing form.

**Publish** first opens a review showing the destination URL and newsletter consequence. An automatically generated slug can receive a collision suffix; **View Post** uses the final saved URL. Confirming publication reuses the server readiness checks described above, including the author's human editorial confirmation. New publication saves the article and taxonomy in one atomic write, without an intermediate draft. Failed validation leaves writing in the editor and queues no newsletter. Newsletter scheduling failures are reported separately from successful publication.

Optional **Settings** and **SEO** sections start collapsed. SEO title and description fall back to the post title and excerpt when left blank; an excerpt is still required for publication. Sections with validation errors open to reveal the corrective guidance.

Cover images in reader preview and publication use the same image optimizer and configured HTTPS hosts as the public article. Unsupported cover hosts block preview and publication; remove the cover or configure its host with `IMAGE_REMOTE_HOSTS`. Supabase covers must use the public storage path.

If a creation response is lost, retrying the same recovery document reports whether it was already saved as a draft or published. Reload to inspect the saved post and newsletter status before comparing your current input; retries never overwrite that post or queue another newsletter. Publication review remains open during the request and displays failures so authors can return to editing.

## Tag selection and taxonomy

The editor shows selected tags first with removal buttons, followed by a searchable,
scrollable list. Native buttons support Tab and Enter/Space; pressed state and the
selected count are exposed to assistive technology. Tag loading errors are distinct
from an empty taxonomy. Administrators can open tag management in a new tab while
keeping their writing form open; authors ask an administrator for taxonomy changes.

Tag names use trimmed, single-spaced text (1–100 characters), preserving meaningful
capitalization. New names are compared case-insensitively. Semantic variants such as
`SoftwareEngineering` and `Software engineering` require a deliberate admin decision.
The migration does not automatically merge existing tags.

In **Dashboard → Admin → Tags**, choose the duplicate and the canonical tag, then
confirm the merge. The transaction deduplicates post relationships and retains the
old row as a URL/ID alias. `/blog/tag/<old-slug>` redirects permanently to the surviving
URL; subsequent merges flatten aliases. Old draft IDs resolve to the canonical tag
when saved. Direct relationship writers also resolve alias IDs through a database
trigger. Sitemaps and build-time tag discovery include only canonical URLs. Used tags and URL aliases cannot be deleted; unused tags require deletion
confirmation. Tag slugs cannot be changed in place.

Apply `20261007165155_searchable_tag_taxonomy.sql` before deploying this application.
Verify merges only in a disposable migrated database using
`database/tests/tag_taxonomy.sql`. No production taxonomy cleanup is performed by
this migration.
