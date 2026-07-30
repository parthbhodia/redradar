import { clearLocalSession } from '../../utils/guard'
import { isLocalMode } from '../../utils/local-db'

export default defineEventHandler(async (event) => {
  if (!isLocalMode()) {
    throw createError({ statusCode: 404, statusMessage: 'Local auth is disabled.' })
  }
  clearLocalSession(event)
  return { ok: true }
})
