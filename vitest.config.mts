import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        // lib core logic
        'lib/utils.ts',
        'lib/permissions/index.ts',
        'lib/store/taxonomy.ts',
        'lib/apiAuth.ts',
        'lib/apiHelpers.ts',
        'lib/rateLimit.ts',
        'lib/encryption.ts',
        'lib/api/auth.ts',
        'lib/auth/session.ts',
        'lib/auth/password-policy.ts',
        'lib/auth/navigation.ts',
        'lib/auth/oauth.ts',
        'lib/auth/oauth-server.ts',
        'lib/auth/token-fetch.ts',
        'app/auth/oauth/actions.ts',
        'app/auth/oauth/callback.ts',
        'components/auth/OAuthButtons.tsx',
        'lib/auth/recovery.ts',
        'app/(auth)/forgot-password/actions.ts',
        'app/(auth)/register/actions.ts',
        'app/(auth)/reset-password/actions.ts',
        'app/auth/callback/route.ts',
        'components/auth/ForgotPasswordForm.tsx',
        'components/auth/ResetPasswordForm.tsx',
        // notifications
        'lib/notifications/user-confirmed.ts',
        // features
        'features/posts/components/**/*.{ts,tsx}',
        'features/posts/actions.ts',
        'features/posts/media/**/*.{ts,tsx}',
        'features/posts/drafts/**/*.{ts,tsx}',
        'features/posts/publication.ts',
        'features/posts/slugs.ts',
        'features/newsletter/actions.ts',
        'features/authors/**/*.{ts,tsx}',
        'app/(public)/authors/[id]/page.tsx',
        'features/comments/components/CommentCard.tsx',
        'features/comments/components/CommentForm.tsx',
        'features/comments/components/CommentList.tsx',
        'features/comments/components/DeleteCommentButton.tsx',
        'features/api-keys/apiKeyService.ts',
        'features/ai-assistant/chatService.ts',
        'features/ai-assistant/llmKeyService.ts',
        'features/ai-assistant/pdfService.ts',
        // components
        'components/dashboard/RoleBadge.tsx',
        'components/dashboard/PostTable/utils.ts',
        // api routes
        'app/api/posts/route.ts',
        'app/api/posts/create/route.ts',
        'app/api/post-media/route.ts',
        'app/api/posts/[id]/route.ts',
        'app/api/ai-assistant/generate/route.ts',
        'app/api/ai-assistant/books/route.ts',
        'app/api/ai-assistant/chats/route.ts',
        // webhook routes
        'app/api/webhooks/user-confirmed/route.ts',
        // app logic
        'app/robots.ts',
        // profile feature
        'features/profile/actions.ts',
        'features/profile/components/**/*.{ts,tsx}',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
})
