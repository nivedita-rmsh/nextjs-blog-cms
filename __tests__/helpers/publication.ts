import { vi } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/service'

import { articleContent } from '@/e2e/publication-fixture'

export { articleContent }

export const validPost = {
  id: 'post-1', title: 'Integration Testing at Service Boundaries', slug: 'integration-testing-service-boundaries',
  content: articleContent, excerpt: 'Design integration tests that verify service contracts, idempotent retries, and recovery from partial failures.',
  seo_title: 'Integration Testing at Service Boundaries', seo_description: 'Practical contract tests for reliable engineering systems.',
  status: 'draft', moderation_status: 'not_submitted', is_premium: false,
  author_id: 'user-1', cover_image: null, cover_image_alt: '', category_id: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', published_at: null as string | null,
  category: { name: 'Engineering' }, tags: [{ tag: { name: 'testing' } }],
}

type Row = Record<string, unknown>
// Stateful query double: assert actual attempted writes and preservation, rather
// than mocking readiness or merely checking that the validator was called.
export function postClient(initialPosts: Row[] = [], authorName: string | null = 'Frank Mendez', initialSends: Row[] = [], initialRoutes: Row[] = [], initialSubscribers: Row[] = []) {
  const sends: Row[] = initialSends.map(row => ({ delivery_started_at: null, dispatch_token: null, ...row }))
  const posts = initialPosts.map(row => ({ ...row }))
  const writes: { table: string; operation: string; payload?: unknown }[] = []
  const requests = new Map<string, { fingerprint: string; post: Row }>()
  let atomicError: { code: string; message: string } | null = null
  let race = false
  let slugRaces = 0
  const queryFailures: { table: string; operation: string; message: string }[] = []
  let queryObserver: ((query: { table: string; operation: string; payload: Row | Row[] }) => void) | undefined
  const routes: Row[] = [...initialRoutes.map(row => ({ ...row })), ...posts.map(row => ({ slug: row.slug, post_id: row.id, was_published: row.status === 'published' }))]
  const reserveRoute = (row: Row, oldSlug?: unknown) => {
    const route = routes.find(route => route.slug === row.slug)
    if (route) route.was_published ||= row.status === 'published'
    else routes.push({ slug: row.slug, post_id: row.id, was_published: row.status === 'published' })
    if (oldSlug !== undefined && oldSlug !== row.slug) {
      const released = routes.findIndex(route => route.slug === oldSlug && route.post_id === row.id && !route.was_published)
      if (released >= 0) routes.splice(released, 1)
    }
  }
  const client = {
    rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
      if (atomicError) return { data: null, error: atomicError }
      const key = `${args.p_actor_id}:${args.p_request_key}`
      const prior = args.p_request_key ? requests.get(key) : undefined
      if (prior) return prior.fingerprint === args.p_fingerprint
        ? { data: { post: prior.post, replayed: true }, error: null }
        : { data: null, error: { code: '22023', message: 'Creation key already used' } }
      const result = args.p_expected_status
        ? await client.from('posts').update(args.p_payload as Row).eq('id', args.p_post_id).eq('updated_at', args.p_expected_updated_at).eq('status', args.p_expected_status).select().single()
        : await client.from('posts').insert({ ...(args.p_post_id ? { id: args.p_post_id } : {}), ...args.p_payload as Row }).select().single()
      if (result.error) return result
      if (args.p_request_key) requests.set(key, { fingerprint: args.p_fingerprint as string, post: result.data })
      return { data: { post: result.data, replayed: false }, error: null }
    }),
    from: vi.fn((table: string) => {
      let operation = 'select'
      let payload: Row | Row[] = {}
      const filters: ((row: Row) => boolean)[] = []
      let rowLimit = Infinity
      const execute = () => {
        queryObserver?.({ table, operation, payload })
        const failureIndex = queryFailures.findIndex(failure => failure.table === table && failure.operation === operation)
        if (failureIndex >= 0) return { data: null, error: { message: queryFailures.splice(failureIndex, 1)[0].message } }
        let rows: Row[] = table === 'post_creation_requests' ? Array.from(requests.entries()).map(([key, value]) => ({ actor_id: key.split(':')[0], request_key: key.slice(key.indexOf(':') + 1), fingerprint: value.fingerprint, post_id: value.post.id })) : table === 'post_slug_routes' ? routes : table === 'newsletter_sends' ? sends : table === 'newsletter_subscriptions' ? initialSubscribers : table === 'posts' ? posts : table === 'profiles' ? [{ id: 'user-1', full_name: authorName }] : []
        rows = rows.filter(row => filters.every(filter => filter(row))).slice(0, rowLimit)
        if (operation !== 'select') {
          writes.push({ table, operation, payload })
          if (slugRaces > 0 && table === 'posts' && ['insert', 'update'].includes(operation)) {
            slugRaces--
            return { data: null, error: { code: '23505', message: 'duplicate key violates posts_slug_key' } }
          }
          if (race && table === 'posts') return { data: null, error: { code: '40001', message: 'Concurrent update' } }
          if (operation === 'upsert' && table === 'newsletter_sends') {
            const send = payload as Row
            if (!sends.some(row => row.post_id === send.post_id)) sends.push({ id: `send-${sends.length + 1}`, sending_started_at: null, delivery_started_at: null, dispatch_token: null, sent_at: null, ...send })
          } else if (operation === 'insert') {
            const incoming = Array.isArray(payload) ? payload : [payload]
            if (table === 'posts' && incoming.some(row => posts.some(post => post.id === row.id))) {
              return { data: null, error: { code: '23505', message: 'Duplicate post ID' } }
            }
            if (table === 'posts' && incoming.some(row => routes.some(route => route.slug === row.slug && route.post_id !== row.id))) {
              return { data: null, error: { code: '23505', message: 'duplicate key violates post_slug_routes_pkey' } }
            }
            rows = incoming.map(row => ({ ...validPost, id: 'created-post', ...row }))
            if (table === 'posts') { posts.push(...rows); rows.forEach(row => reserveRoute(row)) }
          } else if (operation === 'update') {
            if (table === 'posts' && rows.some(row => routes.some(route => route.slug === (payload as Row).slug && route.post_id !== row.id))) {
              return { data: null, error: { code: '23505', message: 'duplicate key violates post_slug_routes_pkey' } }
            }
            for (const row of rows) {
              const oldSlug = row.slug
              Object.assign(row, payload)
              if (table === 'posts') reserveRoute(row, oldSlug)
            }
          } else if (operation === 'delete' && table === 'posts') {
            for (const row of rows) posts.splice(posts.indexOf(row), 1)
          }
        }
        return { data: rows.map(row => ({ ...row })), error: null }
      }
      const chain = {
        select: vi.fn(() => chain),
        upsert: vi.fn((value: Row) => { operation = 'upsert'; payload = value; return chain }),
        insert: vi.fn((value: Row | Row[]) => { operation = 'insert'; payload = value; return chain }),
        update: vi.fn((value: Row) => { operation = 'update'; payload = value; return chain }),
        delete: vi.fn(() => { operation = 'delete'; return chain }),
        eq: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] === value); return chain }),
        is: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] === value); return chain }),
        neq: vi.fn((field: string, value: unknown) => { filters.push(row => row[field] !== value); return chain }),
        in: vi.fn((field: string, values: unknown[]) => { filters.push(row => values.includes(row[field])); return chain }),
        lt: vi.fn((field: string, value: string) => { filters.push(row => row[field] != null && String(row[field]) < value); return chain }),
        lte: vi.fn((field: string, value: string) => { filters.push(row => row[field] != null && String(row[field]) <= value); return chain }),
        limit: vi.fn((value: number) => { rowLimit = value; return chain }),
        maybeSingle: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        single: vi.fn(async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      }
      return chain
    }),
  } as unknown as ReturnType<typeof createServiceClient>
  return { client, posts, sends, routes, writes, observeQueries: (observer: typeof queryObserver) => { queryObserver = observer }, failQuery: (table: string, operation: string, message = 'Database unavailable') => { queryFailures.push({ table, operation, message }) }, failAtomic: (message = 'Tag operation failed') => { atomicError = { code: '23503', message } }, clearAtomicFailure: () => { atomicError = null }, simulateSlugRace: (count = 1) => { slugRaces = count }, simulateRace: () => { race = true } }
}
