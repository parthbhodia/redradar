<template>
  <div class="space-y-6">
    <!-- Greeting + pulse -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ greeting }}, {{ greetingName }}
        </h1>
        <p class="mt-1 text-sm text-mute">{{ pulse }}</p>
      </div>

      <NuxtLink to="/app/analytics" class="btn-quiet">Analytics →</NuxtLink>
    </div>

    <p v-if="error" class="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
      {{ error }}
    </p>

    <p v-if="loading" class="text-sm text-mute">Loading your work…</p>

    <!-- Nothing scanned yet -->
    <div v-else-if="!leads.length" class="card">
      <h2 class="font-medium">Nothing to work on yet</h2>
      <p class="mt-1 mb-4 text-sm text-mute">
        Add keywords and run a scan. Leads land here the moment they come back.
      </p>
      <NuxtLink to="/app" class="btn-primary">Go to setup</NuxtLink>
    </div>

    <template v-else>
      <!-- Brand filter -->
      <div v-if="brands.length > 1" class="flex flex-wrap gap-2">
        <button
          class="chip"
          :class="brandFilter === 'all' ? 'border-signal text-signal' : 'hover:border-line-2'"
          @click="brandFilter = 'all'"
        >
          All brands
        </button>
        <button
          v-for="brand in brands"
          :key="brand.id"
          class="chip"
          :class="brandFilter === brand.id ? 'border-signal text-signal' : 'hover:border-line-2'"
          @click="brandFilter = brand.id"
        >
          {{ brand.name }}
        </button>
      </div>

      <!-- 1. Your queue -->
      <section class="card">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="font-medium">Needs you</h2>
          <span v-if="myQueue.length" class="chip">{{ myQueue.length }}</span>
        </div>
        <p class="mb-4 text-sm text-mute">
          Threads you've claimed, and replies that grew after you posted.
        </p>

        <div v-if="!myQueue.length" class="rounded-lg border border-line bg-panel-2 px-3 py-6 text-center text-sm text-mute">
          You're all caught up. Grab something below.
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="item in myQueue"
            :key="item.lead.id"
            class="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5 transition-colors hover:border-line-2"
            role="button"
            tabindex="0"
            @click="openLead(item.lead)"
            @keydown.enter="openLead(item.lead)"
          >
            <div class="min-w-0">
              <p class="truncate text-sm group-hover:text-signal">{{ item.lead.title || '(untitled thread)' }}</p>
              <p class="mt-0.5 truncate text-xs text-mute">
                <span v-if="brands.length > 1" class="text-fg/70">{{ brandNameOf(item.lead) }} · </span>
                r/{{ item.lead.subreddit }}
                <span v-if="item.lead.matched_keyword"> · {{ item.lead.matched_keyword }}</span>
              </p>
              <p class="mt-1 flex items-center gap-1.5 text-xs" :class="item.tone">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="item.dot" aria-hidden="true" />
                {{ item.reason }}
              </p>
            </div>
            <span class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums" :class="scoreClass(item.lead.score)">
              {{ item.lead.score }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 2. Up for grabs -->
      <section class="card">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="font-medium">Up for grabs</h2>
          <NuxtLink to="/app/inbox" class="btn-quiet">Open inbox</NuxtLink>
        </div>
        <p class="mb-4 text-sm text-mute">
          Unclaimed and worth answering, freshest intent first. These decay fast.
        </p>

        <div v-if="!upForGrabs.length" class="rounded-lg border border-line bg-panel-2 px-3 py-6 text-center text-sm text-mute">
          Nothing unclaimed above the bar right now.
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="lead in upForGrabs"
            :key="lead.id"
            class="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5 transition-colors hover:border-line-2"
            role="button"
            tabindex="0"
            @click="openLead(lead)"
            @keydown.enter="openLead(lead)"
          >
            <div class="min-w-0">
              <p class="truncate text-sm group-hover:text-signal">{{ lead.title || '(untitled thread)' }}</p>
              <p class="mt-0.5 truncate text-xs text-mute">
                <span v-if="brands.length > 1" class="text-fg/70">{{ brandNameOf(lead) }} · </span>
                r/{{ lead.subreddit }}
                <span v-if="lead.matched_keyword"> · {{ lead.matched_keyword }}</span>
                · {{ timeAgo(lead.posted_at || lead.discovered_at) }}
              </p>
              <p v-if="isDecaying(lead)" class="mt-1 flex items-center gap-1.5 text-xs text-warn">
                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
                Getting old — grab it now or let it go
              </p>
            </div>
            <span class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums" :class="scoreClass(lead.score)">
              {{ lead.score }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 3. Team snapshot -->
      <section v-if="teamSnapshot.length" class="card">
        <h2 class="font-medium">Who's on what</h2>
        <p class="mt-1 mb-4 text-sm text-mute">
          Claimed and in progress right now, so nobody doubles up.
        </p>

        <ul class="space-y-2">
          <li
            v-for="row in teamSnapshot"
            :key="row.name"
            class="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
          >
            <span :class="row.isMe ? 'text-signal' : ''">{{ row.name }}{{ row.isMe ? ' (you)' : '' }}</span>
            <span class="font-mono text-xs tabular-nums text-mute">{{ row.count }} in progress</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'Dashboard · RedIntelli' })
    const config = useRuntimeConfig()
    const workspace = useWorkspace()
    const { members, load: loadTeam } = useTeam()
    return {
      localMode: config.public.localMode,
      me: useMe(),
      members,
      loadTeam,
      ...workspace,
    }
  },

  data() {
    return {
      leads: [],
      loading: true,
      error: '',
      brandFilter: 'all',
      // Local mode has no useMe(); the server hands us identity with the leads.
      workspaceMe: null,
    }
  },

  computed: {
    myId() {
      return this.localMode ? this.workspaceMe?.id ?? null : this.me?.id ?? null
    },

    greeting() {
      const h = new Date().getHours()
      if (h < 12) return 'Good morning'
      if (h < 18) return 'Good afternoon'
      return 'Good evening'
    },

    greetingName() {
      if (this.localMode) return this.firstName(this.workspaceMe?.email)
      const member = this.members.find(m => m.user_id === this.myId)
      return this.firstName(member?.profiles?.display_name || this.me?.email)
    },

    // Leads scoped to the brand filter. Everything below reads this, not `leads`.
    scoped() {
      if (this.brandFilter === 'all') return this.leads
      return this.leads.filter(l => this.brandIdOf(l) === this.brandFilter)
    },

    pulse() {
      const need = this.myQueue.length
      const grab = this.upForGrabs.length
      if (!need && !grab) return "Nothing needs you right now. Enjoy the quiet."
      const parts = []
      if (need) parts.push(`${need} thread${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} you`)
      if (grab) parts.push(`${grab} fresh lead${grab === 1 ? '' : 's'} worth grabbing`)
      return `You've got ${parts.join(' and ')}.`
    },

    /**
     * My open work, most urgent first. Two things belong here: threads I
     * claimed but haven't replied to (an aging claim is the worst state — it
     * blocks teammates AND stalls), and threads I replied to that have since
     * grown new replies (the conversation is live).
     */
    myQueue() {
      const items = []
      for (const lead of this.scoped) {
        if (!this.isMine(lead)) continue

        if (lead.status === 'queued') {
          const claimH = this.hoursSince(lead.claimed_at || lead.updated_at)
          if (claimH > 24) {
            items.push({
              lead,
              urgency: 0,
              reason: `Claimed ${this.timeAgo(lead.claimed_at || lead.updated_at)}, still no reply`,
              tone: 'text-warn',
              dot: 'bg-warn',
            })
          } else {
            items.push({
              lead,
              urgency: 2,
              reason: `Claimed ${this.timeAgo(lead.claimed_at || lead.updated_at)}`,
              tone: 'text-mute',
              dot: 'bg-signal',
            })
          }
        } else if (lead.status === 'replied') {
          const n = this.newActivity(lead)
          if (n > 0) {
            items.push({
              lead,
              urgency: 1,
              reason: `+${n} ${n === 1 ? 'reply' : 'replies'} since you posted`,
              tone: 'text-signal-soft',
              dot: 'bg-signal',
            })
          }
        }
      }

      return items.sort((a, b) => a.urgency - b.urgency || (b.lead.score ?? 0) - (a.lead.score ?? 0))
    },

    /**
     * Unclaimed, still new, and above the "worth answering" line. Ranked by
     * score weighted for freshness — the whole product thesis is that Reddit
     * threads decay fast, so a solid-but-fresh lead outranks a slightly higher
     * one from last week.
     */
    upForGrabs() {
      return this.scoped
        .filter(l => l.status === 'new' && !this.isClaimed(l) && (l.score ?? 0) >= 40)
        .sort((a, b) => this.priority(b) - this.priority(a))
        .slice(0, 8)
    },

    /**
     * Cloud-only, and only with real teammates: who's actively holding threads.
     * Local mode has no team, and solo workspaces don't need it.
     */
    teamSnapshot() {
      if (this.localMode || this.members.length < 2) return []

      const counts = new Map()
      for (const lead of this.scoped) {
        if (lead.status !== 'queued' || !lead.assigned_to) continue
        counts.set(lead.assigned_to, (counts.get(lead.assigned_to) ?? 0) + 1)
      }
      if (!counts.size) return []

      const nameById = new Map(
        this.members.map(m => [m.user_id, m.profiles?.display_name || this.firstName(m.profiles?.email)]),
      )

      return [...counts.entries()]
        .map(([id, count]) => ({
          name: nameById.get(id) || 'Someone',
          count,
          isMe: id === this.myId,
        }))
        .sort((a, b) => b.count - a.count)
    },
  },

  watch: {
    // Campaigns arrive from the shared workspace load; Supabase leads are keyed
    // off them, so (re)load once they're present.
    campaigns() {
      if (!this.localMode && this.campaigns.length && !this.leads.length) this.loadWork()
    },
  },

  async mounted() {
    try {
      await this.load()
      if (!this.localMode) await this.loadTeam()
      await this.loadWork()
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
    }
  },

  methods: {
    // --- identity / labels -------------------------------------------------
    firstName(raw) {
      if (!raw) return 'there'
      const base = raw.includes('@') ? raw.split('@')[0] : raw
      const token = base.split(/[.\-_0-9]+/).filter(Boolean)[0] || base
      return token.charAt(0).toUpperCase() + token.slice(1)
    },

    brandIdOf(lead) {
      if (lead.brand_id) return lead.brand_id
      const c = this.campaigns.find(x => x.id === lead.campaign_id)
      return c?.brand_id ?? null
    },

    brandNameOf(lead) {
      if (lead.brand_name) return lead.brand_name
      const b = this.brands.find(x => x.id === this.brandIdOf(lead))
      return b?.name ?? '—'
    },

    // --- claim state (mode-agnostic) ---------------------------------------
    assigneeOf(lead) {
      return this.localMode ? lead.claimed_by : lead.assigned_to
    },

    isMine(lead) {
      return Boolean(this.myId) && this.assigneeOf(lead) === this.myId
    },

    isClaimed(lead) {
      return Boolean(this.assigneeOf(lead))
    },

    newActivity(lead) {
      if (lead.status !== 'replied') return 0
      if (lead.num_comments == null || lead.replied_num_comments == null) return 0
      const d = lead.num_comments - lead.replied_num_comments
      return d >= 2 ? d : 0
    },

    // --- ranking -----------------------------------------------------------
    priority(lead) {
      const ageH = this.hoursSince(lead.posted_at || lead.discovered_at)
      const fresh = ageH <= 24 ? 1 : ageH <= 72 ? 0.85 : ageH <= 168 ? 0.65 : 0.4
      return (lead.score ?? 0) * fresh
    },

    isDecaying(lead) {
      return this.hoursSince(lead.posted_at || lead.discovered_at) > 72
    },

    scoreClass(score) {
      if ((score ?? 0) >= 70) return 'bg-signal/15 text-signal'
      if ((score ?? 0) >= 40) return 'bg-warn/10 text-warn'
      return 'bg-panel text-mute'
    },

    // --- time --------------------------------------------------------------
    hoursSince(stamp) {
      if (!stamp) return Number.POSITIVE_INFINITY
      return (Date.now() - new Date(stamp).getTime()) / 3_600_000
    },

    timeAgo(stamp) {
      if (!stamp) return 'unknown'
      const hours = this.hoursSince(stamp)
      if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`
      if (hours < 24) return `${Math.round(hours)}h ago`
      const days = Math.round(hours / 24)
      return days === 1 ? 'yesterday' : `${days}d ago`
    },

    // --- navigation --------------------------------------------------------
    // Point the inbox at this lead's campaign before we go, so it opens on the
    // right one. activeCampaignId is shared workspace state.
    openLead(lead) {
      this.activeCampaignId = lead.campaign_id
      navigateTo('/app/inbox')
    },

    // --- data --------------------------------------------------------------
    async loadWork() {
      try {
        if (this.localMode) {
          const data = await $fetch('/api/workspace', { query: { allLeads: '1' } })
          this.leads = data.leads ?? []
          this.workspaceMe = data.me ?? null
          return
        }

        const campaignIds = this.campaigns.map(c => c.id)
        if (!campaignIds.length) {
          this.leads = []
          return
        }

        let { data, error } = await this.supabase
          .from('leads')
          .select('*, assigned:profiles!leads_assigned_to_fkey(id, display_name)')
          .in('campaign_id', campaignIds)
          .order('score', { ascending: false })

        // Pre-0002 there's no profiles table and the embed 400s; fall back so
        // the dashboard still works, just without claimer names.
        if (error && /relationship|schema cache/i.test(error.message)) {
          ({ data, error } = await this.supabase
            .from('leads')
            .select('*')
            .in('campaign_id', campaignIds)
            .order('score', { ascending: false }))
        }

        if (error) throw new Error(error.message)
        this.leads = data ?? []
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      }
    },
  },
}
</script>
