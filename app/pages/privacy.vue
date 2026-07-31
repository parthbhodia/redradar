<template>
  <div class="mx-auto max-w-3xl px-6 py-16">
    <p class="eyebrow">Legal</p>
    <h1 class="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
      Privacy Policy
    </h1>
    <p class="mt-4 font-mono text-sm text-ink-soft">Last updated {{ updated }}</p>

    <div class="prose-legal mt-12">
      <p class="lead">
        RedIntelli helps you find Reddit threads relevant to your product and drafts replies
        you can post yourself. This policy explains what we collect, why, and who else sees
        it. It covers <strong>redintelli.com</strong> and the RedIntelli application.
      </p>

      <h2>What we collect</h2>

      <h3>Account information</h3>
      <p>
        When you create an account we store your email address and, if you sign in with
        Google, the name and profile information Google returns. We request only the
        <code>email</code>, <code>profile</code>, and <code>openid</code> scopes. We do not
        request access to your Gmail, Drive, Calendar, or any other Google service, and we
        cannot read them.
      </p>

      <h3>Workspace content</h3>
      <p>
        Anything you enter into the product: your brand description, voice notes,
        competitor names, campaigns, keywords, reply drafts, lead statuses, and the link to
        a comment you posted. If you invite teammates, they can see this content, because a
        workspace is shared by design.
      </p>

      <h3>Public Reddit data</h3>
      <p>
        We search Reddit for your keywords and store the public posts we find: title, body,
        subreddit, author username, permalink, timestamp, and engagement counts. This is
        information Reddit already publishes. We do not access private messages, private
        subreddits, or anything requiring a Reddit login of yours.
      </p>

      <h3>Technical data</h3>
      <p>
        Standard server logs from our hosting provider (IP address, browser user agent,
        request paths and timestamps) and the cookies required to keep you signed in. We do
        not use advertising cookies or third-party analytics trackers.
      </p>

      <h2>Why we process it</h2>
      <ul>
        <li><strong>To run your account</strong> — authentication, sessions, workspace membership.</li>
        <li><strong>To find and score leads</strong> — matching your keywords against public Reddit posts.</li>
        <li><strong>To draft replies</strong> — your brand context and the thread are sent to our AI provider to generate a draft.</li>
        <li><strong>To keep the service working</strong> — debugging, preventing abuse, and security.</li>
      </ul>
      <p>
        We do not sell your data, rent it, or use your workspace content to train AI models.
      </p>

      <h2>Who we share it with</h2>
      <p>These are the only third parties involved in running RedIntelli:</p>

      <div class="not-prose my-6 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-rule text-left font-mono text-xs tracking-wide text-ink-soft uppercase">
              <th scope="col" class="pb-2 pr-4 font-medium">Provider</th>
              <th scope="col" class="pb-2 pr-4 font-medium">Purpose</th>
              <th scope="col" class="pb-2 font-medium">What it receives</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in processors" :key="row.name" class="border-b border-rule/60 align-top">
              <td class="py-3 pr-4 font-medium">{{ row.name }}</td>
              <td class="py-3 pr-4 text-ink-soft">{{ row.purpose }}</td>
              <td class="py-3 text-ink-soft">{{ row.data }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We may also disclose information if legally required to, or to protect the rights
        and safety of our users.
      </p>

      <h2>Where it lives, and for how long</h2>
      <p>
        Your data is stored in our database provider’s infrastructure and retained while
        your account is active. Delete a lead, campaign, or brand and it is removed from the
        database. Ask us to delete your account and we remove your profile, workspace
        content, and drafts within 30 days, except where we are required to keep records
        for legal reasons.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct, export, or delete your data at any time. Most of it you can
        edit or delete directly in the product; for anything else, email us and we will
        action it. Depending on where you live you may have additional rights under the
        GDPR or CCPA, including the right to object to processing and to lodge a complaint
        with a supervisory authority. We do not sell personal information as defined by the
        CCPA.
      </p>

      <h2>Google user data</h2>
      <p>
        RedIntelli’s use of information received from Google APIs adheres to the
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy</a>, including the Limited Use requirements.
        We use Google sign-in only to authenticate you and to display your name and email in
        your workspace. We never transfer this data to others except as required to provide
        the service, and never for advertising.
      </p>

      <h2>Children</h2>
      <p>RedIntelli is not intended for anyone under 16, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy materially we will update the date above and notify account
        holders by email before the change takes effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, or a data request: <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>.
      </p>
    </div>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({
      title: 'Privacy Policy · RedIntelli',
      meta: [{ name: 'description', content: 'How RedIntelli collects, uses, and shares your data.' }],
    })
  },

  data() {
    return {
      updated: '30 July 2026',
      contactEmail: 'privacy@redintelli.com',
      processors: [
        {
          name: 'Supabase',
          purpose: 'Database, authentication, hosting your workspace data',
          data: 'Account details and all workspace content',
        },
        {
          name: 'Vercel',
          purpose: 'Application hosting and delivery',
          data: 'Standard request logs and IP addresses',
        },
        {
          name: 'Anthropic',
          purpose: 'Generating reply drafts',
          data: 'Your brand description and the public thread text, at the moment you click Generate',
        },
        {
          name: 'Reddit',
          purpose: 'Searching public posts',
          data: 'Your keyword queries. No personal data is sent.',
        },
        {
          name: 'Google',
          purpose: 'Optional sign-in',
          data: 'Only what you authorise: email, name, profile picture',
        },
      ],
    }
  },
}
</script>
