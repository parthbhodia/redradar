import type { DraftRequest, DraftResponse } from '#shared/types'
import { requireUserClient } from '../utils/guard'
import { generateReplyDraft } from '../utils/llm'

export default defineEventHandler(async (event): Promise<DraftResponse> => {
  const body = await readBody<DraftRequest>(event)
  if (!body?.leadId) {
    throw createError({ statusCode: 400, statusMessage: 'leadId is required.' })
  }

  const { anthropicApiKey } = useRuntimeConfig(event)
  if (!anthropicApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'ANTHROPIC_API_KEY is not configured.' })
  }

  const { client } = await requireUserClient(event)

  // RLS scopes this to leads in the caller's orgs, so a missing row is a 404
  // whether it doesn't exist or isn't theirs.
  const { data: lead, error } = await client
    .from('leads')
    .select('id, title, body, subreddit, url, matched_keyword, campaign_id, campaigns(brands(name, tagline, description, voice, competitors))')
    .eq('id', body.leadId)
    .single()

  if (error || !lead) {
    throw createError({ statusCode: 404, statusMessage: 'Lead not found.' })
  }

  const campaign = Array.isArray(lead.campaigns) ? lead.campaigns[0] : lead.campaigns
  const brand = campaign && (Array.isArray(campaign.brands) ? campaign.brands[0] : campaign.brands)

  if (!brand) {
    throw createError({ statusCode: 409, statusMessage: 'Lead is not attached to a brand.' })
  }

  const { draft, model } = await generateReplyDraft(
    {
      brand,
      lead,
      instruction: body.instruction,
    },
    anthropicApiKey,
  )

  const { error: updateError } = await client
    .from('leads')
    .update({ reply_draft: draft })
    .eq('id', lead.id)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: `Could not save draft: ${updateError.message}` })
  }

  return { draft, model }
})
