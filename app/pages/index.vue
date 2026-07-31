<template>
  <div>
    <!-- Hero: argument left, live product right -->
    <section class="mx-auto max-w-6xl px-6 pt-12 pb-16 sm:pt-16">
      <div class="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p class="eyebrow">
            <span class="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-signal radar-ping" aria-hidden="true" />
            Reddit lead discovery
          </p>

          <h1 class="mt-7 text-5xl leading-[1.03] font-semibold tracking-tight text-balance sm:text-6xl">
            People are asking
            <span class="accent-line mt-1 block font-normal">for what you sell.</span>
          </h1>

          <p class="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">
            RedIntelli watches Reddit for the threads that match your keywords, scores every
            one by buying intent, and hands you a draft worth posting. You stay the person
            who replies.
          </p>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <NuxtLink to="/login" class="btn-ink">
              Start scanning
              <span aria-hidden="true">→</span>
            </NuxtLink>
            <a href="#anatomy" class="btn-outline">See a scored lead</a>
          </div>

          <ul class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
            <li v-for="item in assurances" :key="item" class="flex items-center gap-1.5">
              <CheckMark class="h-3.5 w-3.5 text-signal" />
              {{ item }}
            </li>
          </ul>
        </div>

        <!-- Live feed. Illustrative, but every signal string is one the scorer
             really emits. -->
        <div class="rounded-2xl border border-rule bg-card p-5 shadow-sm" aria-hidden="true">
          <div class="flex items-center justify-between font-mono text-xs text-ink-soft">
            <span class="flex items-center gap-2">
              <span class="inline-block h-1.5 w-1.5 rounded-full bg-signal radar-ping" />
              live · r/SaaS
            </span>
            <span>sorted by intent</span>
          </div>

          <ul class="mt-4 space-y-2.5">
            <li
              v-for="row in feed"
              :key="row.title"
              class="rounded-xl border border-rule p-3.5"
              :class="row.score >= 70 ? 'bg-signal/[0.04]' : ''"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="font-mono text-xs text-ink-soft">r/{{ row.sub }} · {{ row.age }}</p>
                <span
                  class="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums"
                  :class="row.score >= 70 ? 'bg-signal/15 text-signal' : 'bg-paper text-ink-soft'"
                >{{ row.score }}</span>
              </div>
              <p class="mt-1.5 text-sm">{{ row.title }}</p>
              <p class="mt-2 font-mono text-[11px] text-ink-soft">{{ row.signals }}</p>
            </li>
          </ul>

          <div class="mt-4 flex items-center gap-3 border-t border-rule pt-4">
            <span class="font-mono text-xs text-ink-soft">top intent</span>
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
              <span class="block h-1.5 rounded-full bg-signal" style="width: 87%" />
            </span>
            <span class="font-mono text-xs tabular-nums">87 / 100</span>
          </div>
        </div>
      </div>
    </section>


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
    <section id="how" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">Workflow</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Three steps, then an inbox.
        </h2>
      </div>

      <div class="mt-14 grid gap-5 md:grid-cols-3">
        <!-- 01 -->
        <article class="flex flex-col rounded-2xl border border-rule bg-card p-6">
          <p class="font-mono text-xs text-ink-soft">01 · describe</p>
          <h3 class="mt-3 text-xl font-medium">Describe your brand.</h3>
          <p class="mt-2.5 leading-relaxed text-ink-soft">
            What you do, who it’s for, who you compete with, how you sound. Every draft is
            written from this, so it’s worth ten minutes.
          </p>
          <div class="mt-6 border-t border-dashed border-rule pt-4">
            <p class="mb-2.5 font-mono text-[11px] text-ink-soft">competitors tracked</p>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="c in competitors" :key="c" class="rounded-full border border-rule px-2.5 py-1 text-xs">
                {{ c }}
              </span>
            </div>
          </div>
        </article>

        <!-- 02 -->
        <article class="flex flex-col rounded-2xl border border-rule bg-card p-6">
          <p class="font-mono text-xs text-ink-soft">02 · watch</p>
          <h3 class="mt-3 text-xl font-medium">Add the keywords.</h3>
          <p class="mt-2.5 leading-relaxed text-ink-soft">
            The phrases people type when they’re shopping. Competitor names pull the highest
            intent, so start there.
          </p>
          <div class="mt-6 border-t border-dashed border-rule pt-4">
            <p class="mb-2.5 font-mono text-[11px] text-ink-soft">leads · avg score</p>
            <ul class="space-y-2">
              <li v-for="k in keywordStats" :key="k.phrase" class="flex items-center gap-2.5">
                <span class="w-28 shrink-0 truncate font-mono text-[11px]">{{ k.phrase }}</span>
                <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                  <span
                    class="block h-1.5 rounded-full"
                    :class="k.avg >= 40 ? 'bg-signal' : 'bg-ink/20'"
                    :style="{ width: `${k.avg}%` }"
                  />
                </span>
                <span class="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums">{{ k.avg }}</span>
              </li>
            </ul>
          </div>
        </article>

        <!-- 03 -->
        <article class="flex flex-col rounded-2xl border border-rule bg-card p-6">
          <p class="font-mono text-xs text-ink-soft">03 · reply</p>
          <h3 class="mt-3 text-xl font-medium">Work the inbox.</h3>
          <p class="mt-2.5 leading-relaxed text-ink-soft">
            Scored threads arrive with a draft attached. Claim one so nobody doubles up,
            edit it, post it, mark it replied.
          </p>
          <div class="mt-6 border-t border-dashed border-rule pt-4">
            <p class="mb-2.5 font-mono text-[11px] text-ink-soft">draft</p>
            <p class="rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-soft">
              depends how many links you actually need. if it’s three or four, Linktree’s free
              tier is fine and you’re done. caveat that i work on Cueful so i’m biased…
            </p>
          </div>
        </article>
      </div>
    </section>

    <!-- Stat band. Product facts, not vanity metrics: every number here is
         something the code actually does, and is verifiable in the repo. -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-6xl px-6 py-20">
      <dl class="grid gap-12 sm:grid-cols-3 sm:gap-0">
        <div
          v-for="(stat, i) in stats"
          :key="stat.label"
          :class="i > 0 ? 'sm:border-l sm:border-rule sm:pl-12' : ''"
        >
          <dd class="font-display text-7xl leading-[0.9] tracking-tight">
            {{ stat.value }}<span
              v-if="stat.unit"
              class="align-super text-3xl text-signal"
            >{{ stat.unit }}</span>
          </dd>
          <dt class="mt-5 font-medium">{{ stat.label }}</dt>
          <p class="mt-1.5 font-mono text-xs text-ink-soft">{{ stat.detail }}</p>
        </div>
      </dl>
    </section>

    <!-- Anatomy of a lead -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section id="anatomy" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">Scoring</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Every score shows its work.
          <span class="accent-line mt-1.5 block font-normal">No black box, no vibes.</span>
        </h2>
        <p class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">
          A number you can’t interrogate is a number you can’t trust. Each lead carries the
          signals that produced it, so you can tell a real opportunity from a keyword
          coincidence without opening the thread.
        </p>
      </div>

      <div class="mt-12 rounded-2xl border border-rule bg-card p-6 shadow-sm sm:p-8">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-6">
          <div>
            <p class="text-lg font-medium">Anyone found a decent alternative to Linktree?</p>
            <p class="mt-1 font-mono text-xs text-ink-soft">
              r/NewTubers · 3h ago · 2 comments · matched “linktree alternative”
            </p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-rule px-2.5 py-1 font-mono text-xs">high intent</span>
            <span class="rounded-lg bg-signal/15 px-3 py-1.5 font-mono text-lg text-signal tabular-nums">87</span>
          </div>
        </div>

        <div class="grid gap-8 pt-6 sm:grid-cols-2">
          <!-- score breakdown -->
          <div>
            <p class="mb-4 font-mono text-xs text-ink-soft">01 · what moved the score</p>
            <ul class="space-y-3">
              <li v-for="s in breakdown" :key="s.label" class="flex items-center gap-3">
                <span class="flex-1 text-sm">{{ s.label }}</span>
                <span class="flex gap-0.5" aria-hidden="true">
                  <span
                    v-for="n in 5"
                    :key="n"
                    class="h-1.5 w-4 rounded-sm"
                    :class="n <= s.weight ? (s.negative ? 'bg-ink/30' : 'bg-signal') : 'bg-paper'"
                  />
                </span>
                <span
                  class="w-8 shrink-0 text-right font-mono text-xs tabular-nums"
                  :class="s.negative ? 'text-ink-soft' : 'text-signal'"
                >{{ s.negative ? '' : '+' }}{{ s.points }}</span>
              </li>
            </ul>
          </div>

          <!-- what it refuses -->
          <div>
            <p class="mb-4 font-mono text-xs text-ink-soft">02 · what the draft won’t do</p>
            <ul class="space-y-3">
              <li v-for="pair in draftRules" :key="pair.good" class="grid grid-cols-2 gap-3 text-sm">
                <span class="flex items-start gap-1.5">
                  <CheckMark class="mt-1 h-3 w-3 shrink-0 text-signal" />
                  <span>{{ pair.good }}</span>
                </span>
                <span class="text-ink-soft line-through decoration-ink-soft/40">{{ pair.bad }}</span>
              </li>
            </ul>
          </div>

          <!-- pipeline -->
          <div class="sm:col-span-2 border-t border-dashed border-rule pt-6">
            <p class="mb-4 font-mono text-xs text-ink-soft">03 · then it moves through your pipeline</p>
            <ol class="flex flex-wrap items-center gap-2">
              <li v-for="(stage, i) in pipeline" :key="stage" class="flex items-center gap-2">
                <span
                  class="rounded-full border px-3 py-1 font-mono text-xs"
                  :class="i === 0 ? 'border-signal/40 bg-signal/10 text-signal' : 'border-rule text-ink-soft'"
                >{{ stage }}</span>
                <span v-if="i < pipeline.length - 1" class="text-ink-soft" aria-hidden="true">→</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>

    <!-- Teams -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section id="teams" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">For teams</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Share the inbox,
          <span class="accent-line mt-1.5 block font-normal">not the reply.</span>
        </h2>
        <p class="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Everyone works the same queue and can see who has picked up what. Claim a thread
          and your name sits on the card, so the rest of the team can spend their time on
          the threads nobody has answered yet. One person can draft while another reviews,
          and the whole team gets one clear voice in each conversation.
        </p>
      </div>

      <div class="mx-auto mt-12 max-w-2xl rounded-2xl border border-rule bg-card p-6 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-medium">is Linktree Pro worth it or should I look elsewhere</p>
            <p class="mt-1 font-mono text-xs text-ink-soft">r/Entrepreneur · 9h ago · 5 comments</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="rounded-full border border-signal/40 bg-signal/10 px-2.5 py-1 font-mono text-xs text-signal">
              Priya · 4m
            </span>
            <span class="rounded-lg border border-rule px-2.5 py-1 font-mono text-sm tabular-nums">64</span>
          </div>
        </div>
        <p class="mt-4 rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">
          Priya has this one. Three other threads are still open.
        </p>
      </div>

      <div class="mt-12 grid gap-10 md:grid-cols-3">
        <article v-for="item in team" :key="item.title">
          <h3 class="text-lg font-medium">{{ item.title }}</h3>
          <p class="mt-2 leading-relaxed text-ink-soft">{{ item.body }}</p>
        </article>
      </div>
    </section>

    <!-- FAQ. Native <details> rather than a JS accordion: the answers stay in
         the DOM when collapsed, so crawlers and AI assistants still read them,
         and keyboard support comes free. -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section id="faq" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
      <div class="text-center">
        <p class="eyebrow">Questions</p>
        <h2 class="mt-7 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Reddit lead generation,
          <span class="accent-line mt-1.5 block font-normal">answered plainly.</span>
        </h2>
      </div>

      <div class="mx-auto mt-14 max-w-3xl">
        <details
          v-for="(item, i) in faq"
          :key="item.q"
          class="faq-item group border-t border-rule"
          :class="i === faq.length - 1 ? 'border-b' : ''"
        >
          <summary
            class="flex cursor-pointer list-none items-center justify-between gap-6 py-5
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal
                   [&::-webkit-details-marker]:hidden"
          >
            <h3 class="text-lg font-medium text-balance">{{ item.q }}</h3>
            <span
              class="shrink-0 text-ink-soft transition-transform duration-200 group-open:rotate-45
                     motion-reduce:transition-none"
              aria-hidden="true"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M10 4v12M4 10h12" stroke-linecap="round" />
              </svg>
            </span>
          </summary>

          <p class="max-w-2xl pb-6 leading-relaxed text-ink-soft">{{ item.a }}</p>
        </details>
      </div>
    </section>

    <!-- CTA -->
    <div class="rule-dashed mx-auto max-w-6xl" />
    <section class="mx-auto max-w-3xl px-6 py-24 text-center">
      <!-- Both halves are literally what the scorer does: +15 inside 24h,
           +8 when a thread still has few replies. -->
      <h2 class="text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
        Fresh threads score highest.
        <span class="accent-line mt-1.5 block font-normal">So do the ones nobody answered.</span>
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
// Single source for both the rendered FAQ and its JSON-LD, so the structured
// data can never drift from what a visitor actually reads. Google treats that
// mismatch as a violation, and it is the usual way FAQ schema breaks.
const FAQ = [
  {
    q: 'How do you find leads on Reddit?',
    a: 'You search for the phrases buyers use when they are choosing between tools, not for your product name. Competitor comparisons ("linktree alternative"), problem statements, and myth questions surface people who are actively deciding. RedIntelli runs those searches on a schedule, scores each thread for buying intent, and files it in an inbox so you reply while the question is still open.',
  },
  {
    q: 'Is promoting on Reddit against the rules?',
    a: 'Self-promotion is allowed on Reddit, but undisclosed promotion is not, and most subreddits remove comments that read as advertising. The workable approach is to answer the question first, mention your product only when it genuinely fits, and disclose that you work there. RedIntelli drafts replies that follow those three rules by default.',
  },
  {
    q: 'Does RedIntelli post to Reddit for me?',
    a: 'No, and that is deliberate. Automated replies are why Reddit distrusts marketers. RedIntelli writes a draft in your brand voice and hands it to you to read, edit and post yourself. One comment that gets upvoted is worth more than a hundred that get removed.',
  },
  {
    q: 'How is a lead scored?',
    a: 'Every thread gets a 0-100 score built from 23 signals: how closely it matches your keyword, whether the title shows buying intent, how recently it was posted, how many replies it already has, and whether it mentions a competitor. Each signal that moved the score is stored with the lead, so you can see exactly why a number is what it is.',
  },
  {
    q: 'What is the best Reddit monitoring tool?',
    a: 'It depends what you need. Free options like Reddit\'s own keyword alerts or F5Bot email you every keyword hit with no ranking, which is fine at low volume. Paid tools differ mainly in whether they rank threads by intent and whether they help you write the reply. RedIntelli scores and drafts; if you only want raw alerts, a free tool is enough.',
  },
  {
    q: 'Which subreddits does it watch?',
    a: 'Any of them. You add keywords rather than choosing communities, so a thread is found wherever it was posted, including small subreddits you would never think to monitor. You can pin an individual keyword to one subreddit when the phrase is ambiguous outside it.',
  },
  {
    q: 'Can a marketing team share one inbox?',
    a: 'Yes. Everyone in a workspace sees the same queue, and claiming a thread puts your name on the card so teammates move on to threads nobody has answered. Each person keeps their own draft on a lead, which means one person can write a first pass and another can sharpen it before it goes out.',
  },
  {
    q: 'How much does RedIntelli cost?',
    a: 'It is free to start and does not ask for a card. You bring your own keywords and your own brand voice, and you can run a scan and read scored leads before deciding whether it earns a place in your workflow.',
  },
]

export default {
  setup() {
    useHead({
      title: 'RedIntelli · Find high-intent Reddit threads before they go cold',
      meta: [{
        name: 'description',
        content: 'RedIntelli watches Reddit for the threads that match your keywords, scores them by buying intent, and drafts a reply worth posting.',
      }],
      script: [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map(item => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }),
      }],
    })
  },

  data() {
    return {
      faq: FAQ,

      assurances: ['Free to start', 'No card', 'Your keywords, your voice'],

      // Every figure is something the code does, checkable in the repo. No
      // index sizes or time-saved claims we haven't measured.
      stats: [
        {
          value: '23',
          unit: '',
          label: 'signals per thread',
          detail: 'intent · freshness · competitors · noise',
        },
        {
          value: '100',
          unit: 'pt',
          label: 'score, fully traced',
          detail: 'every point tied to a named signal',
        },
        {
          value: '1',
          unit: '',
          label: 'reply per thread',
          detail: 'claiming blocks the second',
        },
      ],

      feed: [
        {
          sub: 'SaaS',
          age: '3m',
          score: 87,
          title: 'Anyone found a decent alternative to Linktree?',
          signals: 'exact phrase · asking for alternative · few replies',
        },
        {
          sub: 'Entrepreneur',
          age: '2h',
          score: 64,
          title: 'is Linktree Pro worth it or should I look elsewhere',
          signals: 'competitor mentioned · evaluating options',
        },
        {
          sub: 'marketing',
          age: '6h',
          score: 31,
          title: 'what does everyone use for this these days',
          signals: 'weak keyword match · crowded thread',
        },
      ],

      competitors: ['Jobscan', 'Teal', 'Rezi', 'Enhancv', 'Zety'],

      keywordStats: [
        { phrase: 'jobscan alternative', avg: 68 },
        { phrase: 'ats resume checker', avg: 44 },
        { phrase: 'resume rejected', avg: 26 },
      ],

      // Mirrors the real scorer's weights.
      breakdown: [
        { label: 'Exact phrase in the title', weight: 5, points: 35 },
        { label: 'Asking for an alternative', weight: 3, points: 20 },
        { label: 'Posted in the last 24h', weight: 3, points: 15 },
        { label: 'Mentions a competitor', weight: 2, points: 12 },
        { label: 'Few replies so far', weight: 2, points: 8 },
        { label: 'Crowded thread', weight: 1, points: -8, negative: true },
      ],

      draftRules: [
        { good: 'Answers the question first', bad: 'Leads with the product' },
        { good: 'Says when you’re not the fit', bad: 'Claims it fits everyone' },
        { good: 'Discloses you work there', bad: 'Pretends to be a user' },
        { good: 'Sounds like a comment', bad: 'Sounds like a landing page' },
      ],

      pipeline: ['new', 'queued', 'replied', 'won'],

      team: [
        {
          title: 'Draft together',
          body: 'Everyone gets their own version on a lead, so saving yours never overwrites a teammate’s. Write a first pass, hand it over, let someone with more context sharpen it.',
        },
        {
          title: 'Learn from what shipped',
          body: 'Marking a lead replied captures the link to the comment. The team can read what actually went out and see which drafts earned upvotes, so the next one starts better.',
        },
        {
          title: 'Room to give people access',
          body: 'Owners and admins set up campaigns and invite the team. Members get the full queue to work, without anyone worrying they’ll delete a campaign by accident.',
        },
      ],
    }
  },
}
</script>
