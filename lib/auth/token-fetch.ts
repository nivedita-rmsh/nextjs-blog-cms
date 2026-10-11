import 'server-only'

/** The CMS needs Supabase credentials, never Google/GitHub API credentials. */
export const fetchWithoutProviderTokens: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (!response.ok || !url.pathname.endsWith('/auth/v1/token')) return response
  const data = await response.json()
  delete data.provider_token
  delete data.provider_refresh_token
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(JSON.stringify(data), { status: response.status, headers })
}
