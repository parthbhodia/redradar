<template>
  <div>
    <form class="space-y-4" @submit.prevent="sendLink">
      <div>
        <label class="label-paper" for="auth-email">Email</label>
        <input
          id="auth-email"
          v-model="email"
          class="input-paper"
          type="email"
          required
          autocomplete="email"
          :spellcheck="false"
          placeholder="you@company.com"
        >
      </div>

      <button class="btn-ink w-full" type="submit" :disabled="pending">
        {{ pending ? 'Working…' : (localMode ? 'Continue' : 'Email me a link') }}
      </button>
    </form>

    <template v-if="!localMode">
      <div class="my-5 flex items-center gap-3 text-xs text-ink-soft">
        <span class="h-px flex-1 bg-rule" aria-hidden="true" />or<span class="h-px flex-1 bg-rule" aria-hidden="true" />
      </div>

      <button class="btn-outline w-full" :disabled="pending" @click="signInWithGoogle">
        <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.97 11.97 0 0 0 0 10.76l3.98-3.09z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
        </svg>
        Continue with Google
      </button>

      <p
        v-if="sent"
        class="mt-5 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ink"
        aria-live="polite"
      >
        Check <span class="font-medium">{{ email }}</span> for the sign-in link.
      </p>
    </template>

    <p
      v-if="error"
      class="mt-5 rounded-xl border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-ink"
      aria-live="polite"
    >
      {{ error }}
    </p>
  </div>
</template>

<script>
export default {
  setup() {
    const config = useRuntimeConfig()
    return {
      localMode: config.public.localMode,
      supabase: config.public.localMode ? null : useSupabaseClient(),
      route: useRoute(),
    }
  },

  data() {
    return {
      // Prefilled only for local dogfooding; a real sign-in starts empty.
      email: this.localMode ? 'dogfood@cueful.bio' : '',
      pending: false,
      sent: false,
      error: '',
    }
  },

  computed: {
    redirectTo() {
      const next = typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
      return `${window.location.origin}/confirm?next=${encodeURIComponent(next)}`
    },
    nextPath() {
      return typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
    },
  },

  methods: {
    async sendLink() {
      this.pending = true
      this.error = ''
      this.sent = false

      try {
        if (this.localMode) {
          await $fetch('/api/auth/local', { method: 'POST', body: { email: this.email } })
          await navigateTo(this.nextPath)
          return
        }

        const { error } = await this.supabase.auth.signInWithOtp({
          email: this.email,
          options: { emailRedirectTo: this.redirectTo },
        })

        if (error) this.error = error.message
        else this.sent = true
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.pending = false
      }
    },

    async signInWithGoogle() {
      this.pending = true
      this.error = ''

      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: this.redirectTo },
      })

      if (error) {
        this.pending = false
        this.error = error.message
      }
    },
  },
}
</script>
