<template>
  <div class="min-h-screen bg-paper text-ink">
    <a href="#main" class="skip-link">Skip to content</a>
    <header class="sticky top-0 z-20 bg-paper/80 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <RadarMark class="h-7 w-7 text-ink" />
          <span class="text-lg font-semibold tracking-tight">RedIntelli</span>
        </NuxtLink>

        <nav class="flex items-center gap-2">
          <NuxtLink
            v-if="signedIn"
            to="/app/dashboard"
            class="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper"
          >Dashboard</NuxtLink>
          <NuxtLink
            v-else
            to="/login"
            class="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper"
          >Start free</NuxtLink>
        </nav>
      </div>
    </header>

    <main id="main">
      <slot />
    </main>

    <footer class="rule-dashed mt-24">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-ink-soft">
        <span>RedIntelli. Reddit lead discovery with AI reply drafts.</span>
        <nav class="flex flex-wrap items-center gap-5">
          <NuxtLink to="/privacy" class="hover:text-ink">Privacy</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-ink">Terms</NuxtLink>
          <NuxtLink to="/login" class="hover:text-ink">Sign in</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>

<script>
export default {
  setup() {
    const config = useRuntimeConfig()
    // Paints the document itself so overscroll doesn't flash the app's black.
    useHead({
      htmlAttrs: { class: 'paper' },
      meta: [{ name: 'theme-color', content: '#f8f7f4' }],
    })
    return {
      localMode: config.public.localMode,
      user: config.public.localMode ? ref(null) : useSupabaseUser(),
    }
  },

  data() {
    return { localUser: null }
  },

  computed: {
    signedIn() {
      return this.localMode ? Boolean(this.localUser) : Boolean(this.user)
    },
  },

  async mounted() {
    if (!this.localMode) return
    try {
      const session = await $fetch('/api/session')
      this.localUser = session.user
    } catch {
      this.localUser = null
    }
  },
}
</script>
