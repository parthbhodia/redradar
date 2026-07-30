import { setLocalSession } from '../../utils/guard'
import { ensureLocalUser, isLocalMode } from '../../utils/local-db'

export default defineEventHandler(async (event) => {
  if (!isLocalMode()) {
    throw createError({ statusCode: 404, statusMessage: 'Local auth is disabled.' })
  }

  const body = await readBody<{ email?: string }>(event)
  const email = (body?.email || 'dogfood@cueful.bio').trim().toLowerCase()
  if (!email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email required.' })
  }

  const user = ensureLocalUser(email)
  setLocalSession(event, user.id)

  return { id: user.id, email: user.email }
})
