<template>
  <div>
    <!-- Hero -->
    <section class="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center sm:pt-24">
      <p class="eyebrow">Reddit lead discovery</p>

      <h1 class="mt-8 text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-7xl">
        People are asking<br>for what you sell.
        <span class="accent-line mt-2 block font-normal">You’re not in the thread.</span>
      </h1>

      <div class="mx-auto mt-9 max-w-2xl space-y-1.5 text-lg text-ink-soft sm:text-xl">
        <p>Reddit threads rank in Google and get quoted back by AI assistants.</p>
        <p>They’re where buyers ask each other what to actually use.</p>
        <p class="font-medium text-ink">RedRadar finds those threads while the question is still open.</p>
      </div>

      <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
        <NuxtLink to="/login" class="btn-ink">
          Start scanning
          <span aria-hidden="true">→</span>
        </NuxtLink>
        <a href="#scoring" class="btn-outline">See how it scores</a>
      </div>

      <p class="mt-5 text-sm text-ink-soft">No card. Bring your own keywords.</p>
    </section>

    <!-- Where it looks -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-6xl px-6 py-10">
      <div class="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-center">
        <span class="font-medium">Watches any subreddit</span>
        <span class="text-ink-soft">
          r/SaaS · r/Entrepreneur · r/jobs · r/webdev · r/marketing · and the niche ones that matter more
        </span>
      </div>
    </section>
    <div class="rule-dashed mx-auto max-w-6xl" />

    <!-- Why Reddit -->
    <section class="mx-auto max-w-3xl px-6 py-20 text-center">
      <p class="eyebrow">Why Reddit</p>

      <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
        Nobody trusts an ad.
        <span class="accent-line mt-1.5 block font-normal">Everybody trusts a comment.</span>
      </h2>

      <p class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">
        When someone is close to buying, they don’t search for your landing page. They
        search for what other people think. That answer already exists in a thread, written
        by a stranger, and it will outrank you for years. The only way in is to be genuinely
        useful in that thread, before it goes cold.
      </p>
    </section>

    <!-- How it works -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-6xl px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">How it works</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Three steps, then an inbox.
        </h2>
      </div>

      <div class="mt-14 grid gap-10 md:grid-cols-3">
        <article v-for="(step, i) in steps" :key="step.title">
          <p class="font-mono text-sm text-signal">{{ String(i + 1).padStart(2, '0') }}</p>
          <h3 class="mt-3 text-xl font-medium">{{ step.title }}</h3>
          <p class="mt-2.5 leading-relaxed text-ink-soft">{{ step.body }}</p>
        </article>
      </div>
    </section>

    <!-- Scoring -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section id="scoring" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">Scoring</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Every score shows its work.
          <span class="accent-line mt-1.5 block font-normal">No black box, no vibes.</span>
        </h2>
        <p class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">
          A number you can’t interrogate is a number you can’t trust. Each lead carries the
          signals behind it, so you can tell a real opportunity from a keyword coincidence
          without opening the thread.
        </p>
      </div>

      <!-- Illustrative lead card -->
      <div class="mx-auto mt-12 max-w-2xl rounded-2xl border border-rule bg-card p-6 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-medium">Anyone found a decent alternative to [competitor]?</p>
            <p class="mt-1 text-sm text-ink-soft">r/SaaS · 3h ago · 2 comments</p>
          </div>
          <span class="shrink-0 rounded-lg bg-signal/12 px-2.5 py-1 font-mono text-signal tabular-nums">87</span>
        </div>

        <div class="mt-4 flex flex-wrap gap-1.5">
          <span
            v-for="signal in signals"
            :key="signal"
            class="rounded-full border border-rule px-2.5 py-1 text-xs text-ink-soft"
          >{{ signal }}</span>
        </div>
      </div>
    </section>

    <!-- What it won’t do -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-3xl px-6 py-20 text-center">
      <p class="eyebrow">The part most tools skip</p>

      <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
        It won’t post for you.
        <span class="accent-line mt-1.5 block font-normal">That’s the point.</span>
      </h2>

      <p class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Automated replies are why Reddit hates marketers. RedRadar writes a draft from your
        brand’s own voice. It answers the question first, discloses who you are, and
        says when you’re not the right fit. Then it hands it to you. You read it, you edit
        it, you post it. A comment that gets upvoted is worth more than a hundred that get
        removed.
      </p>
    </section>

    <!-- CTA -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 class="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
        The thread is open
        <span class="accent-line mt-1.5 block font-normal">for about a day.</span>
      </h2>

      <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
        <NuxtLink to="/login" class="btn-ink">
          Start scanning
          <span aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({
      title: 'RedRadar · Find high-intent Reddit threads before they go cold',
      meta: [{
        name: 'description',
        content: 'RedRadar watches Reddit for the threads that match your keywords, scores them by buying intent, and drafts a reply worth posting.',
      }],
    })
  },

  data() {
    return {
      steps: [
        {
          title: 'Describe your brand',
          body: 'What you do, who it’s for, who you compete with, and how you sound. Everything downstream is written from this.',
        },
        {
          title: 'Add the keywords',
          body: 'The phrases people type when they’re shopping: competitor names, the problem in their words. Pin one to a subreddit if you need to.',
        },
        {
          title: 'Work the inbox',
          body: 'Scored threads arrive with a draft attached. Edit it, copy it, open the thread, mark it replied. Rescans never touch your notes.',
        },
      ],
      signals: [
        'exact phrase in title',
        'asking for an alternative',
        'posted in the last 24h',
        'few replies so far',
        'mentions a competitor',
      ],
    }
  },
}
</script>
