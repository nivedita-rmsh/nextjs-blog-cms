/** Only application pages may be authentication return destinations. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/dashboard'
  try {
    const url = new URL(value, 'https://internal.invalid')
    // Reject encoded separators/control characters and auth/API endpoints (loops or side effects).
    const path = decodeURIComponent(url.pathname)
    if (url.origin !== 'https://internal.invalid' || /[\\%\x00-\x20\x7f]/.test(path) || path.startsWith('//')) return '/dashboard'
    if (!['/dashboard'].some(root => path === root || path.startsWith(`${root}/`))) return '/dashboard'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/dashboard'
  }
}

export function mfaDestination(next: unknown): string {
  return `/mfa?next=${encodeURIComponent(safeReturnPath(next))}`
}
