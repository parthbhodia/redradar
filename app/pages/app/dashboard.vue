<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p class="mt-1 text-sm text-mute">Where your leads came from and what's still untouched.</p>
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

    <p v-if="loading" class="text-sm text-mute">Loading…</p>

    <div v-else-if="!leads.length" class="card">
      <h2 class="font-medium">No leads yet</h2>
      <p class="mt-1 mb-4 text-sm text-mute">
        Add keywords and run a scan. This page fills in from what comes back.
      </p>
      <NuxtLink to="/app" class="btn-primary">Go to setup</NuxtLink>
    </div>

    <template v-else>
      <!-- KPI row -->
      <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="kpi in kpis" :key="kpi.label" class="rounded-xl border border-line bg-panel p-4">
          <p class="text-xs font-medium tracking-wide text-mute uppercase">{{ kpi.label }}</p>
          <p class="mt-2 font-mono text-2xl tabular-nums" :class="kpi.tone">{{ kpi.value }}</p>
          <p class="mt-1 text-xs text-mute">{{ kpi.hint }}</p>
        </div>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <!-- Keyword performance -->
        <section class="card">
          <h2 class="font-medium">Keyword performance</h2>
          <p class="mt-1 mb-4 text-sm text-mute">
            Sorted by leads found. Avg score tells you which phrases are pulling their weight.
          </p>

          <table class="w-full text-sm">
            <caption class="sr-only">Leads found and average score per keyword</caption>
            <thead>
              <tr class="text-xs tracking-wide text-mute uppercase">
                <th scope="col" class="pb-2 text-left font-medium">Keyword</th>
                <th scope="col" class="pb-2 text-right font-medium">Leads</th>
                <th scope="col" class="pb-2 text-right font-medium">Avg</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in byKeyword" :key="row.name" class="border-t border-line/60">
                <td class="py-2 pr-3">
                  <span class="block truncate">{{ row.name }}</span>
                  <!-- Bar is decoration; the number beside it carries the value. -->
                  <span class="mt-1 block h-1 rounded-full bg-line" aria-hidden="true">
                    <span
                      class="block h-1 rounded-full"
                      :class="row.avg >= 40 ? 'bg-signal' : 'bg-mute/50'"
                      :style="{ width: `${row.share}%` }"
                    />
                  </span>
                </td>
                <td class="py-2 text-right font-mono tabular-nums">{{ row.count }}</td>
                <td class="py-2 text-right font-mono tabular-nums" :class="row.avg >= 40 ? 'text-signal' : 'text-mute'">
                  {{ row.avg }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Score distribution -->
        <section class="card">
          <h2 class="font-medium">Score distribution</h2>
          <p class="mt-1 mb-4 text-sm text-mute">
            A healthy scan is bottom-heavy. What matters is whether anything reaches the top band.
          </p>

          <ul class="space-y-3">
            <li v-for="band in distribution" :key="band.label" class="flex items-center gap-3">
              <span class="w-16 shrink-0 text-xs text-mute">{{ band.label }}</span>
              <span class="h-6 flex-1 overflow-hidden rounded bg-panel-2">
                <span class="block h-6 rounded" :class="band.tone" :style="{ width: `${band.pct}%` }" />
              </span>
              <span class="w-8 shrink-0 text-right font-mono text-sm tabular-nums">{{ band.count }}</span>
            </li>
          </ul>

          <p class="mt-4 text-xs text-mute">{{ distributionNote }}</p>
        </section>
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
        <!-- Status funnel -->
        <section class="card lg:col-span-1">
          <h2 class="font-medium">Pipeline</h2>
          <p class="mt-1 mb-4 text-sm text-mute">{{ funnelNote }}</p>

          <ul class="space-y-2">
            <li
              v-for="stage in funnel"
              :key="stage.status"
              class="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2"
            >
              <span class="flex items-center gap-2 text-sm capitalize">
                <span class="h-1.5 w-1.5 rounded-full" :class="stage.dot" aria-hidden="true" />
                {{ stage.status }}
              </span>
              <span class="font-mono text-sm tabular-nums" :class="stage.count ? '' : 'text-mute'">
                {{ stage.count }}
              </span>
            </li>
          </ul>
        </section>

        <!-- Top leads -->
        <section class="card lg:col-span-2">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h2 class="font-medium">Highest intent</h2>
            <NuxtLink to="/app/inbox" class="btn-quiet">Open inbox</NuxtLink>
          </div>

          <ul class="space-y-2">
            <li
              v-for="lead in topLeads"
              :key="lead.id"
              class="flex items-start justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2"
            >
              <div class="min-w-0">
                <a
                  :href="lead.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block truncate text-sm hover:text-signal"
                >{{ lead.title || '(untitled)' }}</a>
                <p class="mt-0.5 truncate text-xs text-mute">
                  r/{{ lead.subreddit }} · {{ lead.matched_keyword }}
                </p>
              </div>
              <span
                class="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums"
                :class="lead.score >= 70 ? 'bg-signal/15 text-signal' : 'bg-panel text-mute'"
              >{{ lead.score }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

<script>
import { LEAD_STATUSES } from '#shared/types'

export default {
  setup() {
    useHead({ title: 'Dashboard · RedIntelli' })
    const config = useRuntimeConfig()
    const workspace = useWorkspace()
    return {
      localMode: config.public.localMode,
      ...workspace,
    }
  },

  data() {
    return {
      leads: [],
      loading: true,
      error: '',
    }
  },

  computed: {
    highIntent() {
      return this.leads.filter(l => l.score >= 70).length
    },

    worked() {
      return this.leads.filter(l => l.status !== 'new').length
    },

    lastScan() {
      const stamps = this.leads.map(l => l.discovered_at).filter(Boolean).sort()
      if (!stamps.length) return '—'

      const hours = (Date.now() - new Date(stamps[stamps.length - 1]).getTime()) / 3_600_000
      if (hours < 1) return 'just now'
      if (hours < 24) return `${Math.round(hours)}h ago`
      return `${Math.round(hours / 24)}d ago`
    },

    kpis() {
      return [
        { label: 'Leads', value: this.leads.length, hint: 'in this campaign', tone: '' },
        {
          label: 'High intent',
          value: this.highIntent,
          hint: 'scoring 70 or above',
          tone: this.highIntent ? 'text-signal' : 'text-mute',
        },
        {
          label: 'Worked',
          value: this.worked,
          hint: this.worked ? 'moved out of new' : 'nothing touched yet',
          tone: this.worked ? '' : 'text-mute',
        },
        { label: 'Last scan', value: this.lastScan, hint: 'most recent lead', tone: '' },
      ]
    },

    byKeyword() {
      const groups = new Map()
      for (const lead of this.leads) {
        const name = lead.matched_keyword || '(none)'
        if (!groups.has(name)) groups.set(name, [])
        groups.get(name).push(lead.score ?? 0)
      }

      const rows = [...groups.entries()].map(([name, scores]) => ({
        name,
        count: scores.length,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      }))

      // Sorted descending, per the bar-chart rule — rank is the whole point.
      rows.sort((a, b) => b.count - a.count)

      const max = rows[0]?.count || 1
      return rows.map(r => ({ ...r, share: Math.round((r.count / max) * 100) }))
    },

    distribution() {
      const bands = [
        { label: '70+', tone: 'bg-signal', test: s => s >= 70 },
        { label: '40–69', tone: 'bg-signal/50', test: s => s >= 40 && s < 70 },
        { label: '20–39', tone: 'bg-mute/40', test: s => s >= 20 && s < 40 },
        { label: '0–19', tone: 'bg-mute/20', test: s => s < 20 },
      ]

      const total = this.leads.length || 1
      return bands.map((b) => {
        const count = this.leads.filter(l => b.test(l.score ?? 0)).length
        return { ...b, count, pct: Math.round((count / total) * 100) }
      })
    },

    distributionNote() {
      return this.highIntent
        ? `${this.highIntent} lead${this.highIntent === 1 ? '' : 's'} worth answering first.`
        : 'Nothing above 70 yet. Competitor-name keywords score highest, so try one of those.'
    },

    funnel() {
      const dots = {
        new: 'bg-signal',
        queued: 'bg-warn',
        replied: 'bg-ok',
        skipped: 'bg-mute/50',
        won: 'bg-ok',
      }
      return LEAD_STATUSES.map(status => ({
        status,
        dot: dots[status] ?? 'bg-mute',
        count: this.leads.filter(l => l.status === status).length,
      }))
    },

    funnelNote() {
      // A funnel needs stages that actually decline. Until then it's a tally.
      return this.worked
        ? 'Where your leads sit right now.'
        : 'Everything is still new. Work a few leads in the inbox and this becomes a funnel.'
    },

    topLeads() {
      return [...this.leads].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 6)
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
          const { data, error } = await this.supabase
            .from('leads')
            .select('*')
            .eq('campaign_id', this.activeCampaignId)
            .order('score', { ascending: false })

          if (error) throw new Error(error.message)
          this.leads = data ?? []
        }
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },
  },
}
</script>
