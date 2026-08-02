<template>
  <div class="min-h-screen bg-void">
    <a href="#main" class="skip-link">Skip to content</a>
    <header class="sticky top-0 z-10 border-b border-line/60 bg-void/85 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div class="flex items-center gap-6">
          <NuxtLink to="/app" class="flex items-center gap-2.5">
            <RadarMark class="h-6 w-6" />
            <span class="font-semibold tracking-tight">RedIntelli</span>
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
          <span v-if="org" class="chip hidden sm:inline-flex">{{ org.name }}</span>

          <span
            v-if="showQuota"
            class="chip"
            :class="quotaExhausted ? 'border-warn/50 text-warn' : ''"
            :title="quotaTitle"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3 opacity-70" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 4.5V8l2.5 1.5" stroke-linecap="round" />
            </svg>
            <span class="font-mono">{{ quota.remaining }}</span>
            <span class="text-mute">/ {{ quota.limit }}</span>
            <span class="hidden sm:inline">scans</span>
            <span class="sr-only">left today, resets {{ quotaResetsIn }}</span>
          </span>

          <NuxtLink
            v-if="showSeats"
            to="/app/settings"
            class="chip"
            :class="seatsFull ? 'border-warn/50 text-warn' : 'hover:border-line-2'"
            :title="`${members.length} of ${maxMembers} seats used — manage team in Settings`"
          >
            <svg viewBox="0 0 16 16" class="h-3 w-3 opacity-70" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <circle cx="6" cy="5.5" r="2" />
              <path d="M2.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke-linecap="round" />
              <circle cx="11.5" cy="6" r="1.5" />
              <path d="M10 9.8c1.6.2 2.8 1.5 2.8 3.2" stroke-linecap="round" />
            </svg>
            <span class="font-mono">{{ members.length }}</span>
            <span class="text-mute">/ {{ maxMembers }}</span>
            <span class="sr-only">seats used — open Settings to manage the team</span>
          </NuxtLink>

          <button class="btn-quiet" @click="signOut">Sign out</button>
        </div>
      </div>
    </header>

    <main id="main" class="mx-auto max-w-6xl px-6 py-8">
      <slot />
    </main>
  </div>
</template>

<script>
export default {
  setup() {
    const config = useRuntimeConfig()
    useHead({ meta: [{ name: 'theme-color', content: '#08090b' }] })
    const { org } = useWorkspace()
    const { quota, exhausted, load, resetsIn } = useScanQuota()
    const { members, load: loadTeam } = useTeam()
    return {
      localMode: config.public.localMode,
      supabase: config.public.localMode ? null : useSupabaseClient(),
      route: useRoute(),
      org,
      quota,
      quotaExhausted: exhausted,
      loadQuota: load,
      quotaResetsInFn: resetsIn,
      members,
      loadTeam,
      maxMembers: config.public.maxOrgMembers,
    }
  },

  data() {
    return {
      links: [
        { to: '/app/dashboard', label: 'Dashboard' },
        { to: '/app/inbox', label: 'Inbox' },
        { to: '/app', label: 'Setup' },
      ],
      // Recomputed on quota change so the tooltip doesn't go stale mid-session.
      quotaResetsIn: '',
    }
  },

  computed: {
    // Admins have no allowance to report, and local mode has no quota at all.
    showQuota() {
      return Boolean(this.quota && !this.quota.unlimited)
    },

    quotaTitle() {
      if (!this.showQuota) return ''
      return this.quotaExhausted
        ? `Daily scan limit reached. Resets ${this.quotaResetsIn}.`
        : `${this.quota.remaining} of ${this.quota.limit} scans left today. Resets ${this.quotaResetsIn}.`
    },

    // Local mode has no team concept, and an empty list before the first
    // load would otherwise flash a misleading "0 / 3" badge.
    showSeats() {
      return !this.localMode && this.members.length > 0
    },

    seatsFull() {
      return this.members.length >= this.maxMembers
    },
  },

  watch: {
    quota: {
      immediate: true,
      handler() {
        this.quotaResetsIn = this.quotaResetsInFn()
      },
    },
  },

  mounted() {
    if (!this.localMode) {
      this.loadQuota()
      this.loadTeam()
    }
  },

  methods: {
    isActive(path) {
      return path === '/app' ? this.route.path === '/app' : this.route.path.startsWith(path)
    },

    async signOut() {
      if (this.localMode) {
        await $fetch('/api/auth/logout', { method: 'POST' })
      } else {
        await this.supabase.auth.signOut()
      }
      await navigateTo('/')
    },
  },
}
</script>
