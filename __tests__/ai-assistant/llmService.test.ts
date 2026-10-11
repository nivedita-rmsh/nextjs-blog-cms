import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AVAILABLE_MODELS } from '@/features/ai-assistant/types'

// ─── AVAILABLE_MODELS ────────────────────────────────────────────────────────

describe('AVAILABLE_MODELS', () => {
  it('contains claude models', () => {
    const claude = AVAILABLE_MODELS.filter((m) => m.provider === 'claude')
    expect(claude.length).toBeGreaterThan(0)
  })

  it('contains openai models', () => {
    const openai = AVAILABLE_MODELS.filter((m) => m.provider === 'openai')
    expect(openai.length).toBeGreaterThan(0)
  })

  it('contains gemini models', () => {
    const gemini = AVAILABLE_MODELS.filter((m) => m.provider === 'gemini')
    expect(gemini.length).toBeGreaterThan(0)
  })

  it('each model has required fields including contextWindow', () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy()
      expect(model.name).toBeTruthy()
      expect(model.provider).toMatch(/^(claude|gemini|openai)$/)
      expect(typeof model.free).toBe('boolean')
      expect(typeof model.contextWindow).toBe('number')
      expect(model.contextWindow).toBeGreaterThan(0)
    }
  })

  it('has at least one free model', () => {
    expect(AVAILABLE_MODELS.some((m) => m.free)).toBe(true)
  })
})


describe('inferProviderFromModel', () => {
  it('infers Gemini from a Gemini model ID', async () => {
    const { inferProviderFromModel } = await import(
      '@/features/ai-assistant/llmService'
    )
    expect(inferProviderFromModel('gemini-2.5-flash')).toBe('gemini')
  })

  it('infers OpenAI from a GPT model ID', async () => {
    const { inferProviderFromModel } = await import(
      '@/features/ai-assistant/llmService'
    )
    expect(inferProviderFromModel('gpt-4o')).toBe('openai')
  })

  it('defaults to Claude for other model IDs', async () => {
    const { inferProviderFromModel } = await import(
      '@/features/ai-assistant/llmService'
    )
    expect(inferProviderFromModel('claude-sonnet-4-6')).toBe('claude')
  })
})


// ─── buildSystemPrompt ────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('includes the full text when it fits within context window', async () => {
    const { buildSystemPrompt } = await import('@/features/ai-assistant/llmService')
    const text = 'This is the book content.'
    const prompt = buildSystemPrompt(text, 'gemini-1.5-flash')
    expect(prompt).toContain(text)
    expect(prompt).not.toContain('[Book text truncated')
  })

  it('truncates text and adds note when it exceeds model context window', async () => {
    const { buildSystemPrompt } = await import('@/features/ai-assistant/llmService')
    // gpt-4o has 128k context; 8k reserved = 120k available = 480k chars
    // Create text of 600k chars to force truncation
    const longText = 'x'.repeat(600000)
    const prompt = buildSystemPrompt(longText, 'gpt-4o')
    expect(prompt).toContain('[Book text truncated')
    expect(prompt.length).toBeLessThan(longText.length + 500)
  })

  it('does NOT truncate for Gemini 1.5 Flash (1M context window)', async () => {
    const { buildSystemPrompt } = await import('@/features/ai-assistant/llmService')
    // 600k chars / 4 = 150k tokens — fits in 1M context
    const text = 'y'.repeat(600000)
    const prompt = buildSystemPrompt(text, 'gemini-1.5-flash')
    expect(prompt).not.toContain('[Book text truncated')
  })
})

// ─── Shared mock for @anthropic-ai/sdk ───────────────────────────────────────

const mockAnthropicCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: { create: mockAnthropicCreate },
    }
  }),
}))

// ─── Shared mock for openai ───────────────────────────────────────────────────

const mockOpenAICreate = vi.fn()

const { mockGeminiGenerate, mockGeminiStream } = vi.hoisted(() => ({
  mockGeminiGenerate: vi.fn(),
  mockGeminiStream: vi.fn(),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGeminiGenerate, generateContentStream: mockGeminiStream }
  },
}))

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return {
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    }
  }),
}))

describe('Google GenAI migration', () => {
  it('streams text properties and preserves conversation roles and system context', async () => {
    mockGeminiStream.mockResolvedValue((async function* () {
      yield { text: 'Hello' }
      yield { text: undefined }
      yield { text: ' world' }
    })())
    const { sendMessage } = await import('@/features/ai-assistant/llmService')
    const chunks: string[] = []
    for await (const text of sendMessage({
      provider: 'gemini', model: 'gemini-1.5-flash', apiKey: 'test-key',
      extractedText: 'Book context',
      messages: [
        { id: '1', chat_id: 'chat', created_at: '', role: 'user', content: 'Question' },
        { id: '2', chat_id: 'chat', created_at: '', role: 'assistant', content: 'Answer' },
      ],
    })) chunks.push(text)
    expect(chunks.join('')).toBe('Hello world')
    expect(mockGeminiStream).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.5-flash-lite',
      contents: [
        { role: 'user', parts: [{ text: 'Question' }] },
        { role: 'model', parts: [{ text: 'Answer' }] },
      ],
      config: { systemInstruction: expect.stringContaining('Book context') },
    }))
  })

  it('requests JSON generation and parses the response text property', async () => {
    const post = { title: 'Gemini Post', content: '<p>Body</p>', tags: ['test'] }
    mockGeminiGenerate.mockResolvedValue({ text: JSON.stringify(post) })
    const { generateBlogPost, generateBlogPostHeadless } = await import('@/features/ai-assistant/llmService')
    expect(await generateBlogPost({
      model: 'gemini-2.5-flash', apiKey: 'test-key', extractedText: 'Book', messages: [],
    })).toEqual(post)
    expect(mockGeminiGenerate).toHaveBeenLastCalledWith(expect.objectContaining({
      config: { systemInstruction: expect.stringContaining('Book'), responseMimeType: 'application/json' },
    }))
    expect(await generateBlogPostHeadless({
      model: 'gemini-2.5-flash', provider: 'gemini', apiKey: 'test-key', topic: 'Testing', tone: 'technical', wordCount: 800,
    })).toEqual(post)
    expect(mockGeminiGenerate).toHaveBeenLastCalledWith(expect.objectContaining({
      config: { responseMimeType: 'application/json' },
    }))
  })

  it('uses the title fallback when Gemini returns no text', async () => {
    mockGeminiGenerate.mockResolvedValue({})
    const { generateChatTitle } = await import('@/features/ai-assistant/llmService')
    expect(await generateChatTitle('Question', 'gemini-2.5-flash', 'test-key')).toBe('New Chat')
  })
})

// ─── generateChatTitle ────────────────────────────────────────────────────────

describe('generateChatTitle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a non-empty string from Claude response', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Key Themes in Atomic Habits' }],
    })

    const { generateChatTitle } = await import('@/features/ai-assistant/llmService')
    const title = await generateChatTitle(
      'What are the key themes of this book?',
      'claude-sonnet-4-6',
      'test-api-key'
    )
    expect(typeof title).toBe('string')
    expect(title.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string from OpenAI response', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'GPT Chat Title' } }],
    })

    const { generateChatTitle } = await import('@/features/ai-assistant/llmService')
    const title = await generateChatTitle(
      'Tell me about this book',
      'gpt-4o',
      'sk-openai-key'
    )
    expect(typeof title).toBe('string')
    expect(title.length).toBeGreaterThan(0)
  })
})

// ─── generateBlogPost ────────────────────────────────────────────────────────

describe('generateBlogPost', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses JSON response from Claude and returns all required fields', async () => {
    const mockPost = {
      title: 'Test Post',
      meta_title: 'Test SEO Title',
      meta_description: 'Test description',
      excerpt: 'Short summary.',
      content: '<p>Body content</p>',
      tags: ['tag1', 'tag2'],
      category: 'Technology',
    }

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockPost) }],
    })

    const { generateBlogPost } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPost({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Write a post' }],
      extractedText: 'Book content here.',
      apiKey: 'test-key',
    })

    expect(result.title).toBe('Test Post')
    expect(result.meta_title).toBe('Test SEO Title')
    expect(result.tags).toEqual(['tag1', 'tag2'])
  })

  it('parses JSON from OpenAI using response_format json_object mode', async () => {
    const mockPost = {
      title: 'OpenAI Post',
      meta_title: 'OpenAI SEO',
      meta_description: 'OpenAI description',
      excerpt: 'OpenAI summary.',
      content: '<p>OpenAI body</p>',
      tags: ['openai'],
      category: 'AI',
    }

    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockPost) } }],
    })

    const { generateBlogPost } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPost({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Write a post' }],
      extractedText: 'Book content here.',
      apiKey: 'sk-openai-key',
    })

    expect(result.title).toBe('OpenAI Post')
    // OpenAI was called with response_format: json_object
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.response_format).toEqual({ type: 'json_object' })
    expect(callArgs.stream).toBe(false)
  })

  it('strips markdown code fences from Claude response', async () => {
    const mockPost = {
      title: 'Fenced Post',
      meta_title: 'Fenced SEO Title',
      meta_description: 'Fenced description',
      excerpt: 'Fenced summary.',
      content: '<p>Fenced body</p>',
      tags: ['fenced'],
      category: 'Tech',
    }

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(mockPost)}\n\`\`\`` }],
    })

    const { generateBlogPost } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPost({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Write a post' }],
      extractedText: 'Book content here.',
      apiKey: 'test-key',
    })

    expect(result.title).toBe('Fenced Post')
  })
})

// ─── generateBlogPostHeadless ─────────────────────────────────────────────────

describe('generateBlogPostHeadless', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls Claude without a document block and returns parsed JSON', async () => {
    const mockPost = {
      title: 'Headless Post',
      meta_title: 'Headless SEO Title',
      meta_description: 'Headless description',
      excerpt: 'Short headless summary.',
      content: '<p>Headless body</p>',
      tags: ['headless', 'cms'],
      category: 'Technology',
    }

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockPost) }],
    })

    const { generateBlogPostHeadless } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPostHeadless({
      topic: 'Headless CMS',
      tone: 'professional',
      wordCount: 800,
      model: 'claude-sonnet-4-6',
      provider: 'claude' as const,
      apiKey: 'test-key',
    })

    expect(result.title).toBe('Headless Post')
    // Plain string content, no document block
    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    expect(typeof callArgs.messages[0].content).toBe('string')
  })

  it('calls OpenAI with response_format json_object for headless generation', async () => {
    const mockPost = {
      title: 'OpenAI Headless Post',
      meta_title: 'OpenAI Headless SEO',
      meta_description: 'OpenAI headless description',
      excerpt: 'OpenAI headless summary.',
      content: '<p>OpenAI headless body</p>',
      tags: ['openai'],
      category: 'AI',
    }

    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockPost) } }],
    })

    const { generateBlogPostHeadless } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPostHeadless({
      topic: 'OpenAI Headless',
      tone: 'casual',
      wordCount: 600,
      model: 'gpt-4o',
      provider: 'openai' as const,
      apiKey: 'sk-openai-key',
    })

    expect(result.title).toBe('OpenAI Headless Post')
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.response_format).toEqual({ type: 'json_object' })
  })

  it('strips markdown code fences from Claude response', async () => {
    const mockPost = {
      title: 'Fenced Post',
      meta_title: '', meta_description: '', excerpt: '',
      content: '', tags: [], category: '',
    }

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(mockPost)}\n\`\`\`` }],
    })

    const { generateBlogPostHeadless } = await import('@/features/ai-assistant/llmService')
    const result = await generateBlogPostHeadless({
      topic: 'Code fences',
      tone: 'casual',
      wordCount: 500,
      model: 'claude-sonnet-4-6',
      provider: 'claude' as const,
      apiKey: 'test-key',
    })

    expect(result.title).toBe('Fenced Post')
  })

  it('throws when LLM returns invalid JSON', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })

    const { generateBlogPostHeadless } = await import('@/features/ai-assistant/llmService')

    await expect(
      generateBlogPostHeadless({
        topic: 'Bad response',
        tone: 'neutral',
        wordCount: 600,
        model: 'claude-sonnet-4-6',
        provider: 'claude' as const,
        apiKey: 'test-key',
      })
    ).rejects.toThrow('LLM returned invalid JSON')
  })
})
