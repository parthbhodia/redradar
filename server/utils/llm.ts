import Anthropic from '@anthropic-ai/sdk'
import type { Brand, Lead } from '#shared/types'

const MODEL = 'claude-opus-5'

export interface DraftInput {
  brand: Pick<Brand, 'name' | 'tagline' | 'description' | 'voice' | 'competitors'>
  lead: Pick<Lead, 'title' | 'body' | 'subreddit' | 'url' | 'matched_keyword'>
  /** Optional nudge for a regeneration, e.g. "shorter" or "lead with the pricing". */
  instruction?: string
  /** The caller's current draft, so a regeneration takes a different angle. */
  previousDraft?: string
}

const SYSTEM = `You write Reddit comments for someone who works at a brand and wants the
reader to try it. You are selling. Make the case, name the product, and give them a
reason to act. Neutrality is not the goal.

How to sell in a thread:
- Open on the outcome the reader actually wants, then show how the product delivers it.
  They care about getting the interview, not about your feature list.
- Be concrete. Specifics persuade, vague praise doesn't. Name the exact thing it does
  that solves the exact problem in the post.
- Position against whatever they're using or considering. If the thread names a
  competitor, say plainly where you win.
- Pre-empt the obvious objection in a clause, then keep selling.
- Close with a next step: try it, DM me, check it out. Every comment should have one.
- Write with conviction. You think this is the best answer to their problem, so say so.

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
    // No canned fallback: fake drafts posing as AI output is how nobody notices
    // the pipeline is broken. Fail loudly instead.
    throw createError({
      statusCode: 503,
      statusMessage: 'Set ANTHROPIC_API_KEY to generate drafts.',
    })
  }

  const client = new Anthropic({ apiKey, timeout: 120_000 })

  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      // Thinking is on by default on Opus 5 and shares this budget with the
      // reply text, so it is far larger than the comment itself needs.
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: buildPrompt(input) }],
    })
  } catch (error) {
    // Surface the real reason (bad key, model access, network) to the UI
    // instead of quietly shipping a template.
    throw createError({
      statusCode: 502,
      statusMessage: `Draft generation failed: ${(error as Error).message}`,
    })
  }

  if (response.stop_reason === 'refusal') {
    throw createError({
      statusCode: 422,
      statusMessage: 'The model declined to draft a reply for this thread.',
    })
  }

  const draft = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()

  if (!draft) {
    throw createError({ statusCode: 502, statusMessage: 'Empty draft returned.' })
  }

  return { draft, model: response.model }
}
