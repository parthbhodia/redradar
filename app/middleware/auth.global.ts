/**
 * Gates the dashboard. Global rather than per-page so pages can stay plain
 * Options API components without a `definePageMeta` block.
 */
export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  if (to.path.startsWith('/app') && !user.value) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }

  if (to.path === '/login' && user.value) {
    return navigateTo('/app')
  }
})
