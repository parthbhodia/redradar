<template>
  <div class="mx-auto max-w-md px-6 py-24 text-center">
    <p class="text-sm text-mute">{{ message }}</p>
    <NuxtLink v-if="stalled" to="/login" class="btn-ghost mt-6">Back to sign in</NuxtLink>
  </div>
</template>

<script>
export default {
  setup() {
    return { user: useSupabaseUser(), route: useRoute() }
  },

  data() {
    return {
      stalled: false,
      timer: null,
    }
  },

  computed: {
    message() {
      return this.stalled ? "That link didn't sign you in." : 'Signing you in…'
    },
  },

  watch: {
    user: {
      immediate: true,
      handler(value) {
        if (value) this.go()
      },
    },
  },

  mounted() {
    // The client parses the token out of the URL fragment on load; if no session
    // has appeared by then, the link was stale or already used.
    this.timer = setTimeout(() => {
      if (!this.user) this.stalled = true
    }, 5000)
  },

  beforeUnmount() {
    if (this.timer) clearTimeout(this.timer)
  },

  methods: {
    go() {
      const next = typeof this.route.query.next === 'string' ? this.route.query.next : '/app'
      return navigateTo(next.startsWith('/') ? next : '/app', { replace: true })
    },
  },
}
</script>
