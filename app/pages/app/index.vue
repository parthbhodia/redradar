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
        <div class="mb-1 flex items-center justify-between gap-3">
          <h2 class="font-medium">Keywords</h2>
          <button
            type="button"
            class="btn-quiet"
            :disabled="suggestingKeywords || !activeBrand"
            @click="suggestKeywordIdeas"
          >
            {{ suggestingKeywords ? 'Thinking…' : 'Suggest with AI' }}
          </button>
        </div>
        <p class="mb-4 text-sm text-mute">
          What people type when they're looking for what you sell.
        </p>

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

      <!-- 6. Team -->
      <section v-if="!localMode" class="card">
        <h2 class="mb-1 font-medium">Team</h2>
        <p class="mb-4 text-sm text-mute">
          Everyone here shares this workspace: same campaigns, same inbox.
        </p>

        <ul v-if="members.length" class="mb-4 space-y-2">
          <li
            v-for="member in members"
            :key="member.user_id"
            class="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm">{{ member.profiles?.display_name ?? 'Unknown' }}</p>
              <p class="truncate text-xs text-mute">{{ member.profiles?.email }}</p>
            </div>
            <span class="chip shrink-0 capitalize">{{ member.role }}</span>
          </li>
        </ul>

        <form v-if="canInvite" class="flex flex-col gap-2 sm:flex-row" @submit.prevent="invite">
          <input
            v-model="inviteEmail"
            class="input"
            type="email"
            autocomplete="off"
            placeholder="teammate@company.com"
            required
          >
          <button class="btn-ghost shrink-0" :disabled="inviting">
            {{ inviting ? 'Inviting…' : 'Invite' }}
          </button>
        </form>
        <p v-else-if="members.length" class="text-xs text-mute">
          Only owners and admins can invite.
        </p>

        <p v-if="inviteMessage" class="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
          {{ inviteMessage }}
        </p>
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
    return {
      localMode: config.public.localMode,
      me: config.public.localMode ? ref(null) : useSupabaseUser(),
      // Survives the hop to the inbox so the scan result isn't lost on navigate.
      lastScan: useState('rr:lastScan', () => null),
      ...workspace,
    }
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
      suggesting: false,
      suggestHint: '',
      assumptions: [],
      suggestingKeywords: false,
      keywordIdeas: [],
      members: [],
      inviteEmail: '',
      inviting: false,
      inviteMessage: '',
    }
  },

  computed: {
    canInvite() {
      const meId = this.me?.id
      const mine = this.members.find(m => m.user_id === meId)
      return ['owner', 'admin'].includes(mine?.role)
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
        if (id) this.loadKeywords()
        else this.keywords = []
      },
    },
  },

  async mounted() {
    try {
      await this.load()
      if (!this.localMode && this.org) await this.loadMembers()
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

    async loadMembers() {
      const { data, error } = await this.supabase
        .from('org_members')
        .select('user_id, role, created_at, profiles!org_members_user_profile_fkey(display_name, email)')
        .order('created_at')

      // Before migration 0002 the profiles table doesn't exist; keep Setup
      // usable and just leave the team list empty.
      if (!error) this.members = data ?? []
    },

    async invite() {
      this.inviting = true
      this.error = ''
      this.inviteMessage = ''

      try {
        const result = await $fetch('/api/invite', {
          method: 'POST',
          body: { email: this.inviteEmail },
        })
        this.inviteMessage = result.status === 'invited'
          ? `Invite sent to ${result.email}. They'll land in this workspace when they accept.`
          : `${result.email} already had an account, so they were added directly.`
        this.inviteEmail = ''
        await this.loadMembers()
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.inviting = false
      }
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

    saveBrand() {
      return this.run(async () => {
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
          ? this.supabase.from('brands').update(payload).eq('id', this.activeBrand.id)
          : this.supabase.from('brands').insert(payload)

        const { error } = await query
        if (error) throw new Error(error.message)

        await this.load(true)
      })
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
      this.suggestingKeywords = true
      this.error = ''
      this.keywordIdeas = []

      try {
        const result = await $fetch('/api/keyword-suggest', {
          method: 'POST',
          body: { campaignId: this.activeCampaignId },
        })
        this.keywordIdeas = result.keywords ?? []
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
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

    async runScan() {
      this.scanning = true
      this.error = ''
      this.scanResult = null

      try {
        const result = await $fetch('/api/discover', {
          method: 'POST',
          body: { campaignId: this.activeCampaignId },
        })
        this.scanResult = result

        // Straight to the inbox when there's something new to look at. Stay put
        // when a keyword errored or nothing landed — that summary is the result,
        // and an unchanged inbox wouldn't explain itself.
        const found = (result.inserted ?? 0) + (result.updated ?? 0)
        if (found > 0 && !result.errors?.length) {
          this.lastScan = result
          await navigateTo('/app/inbox')
        }
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.scanning = false
      }
    },
  },
}
</script>
