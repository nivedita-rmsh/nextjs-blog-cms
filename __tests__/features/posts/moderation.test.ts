import { describe, expect, it } from 'vitest'
import { canPubliclyReadPost, moderationMutation } from '@/features/posts/moderation'

describe('moderation state transitions', () => {
  it('leaves an ordinary draft outside the review queue', () => {
    expect(moderationMutation({ requestPublish: false })).toEqual({
      status: 'draft', moderation_status: 'not_submitted', published_at: null,
    })
  })
  it('submits a publish request as a pending draft', () => {
    expect(moderationMutation({ requestPublish: true })).toEqual({
      status: 'draft', moderation_status: 'pending', published_at: null,
    })
  })
  it('returns edits to an existing published article to moderation', () => {
    expect(moderationMutation({ currentStatus: 'published', currentModerationStatus: 'approved', requestPublish: false }))
      .toMatchObject({ status: 'draft', moderation_status: 'pending', published_at: null })
  })
  it('keeps an already pending submission in the review queue when edited', () => {
    expect(moderationMutation({ currentStatus: 'draft', currentModerationStatus: 'pending', requestPublish: false }).moderation_status)
      .toBe('pending')
  })
  it('requires both publication and approval for public visibility', () => {
    expect(canPubliclyReadPost({ status: 'published', moderation_status: 'approved' })).toBe(true)
    expect(canPubliclyReadPost({ status: 'draft', moderation_status: 'approved' })).toBe(false)
    expect(canPubliclyReadPost({ status: 'published', moderation_status: 'pending' })).toBe(false)
    expect(canPubliclyReadPost({ status: 'published', moderation_status: 'rejected' })).toBe(false)
  })
})
