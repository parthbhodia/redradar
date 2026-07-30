<template>
  <div class="mx-auto flex max-w-md flex-col justify-center px-6 py-24">
    <h1 class="text-2xl font-semibold tracking-tight">Sign in to RedRadar</h1>
    <p class="mt-2 text-sm text-mute">
      We'll email you a link. No password to remember.
    </p>

    <form class="mt-8 space-y-4" @submit.prevent="sendLink">
      <div>
        <label class="label" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          class="input"
          type="email"
          required
          autocomplete="email"
          placeholder="you@company.com"
        >
      </div>

      <button class="btn-primary w-full" type="submit" :disabled="pending">
        {{ pending ? 'Sending…' : 'Email me a link' }}
      </button>
    </form>

    <div class="my-6 flex items-center gap-3 text-xs text-mute">
      <span class="h-px flex-1 bg-line" />or<span class="h-px flex-1 bg-line" />
    </div>

    <button class="btn-ghost w-full" :disabled="pending" @click="signInWithGoogle">
      Continue with Google
    </button>

    <p v-if="sent" class="mt-6 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
      Check {{ email }} for the sign-in link.
    </p>

    <p v-if="error" class="mt-6 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
      {{ error }}
    </p>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'Sign in — RedRadar' })
    return { supabase: useSupabaseClient(), route: useRoute() }
  },

  data() {
    return {
      email: '',
      pending: false,
      sent: false,
      error: '',
    }
  },

  computed: {
    // Where to land after the round trip through email / the OAuth provider.
    redirectTo() {
      const next = typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
      return `${window.location.origin}/confirm?next=${encodeURIComponent(next)}`
    },
  },

  methods: {
    async sendLink() {
      this.pending = true
      this.error = ''
      this.sent = false

      const { error } = await this.supabase.auth.signInWithOtp({
        email: this.email,
        options: { emailRedirectTo: this.redirectTo },
      })

      this.pending = false
      if (error) this.error = error.message
      else this.sent = true
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
        // Google has to be enabled in the Supabase dashboard first.
        this.error = error.message
      }
    },
  },
}
</script>
