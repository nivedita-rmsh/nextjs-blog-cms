export type ModerationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected'
export type ModerationMutation = { status: 'draft'; moderation_status: 'not_submitted' | 'pending'; published_at: null }
/** Publication requests and edits to live content must be reviewed before going public. */
export function moderationMutation(input: { currentStatus?: string | null; currentModerationStatus?: string | null; requestPublish: boolean }): ModerationMutation {
  const needsReview = input.requestPublish || input.currentStatus === 'published'
  return { status: 'draft', moderation_status: needsReview || input.currentModerationStatus === 'pending' ? 'pending' : 'not_submitted', published_at: null }
}
export function canPubliclyReadPost(post: { status: string | null; moderation_status: string | null }): boolean {
  return post.status === 'published' && post.moderation_status === 'approved'
}
