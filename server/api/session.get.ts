import { getCookie } from 'h3'
import { LOCAL_SESSION_COOKIE } from '../utils/guard'
import { getLocalUser, isLocalMode } from '../utils/local-db'

export default defineEventHandler((event) => {
  return {
    local: isLocalMode(),
    user: (() => {
      if (!isLocalMode()) return null
      const id = getCookie(event, LOCAL_SESSION_COOKIE)
      if (!id) return null
      const user = getLocalUser(id)
      return user ? { id: user.id, email: user.email } : null
    })(),
  }
})
