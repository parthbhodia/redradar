/**
 * Gates the dashboard. Global rather than per-page so pages can stay plain
 * Options API components without a `definePageMeta` block.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig()

  // ?preview=1 lets a signed-in user look at /login without being bounced,
  // e.g. while iterating on the design.
  const previewing = to.path === '/login' && to.query.preview === '1'
  if (previewing) return

  if (config.public.localMode) {
    const session = await $fetch<{ user: { id: string } | null }>('/api/session')
    if (to.path.startsWith('/app') && !session.user) {
      return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
    }
    if (to.path === '/login' && session.user) {
      const next = typeof to.query.next === 'string' ? to.query.next : '/app'
      return navigateTo(next.startsWith('/') ? next : '/app')
    }
    return
  }

  const user = useSupabaseUser()

  if (to.path.startsWith('/app') && !user.value) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }

  if (to.path === '/login' && user.value) {
    const next = typeof to.query.next === 'string' ? to.query.next : '/app'
    return navigateTo(next.startsWith('/') ? next : '/app')
  }
})
