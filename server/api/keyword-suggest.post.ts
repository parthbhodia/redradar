import { requireCampaign } from '../utils/guard'
import { listKeywords } from '../utils/local-db'
import { suggestKeywords } from '../utils/keyword-suggest'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ campaignId?: string }>(event)
  if (!body?.campaignId) {
    throw createError({ statusCode: 400, statusMessage: 'campaignId is required.' })
  }

  const { qwenApiKey, qwenBaseUrl } = useRuntimeConfig(event)
  if (!qwenApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Set QWEN_API_KEY to use AI suggestions.' })
  }

  const { client, campaign, brand, local } = await requireCampaign(event, body.campaignId)

  let existing: string[]
  if (local) {
    existing = listKeywords(campaign.id).map(k => k.phrase)
  } else {
    const { data, error } = await client!
      .from('keywords')
      .select('phrase')
      .eq('campaign_id', campaign.id)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    existing = (data ?? []).map((row: { phrase: string }) => row.phrase)
  }

  const keywords = await suggestKeywords({ brand, existing }, qwenApiKey, qwenBaseUrl)
  return { keywords }
})
