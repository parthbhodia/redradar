import type { DraftRequest, DraftResponse } from '#shared/types'
import { requireUserClient } from '../utils/guard'
import { generateReplyDraft } from '../utils/llm'
import { getCampaignWithBrand, getLead, updateLead } from '../utils/local-db'

export default defineEventHandler(async (event): Promise<DraftResponse> => {
  const body = await readBody<DraftRequest>(event)
  if (!body?.leadId) {
    throw createError({ statusCode: 400, statusMessage: 'leadId is required.' })
  }

  const { qwenApiKey } = useRuntimeConfig(event)
  const { client, local, user } = await requireUserClient(event)

  if (local) {
    const lead = getLead(body.leadId)
    if (!lead) {
      throw createError({ statusCode: 404, statusMessage: 'Lead not found.' })
    }
    const row = getCampaignWithBrand(lead.campaign_id)
    if (!row) {
      throw createError({ statusCode: 409, statusMessage: 'Lead is not attached to a brand.' })
    }

    const { draft, model } = await generateReplyDraft(
      {
        brand: row.brand,
        lead,
        instruction: body.instruction,
        previousDraft: lead.reply_draft || undefined,
      },
      qwenApiKey || undefined,
    )

    updateLead(lead.id, { reply_draft: draft })
    return { draft, model }
  }

  const { data: lead, error } = await client!
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

  // The caller's current draft, if any, so Regenerate takes a different angle
  // instead of converging on the same text.
  const { data: existingDraft } = await client!
    .from('lead_drafts')
    .select('body')
    .eq('lead_id', lead.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { draft, model } = await generateReplyDraft(
    {
      brand,
      lead,
      instruction: body.instruction,
      previousDraft: existingDraft?.body || undefined,
    },
    qwenApiKey || undefined,
  )

  // The draft is the caller's, not the lead's: per-user rows mean two
  // teammates can each work a version without overwriting the other.
  const { error: upsertError } = await client!
    .from('lead_drafts')
    .upsert(
      { lead_id: lead.id, user_id: user.id, body: draft },
      { onConflict: 'lead_id,user_id' },
    )

  if (upsertError) {
    throw createError({ statusCode: 500, statusMessage: `Could not save draft: ${upsertError.message}` })
  }

  return { draft, model }
})
