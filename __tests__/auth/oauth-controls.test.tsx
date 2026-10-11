import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/auth/oauth/actions', () => ({ startOAuth: vi.fn() }))
vi.mock('@/app/(auth)/login/actions', () => ({ login: vi.fn() }))
vi.mock('@/app/(auth)/register/actions', () => ({ register: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
import { startOAuth } from '@/app/auth/oauth/actions'
import { login } from '@/app/(auth)/login/actions'
import { register as registerAction } from '@/app/(auth)/register/actions'
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

 describe.each([['login', LoginForm, login], ['registration', RegisterForm, registerAction]] as const)('%s navigation locks', (name, Form, action) => {
  it('restores provider and email controls on a persisted pageshow', async () => {
    vi.mocked(startOAuth).mockReturnValue(new Promise(() => {}))
    render(<Form />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: false }))
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
    expect(screen.getByLabelText('Email address')).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }))
    expect(startOAuth).toHaveBeenCalledTimes(2)
  })
  it.each([true, false])('holds the submit lock only after successful navigation (%s)', async success => {
    vi.mocked(action).mockResolvedValue(success ? { success: true } : { error: 'Try again' })
    const { container } = render(<Form />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'test@example.com' } })
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'ValidPassword123!' } })
    if (name === 'registration') {
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test User' } })
      fireEvent.change(screen.getByLabelText('Confirm password', { exact: false }), { target: { value: 'ValidPassword123!' } })
    }
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText('Email address').hasAttribute('disabled')).toBe(success))
    if (success) {
      fireEvent.submit(container.querySelector('form')!)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(action).toHaveBeenCalledTimes(1)
    }
  })
})
