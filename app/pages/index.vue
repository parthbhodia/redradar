<template>
  <div>
    <!-- Hero -->
    <section class="relative overflow-hidden">
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
        <svg viewBox="0 0 400 400" class="h-[560px] w-[560px]">
          <circle v-for="r in [60, 120, 180]" :key="r" cx="200" cy="200" :r="r" fill="none" stroke="currentColor" />
          <line x1="200" y1="20" x2="200" y2="380" stroke="currentColor" />
          <line x1="20" y1="200" x2="380" y2="200" stroke="currentColor" />
          <path d="M200 200 L200 20 A180 180 0 0 1 327 73 Z" fill="var(--color-signal)" class="radar-sweep" />
        </svg>
      </div>

      <div class="relative mx-auto max-w-3xl px-6 pt-24 pb-20 text-center">
        <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs text-mute">
          <span class="h-1.5 w-1.5 rounded-full bg-signal radar-ping" />
          Reddit lead discovery
        </p>

        <h1 class="text-4xl leading-[1.1] font-semibold tracking-tight sm:text-6xl">
          Your customers are already<br class="hidden sm:block" >
          asking for you on Reddit.
        </h1>

        <p class="mx-auto mt-6 max-w-xl text-lg text-mute">
          RedRadar watches the threads that match your keywords, scores them by how
          likely they are to convert, and drafts a reply that won't get you downvoted.
        </p>

        <div class="mt-9 flex items-center justify-center gap-3">
          <NuxtLink to="/login" class="btn-primary px-5 py-2.5">Start scanning</NuxtLink>
          <a href="#how" class="btn-ghost px-5 py-2.5">How it works</a>
        </div>

        <p class="mt-4 text-xs text-mute">No credit card. Bring your own Reddit keywords.</p>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="mx-auto max-w-6xl px-6 py-16">
      <h2 class="text-sm font-medium tracking-wide text-mute uppercase">How it works</h2>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article v-for="(step, i) in steps" :key="step.title" class="card">
          <div class="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-panel-2 font-mono text-sm text-signal">
            {{ i + 1 }}
          </div>
          <h3 class="mb-2 font-medium">{{ step.title }}</h3>
          <p class="text-sm leading-relaxed text-mute">{{ step.body }}</p>
        </article>
      </div>
    </section>

    <!-- Scoring -->
    <section class="mx-auto max-w-6xl px-6 py-8">
      <div class="grid items-start gap-10 md:grid-cols-2">
        <div>
          <h2 class="text-2xl font-semibold tracking-tight">Every lead shows its work</h2>
          <p class="mt-4 leading-relaxed text-mute">
            A score you can't interrogate is a score you can't trust. RedRadar attaches
            the signals behind every number — intent language, freshness, competitor
            mentions, how crowded the thread already is — so you can tell a real
            opportunity from a keyword coincidence at a glance.
          </p>
        </div>

        <div class="card">
          <div class="mb-3 flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-medium">Any good linktree alternatives for creators?</p>
              <p class="mt-1 text-xs text-mute">r/NewTubers · 3h ago</p>
            </div>
            <span class="rounded-lg bg-signal/15 px-2 py-1 font-mono text-sm text-signal">87</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="signal in exampleSignals" :key="signal" class="chip">{{ signal }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Roadmap -->
    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="card">
        <h2 class="text-lg font-medium">Where this is going</h2>
        <div class="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium tracking-wide text-signal uppercase">Available now</p>
            <ul class="space-y-1.5 text-sm text-mute">
              <li v-for="item in now" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div>
            <p class="mb-2 text-xs font-medium tracking-wide text-mute uppercase">Next</p>
            <ul class="space-y-1.5 text-sm text-mute">
              <li v-for="item in next" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'RedRadar — find high-intent Reddit threads' })
  },

  data() {
    return {
      steps: [
        {
          title: 'Describe your brand',
          body: 'One-liner, what it does, who it is for, who you compete with, and how you sound. This is what the drafts are written from.',
        },
        {
          title: 'Add the keywords',
          body: 'The phrases people use when they are shopping for what you sell. Optionally pin a keyword to a single subreddit.',
        },
        {
          title: 'Work the inbox',
          body: 'Scored threads land in an inbox with a draft reply attached. Edit it, copy it, open the thread, mark it replied.',
        },
      ],
      exampleSignals: [
        'exact phrase in title',
        'asking for recommendations',
        'posted in the last 24h',
        'few replies so far',
      ],
      now: [
        'Keyword-driven Reddit discovery',
        'Explainable relevance scoring',
        'AI reply drafts from your brand voice',
        'Status tracking: new, queued, replied, won',
      ],
      next: [
        'LLM citation tracking — where AI assistants cite you',
        'Scheduled scans and digests',
        'Team seats and shared inboxes',
      ],
    }
  },
}
</script>
