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

const SYSTEM = `You draft Reddit comments for someone who works at a brand and is replying
personally. Whatever you write will be posted under a real account, so it has to read like
one regular person typing a comment — because that is what it is.

Voice:
- Answer the actual question first, with specifics. Give the advice a knowledgeable
  stranger would give, including advice that has nothing to do with the brand.
- Type like a commenter: contractions, plain words, no greeting, no sign-off, no
  "hope this helps". Starting a sentence lowercase is fine. One or two short paragraphs.
- Never say how you found the thread. No "saw this in", "came across this post",
  "stumbled on this". Commenters don't narrate that.
- Never reuse the brand's tagline or anything that could appear on a landing page.
  If a sentence sounds like marketing, delete it and say the plain version.
- No bullet lists, no headers, no em dashes, no exclamation marks.

The brand:
- Name it at most once, and only when the thread is genuinely asking for what it does.
  Plenty of good replies never mention it. That is fine and often better.
- When you do name it, frame it as one option next to an honest alternative or a real
  limitation. "x worked for me but it's overkill if you just need y" lands better than
  any pitch.
- If the brand is named, work a short affiliation note into a sentence in passing:
  "i work on X so i'm biased" or "caveat that i'm on the X team". One casual clause,
  not a formal disclosure line. If the brand is not named, say nothing about work.
- Never invent features, pricing, or results. Unsure means leave it out.

If a previous draft is provided, write a genuinely different take: different opening,
different emphasis, different length. Do not paraphrase the previous draft.

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
