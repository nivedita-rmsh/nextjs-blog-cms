import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChangePasswordForm } from '@/features/profile/components/ChangePasswordForm'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/profile/actions', () => ({ updatePassword: vi.fn() }))

import { updatePassword } from '@/features/profile/actions'
const mockUpdatePassword = vi.mocked(updatePassword)

beforeEach(() => { vi.clearAllMocks() })

describe('ChangePasswordForm', () => {
  it('renders current, new, and confirm password fields', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText(/^current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument()
  })

  it('shows error when new password and confirm do not match', async () => {
    render(<ChangePasswordForm />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'current123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument())
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('calls updatePassword with correct args on valid submit', async () => {
    mockUpdatePassword.mockResolvedValue({ success: true })
    render(<ChangePasswordForm />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'current123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'newpass123' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('current123', 'newpass123'))
  })
})


it('offers verified recovery instead of asking provider accounts for a current password', () => {
  render(<ChangePasswordForm useEmailRecovery />)
  expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /set or reset password by email/i })).toHaveAttribute('href', '/forgot-password')
})
