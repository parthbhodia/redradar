import type { Brand } from '#shared/types'

const MODEL = 'qwen-turbo'

export interface KeywordSuggestInput {
  brand: Pick<Brand, 'name' | 'tagline' | 'description' | 'competitors'>
  /** Phrases already on the campaign, so the model proposes something new. */
  existing: string[]
}

export interface KeywordIdea {
  phrase: string
  subreddit: string | null
  intent: string
}

const SCHEMA = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phrase: {
            type: 'string',
            description: 'Lowercase search phrase, 2-6 words, as a person would type it.',
          },
          subreddit: {
            type: ['string', 'null'],
            description: 'Subreddit to restrict to, without the r/ prefix. Null for most phrases.',
          },
          intent: {
            type: 'string',
            description: 'One short clause on who posts this and why it is worth answering.',
          },
        },
        required: ['phrase', 'subreddit', 'intent'],
        additionalProperties: false,
      },
    },
  },
  required: ['keywords'],
  additionalProperties: false,
} as const

const SYSTEM = `You propose Reddit search phrases for RedIntelli, which runs each phrase through
Reddit search and scores the threads it finds.

These are search queries against post titles and bodies — not SEO keywords and not ad
targeting. Judge every candidate by one test: would a real person plausibly write these
words in a Reddit post, and would that person be worth replying to?

Aim for a spread across four kinds:

1. Problem statements — how someone describes the pain before they know a tool exists
   ("resume not getting callbacks"). Highest intent, and the least contested.
2. Competitor names plus a qualifier ("jobscan alternative", "is teal worth it"). People
   asking these are actively shopping.
3. Questions and myths in the category ("does ATS reject pdf"). Often threads where the
   product is genuinely relevant and a correct answer earns credibility.
4. Category terms ("ats resume checker"). Broadest, noisiest — include only a couple.

Rules:
- Lowercase. Two to six words. No quotes, no boolean operators, no site: prefixes.
- Never a single generic word ("resume", "jobs") — that returns thousands of useless hits.
- Set "subreddit" only when a phrase is meaningless outside one community. Most should be
  null; pinning too early is the main way people starve their own inbox.
- Do not repeat any phrase already on the campaign, or a trivial rewording of one.
- Propose 8 to 12.`

export async function suggestKeywords(
  input: KeywordSuggestInput,
  apiKey: string,
  baseUrl: string,
): Promise<KeywordIdea[]> {
  const brandLines = [
    `Name: ${input.brand.name}`,
    input.brand.tagline ? `One-liner: ${input.brand.tagline}` : null,
    input.brand.description ? `What it does: ${input.brand.description}` : null,
    input.brand.competitors?.length ? `Competitors: ${input.brand.competitors.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  // Debug: log if brand is incomplete
  if (!input.brand.description && !input.brand.tagline) {
    console.warn('[KeywordSuggest] Warning: Brand has minimal data (no description/tagline). Qwen may return empty suggestions.')
  }

  const prompt = [
    `<brand>\n${brandLines}\n</brand>`,
    input.existing.length
      ? `<already_tracked>\n${input.existing.join('\n')}\n</already_tracked>`
      : '<already_tracked>\n(none yet)\n</already_tracked>',
    'Propose the keywords as valid JSON.',
  ].join('\n\n')

  try {
    const response = await $fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
      },
      timeout: 120_000,
    }) as {
      choices: Array<{ message: { content: string } }>
    }

    if (!response.choices?.[0]?.message?.content) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Empty suggestion returned.',
      })
    }

    const text = response.choices[0].message.content.trim()

    let parsed: { keywords?: KeywordIdea[] }
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error('[KeywordSuggest] Parse error:', text.substring(0, 200))
      throw createError({ statusCode: 502, statusMessage: 'Could not parse the suggestions.' })
    }

    console.log('[KeywordSuggest] Qwen returned:', parsed.keywords?.length ?? 0, 'keywords')

    // Belt-and-braces dedupe — the model is told to skip these, but a near-miss
    // would otherwise surface an Add button that silently conflicts on insert.
    const seen = new Set(input.existing.map(p => p.trim().toLowerCase()))
    const filtered = (parsed.keywords ?? []).filter((idea) => {
      const key = idea.phrase?.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (parsed.keywords?.length && !filtered.length) {
      console.warn('[KeywordSuggest] All suggestions filtered (duplicates with existing)')
    }

    return filtered
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Keyword suggestion failed: ${(error as Error).message}`,
    })
  }
}
