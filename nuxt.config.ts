import tailwindcss from '@tailwindcss/vite'

const localMode = process.env.REDRADAR_LOCAL === '1' || process.env.REDRADAR_LOCAL === 'true'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Keep the module mounted even in local mode so `#supabase/server` resolves
  // for the cloud code paths. Local auth simply never calls into it.
  modules: ['@nuxtjs/supabase'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  supabase: {
    redirect: false,
    // Avoid hard-failing the app shell when placeholder keys are present.
    types: false,
  },

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    cronSecret: process.env.CRON_SECRET || '',
    // Comma-separated emails exempt from the daily scan limit. Kept in config
    // rather than source: this repo is public.
    adminEmails: process.env.ADMIN_EMAILS || '',
    redditClientId: process.env.REDDIT_CLIENT_ID || '',
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    redditUserAgent: process.env.REDDIT_USER_AGENT || 'redintelli/0.1 (lead discovery)',
    public: {
      localMode,
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      title: 'RedIntelli',
    },
  },
})
