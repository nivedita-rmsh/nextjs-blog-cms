import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { listFactors, challenge, verify } = vi.hoisted(() => ({ listFactors: vi.fn(), challenge: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { mfa: { listFactors, challenge, verify } } }) }))
import MfaChallenge from '@/components/auth/MfaChallenge'

beforeEach(() => {
  vi.resetAllMocks()
  listFactors.mockResolvedValue({ data: { totp: [{ id: 'factor', status: 'verified' }] }, error: null })
  challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null })
})

it.each([true, false])('holds the MFA lock only after successful verification (%s)', async success => {
  verify.mockResolvedValue({ error: success ? null : { message: 'invalid' } })
  // Hash navigation is supported by jsdom and leaves this component mounted.
  render(<MfaChallenge next="#verified" />)
  const input = await screen.findByLabelText('Verification Code')
  fireEvent.change(input, { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button').hasAttribute('disabled')).toBe(success))
  if (success) {
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(verify).toHaveBeenCalledTimes(1)
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2))
  }
})
