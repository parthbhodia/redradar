<template>
  <div class="mx-auto max-w-3xl px-6 py-16">
    <p class="eyebrow">Legal</p>
    <h1 class="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
      Terms of Service
    </h1>
    <p class="mt-4 font-mono text-sm text-ink-soft">Last updated {{ updated }}</p>

    <div class="prose-legal mt-12">
      <p class="lead">
        These terms govern your use of RedIntelli at <strong>redintelli.com</strong>. By
        creating an account you agree to them. If you are accepting on behalf of a company,
        you confirm you are authorised to do so.
      </p>

      <h2>What RedIntelli does</h2>
      <p>
        RedIntelli searches public Reddit posts for keywords you choose, scores them for
        how likely they are to be worth replying to, and generates draft replies from the
        brand description you provide. It is a research and drafting tool. It does not post
        to Reddit on your behalf, and it never will without you explicitly asking for that
        feature.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for what happens under your account and for keeping your credentials secure.</li>
        <li>You must provide an accurate email address and be at least 16 years old.</li>
        <li>Anyone you invite into a workspace can see and edit that workspace’s brands, campaigns, keywords, leads, and drafts. Invite accordingly.</li>
      </ul>

      <h2>Your responsibility for what you post</h2>
      <p>
        This is the important part. RedIntelli produces <em>drafts</em>. You decide whether
        to post them, and once you do, the comment is yours. You are responsible for:
      </p>
      <ul>
        <li>Complying with <a href="https://www.redditinc.com/policies/content-policy" target="_blank" rel="noopener noreferrer">Reddit’s Content Policy</a>, its User Agreement, and the rules of every subreddit you post in. Many subreddits restrict or prohibit self-promotion.</li>
        <li>Disclosing your affiliation where the community or the law requires it. Our drafts are written to include a disclosure, but you must check that it is accurate and present before posting.</li>
        <li>The accuracy of any claim in a comment you post, including anything the AI wrote.</li>
        <li>Consequences of your posting, including removals, bans, or reputational harm.</li>
      </ul>
      <p>
        We are not responsible for actions Reddit takes against your account.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to use RedIntelli to:</p>
      <ul>
        <li>Post spam, run coordinated inauthentic behaviour, or operate vote or comment manipulation schemes.</li>
        <li>Impersonate another person or organisation, or conceal an affiliation you are required to disclose.</li>
        <li>Harass, defame, or target individuals.</li>
        <li>Generate content that is illegal, or that infringes someone else’s rights.</li>
        <li>Circumvent rate limits, scrape the service, or resell access without our agreement.</li>
      </ul>
      <p>We may suspend or terminate accounts that do these things, without refund.</p>

      <h2>AI-generated content</h2>
      <p>
        Drafts are produced by a large language model. They can be wrong, outdated, or
        confidently mistaken about your own product. Read every draft before posting. We
        make no warranty that a draft is accurate, appropriate for the subreddit, or
        compliant with any rule. You retain ownership of drafts generated for your
        workspace, subject to our AI provider’s terms.
      </p>

      <h2>Third-party services</h2>
      <p>
        RedIntelli depends on Reddit, our AI provider, and our hosting and database
        providers. If one of them changes its API, pricing, or availability, parts of the
        service may change or stop working. We will tell you if something material changes,
        but we do not control those services.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep RedIntelli running but do not guarantee uptime. We may change,
        suspend, or discontinue features. For paid plans, if we discontinue the service
        entirely we will refund any prepaid, unused portion.
      </p>

      <h2>Fees</h2>
      <p>
        Paid plans, if you are on one, are billed in advance and are non-refundable except
        as stated above or where required by law. We will give at least 30 days’ notice
        before a price increase affects you. You can cancel at any time and keep access
        until the end of the period you have paid for.
      </p>

      <h2>Termination</h2>
      <p>
        You can delete your account at any time. We may terminate an account for a breach
        of these terms, or with 30 days’ notice for any other reason. On termination we
        delete your workspace data as described in the
        <NuxtLink to="/privacy">Privacy Policy</NuxtLink>.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        RedIntelli is provided “as is”, without warranties of any kind to the extent
        permitted by law. We are not liable for indirect, incidental, or consequential
        damages, or for lost profits, revenue, or data. Our total liability for any claim is
        limited to the greater of the amount you paid us in the 12 months before the claim,
        or 100 USD. Nothing here limits liability that cannot be limited by law.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. If a change is material we will update the date above and
        notify account holders by email before it takes effect. Continuing to use
        RedIntelli after that means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>.
      </p>
    </div>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({
      title: 'Terms of Service · RedIntelli',
      meta: [{ name: 'description', content: 'The terms governing your use of RedIntelli.' }],
    })
  },

  data() {
    return {
      updated: '30 July 2026',
      contactEmail: 'legal@redintelli.com',
    }
  },
}
</script>
