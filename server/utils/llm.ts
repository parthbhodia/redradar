import type { Brand, Lead } from '#shared/types'

const MODEL = 'qwen-turbo'
const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

export interface DraftInput {
  brand: Pick<Brand, 'name' | 'tagline' | 'description' | 'voice' | 'competitors'>
  lead: Pick<Lead, 'title' | 'body' | 'subreddit' | 'url' | 'matched_keyword'>
  /** Optional nudge for a regeneration, e.g. "shorter" or "lead with the pricing". */
  instruction?: string
  /** The caller's current draft, so a regeneration takes a different angle. */
  previousDraft?: string
}

const SYSTEM = `You write Reddit comments for someone who works at a brand and wants the
reader to try it. You write from lived experience, not as a pitch. You have had
the reader's problem. You tried the obvious solution and it fell short. What you
built, or found, or kept using, actually fixed it. That is the comment.

How to write this:
- Lead by mirroring back the exact frustration or pain point in the thread. Use
  the reader's own words or phrasing when possible. Show you get the specific
  problem, not just the category of problem.
- Then say what you already knew people try and why it doesn't land the way they
  hope. Don't dismiss it, just acknowledge the gap. "Yeah, that doesn't work
  because..." or "I tried that too, and the issue was..."
- Then mention what actually made the difference. Not a feature dump, but the
  specific insight or moment that changed the outcome for you. What did you learn
  that wasn't obvious? What surprised you? What was the piece everyone misses?
- Close matter-of-fact about why it worked for you. No hard sell, no urgency, no
  CTA or website link. If the reader wants to find it, they will. The disclosure
  ("I work on X") already named it — that's enough. Just end on the insight that
  changed things: "the missing piece was seeing how your résumé actually renders
  in an ATS, instead of just a percentage".
- Write with conviction. You think this actually solved the problem, so say so.

Keeps the comment from being removed (both of these are load-bearing):
- Say you work there, once, in passing: "i work on X" or "full disclosure, i'm on the
  X team". Reddit removes undisclosed promotion and bans the account, and in the US
  an undisclosed material connection is an FTC violation. One clause is enough.
- Only claim what the product actually does. Invented features, pricing, or results
  get fact-checked in the replies and the thread turns on you.

Numbers persuade, so use them, but never guess one. When a figure would make a
sentence land and you have not been given it, write a bracketed placeholder for the
person posting to fill in: "[X]% more callbacks", "went from [X] applications a week
to [Y]", "[X] people have run a résumé through it". They know their real numbers and
will substitute them before posting. A placeholder is always better than either
omitting the claim or inventing a figure.

Style: sound like a person who is enthusiastic about something they built, not like a
press release. Contractions, plain words, no headers, no bullet lists. Two or three
short paragraphs at most.

Never use a dash as punctuation. No em dashes, no en dashes, no " - " between clauses.
They are the clearest tell that a comment was written by an AI, and readers on Reddit
notice. Use a full stop, a comma, or a colon instead. Hyphens inside a normal compound
word ("two-column", "link-in-bio") are fine and expected.

If a previous draft is provided, write a genuinely different take: different opening,
different angle, different length. Do not paraphrase it.

Return only the comment text. No preamble, no quotes around it.`

function buildPrompt(input: DraftInput) {
  const { brand, lead, instruction, previousDraft } = input

  const brandLines = [
    `Name: ${brand.name}`,
    brand.description ? `What it does: ${brand.description}` : null,
    brand.voice ? `Voice notes: ${brand.voice}` : null,
    brand.competitors?.length ? `Competitors: ${brand.competitors.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const threadLines = [
    `Subreddit: r/${lead.subreddit ?? 'unknown'}`,
    `Title: ${lead.title ?? '(no title)'}`,
    lead.body ? `Body:\n${lead.body.slice(0, 4000)}` : 'Body: (link post, no text)',
  ].filter(Boolean).join('\n')

  return [
    `<brand>\n${brandLines}\n</brand>`,
    `<thread>\n${threadLines}\n</thread>`,
    previousDraft ? `<previous_draft>\n${previousDraft.slice(0, 2000)}\n</previous_draft>` : null,
    instruction ? `<instruction>\n${instruction}\n</instruction>` : null,
    'Write the comment.',
  ].filter(Boolean).join('\n\n')
}

export async function generateReplyDraft(input: DraftInput, apiKey?: string) {
  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Set QWEN_API_KEY to generate drafts.',
    })
  }

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
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: buildPrompt(input) },
        ],
      },
      timeout: 120_000,
    }) as {
      choices: Array<{ message: { content: string } }>
      model: string
    }

    if (!response.choices?.[0]?.message?.content) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Empty draft returned.',
      })
    }

    const draft = response.choices[0].message.content.trim()

    return { draft, model: response.model || MODEL }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Draft generation failed: ${(error as Error).message}`,
    })
  }
}
