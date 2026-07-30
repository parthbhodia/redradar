<template>
  <div class="min-h-screen bg-void">
    <header class="sticky top-0 z-10 border-b border-line/60 bg-void/85 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div class="flex items-center gap-6">
          <NuxtLink to="/app" class="flex items-center gap-2.5">
            <RadarMark class="h-6 w-6" />
            <span class="font-semibold tracking-tight">RedRadar</span>
          </NuxtLink>

          <nav class="flex items-center gap-1">
            <NuxtLink
              v-for="link in links"
              :key="link.to"
              :to="link.to"
              class="rounded-lg px-3 py-1.5 text-sm transition-colors"
              :class="isActive(link.to) ? 'bg-panel-2 text-fg' : 'text-mute hover:text-fg'"
            >
              {{ link.label }}
            </NuxtLink>
          </nav>
        </div>

        <div class="flex items-center gap-3">
          <span v-if="org" class="chip">{{ org.name }}</span>
          <button class="btn-quiet" @click="signOut">Sign out</button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <slot />
    </main>
  </div>
</template>

<script>
export default {
  setup() {
    const { org } = useWorkspace()
    return { supabase: useSupabaseClient(), route: useRoute(), org }
  },

  data() {
    return {
      links: [
        { to: '/app', label: 'Setup' },
        { to: '/app/inbox', label: 'Inbox' },
      ],
    }
  },

  methods: {
    isActive(path) {
      return path === '/app' ? this.route.path === '/app' : this.route.path.startsWith(path)
    },

    async signOut() {
      await this.supabase.auth.signOut()
      await navigateTo('/')
    },
  },
}
</script>
