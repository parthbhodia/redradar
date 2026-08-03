<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
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

      <!-- Scan history. Hidden entirely until migration 0005 is applied, and in
           local mode, which keeps no run history. -->
      <div v-if="scanRuns.length || keywordPerf.length" class="grid gap-5 lg:grid-cols-2">
        <section class="card">
          <h2 class="font-medium">Recent scans</h2>
          <p class="mt-1 mb-4 text-sm text-mute">
            Manual and scheduled runs. A failed run is the only way you'd know a
            scheduled scan didn't happen.
          </p>

          <table v-if="scanRuns.length" class="w-full text-sm">
            <caption class="sr-only">The last ten scans for this campaign</caption>
            <thead>
              <tr class="text-xs tracking-wide text-mute uppercase">
                <th scope="col" class="pb-2 text-left font-medium">When</th>
                <th scope="col" class="pb-2 text-left font-medium">Trigger</th>
                <th scope="col" class="pb-2 text-right font-medium">New</th>
                <th scope="col" class="pb-2 text-right font-medium">Seen</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="run in scanRuns" :key="run.id">
                <tr
                  class="cursor-pointer border-t border-line/60 hover:bg-panel-2"
                  role="button"
                  tabindex="0"
                  :aria-expanded="expandedRunId === run.id"
                  @click="toggleRunDetail(run.id)"
                  @keydown.enter="toggleRunDetail(run.id)"
                >
                  <td class="py-2">
                    <span class="flex items-center gap-2">
                      <svg
                        viewBox="0 0 16 16"
                        class="h-3 w-3 shrink-0 text-mute transition-transform"
                        :class="expandedRunId === run.id ? 'rotate-90' : ''"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M6 4l4 4-4 4V4z" />
                      </svg>
                      <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="runDot(run)" aria-hidden="true" />
                      {{ timeAgo(run.started_at) }}
                    </span>
                    <span v-if="run.status !== 'ok'" class="mt-0.5 ml-5 block text-xs" :class="run.status === 'failed' ? 'text-signal-soft' : 'text-warn'">
                      {{ runNote(run) }}
                    </span>
                  </td>
                  <td class="py-2 text-mute capitalize">{{ run.trigger }}</td>
                  <td class="py-2 text-right font-mono tabular-nums" :class="run.inserted ? 'text-signal' : 'text-mute'">
                    {{ run.inserted }}
                  </td>
                  <td class="py-2 text-right font-mono text-mute tabular-nums">{{ run.scanned }}</td>
                </tr>

                <tr v-if="expandedRunId === run.id">
                  <td colspan="4" class="bg-panel-2/60 px-2 py-3">
                    <p v-if="runDetailLoading" class="text-xs text-mute">Loading…</p>
                    <p v-else-if="!runDetail.length" class="text-xs text-mute">No per-keyword data recorded for this run.</p>
                    <table v-else class="w-full text-xs">
                      <caption class="sr-only">Per-keyword breakdown for this scan</caption>
                      <thead>
                        <tr class="text-mute uppercase">
                          <th scope="col" class="pb-1.5 text-left font-medium">Keyword</th>
                          <th scope="col" class="pb-1.5 text-right font-medium">Seen</th>
                          <th scope="col" class="pb-1.5 text-right font-medium">Matched</th>
                          <th scope="col" class="pb-1.5 text-right font-medium">New</th>
                          <th scope="col" class="pb-1.5 text-right font-medium">Top score</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in runDetail" :key="row.id" class="border-t border-line/40">
                          <td class="py-1.5 pr-2">
                            <span class="block truncate">{{ row.phrase }}</span>
                            <span v-if="row.error" class="text-signal-soft">{{ row.error }}</span>
                          </td>
                          <td class="py-1.5 text-right font-mono tabular-nums">{{ row.scanned }}</td>
                          <td class="py-1.5 text-right font-mono tabular-nums">{{ row.matched }}</td>
                          <td class="py-1.5 text-right font-mono tabular-nums" :class="row.inserted ? 'text-signal' : 'text-mute'">
                            {{ row.inserted }}
                          </td>
                          <td class="py-1.5 text-right font-mono tabular-nums text-mute">
                            {{ row.top_score ?? '—' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>

          <p v-else class="text-sm text-mute">No scans recorded yet.</p>

          <div v-if="scanRunsTotal > scanRunsPageSize" class="mt-4 flex items-center justify-between gap-3">
            <p class="text-xs text-mute">
              {{ scanRunsPage * scanRunsPageSize + 1 }}–{{ Math.min((scanRunsPage + 1) * scanRunsPageSize, scanRunsTotal) }}
              of {{ scanRunsTotal }}
            </p>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn-quiet"
                :disabled="!scanRunsHasPrev || scanRunsLoading"
                @click="scanRunsPrev"
              >
                ← Newer
              </button>
              <button
                type="button"
                class="btn-quiet"
                :disabled="!scanRunsHasNext || scanRunsLoading"
                @click="scanRunsNext"
              >
                Older →
              </button>
            </div>
          </div>
        </section>

        <section class="card">
          <h2 class="font-medium">Keyword yield</h2>
          <p class="mt-1 mb-4 text-sm text-mute">
            Lifetime, across every scan. A phrase with no leads after a few runs
            is costing you a request and returning nothing.
          </p>

          <table v-if="keywordPerf.length" class="w-full text-sm">
            <caption class="sr-only">Lifetime scan yield per keyword</caption>
            <thead>
              <tr class="text-xs tracking-wide text-mute uppercase">
                <th scope="col" class="pb-2 text-left font-medium">Keyword</th>
                <th scope="col" class="pb-2 text-right font-medium">Runs</th>
                <th scope="col" class="pb-2 text-right font-medium">Seen</th>
                <th scope="col" class="pb-2 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in keywordPerf" :key="row.phrase" class="border-t border-line/60">
                <td class="py-2 pr-3">
                  <span class="block truncate">{{ row.phrase }}</span>
                  <span v-if="isDeadKeyword(row)" class="text-xs text-warn">
                    no leads in {{ row.runs }} runs
                  </span>
                  <span v-else-if="row.failed_runs" class="text-xs text-signal-soft">
                    errored in {{ row.failed_runs }} of {{ row.runs }}
                  </span>
                </td>
                <td class="py-2 text-right font-mono text-mute tabular-nums">{{ row.runs }}</td>
                <td class="py-2 text-right font-mono text-mute tabular-nums">{{ row.threads_seen }}</td>
                <td
                  class="py-2 text-right font-mono tabular-nums"
                  :class="row.leads_new ? 'text-signal' : 'text-warn'"
                >{{ row.leads_new }}</td>
              </tr>
            </tbody>
          </table>

          <p v-else class="text-sm text-mute">Run a scan and this fills in.</p>
        </section>
      </div>
    </template>
  </div>
</template>

<script>
import { LEAD_STATUSES } from '#shared/types'

export default {
  setup() {
    useHead({ title: 'Analytics · RedIntelli' })
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
      scanRuns: [],
      scanRunsPage: 0,
      scanRunsPageSize: 10,
      scanRunsTotal: 0,
      scanRunsLoading: false,
      expandedRunId: null,
      runDetail: [],
      runDetailLoading: false,
      runDetailCache: {},
      keywordPerf: [],
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

    scanRunsHasNext() {
      return (this.scanRunsPage + 1) * this.scanRunsPageSize < this.scanRunsTotal
    },

    scanRunsHasPrev() {
      return this.scanRunsPage > 0
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
    timeAgo(stamp) {
      if (!stamp) return 'unknown'
      const hours = (Date.now() - new Date(stamp).getTime()) / 3_600_000
      if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`
      if (hours < 24) return `${Math.round(hours)}h ago`
      const days = Math.round(hours / 24)
      return days === 1 ? 'yesterday' : `${days}d ago`
    },

    runDot(run) {
      if (run.status === 'failed') return 'bg-signal'
      if (run.status === 'partial') return 'bg-warn'
      if (run.status === 'running') return 'bg-mute'
      return 'bg-ok'
    },

    runNote(run) {
      if (run.status === 'failed') return run.error_message || 'Failed'
      if (run.status === 'running') return 'Still running, or the process died'
      const count = run.errors?.length ?? 0
      return `${count} keyword${count === 1 ? '' : 's'} errored`
    },

    // One barren run is noise; several means the phrase is genuinely dead.
    isDeadKeyword(row) {
      return !row.leads_new && (row.runs ?? 0) >= 2
    },

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

      await this.loadScanHistory()
    },

    /**
     * Scan history lives in scan_runs / keyword_performance (migration 0005).
     * Absent before that migration, and absent in local mode, so a failure here
     * hides the panel rather than breaking the dashboard.
     */
    async loadScanHistory() {
      if (this.localMode || !this.activeCampaignId) return

      this.scanRunsPage = 0
      // A cached run detail from a different campaign shouldn't be reachable
      // through a run_id that happens to collide (it won't) or just linger
      // expanded under the wrong campaign's rows.
      this.expandedRunId = null
      this.runDetailCache = {}
      await this.loadScanRunsPage()

      const perf = await this.supabase
        .from('keyword_performance')
        .select('phrase, runs, last_run_at, threads_seen, leads_new, best_score, failed_runs')
        .eq('campaign_id', this.activeCampaignId)

      this.keywordPerf = perf.error
        ? []
        : [...(perf.data ?? [])].sort((a, b) => (b.leads_new ?? 0) - (a.leads_new ?? 0))
    },

    /** Just the scan_runs page — split out so Prev/Next don't re-fetch keyword yield too. */
    async loadScanRunsPage() {
      if (this.localMode || !this.activeCampaignId) return

      this.scanRunsLoading = true
      const from = this.scanRunsPage * this.scanRunsPageSize
      const to = from + this.scanRunsPageSize - 1

      const runs = await this.supabase
        .from('scan_runs')
        .select('id, trigger, status, started_at, finished_at, keywords, scanned, inserted, updated, errors, error_message', { count: 'exact' })
        .eq('campaign_id', this.activeCampaignId)
        .order('started_at', { ascending: false })
        .range(from, to)

      this.scanRuns = runs.error ? [] : (runs.data ?? [])
      this.scanRunsTotal = runs.error ? 0 : (runs.count ?? 0)
      this.scanRunsLoading = false
    },

    scanRunsPrev() {
      if (!this.scanRunsHasPrev) return
      this.scanRunsPage -= 1
      this.expandedRunId = null
      this.loadScanRunsPage()
    },

    scanRunsNext() {
      if (!this.scanRunsHasNext) return
      this.scanRunsPage += 1
      this.expandedRunId = null
      this.loadScanRunsPage()
    },

    async toggleRunDetail(runId) {
      if (this.expandedRunId === runId) {
        this.expandedRunId = null
        return
      }

      this.expandedRunId = runId

      // Cached per run_id, so re-expanding a row you already opened is free.
      if (this.runDetailCache[runId]) {
        this.runDetail = this.runDetailCache[runId]
        return
      }

      this.runDetailLoading = true
      this.runDetail = []
      try {
        const { data, error } = await this.supabase
          .from('scan_run_keywords')
          .select('id, phrase, subreddit_filter, scanned, matched, inserted, updated, top_score, error')
          .eq('run_id', runId)
          .order('inserted', { ascending: false })

        const rows = error ? [] : (data ?? [])
        this.runDetailCache = { ...this.runDetailCache, [runId]: rows }
        this.runDetail = rows
      } finally {
        this.runDetailLoading = false
      }
    },
  },
}
</script>
