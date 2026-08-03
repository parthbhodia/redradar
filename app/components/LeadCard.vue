<template>
  <article class="card">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <a :href="lead.url" target="_blank" rel="noopener noreferrer" class="font-medium hover:text-signal">
          {{ lead.title || '(untitled thread)' }}
        </a>
        <p class="mt-1 text-xs text-mute">
          r/{{ lead.subreddit }} · u/{{ lead.author }} · {{ age }}
          <span v-if="lead.matched_keyword"> · matched “{{ lead.matched_keyword }}”</span>
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <!-- Claim state. The whole point is that two people never work the same
             thread without seeing each other. -->
        <template v-if="localMode && claimed">
          <template v-if="claimedByMe">
            <span class="chip border-signal/40 text-signal">Yours</span>
          </template>
          <span v-else class="chip border-warn/40 text-warn">
            {{ claimed }}
          </span>
        </template>
        <template v-else-if="!localMode">
          <button v-if="!assigned" class="btn-quiet" :disabled="busy" @click="claim">Claim</button>
          <template v-else-if="claimedByMe">
            <span class="chip border-signal/40 text-signal">Yours</span>
            <button class="btn-quiet" :disabled="busy" @click="release">Release</button>
          </template>
          <span v-else class="chip border-warn/40 text-warn">
            {{ assigned.display_name }} · {{ claimedAgo }}
          </span>
        </template>

        <span class="rounded-lg px-2 py-1 font-mono text-sm" :class="scoreClass">
          {{ lead.score }}
        </span>
      </div>
    </div>

    <p v-if="locked" class="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
      {{ assigned.display_name }} claimed this thread. Two replies from one brand reads as
      brigading, so coordinate before posting.
    </p>

    <!-- Same Reddit thread, different campaign. Claiming is per-row, so without
         this the twin looks free even though a teammate is already on it. -->
    <p
      v-if="claimedElsewhere"
      class="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn"
    >
      Also in the “{{ claimedElsewhere.sibling_campaign_name }}” campaign, where
      {{ claimedElsewhere.sibling_assigned_name || 'someone' }}
      {{ claimedElsewhere.sibling_status === 'replied' ? 'has already replied' : 'has claimed it' }}.
      Same thread, so only one of you should post.
    </p>

    <!-- A later scan refreshed num_comments past what it was when you posted:
         worth checking back on the thread, without treating it as new. -->
    <p v-if="newActivityCount" class="mt-3 flex items-center gap-2 text-xs text-signal-soft">
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-hidden="true" />
      +{{ newActivityCount }} {{ newActivityCount === 1 ? 'reply' : 'replies' }} since you posted
    </p>

    <div v-if="lead.signals?.length" class="mt-3 flex flex-wrap gap-1.5">
      <span v-for="signal in lead.signals" :key="signal" class="chip">{{ signal }}</span>
    </div>

    <p v-if="lead.body" class="mt-3 text-sm leading-relaxed whitespace-pre-line text-mute">
      {{ expanded ? lead.body : truncatedBody }}
      <button v-if="isLong" class="ml-1 text-signal hover:underline" @click="expanded = !expanded">
        {{ expanded ? 'less' : 'more' }}
      </button>
    </p>

    <!-- Draft -->
    <div class="mt-4 rounded-lg border border-line bg-panel-2 p-3">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-medium tracking-wide text-mute uppercase">
          {{ localMode ? 'Reply draft' : 'Your draft' }}
        </span>
        <div class="flex items-center gap-1">
          <button class="btn-quiet" :disabled="drafting || locked" @click="generate">
            {{ drafting ? 'Writing…' : (draft ? 'Regenerate' : 'Generate') }}
          </button>
          <button v-if="draft" class="btn-quiet" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
          <button v-if="dirty" class="btn-quiet text-signal" :disabled="locked" @click="saveDraft">Save</button>
        </div>
      </div>

      <textarea
        v-model="draft"
        class="input min-h-28 bg-panel transition-colors duration-700"
        :class="justGenerated
          ? 'border-ok/60 ring-2 ring-ok/30'
          : (placeholders.length ? 'border-warn/50 focus:border-warn' : '')"
        :readonly="locked"
        placeholder="No draft yet. Hit Generate."
      />

      <p v-if="placeholders.length" class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-warn">
        Fill in before posting:
        <span v-for="ph in placeholders" :key="ph" class="rounded bg-warn/15 px-1.5 py-0.5 font-mono">{{ ph }}</span>
      </p>
      <p v-if="otherDrafters.length" class="mt-2 text-xs text-mute">
        Also drafting: {{ otherDrafters.join(', ') }}
      </p>
      <p v-if="draftError" class="mt-2 text-xs text-signal-soft">{{ draftError }}</p>
    </div>

    <!-- Replied confirmation: capture the permalink so the team can see what
         actually went out. -->
    <div v-if="pendingReplied" class="mt-3 rounded-lg border border-line bg-panel-2 p-3">
      <label class="label" :for="`posted-${lead.id}`">Link to your comment (optional)</label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          :id="`posted-${lead.id}`"
          v-model="repliedUrl"
          class="input"
          type="url"
          inputmode="url"
          placeholder="https://www.reddit.com/r/…/comment/…"
        >
        <button class="btn-primary shrink-0" :disabled="busy" @click="confirmReplied">Mark replied</button>
        <button class="btn-quiet shrink-0" @click="pendingReplied = false">Cancel</button>
      </div>
    </div>

    <!-- Status -->
    <div class="mt-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="status in statuses"
        :key="status"
        class="rounded-lg px-2.5 py-1 text-xs capitalize transition-colors"
        :disabled="locked || busy"
        :class="status === lead.status
          ? 'bg-signal/15 text-signal'
          : 'text-mute hover:bg-panel-2 hover:text-fg disabled:opacity-50'"
        @click="setStatus(status)"
      >
        {{ status }}
      </button>

      <a
        v-if="lead.posted_url"
        :href="lead.posted_url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-quiet text-ok"
      >View reply →</a>

      <a
        :href="lead.url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-quiet ml-auto"
        :class="locked ? 'opacity-40' : ''"
        :title="locked ? `Claimed by ${assigned?.display_name}` : undefined"
      >Open on Reddit →</a>
    </div>
  </article>
</template>

<script>
import { LEAD_STATUSES } from '#shared/types'

export default {
  props: {
    lead: { type: Object, required: true },
  },

  emits: ['update'],

  setup() {
    const config = useRuntimeConfig()
    const localMode = config.public.localMode
    return {
      localMode,
      supabase: localMode ? null : useSupabaseClient(),
      me: useMe(),
      toast: useToasts().push,
    }
  },

  data() {
    const mine = this.localMode
      ? null
      : (this.lead.lead_drafts ?? []).find(d => d.user_id === this.me?.id)

    return {
      statuses: LEAD_STATUSES,
      // Your row if you have one; the shared AI seed otherwise.
      draft: mine?.body ?? this.lead.reply_draft ?? '',
      savedDraft: mine?.body ?? this.lead.reply_draft ?? '',
      drafting: false,
      draftError: '',
      justGenerated: false,
      copied: false,
      expanded: false,
      busy: false,
      pendingReplied: false,
      repliedUrl: '',
    }
  },

  computed: {
    myId() {
      return this.me?.id ?? null
    },

    // Snapshotted server-side the moment status became 'replied' (see
    // migration 0008); num_comments keeps refreshing on every later scan. A
    // small floor avoids flagging a single stray reply as "new activity".
    newActivityCount() {
      if (this.lead.status !== 'replied') return 0
      if (this.lead.num_comments == null || this.lead.replied_num_comments == null) return 0
      const delta = this.lead.num_comments - this.lead.replied_num_comments
      return delta >= 2 ? delta : 0
    },

    assigned() {
      return this.lead.assigned ?? null
    },

    claimed() {
      // Local mode: show the claimed_by field directly (usually a user ID).
      // For display, we could show "You" if it's the current user, or just the ID.
      return this.lead.claimed_by ?? null
    },

    claimedByMe() {
      if (this.localMode) {
        return this.lead.claimed_by === this.myId
      }
      return Boolean(this.assigned && this.assigned.id === this.myId)
    },

    locked() {
      if (this.localMode) {
        return Boolean(this.lead.claimed_by && !this.claimedByMe)
      }
      return Boolean(this.assigned && !this.claimedByMe)
    },

    // Attached by the inbox from the lead_thread_claims view. Suppressed when
    // this row is already claimed, since the banner above says the same thing.
    claimedElsewhere() {
      if (this.assigned) return null
      return this.lead.claimed_elsewhere ?? null
    },

    claimedAgo() {
      return this.timeAgo(this.lead.claimed_at)
    },

    otherDrafters() {
      if (this.localMode) return []
      return (this.lead.lead_drafts ?? [])
        .filter(d => d.user_id !== this.myId && d.body?.trim())
        .map(d => d.profiles?.display_name)
        .filter(Boolean)
    },

    dirty() {
      return this.draft !== this.savedDraft
    },

    // Bracketed numbers the model couldn't know ("[X]% more callbacks") and
    // left for whoever posts to fill in. Easy to miss inside a wall of text,
    // so the textarea gets a warning ring and these get spelled out below it.
    placeholders() {
      return [...new Set((this.draft.match(/\[[^\]\n]{1,24}\]/g) ?? []))]
    },

    isLong() {
      return (this.lead.body?.length ?? 0) > 280
    },

    truncatedBody() {
      return this.isLong ? `${this.lead.body.slice(0, 280).trimEnd()}…` : this.lead.body
    },

    scoreClass() {
      if (this.lead.score >= 70) return 'bg-signal/15 text-signal'
      if (this.lead.score >= 40) return 'bg-warn/10 text-warn'
      return 'bg-panel-2 text-mute'
    },

    age() {
      return this.timeAgo(this.lead.posted_at || this.lead.discovered_at) ?? 'unknown age'
    },
  },

  watch: {
    // Local mode only: a rescan can refresh the shared draft under us.
    'lead.reply_draft'(value) {
      if (this.localMode && !this.dirty) {
        this.draft = value ?? ''
        this.savedDraft = value ?? ''
      }
    },
  },

  methods: {
    timeAgo(stamp) {
      if (!stamp) return null
      const hours = (Date.now() - new Date(stamp).getTime()) / 3_600_000
      if (hours < 1) return 'just now'
      if (hours < 24) return `${Math.round(hours)}h ago`
      const days = Math.round(hours / 24)
      return days === 1 ? 'yesterday' : `${days}d ago`
    },

    // Fire-and-forget: the action already succeeded, the log is bookkeeping.
    logEvent(type, fromStatus = null, toStatus = null) {
      if (this.localMode) return
      this.supabase
        .from('lead_events')
        .insert({
          lead_id: this.lead.id,
          user_id: this.myId,
          type,
          from_status: fromStatus,
          to_status: toStatus,
        })
        .then(({ error }) => {
          if (error) console.warn('lead_events insert failed:', error.message)
        })
    },

    async claim() {
      this.busy = true
      try {
        // `.is('assigned_to', null)` makes this first-writer-wins: if a
        // teammate claimed between render and click, zero rows come back.
        const { data, error } = await this.supabase
          .from('leads')
          .update({ assigned_to: this.myId, claimed_at: new Date().toISOString() })
          .eq('id', this.lead.id)
          .is('assigned_to', null)
          .select('assigned_to, claimed_at, assigned:profiles!leads_assigned_to_fkey(id, display_name)')

        if (error) throw new Error(error.message)

        if (data?.length) {
          this.$emit('update', { id: this.lead.id, patch: data[0] })
          this.logEvent('claimed')
        } else {
          // Lost the race. Show who won instead of pretending.
          const { data: fresh } = await this.supabase
            .from('leads')
            .select('assigned_to, claimed_at, assigned:profiles!leads_assigned_to_fkey(id, display_name)')
            .eq('id', this.lead.id)
            .single()
          if (fresh) this.$emit('update', { id: this.lead.id, patch: fresh })
        }
      } catch (e) {
        this.draftError = e.message
      } finally {
        this.busy = false
      }
    },

    async release() {
      this.busy = true
      try {
        const { error } = await this.supabase
          .from('leads')
          .update({ assigned_to: null, claimed_at: null })
          .eq('id', this.lead.id)
          .eq('assigned_to', this.myId)

        if (error) throw new Error(error.message)

        this.$emit('update', { id: this.lead.id, patch: { assigned_to: null, claimed_at: null, assigned: null } })
        this.logEvent('released')
      } catch (e) {
        this.draftError = e.message
      } finally {
        this.busy = false
      }
    },

    async setStatus(status) {
      if (status === this.lead.status) return

      if (this.localMode) {
        this.busy = true
        try {
          const { lead } = await $fetch('/api/workspace', {
            method: 'POST',
            body: { action: 'update_lead', leadId: this.lead.id, patch: { status } },
          })
          this.$emit('update', { id: this.lead.id, patch: lead })
        } catch (e) {
          this.draftError = e.data?.statusMessage || e.message
        } finally {
          this.busy = false
        }
        return
      }

      if (this.locked) return

      // Replied is the one transition with an artifact: ask for the permalink.
      if (status === 'replied') {
        this.pendingReplied = true
        return
      }

      await this.commitStatus(status)
    },

    async confirmReplied() {
      const url = this.repliedUrl.trim()
      await this.commitStatus('replied', url || null)
      this.pendingReplied = false
      this.repliedUrl = ''
    },

    async commitStatus(status, postedUrl) {
      this.busy = true
      const from = this.lead.status
      try {
        const patch = { status }
        if (postedUrl !== undefined) patch.posted_url = postedUrl

        const { error } = await this.supabase.from('leads').update(patch).eq('id', this.lead.id)
        if (error) throw new Error(error.message)

        this.$emit('update', { id: this.lead.id, patch })
        this.logEvent('status_changed', from, status)
      } catch (e) {
        this.draftError = e.message
      } finally {
        this.busy = false
      }
    },

    async saveDraft() {
      if (this.localMode) {
        await $fetch('/api/workspace', {
          method: 'POST',
          body: { action: 'update_lead', leadId: this.lead.id, patch: { reply_draft: this.draft } },
        })
        this.savedDraft = this.draft
        this.$emit('update', { id: this.lead.id, patch: { reply_draft: this.draft } })
        return
      }

      const { error } = await this.supabase
        .from('lead_drafts')
        .upsert(
          { lead_id: this.lead.id, user_id: this.myId, body: this.draft },
          { onConflict: 'lead_id,user_id' },
        )

      if (error) {
        this.draftError = error.message
        return
      }

      this.savedDraft = this.draft
      this.emitMyDraft()
    },

    emitMyDraft() {
      const others = (this.lead.lead_drafts ?? []).filter(d => d.user_id !== this.myId)
      this.$emit('update', {
        id: this.lead.id,
        patch: {
          lead_drafts: [
            ...others,
            { user_id: this.myId, body: this.draft, updated_at: new Date().toISOString() },
          ],
        },
      })
    },

    async generate() {
      const wasRegenerate = Boolean(this.draft.trim())
      this.drafting = true
      this.draftError = ''

      try {
        const result = await $fetch('/api/draft', {
          method: 'POST',
          body: { leadId: this.lead.id },
        })
        this.draft = result.draft
        this.savedDraft = result.draft

        if (this.localMode) {
          this.$emit('update', { id: this.lead.id, patch: { reply_draft: result.draft } })
        } else {
          // The server already upserted our lead_drafts row.
          this.emitMyDraft()
        }

        this.toast(wasRegenerate ? 'New draft ready.' : 'Draft ready.', { tone: 'success' })

        // Brief flash so the update is obvious even if you weren't looking
        // right at the textarea when it landed.
        this.justGenerated = true
        setTimeout(() => { this.justGenerated = false }, 1500)
      } catch (e) {
        this.draftError = e.data?.statusMessage || e.message
      } finally {
        this.drafting = false
      }
    },

    async copy() {
      await navigator.clipboard.writeText(this.draft)
      this.copied = true
      setTimeout(() => { this.copied = false }, 1500)
    },
  },
}
</script>
