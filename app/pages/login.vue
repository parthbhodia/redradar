<template>
  <!-- Minimal variant (?v=minimal): just the form, centred. -->
  <div v-if="variant === 'minimal'" class="mx-auto max-w-md px-6 py-20">
    <p class="eyebrow">Sign in</p>
    <h1 class="mt-6 text-4xl font-semibold tracking-tight text-balance">
      Back to the inbox.
    </h1>
    <p class="mt-3 text-ink-soft">
      {{ localMode
        ? 'Local dogfood mode. Enter any address to continue.'
        : 'A link lands in your inbox. No password to remember.' }}
    </p>

    <div class="mt-8">
      <AuthForm />
    </div>
  </div>

  <!-- Default: form on the left, what's waiting inside on the right. -->
  <div v-else class="mx-auto grid max-w-6xl items-center gap-14 px-6 py-14 lg:min-h-[calc(100dvh-170px)] lg:grid-cols-2 lg:py-10">
    <div class="mx-auto w-full max-w-md">
      <p class="eyebrow">Sign in</p>
      <h1 class="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Back to the inbox.
        <span class="accent-line mt-1.5 block font-normal">The threads don’t wait.</span>
      </h1>
      <p class="mt-4 text-ink-soft">
        {{ localMode
          ? 'Local dogfood mode. Enter any address to continue.'
          : 'A link lands in your inbox. No password to remember.' }}
      </p>

      <div class="mt-8">
        <AuthForm />
      </div>
    </div>

    <!-- Product vignette: a believable slice of the inbox, not a stock illustration. -->
    <div class="hidden lg:block" aria-hidden="true">
      <div class="rounded-3xl border border-rule bg-card p-8 shadow-sm">
        <p class="text-xs font-medium tracking-[0.12em] text-ink-soft uppercase">Your inbox</p>

        <div class="mt-5 space-y-3">
          <div class="rounded-xl border border-rule p-4">
            <div class="flex items-start justify-between gap-3">
              <p class="text-sm font-medium">Anyone found a decent alternative to Linktree?</p>
              <span class="shrink-0 rounded-lg bg-signal/12 px-2 py-0.5 font-mono text-sm text-signal tabular-nums">87</span>
            </div>
            <p class="mt-1 text-xs text-ink-soft">r/SaaS · 3h ago · 2 comments</p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span class="rounded-full border border-rule px-2 py-0.5 text-[11px] text-ink-soft">asking for an alternative</span>
              <span class="rounded-full border border-rule px-2 py-0.5 text-[11px] text-ink-soft">posted in the last 24h</span>
            </div>
          </div>

          <div class="rounded-xl border border-rule p-4 opacity-80">
            <div class="flex items-start justify-between gap-3">
              <p class="text-sm font-medium">is Linktree Pro worth it or should I look elsewhere</p>
              <span class="shrink-0 rounded-lg bg-panel/5 px-2 py-0.5 font-mono text-sm text-ink-soft tabular-nums">64</span>
            </div>
            <p class="mt-1 text-xs text-ink-soft">r/Entrepreneur · 9h ago · 5 comments</p>
          </div>

          <div class="rounded-xl border border-dashed border-rule p-4">
            <p class="text-xs font-medium tracking-[0.12em] text-ink-soft uppercase">Draft</p>
            <p class="mt-2 text-sm leading-relaxed text-ink-soft">
              depends how many links you actually need. if it's three or four, Linktree's free
              tier is fine and you're done. caveat that i work on Cueful so i'm biased…
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'Sign in · RedIntelli' })
    const config = useRuntimeConfig()
    return {
      localMode: config.public.localMode,
      route: useRoute(),
    }
  },

  computed: {
    variant() {
      return this.route.query.v === 'minimal' ? 'minimal' : 'split'
    },
  },
}
</script>
