<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Setup</h1>
      <p class="mt-1 text-sm text-mute">Brand, campaign, keywords — then scan.</p>
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
          </div>
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
        <h2 class="mb-1 font-medium">Keywords</h2>
        <p class="mb-4 text-sm text-mute">
          What people type when they're looking for what you sell.
        </p>

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
          <input v-model="newKeyword.phrase" class="input" placeholder="linktree alternative" required>
          <input v-model="newKeyword.subreddit" class="input sm:max-w-48" placeholder="subreddit (optional)">
          <button class="btn-ghost shrink-0" :disabled="busy">Add keyword</button>
        </form>
      </section>

      <!-- 5. Scan -->
      <section v-if="activeCampaign" class="card">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="font-medium">Run a scan</h2>
            <p class="mt-1 text-sm text-mute">
              Searches Reddit for each keyword, scores what it finds, and files it in your inbox.
            </p>
          </div>
          <button class="btn-primary shrink-0" :disabled="scanning || !keywords.length" @click="runScan">
            {{ scanning ? 'Scanning…' : 'Scan now' }}
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
    useHead({ title: 'Setup — RedRadar' })
    const workspace = useWorkspace()
    return { supabase: useSupabaseClient(), ...workspace }
  },

  data() {
    return {
      busy: false,
      scanning: false,
      error: '',
      orgName: '',
      newCampaignName: '',
      newKeyword: { phrase: '', subreddit: '' },
      keywords: [],
      scanResult: null,
      brandForm: { name: '', tagline: '', description: '', voice: '', competitors: '' },
    }
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

    saveBrand() {
      return this.run(async () => {
        const payload = {
          org_id: this.org.id,
          name: this.brandForm.name,
          tagline: this.brandForm.tagline || null,
          description: this.brandForm.description || null,
          voice: this.brandForm.voice || null,
          competitors: this.brandForm.competitors
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        }

        const query = this.activeBrand
          ? this.supabase.from('brands').update(payload).eq('id', this.activeBrand.id)
          : this.supabase.from('brands').insert(payload)

        const { error } = await query
        if (error) throw new Error(error.message)

        await this.load(true)
      })
    },

    addCampaign() {
      return this.run(async () => {
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
      const { data, error } = await this.supabase
        .from('keywords')
        .select('*')
        .eq('campaign_id', this.activeCampaignId)
        .order('created_at')

      if (error) this.error = error.message
      else this.keywords = data ?? []
    },

    addKeyword() {
      return this.run(async () => {
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
        const { error } = await this.supabase.from('keywords').delete().eq('id', id)
        if (error) throw new Error(error.message)
        await this.loadKeywords()
      })
    },

    async runScan() {
      this.scanning = true
      this.error = ''
      this.scanResult = null

      try {
        this.scanResult = await $fetch('/api/discover', {
          method: 'POST',
          body: { campaignId: this.activeCampaignId },
        })
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.scanning = false
      }
    },
  },
}
</script>
