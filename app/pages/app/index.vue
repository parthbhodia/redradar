<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Setup</h1>
      <p class="mt-1 text-sm text-mute">Brand, campaign, keywords, then scan.</p>
    </div>

    <p v-if="error" class="rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
      {{ error }}
    </p>

    <!-- 1. Workspace -->
    <section v-if="!org" class="card">
      <h2 class="font-medium">Name your workspace</h2>
      <p class="mt-1 mb-4 text-sm text-mute">Usually your company name.</p>

      <form class="flex gap-2" @submit.prevent="createWorkspace">
        <input v-model="orgName" class="input" placeholder="Acme Inc" required>
        <button class="btn-primary shrink-0" :disabled="busy">Create</button>
      </form>
    </section>

    <template v-else>
      <!-- 2. Brand -->
      <section class="card">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-medium">Brand</h2>
          <span v-if="activeBrand" class="text-xs text-mute">Used to write your reply drafts</span>
        </div>

        <!-- AI fill -->
        <div class="mb-5 rounded-lg border border-line bg-panel-2 p-3">
          <div class="flex flex-col gap-2 sm:flex-row">
            <input
              v-model="suggestHint"
              class="input"
              placeholder="Optional: one line on what it does, or paste your homepage copy"
              @keydown.enter.prevent="suggestBrand"
            >
            <button
              type="button"
              class="btn-ghost shrink-0"
              :disabled="suggesting || !brandForm.name.trim()"
              @click="suggestBrand"
            >
              {{ suggesting ? 'Writing…' : 'Fill with AI' }}
            </button>
          </div>

          <p class="mt-2 text-xs text-mute">
            Writes the four fields below from the name. Nothing saves until you hit
            {{ activeBrand ? 'Save brand' : 'Create brand' }}. Review it first, since this text
            feeds every reply draft.
          </p>

          <div v-if="assumptions.length" class="mt-3 border-t border-line pt-3">
            <p class="mb-1.5 text-xs font-medium tracking-wide text-warn uppercase">
              Guessed, worth checking
            </p>
            <ul class="space-y-1 text-xs text-mute">
              <li v-for="item in assumptions" :key="item">· {{ item }}</li>
            </ul>
          </div>
        </div>

        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveBrand">
          <div>
            <label class="label" for="brand-name">Name</label>
            <input id="brand-name" v-model="brandForm.name" class="input" required placeholder="Cueful">
          </div>

          <div>
            <label class="label" for="brand-tagline">One-liner</label>
            <input id="brand-tagline" v-model="brandForm.tagline" class="input" placeholder="Link in bio, built for creators">
          </div>

          <div class="sm:col-span-2">
            <label class="label" for="brand-description">What it does & who it's for</label>
            <textarea
              id="brand-description"
              v-model="brandForm.description"
              class="input min-h-24"
              placeholder="A link-in-bio tool for creators who want…"
            />
          </div>

          <div>
            <label class="label" for="brand-voice">Voice notes</label>
            <textarea
              id="brand-voice"
              v-model="brandForm.voice"
              class="input min-h-20"
              placeholder="Plain, direct, no hype. Happy to say when we're not the right fit."
            />
          </div>

          <div>
            <label class="label" for="brand-competitors">Competitors (comma separated)</label>
            <textarea
              id="brand-competitors"
              v-model="brandForm.competitors"
              class="input min-h-20"
              placeholder="Linktree, Beacons, Stan Store"
            />
          </div>

          <div class="sm:col-span-2">
            <button class="btn-primary" :disabled="busy">
              {{ activeBrand ? 'Save brand' : 'Create brand' }}
            </button>
            <span v-if="brandSaved" class="ml-3 text-sm text-ok">Saved.</span>
          </div>

          <p v-if="brandError" class="sm:col-span-2 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
            {{ brandError }}
          </p>
        </form>
      </section>

      <!-- 3. Campaigns -->
      <section v-if="activeBrand" class="card">
        <h2 class="mb-4 font-medium">Campaigns</h2>

        <div v-if="campaigns.length" class="mb-4 flex flex-wrap gap-2">
          <button
            v-for="campaign in campaigns"
            :key="campaign.id"
            class="chip"
            :class="campaign.id === activeCampaignId ? 'border-signal text-signal' : 'hover:border-line-2'"
            @click="activeCampaignId = campaign.id"
          >
            {{ campaign.name }}
          </button>
        </div>

        <form class="flex gap-2" @submit.prevent="addCampaign">
          <input v-model="newCampaignName" class="input" placeholder="New campaign name" required>
          <button class="btn-ghost shrink-0" :disabled="busy">Add</button>
        </form>
      </section>

      <!-- 4. Keywords -->
      <section v-if="activeCampaign" class="card">
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="font-medium">Keywords</h2>
          <div class="flex items-center gap-3">
            <span class="text-xs" :class="keywordLimitApproaching ? 'text-warn' : 'text-mute'">
              <span class="font-mono">{{ keywords.length }}</span> / {{ maxKeywordsPerCampaign }}
            </span>
            <button
              type="button"
              class="btn-quiet"
              :disabled="suggestingKeywords || !activeBrand"
              @click="suggestKeywordIdeas"
            >
              {{ suggestingKeywords ? 'Thinking…' : 'Suggest with AI' }}
            </button>
          </div>
        </div>
        <p class="mb-4 text-sm text-mute">
          What people type when they're looking for what you sell.
        </p>

        <p v-if="keywordSuggestError" class="mb-4 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
          {{ keywordSuggestError }}
        </p>

        <!-- Rate limiting info -->
        <div v-if="keywords.length > 0" class="mb-4 rounded-lg border border-line/60 bg-panel-2 px-3 py-2">
          <p class="text-xs text-mute">
            <span v-if="scanDurationEstimate <= 5" class="text-ok">
              ✓ Scan will take ~{{ scanDurationEstimate }}s ({{ keywords.length }} keywords × 1s pacing)
            </span>
            <span v-else-if="scanDurationEstimate <= 30" class="text-mute">
              ⏱ Scan will take ~{{ scanDurationEstimate }}s ({{ keywords.length }} keywords × 1s pacing)
            </span>
            <span v-else class="text-warn">
              ⚠ Scan will take ~{{ scanDurationEstimate }}s ({{ keywords.length }} keywords × 1s pacing)
            </span>
          </p>
        </div>

        <!-- AI suggestions: proposed, not added — keywords save the moment you accept one. -->
        <div v-if="keywordIdeas.length" class="mb-4 rounded-lg border border-line bg-panel-2 p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-xs font-medium tracking-wide text-mute uppercase">Suggested</span>
            <button type="button" class="btn-quiet" @click="keywordIdeas = []">Dismiss</button>
          </div>

          <ul class="space-y-2.5">
            <li
              v-for="idea in keywordIdeas"
              :key="idea.phrase"
              class="flex items-start justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-sm">
                  {{ idea.phrase }}
                  <span v-if="idea.subreddit" class="text-mute">· r/{{ idea.subreddit }}</span>
                </p>
                <p class="text-xs text-mute">{{ idea.intent }}</p>
              </div>
              <button
                type="button"
                class="btn-quiet shrink-0 text-signal"
                :disabled="busy"
                @click="acceptKeyword(idea)"
              >
                Add
              </button>
            </li>
          </ul>
        </div>

        <ul v-if="keywords.length" class="mb-4 space-y-2">
          <li
            v-for="keyword in keywords"
            :key="keyword.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm">{{ keyword.phrase }}</p>
              <p v-if="keyword.subreddit_filter" class="text-xs text-mute">
                r/{{ keyword.subreddit_filter }} only
              </p>
            </div>
            <button class="btn-quiet shrink-0" @click="removeKeyword(keyword.id)">Remove</button>
          </li>
        </ul>

        <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="addKeyword">
          <input
            v-model="newKeyword.phrase"
            class="input"
            placeholder="linktree alternative"
            :disabled="keywordLimitReached"
            required
          >
          <input
            v-model="newKeyword.subreddit"
            class="input sm:max-w-48"
            placeholder="subreddit (optional)"
            :disabled="keywordLimitReached"
          >
          <button class="btn-ghost shrink-0" :disabled="busy || keywordLimitReached">
            Add keyword
          </button>
        </form>

        <p v-if="keywordLimitReached" class="mt-2 text-xs text-warn">
          Limit reached: {{ maxKeywordsPerCampaign }} keywords per campaign. Remove some to add more.
        </p>
      </section>

      <!-- 5. Scan -->
      <section v-if="activeCampaign" class="card">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-medium">Run a scan</h2>
            <p v-if="scanBlocked" class="mt-1 flex items-center gap-2 text-sm text-warn">
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
              <template v-if="scanBlockedBy">{{ scanBlockedBy }} started a scan for this campaign.</template>
              <template v-else>This campaign is already being scanned.</template>
            </p>
            <p v-else class="mt-1 text-sm text-mute">
              Searches Reddit for each keyword, scores what it finds, and files it in your inbox.
            </p>
            <!-- Shown before they hit it, not after: a disabled button with no
                 explanation is worse than the limit itself. -->
            <div v-if="quota && !quota.unlimited && !scanBlocked" class="mt-3 space-y-2">
              <p class="text-xs" :class="quotaExhausted ? 'text-warn' : 'text-mute'">
                <template v-if="quotaExhausted">
                  <strong>Daily limit reached.</strong> Resets {{ quotaResetsIn }}.
                </template>
                <template v-else>
                  <strong><span class="font-mono">{{ quota.remaining }}</span> of {{ quota.limit }} scans left today</strong>
                </template>
              </p>
              <p class="text-xs text-mute">
                Rate limited to 1 keyword per second to protect against Reddit blocks.
                <template v-if="keywords.length > 1">
                  This scan will take ~{{ scanDurationEstimate }}s.
                </template>
              </p>
            </div>
          </div>
          <button
            v-if="scanBlocked"
            class="btn-ghost shrink-0"
            :disabled="scanning"
            @click="runScan()"
          >
            {{ scanning ? 'Checking…' : 'Check again' }}
          </button>
          <button
            v-else
            class="btn-primary shrink-0"
            :disabled="scanning || !keywords.length || quotaExhausted"
            @click="runScan()"
          >
            {{ scanning ? 'Scanning…' : 'Scan now' }}
          </button>
        </div>

        <!-- Recently scanned: ask before spending a scan on a near-repeat,
             rather than silently letting it burn quota. -->
        <div v-if="scanCooldown && !scanBlocked" class="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line-2 bg-panel-2 px-3 py-2.5">
          <p class="text-xs text-mute">Last scanned {{ scanCooldownAgo }}. Unlikely to find much new yet.</p>
          <button class="btn-ghost shrink-0" :disabled="scanning" @click="runScan(true)">
            {{ scanning ? 'Scanning…' : 'Scan anyway' }}
          </button>
        </div>

        <div v-if="scanResult" class="mt-5 rounded-lg border border-line bg-panel-2 p-4">
          <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span><span class="font-mono text-signal">{{ scanResult.inserted }}</span> new</span>
            <span><span class="font-mono">{{ scanResult.updated }}</span> refreshed</span>
            <span class="text-mute">{{ scanResult.scanned }} threads scanned across {{ scanResult.keywords }} keywords</span>
          </div>

          <ul v-if="scanResult.errors.length" class="mt-3 space-y-1 text-xs text-warn">
            <li v-for="e in scanResult.errors" :key="e">{{ e }}</li>
          </ul>

          <NuxtLink to="/app/inbox" class="btn-ghost mt-4">Open inbox</NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'Setup · RedIntelli' })
    const config = useRuntimeConfig()
    const workspace = useWorkspace()
    // Shared with the header badge so both always show the same number.
    const { quota, exhausted, set: setQuota, markExhausted, resetsIn } = useScanQuota()
    const { push: toast } = useToasts()
    return {
      localMode: config.public.localMode,
      me: useMe(),
      // Survives the hop to the inbox so the scan result isn't lost on navigate.
      lastScan: useState('rr:lastScan', () => null),
      quota,
      quotaExhausted: exhausted,
      setQuota,
      markQuotaExhausted: markExhausted,
      quotaResetsInFn: resetsIn,
      toast,
      dailyScanLimit: config.public.dailyScanLimit,
      ...workspace,
    }
  },

  data() {
    return {
      busy: false,
      scanning: false,
      error: '',
      brandError: '',
      brandSaved: false,
      keywordSuggestError: '',
      orgName: '',
      newCampaignName: '',
      newKeyword: { phrase: '', subreddit: '' },
      keywords: [],
      scanResult: null,
      // Someone else's scan for this campaign is in flight.
      scanBlocked: false,
      // Their display_name, or null if the server didn't have one to give us
      // (scanBlocked can be true with this still null).
      scanBlockedBy: null,
      // Non-null (ISO timestamp of the last scan) when the server wants a
      // "scan anyway?" confirmation before spending quota on a near-repeat.
      scanCooldown: null,
      brandForm: { name: '', tagline: '', description: '', voice: '', competitors: '' },
      suggesting: false,
      suggestHint: '',
      assumptions: [],
      suggestingKeywords: false,
      keywordIdeas: [],
      maxKeywordsPerCampaign: 10, // Rate limiting: 10 keywords × 1s = 10s max scan
      redditApiPacingMs: 1000, // 1 second between keyword searches
    }
  },

  computed: {
    quotaResetsIn() {
      return this.quotaResetsInFn()
    },

    keywordLimitReached() {
      return this.keywords.length >= this.maxKeywordsPerCampaign
    },

    keywordLimitApproaching() {
      return this.keywords.length >= this.maxKeywordsPerCampaign * 0.75
    },

    scanDurationEstimate() {
      // Each keyword takes ~1 second (paced API calls)
      return this.keywords.length * (this.redditApiPacingMs / 1000)
    },

    scanCooldownAgo() {
      if (!this.scanCooldown) return ''
      const minutes = Math.max(1, Math.round((Date.now() - new Date(this.scanCooldown).getTime()) / 60_000))
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
    },
  },

  watch: {
    activeBrand: {
      immediate: true,
      handler(brand) {
        if (!brand) return
        this.brandForm = {
          name: brand.name ?? '',
          tagline: brand.tagline ?? '',
          description: brand.description ?? '',
          voice: brand.voice ?? '',
          competitors: (brand.competitors ?? []).join(', '),
        }
      },
    },

    activeCampaignId: {
      immediate: true,
      handler(id) {
        this.scanResult = null
        this.scanBlocked = false
        this.scanBlockedBy = null
        this.scanCooldown = null
        this.keywordSuggestError = ''
        this.keywordIdeas = []
        if (id) this.loadKeywords()
        else this.keywords = []
      },
    },
  },

  async mounted() {
    try {
      await this.load()
    } catch (e) {
      this.error = e.message
    }
  },

  methods: {
    async run(fn) {
      this.busy = true
      this.error = ''
      try {
        await fn()
      } catch (e) {
        this.error = e.message
      } finally {
        this.busy = false
      }
    },

    createWorkspace() {
      return this.run(() => this.createOrg(this.orgName))
    },

    async suggestBrand() {
      if (!this.brandForm.name.trim()) return

      this.suggesting = true
      this.error = ''
      this.assumptions = []

      try {
        const suggestion = await $fetch('/api/brand-suggest', {
          method: 'POST',
          body: { name: this.brandForm.name, hint: this.suggestHint },
        })

        // Name is the user's input — only the derived fields get replaced.
        this.brandForm.tagline = suggestion.tagline ?? ''
        this.brandForm.description = suggestion.description ?? ''
        this.brandForm.voice = suggestion.voice ?? ''
        this.brandForm.competitors = (suggestion.competitors ?? []).join(', ')
        this.assumptions = suggestion.assumptions ?? []
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.suggesting = false
      }
    },

    async saveBrand() {
      this.busy = true
      this.brandError = ''
      this.brandSaved = false

      try {
        if (!this.brandForm.name?.trim()) {
          throw new Error('Brand name is required.')
        }

        const competitors = this.brandForm.competitors
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)

        if (this.localMode) {
          await $fetch('/api/workspace', {
            method: 'POST',
            body: {
              action: 'upsert_brand',
              brand: {
                id: this.activeBrand?.id,
                name: this.brandForm.name,
                tagline: this.brandForm.tagline || null,
                description: this.brandForm.description || null,
                voice: this.brandForm.voice || null,
                competitors,
              },
            },
          })
          await this.load(true)
          this.brandSaved = true
          this.toast('Brand saved.', { tone: 'success' })
          setTimeout(() => { this.brandSaved = false }, 3000)
          return
        }

        const payload = {
          org_id: this.org.id,
          name: this.brandForm.name,
          tagline: this.brandForm.tagline || null,
          description: this.brandForm.description || null,
          voice: this.brandForm.voice || null,
          competitors,
        }

        const query = this.activeBrand
          ? this.supabase.from('brands').update(payload).eq('id', this.activeBrand.id).select()
          : this.supabase.from('brands').insert(payload).select()

        const { data, error } = await query
        if (error) throw new Error(error.message)

        // An update matching zero rows (e.g. RLS silently blocking it) returns
        // no error and an empty array — that reads as success but wrote nothing.
        if (this.activeBrand && (!data || data.length === 0)) {
          throw new Error('Save didn\'t apply — you may not have permission to edit this brand.')
        }

        await this.load(true)
        this.brandSaved = true
        this.toast('Brand saved.', { tone: 'success' })
        setTimeout(() => { this.brandSaved = false }, 3000)
      } catch (e) {
        this.brandError = e.data?.statusMessage || e.message
        this.toast('Could not save brand.', { tone: 'error', detail: this.brandError })
      } finally {
        this.busy = false
      }
    },

    addCampaign() {
      return this.run(async () => {
        if (this.localMode) {
          const { campaign } = await $fetch('/api/workspace', {
            method: 'POST',
            body: {
              action: 'create_campaign',
              brandId: this.activeBrand.id,
              name: this.newCampaignName,
            },
          })
          this.newCampaignName = ''
          await this.load(true)
          this.activeCampaignId = campaign.id
          return
        }

        const { data, error } = await this.supabase
          .from('campaigns')
          .insert({ brand_id: this.activeBrand.id, name: this.newCampaignName })
          .select()
          .single()

        if (error) throw new Error(error.message)

        this.newCampaignName = ''
        await this.load(true)
        this.activeCampaignId = data.id
      })
    },

    async loadKeywords() {
      if (this.localMode) {
        const data = await $fetch('/api/workspace', {
          query: { keywords: '1', campaignId: this.activeCampaignId },
        })
        this.keywords = data.keywords ?? []
        return
      }

      const { data, error } = await this.supabase
        .from('keywords')
        .select('*')
        .eq('campaign_id', this.activeCampaignId)
        .order('created_at')

      if (error) this.error = error.message
      else this.keywords = data ?? []
    },

    async suggestKeywordIdeas() {
      // Validate brand is set up first
      if (!this.activeBrand?.name) {
        this.keywordSuggestError = 'Fill in the brand name first, then try again.'
        this.toast('Add a brand first.', { tone: 'warn', detail: this.keywordSuggestError })
        return
      }

      this.suggestingKeywords = true
      this.keywordSuggestError = ''
      this.keywordIdeas = []

      try {
        const result = await $fetch('/api/keyword-suggest', {
          method: 'POST',
          body: { campaignId: this.activeCampaignId },
        })
        this.keywordIdeas = result.keywords ?? []
        if (!this.keywordIdeas.length) {
          this.keywordSuggestError = 'No keywords suggested. Try filling in more brand details (description, competitors).'
          this.toast('No suggestions came back.', { tone: 'warn', detail: this.keywordSuggestError })
        } else {
          this.toast(`${this.keywordIdeas.length} keyword${this.keywordIdeas.length === 1 ? '' : 's'} suggested.`, { tone: 'success' })
        }
      } catch (e) {
        this.keywordSuggestError = e.data?.statusMessage || e.message
        this.toast('Suggestion failed.', { tone: 'error', detail: this.keywordSuggestError })
      } finally {
        this.suggestingKeywords = false
      }
    },

    // Reuses addKeyword so local and cloud paths stay in one place.
    async acceptKeyword(idea) {
      this.newKeyword = { phrase: idea.phrase, subreddit: idea.subreddit ?? '' }
      await this.addKeyword()
      if (!this.error) {
        this.keywordIdeas = this.keywordIdeas.filter(i => i.phrase !== idea.phrase)
      }
    },

    addKeyword() {
      return this.run(async () => {
        if (this.localMode) {
          await $fetch('/api/workspace', {
            method: 'POST',
            body: {
              action: 'add_keyword',
              campaignId: this.activeCampaignId,
              phrase: this.newKeyword.phrase.trim(),
              subreddit: this.newKeyword.subreddit.trim().replace(/^\/?r\//i, '') || null,
            },
          })
          this.newKeyword = { phrase: '', subreddit: '' }
          await this.loadKeywords()
          return
        }

        const { error } = await this.supabase.from('keywords').insert({
          campaign_id: this.activeCampaignId,
          phrase: this.newKeyword.phrase.trim(),
          subreddit_filter: this.newKeyword.subreddit.trim().replace(/^\/?r\//i, '') || null,
        })

        if (error) throw new Error(error.message)

        this.newKeyword = { phrase: '', subreddit: '' }
        await this.loadKeywords()
      })
    },

    removeKeyword(id) {
      return this.run(async () => {
        if (this.localMode) {
          await $fetch('/api/workspace', {
            method: 'POST',
            body: { action: 'remove_keyword', keywordId: id },
          })
          await this.loadKeywords()
          return
        }

        const { error } = await this.supabase.from('keywords').delete().eq('id', id)
        if (error) throw new Error(error.message)
        await this.loadKeywords()
      })
    },

    async runScan(force = false) {
      this.scanning = true
      this.error = ''
      this.scanResult = null
      this.scanBlocked = false
      this.scanBlockedBy = null
      if (force) this.scanCooldown = null

      try {
        const result = await $fetch('/api/discover', {
          method: 'POST',
          body: { campaignId: this.activeCampaignId, force },
        })
        this.scanResult = result
        this.setQuota(result.quota)
        this.scanCooldown = null

        // The badge is up in the header and easy to miss, so say it out loud on
        // the last scan of the day rather than letting tomorrow be a surprise.
        if (result.quota && !result.quota.unlimited && result.quota.remaining === 0) {
          this.toast('That was your last scan today.', {
            tone: 'warn',
            detail: `Your ${result.quota.limit} daily scans reset ${this.quotaResetsIn}.`,
          })
        }

        // Straight to the inbox when there's something new to look at. Stay put
        // when a keyword errored or nothing landed — that summary is the result,
        // and an unchanged inbox wouldn't explain itself.
        const found = (result.inserted ?? 0) + (result.updated ?? 0)
        if (found > 0 && !result.errors?.length) {
          this.lastScan = result
          await navigateTo('/app/inbox')
        }
      } catch (e) {
        const data = e.data?.data ?? {}

        // Someone else's scan for this campaign is genuinely in flight —
        // nothing to confirm, just wait for it.
        if (data.scanBlocked) {
          this.scanBlocked = true
          this.scanBlockedBy = data.blockedBy ?? null
          this.toast(
            data.blockedBy ? `${data.blockedBy} is already scanning this campaign.` : 'This campaign is already being scanned.',
            { tone: 'warn' },
          )
          return
        }

        // Recently scanned, probably nothing new yet — ask before spending
        // one of the day's scans on a near-duplicate run.
        if (data.needsConfirm) {
          this.scanCooldown = data.lastScannedAt ?? new Date().toISOString()
          return
        }

        this.error = e.data?.statusMessage || e.message
        // 429 means the allowance is gone; reflect it without another request.
        if (e.statusCode === 429 || e.response?.status === 429) {
          // h3 nests `data` inside the error body; fall back to a local guess.
          this.markQuotaExhausted(e.data?.data?.quota ?? e.data?.quota ?? null)
          this.toast('Daily scan limit reached.', {
            tone: 'error',
            detail: `You get ${this.quota?.limit ?? this.dailyScanLimit} scans a day. Resets ${this.quotaResetsIn}.`,
          })
        } else {
          this.toast('Scan failed.', { tone: 'error', detail: this.error })
        }
      } finally {
        this.scanning = false
      }
    },
  },
}
</script>
