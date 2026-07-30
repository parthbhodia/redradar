import Anthropic from '@anthropic-ai/sdk'
import type { Brand, Lead } from '#shared/types'

const MODEL = 'claude-opus-5'

export interface DraftInput {
  brand: Pick<Brand, 'name' | 'tagline' | 'description' | 'voice' | 'competitors'>
  lead: Pick<Lead, 'title' | 'body' | 'subreddit' | 'url' | 'matched_keyword'>
  /** Optional nudge for a regeneration, e.g. "shorter" or "lead with the pricing". */
  instruction?: string
}

const SYSTEM = `You write Reddit replies on behalf of a brand. Reddit punishes marketing, so
the reply has to earn its place in the thread on its own merits.

Rules:
- Answer the person's actual question first. If you can help them without mentioning
  the brand at all, do that — a reply that solves their problem is worth more than a
  mention that gets downvoted.
- Mention the brand only where it is genuinely the right answer, once, in passing, and
  always disclose the affiliation plainly ("I work on X" / "disclosure: I built X").
- No marketing voice. No "game-changer", "seamless", "revolutionize", "leverage",
  "in today's landscape". No exclamation marks. No bulleted feature lists.
- Sound like one person typing a comment: lowercase is fine, contractions are fine,
  short paragraphs, no headers, no markdown formatting beyond the occasional link.
- Acknowledge tradeoffs honestly, including where competitors are the better pick.
  Being useful about the alternatives is what makes the recommendation credible.
- Match the length the thread deserves. Most good replies are 2-5 sentences. A detailed
  technical question can justify more; a quick recommendation request cannot.
- Never invent features, pricing, or benchmarks. If you don't know, don't claim it.

Return only the reply text. No preamble, no "Here's a draft:", no surrounding quotes.`

function buildPrompt(input: DraftInput) {
  const { brand, lead, instruction } = input

  const brandLines = [
    `Name: ${brand.name}`,
    brand.tagline ? `One-liner: ${brand.tagline}` : null,
    brand.description ? `What it does: ${brand.description}` : null,
    brand.voice ? `Voice notes: ${brand.voice}` : null,
    brand.competitors?.length ? `Competitors: ${brand.competitors.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const threadLines = [
    `Subreddit: r/${lead.subreddit ?? 'unknown'}`,
    `Title: ${lead.title ?? '(no title)'}`,
    lead.body ? `Body:\n${lead.body.slice(0, 4000)}` : 'Body: (link post, no text)',
    lead.matched_keyword ? `Matched keyword: ${lead.matched_keyword}` : null,
  ].filter(Boolean).join('\n')

  return [
    `<brand>\n${brandLines}\n</brand>`,
    `<thread>\n${threadLines}\n</thread>`,
    instruction ? `<instruction>\n${instruction}\n</instruction>` : null,
    'Write the reply.',
  ].filter(Boolean).join('\n\n')
}

export async function generateReplyDraft(input: DraftInput, apiKey: string) {
  const client = new Anthropic({ apiKey })

  const response = await client.beta.messages.create({
    model: MODEL,
    // Thinking is on by default on Opus 5 and counts against max_tokens, so the
    // budget is much larger than the few hundred tokens the reply itself needs.
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    // Route safety declines to Anthropic's recommended fallback instead of
    // failing the request.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: buildPrompt(input) }],
  })

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
