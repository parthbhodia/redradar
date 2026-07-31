const MODEL = 'qwen-turbo'
const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

export interface BrandSuggestInput {
  name: string
  /** Anything the user already knows: a URL, a sentence, pasted marketing copy. */
  hint?: string
}

export interface BrandSuggestion {
  tagline: string
  description: string
  voice: string
  competitors: string[]
  /** Anything inferred rather than given, so the user can correct it. */
  assumptions: string[]
}

const SCHEMA = {
  type: 'object',
  properties: {
    tagline: {
      type: 'string',
      description: 'One plain sentence naming the problem solved. No hype, no trailing period needed.',
    },
    description: {
      type: 'string',
      description: 'What it does and who it is for. Two short paragraphs at most.',
    },
    voice: {
      type: 'string',
      description: 'How replies should sell on Reddit: the angle that persuades, the strongest claim, and how to position against competitors.',
    },
    competitors: {
      type: 'array',
      items: { type: 'string' },
      description: 'Product names as people actually type them on Reddit. 5-9 entries.',
    },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Claims inferred rather than supplied. Empty if everything came from the input.',
    },
  },
  required: ['tagline', 'description', 'voice', 'competitors', 'assumptions'],
  additionalProperties: false,
} as const

const SYSTEM = `You write brand profiles for RedIntelli, a tool that finds high-intent Reddit
threads and drafts replies. This profile is not marketing copy — it is the context an LLM
uses to write Reddit comments, and it is matched against thread text to score leads. Write
for that job.

Rules that matter more than polish:

- NEVER invent features, pricing, integrations, funding, customer counts, or metrics. If
  the input doesn't establish something, leave it out. A vague-but-true profile produces
  good replies; a specific-but-false one produces replies that get the brand called out.
- If you don't recognise the brand, write from the hint alone and keep claims general.
  Record every inference in "assumptions" so the user can correct it.
- "tagline" states the problem the product solves, in the customer's words — not a slogan.
- "description" covers what it does and who it's for. Concrete over clever.
- "voice" is instructions for the reply writer, which sells the product in Reddit
  threads: the angle that persuades this audience, the single strongest true claim, and
  how to position against the named competitors. Include any domain myth that would get
  a reply fact-checked and buried if repeated, since that costs the sale.
- "competitors" are the names people actually say in the relevant subreddits, including
  ones mentioned as complaints — those are good threads to be in. Not market leaders by
  revenue. These strings get substring-matched against thread text, so use the common
  spelling and no legal suffixes.`

export async function suggestBrandProfile(
  input: BrandSuggestInput,
  apiKey: string,
): Promise<BrandSuggestion> {
  const prompt = [
    `Brand name: ${input.name}`,
    input.hint?.trim()
      ? `What the user told us:\n${input.hint.trim()}`
      : 'The user gave no additional detail. Infer only what the name reasonably supports, and list those inferences.',
    'Write the profile as valid JSON.',
  ].join('\n\n')

  try {
    const response = await $fetch(QWEN_ENDPOINT, {
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

    try {
      return JSON.parse(text) as BrandSuggestion
    } catch {
      throw createError({ statusCode: 502, statusMessage: 'Could not parse the suggestion.' })
    }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Brand profile generation failed: ${(error as Error).message}`,
    })
  }
}
