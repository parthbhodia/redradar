import { requireUserClient } from '../utils/guard'
import { suggestBrandProfile } from '../utils/brand-suggest'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, hint?: string }>(event)
  const name = body?.name?.trim()

  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'A brand name is required.' })
  }

  const { qwenApiKey } = useRuntimeConfig(event)
  if (!qwenApiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Set QWEN_API_KEY to use AI fill.',
    })
  }

  // Gate on a session so this isn't an open relay to the model, but the
  // suggestion itself touches no rows — nothing to authorize beyond that.
  await requireUserClient(event)

  return await suggestBrandProfile({ name, hint: body?.hint }, qwenApiKey)
})
