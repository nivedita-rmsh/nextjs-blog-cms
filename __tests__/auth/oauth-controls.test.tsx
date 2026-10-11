import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/auth/oauth/actions', () => ({ startOAuth: vi.fn() }))
vi.mock('@/app/(auth)/login/actions', () => ({ login: vi.fn() }))
vi.mock('@/app/(auth)/register/actions', () => ({ register: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { startOAuth } from '@/app/auth/oauth/actions'
import LoginForm from '@/components/auth/LoginForm'
import RegisterForm from '@/components/auth/RegisterForm'

beforeEach(() => vi.resetAllMocks())
describe.each([['login', LoginForm], ['registration', RegisterForm]] as const)('%s provider controls', (_name, Form) => {
  it('supports keyboard activation, disables competing methods, and announces pending state', async () => {
    vi.mocked(startOAuth).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<Form next="/dashboard/posts" />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(startOAuth).toHaveBeenCalledWith('google', '/dashboard/posts')
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to Google')
    expect(screen.getByRole('button', { name: 'Continue with GitHub' })).toBeDisabled()
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(startOAuth).toHaveBeenCalledTimes(1)
  })
  it('offers a retry after a network failure', async () => {
    vi.mocked(startOAuth).mockRejectedValue(new Error('private internal detail'))
    render(<Form />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Check your connection'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('private internal detail')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })
  it('displays callback failures and provider configuration errors', async () => {
    vi.mocked(startOAuth).mockResolvedValue({ error: 'Provider unavailable. Use email and password.' })
    render(<Form initialError="Sign-in was cancelled. Try again." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Provider unavailable'))
  })
})
