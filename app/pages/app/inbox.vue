<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p class="mt-1 text-sm text-mute">Scored threads, highest intent first.</p>
      </div>

      <select v-if="campaigns.length > 1" v-model="activeCampaignId" class="input max-w-56">
        <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
          {{ campaign.name }}
        </option>
      </select>
    </div>

    <p v-if="error" class="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
      {{ error }}
    </p>

    <!-- Carried over from the scan that redirected here, so the count isn't lost. -->
    <div
      v-if="lastScan"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
    >
      <span>
        <span class="font-mono text-signal">{{ lastScan.inserted }}</span> new
        <span v-if="lastScan.updated" class="text-mute">
          · <span class="font-mono">{{ lastScan.updated }}</span> refreshed
        </span>
        <span class="text-mute">
          · {{ lastScan.scanned }} threads across {{ lastScan.keywords }} keywords
        </span>
      </span>
      <button class="btn-quiet" @click="lastScan = null">Dismiss</button>
    </div>

    <div v-if="activeCampaignId" class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="rounded-lg px-3 py-1.5 text-sm capitalize transition-colors"
        :class="tab.value === filter ? 'bg-panel-2 text-fg' : 'text-mute hover:text-fg'"
        @click="filter = tab.value"
      >
        {{ tab.label }}
        <span class="ml-1 font-mono text-xs text-mute">{{ tab.count }}</span>
      </button>
    </div>

    <p v-if="loading" class="text-sm text-mute">Loading leads…</p>

    <div v-else-if="!activeCampaignId" class="card text-sm text-mute">
      No campaign yet. <NuxtLink to="/app" class="text-signal hover:underline">Set one up</NuxtLink> first.
    </div>

    <div v-else-if="!visible.length" class="card text-sm text-mute">
      <template v-if="leads.length">Nothing with that status yet.</template>
      <template v-else>
        No leads yet. <NuxtLink to="/app" class="text-signal hover:underline">Run a scan</NuxtLink> to fill this up.
      </template>
    </div>

    <div v-else class="space-y-4">
      <LeadCard
        v-for="lead in visible"
        :key="lead.id"
        :lead="lead"
        @update="applyUpdate"
      />
    </div>
  </div>
</template>

<script>
import { LEAD_STATUSES } from '#shared/types'

export default {
  setup() {
    useHead({ title: 'Inbox · RedIntelli' })
    const config = useRuntimeConfig()
    const workspace = useWorkspace()
    return {
      localMode: config.public.localMode,
      lastScan: useState('rr:lastScan', () => null),
      ...workspace,
    }
  },

  data() {
    return {
      leads: [],
      loading: true,
      error: '',
      filter: 'all',
    }
  },

  computed: {
    visible() {
      const rows = this.filter === 'all'
        ? this.leads
        : this.leads.filter(lead => lead.status === this.filter)

      return [...rows].sort((a, b) => b.score - a.score)
    },

    tabs() {
      return [
        { value: 'all', label: 'all', count: this.leads.length },
        ...LEAD_STATUSES.map(status => ({
          value: status,
          label: status,
          count: this.leads.filter(lead => lead.status === status).length,
        })),
      ]
    },
  },

  watch: {
    activeCampaignId(id) {
      if (id) this.loadLeads()
    },
  },

  async mounted() {
    try {
      await this.load()
      if (this.activeCampaignId) await this.loadLeads()
    } catch (e) {
      this.error = e.message
    } finally {
      this.loading = false
    }
  },

  methods: {
    async loadLeads() {
      this.loading = true

      try {
        if (this.localMode) {
          const data = await $fetch('/api/workspace', {
            query: { leads: '1', campaignId: this.activeCampaignId },
          })
          this.leads = data.leads ?? []
        } else {
          let { data, error } = await this.supabase
            .from('leads')
            .select('*, assigned:profiles!leads_assigned_to_fkey(id, display_name), lead_drafts(user_id, body, updated_at, profiles(display_name))')
            .eq('campaign_id', this.activeCampaignId)
            .order('score', { ascending: false })

          // Before migration 0002, profiles/lead_drafts don't exist and the
          // embed 400s. Fall back to a plain read so the inbox still works.
          if (error && /relationship|schema cache/i.test(error.message)) {
            ({ data, error } = await this.supabase
              .from('leads')
              .select('*')
              .eq('campaign_id', this.activeCampaignId)
              .order('score', { ascending: false }))
          }

          if (error) this.error = error.message
          else this.leads = data ?? []

          await this.attachSiblingClaims()
        }
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      }

      this.loading = false
    },

    /**
     * The same Reddit thread can exist as a lead row in several campaigns, and
     * claiming is per-row. Without this, a thread a teammate is already working
     * in another campaign looks unclaimed here.
     */
    async attachSiblingClaims() {
      if (!this.leads.length) return

      const { data, error } = await this.supabase
        .from('lead_thread_claims')
        .select('lead_id, sibling_campaign_name, sibling_assigned_name, sibling_status')
        .in('lead_id', this.leads.map(l => l.id))

      // Pre-0004 the view doesn't exist; the inbox is still fully usable.
      if (error || !data?.length) return

      const byLead = new Map(data.map(row => [row.lead_id, row]))
      for (const lead of this.leads) {
        const sibling = byLead.get(lead.id)
        if (sibling) lead.claimed_elsewhere = sibling
      }
    },

    applyUpdate({ id, patch }) {
      const lead = this.leads.find(l => l.id === id)
      if (lead) Object.assign(lead, patch)
    },
  },
}
</script>
