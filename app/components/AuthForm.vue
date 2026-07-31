<template>
  <div>
    <form class="space-y-4" @submit.prevent="submit">
      <div>
        <label class="label-paper" for="auth-email">Email</label>
        <input
          id="auth-email"
          v-model="email"
          class="input-paper"
          type="email"
          name="email"
          required
          autocomplete="email"
          :spellcheck="false"
          placeholder="you@company.com"
        >
      </div>

      <div v-if="mode === 'password'">
        <label class="label-paper" for="auth-password">Password</label>
        <div class="relative">
          <input
            id="auth-password"
            v-model="password"
            class="input-paper pr-20"
            :type="revealed ? 'text' : 'password'"
            name="password"
            required
            :minlength="isSignUp ? 8 : undefined"
            :autocomplete="isSignUp ? 'new-password' : 'current-password'"
            :spellcheck="false"
            :placeholder="isSignUp ? 'At least 8 characters' : 'Your password'"
          >
          <button
            type="button"
            class="absolute inset-y-0 right-3 text-xs font-medium text-ink-soft hover:text-ink"
            :aria-label="revealed ? 'Hide password' : 'Show password'"
            @click="revealed = !revealed"
          >
            {{ revealed ? 'Hide' : 'Show' }}
          </button>
        </div>
        <p v-if="isSignUp" class="mt-1.5 text-xs text-ink-soft">
          Eight characters or more. Nothing else is required.
        </p>
      </div>

      <button class="btn-ink w-full" type="submit" :disabled="pending">
        {{ submitLabel }}
      </button>
    </form>

    <!-- Switching between the two email methods -->
    <div v-if="!localMode" class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <button class="text-ink-soft underline-offset-4 hover:text-ink hover:underline" @click="toggleMode">
        {{ mode === 'link' ? 'Use a password instead' : 'Email me a link instead' }}
      </button>

      <button
        v-if="mode === 'password'"
        class="text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        @click="toggleSignUp"
      >
        {{ isSignUp ? 'I already have an account' : 'Create an account' }}
      </button>
    </div>

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
    </template>

    <p
      v-if="notice"
      class="mt-5 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ink"
      aria-live="polite"
    >
      {{ notice }}
    </p>

    <p
      v-if="error"
      class="mt-5 rounded-xl border border-signal/40 bg-signal/10 px-4 py-3 text-sm text-ink"
      role="alert"
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
      password: '',
      mode: 'link',
      isSignUp: false,
      revealed: false,
      pending: false,
      notice: '',
      error: '',
    }
  },

  computed: {
    submitLabel() {
      if (this.pending) return 'Working…'
      if (this.localMode) return 'Continue'
      if (this.mode === 'link') return 'Email me a link'
      return this.isSignUp ? 'Create account' : 'Sign in'
    },

    redirectTo() {
      const next = typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
      return `${window.location.origin}/confirm?next=${encodeURIComponent(next)}`
    },

    nextPath() {
      return typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
    },
  },

  methods: {
    reset() {
      this.notice = ''
      this.error = ''
    },

    toggleMode() {
      this.mode = this.mode === 'link' ? 'password' : 'link'
      this.password = ''
      this.reset()
    },

    toggleSignUp() {
      this.isSignUp = !this.isSignUp
      this.reset()
    },

    submit() {
      if (this.localMode) return this.localSignIn()
      return this.mode === 'link' ? this.sendLink() : this.withPassword()
    },

    async localSignIn() {
      this.pending = true
      this.reset()
      try {
        await $fetch('/api/auth/local', { method: 'POST', body: { email: this.email } })
        await navigateTo(this.nextPath)
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
      } finally {
        this.pending = false
      }
    },

    async sendLink() {
      this.pending = true
      this.reset()

      const { error } = await this.supabase.auth.signInWithOtp({
        email: this.email,
        options: { emailRedirectTo: this.redirectTo },
      })

      this.pending = false
      if (error) this.error = error.message
      else this.notice = `Check ${this.email} for the sign-in link.`
    },

    async withPassword() {
      this.pending = true
      this.reset()

      if (this.isSignUp) {
        const { data, error } = await this.supabase.auth.signUp({
          email: this.email,
          password: this.password,
          options: { emailRedirectTo: this.redirectTo },
        })

        this.pending = false
        if (error) {
          this.error = error.message
          return
        }

        // With email confirmation on, signUp returns a user but no session.
        if (data.session) {
          await navigateTo(this.nextPath)
        } else {
          this.notice = `Account created. Confirm ${this.email} to finish signing in.`
        }
        return
      }

      const { error } = await this.supabase.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      })

      this.pending = false
      if (error) {
        // Supabase returns the same message for wrong password and unknown
        // account, which is correct: revealing which would enumerate users.
        this.error = error.message
        return
      }

      await navigateTo(this.nextPath)
    },

    async signInWithGoogle() {
      this.pending = true
      this.reset()

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
