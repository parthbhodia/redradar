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

      <span class="shrink-0 rounded-lg px-2 py-1 font-mono text-sm" :class="scoreClass">
        {{ lead.score }}
      </span>
    </div>

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
        <span class="text-xs font-medium tracking-wide text-mute uppercase">Reply draft</span>
        <div class="flex items-center gap-1">
          <button class="btn-quiet" :disabled="drafting" @click="generate">
            {{ drafting ? 'Writing…' : (lead.reply_draft ? 'Regenerate' : 'Generate') }}
          </button>
          <button v-if="draft" class="btn-quiet" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
          <button v-if="dirty" class="btn-quiet text-signal" @click="saveDraft">Save</button>
        </div>
      </div>

      <textarea
        v-model="draft"
        class="input min-h-28 bg-panel"
        placeholder="No draft yet — hit Generate."
      />

      <p v-if="draftError" class="mt-2 text-xs text-signal-soft">{{ draftError }}</p>
    </div>

    <!-- Status -->
    <div class="mt-4 flex flex-wrap items-center gap-1.5">
      <button
        v-for="status in statuses"
        :key="status"
        class="rounded-lg px-2.5 py-1 text-xs capitalize transition-colors"
        :class="status === lead.status
          ? 'bg-signal/15 text-signal'
          : 'text-mute hover:bg-panel-2 hover:text-fg'"
        @click="setStatus(status)"
      >
        {{ status }}
      </button>

      <a
        :href="lead.url"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-quiet ml-auto"
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
    return { supabase: useSupabaseClient() }
  },

  data() {
    return {
      statuses: LEAD_STATUSES,
      draft: this.lead.reply_draft ?? '',
      drafting: false,
      draftError: '',
      copied: false,
      expanded: false,
    }
  },

  computed: {
    dirty() {
      return this.draft !== (this.lead.reply_draft ?? '')
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
      const stamp = this.lead.posted_at || this.lead.discovered_at
      if (!stamp) return 'unknown age'

      const hours = (Date.now() - new Date(stamp).getTime()) / 3_600_000
      if (hours < 1) return 'just now'
      if (hours < 24) return `${Math.round(hours)}h ago`
      const days = Math.round(hours / 24)
      return days === 1 ? 'yesterday' : `${days}d ago`
    },
  },

  watch: {
    // A rescan can replace the row underneath us; don't clobber unsaved edits.
    'lead.reply_draft'(value) {
      if (!this.dirty) this.draft = value ?? ''
    },
  },

  methods: {
    async setStatus(status) {
      const { error } = await this.supabase.from('leads').update({ status }).eq('id', this.lead.id)
      if (!error) this.$emit('update', { id: this.lead.id, patch: { status } })
    },

    async saveDraft() {
      const { error } = await this.supabase
        .from('leads')
        .update({ reply_draft: this.draft })
        .eq('id', this.lead.id)

      if (error) this.draftError = error.message
      else this.$emit('update', { id: this.lead.id, patch: { reply_draft: this.draft } })
    },

    async generate() {
      this.drafting = true
      this.draftError = ''

      try {
        const result = await $fetch('/api/draft', {
          method: 'POST',
          body: { leadId: this.lead.id },
        })
        this.draft = result.draft
        this.$emit('update', { id: this.lead.id, patch: { reply_draft: result.draft } })
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
