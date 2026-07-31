import tailwindcss from '@tailwindcss/vite'
import {
  DEFAULT_DAILY_SCAN_LIMIT,
  DEFAULT_MAX_ORG_MEMBERS,
  positiveIntOr,
} from './shared/limits'

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
    qwenApiKey: process.env.QWEN_API_KEY || '',
    // Workspace-scoped DashScope keys use a per-workspace regional host, not
    // the generic dashscope.aliyuncs.com — see the API-KEY dialog in the
    // console for the exact "OpenAI 兼容地址" value.
    qwenBaseUrl: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    cronSecret: process.env.CRON_SECRET || '',
    // Comma-separated emails exempt from the daily scan limit. Kept in config
    // rather than source: this repo is public.
    adminEmails: process.env.ADMIN_EMAILS || '',
    redditClientId: process.env.REDDIT_CLIENT_ID || '',
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    redditUserAgent: process.env.REDDIT_USER_AGENT || 'redintelli/0.1 (lead discovery)',
    public: {
      localMode,
      // Public because the UI states both limits before anyone hits one.
      // Neither is a secret, and the server re-reads them when it enforces.
      // Overridable at runtime as NUXT_PUBLIC_MAX_ORG_MEMBERS /
      // NUXT_PUBLIC_DAILY_SCAN_LIMIT without a rebuild.
      maxOrgMembers: positiveIntOr(DEFAULT_MAX_ORG_MEMBERS, process.env.MAX_ORG_MEMBERS),
      dailyScanLimit: positiveIntOr(DEFAULT_DAILY_SCAN_LIMIT, process.env.DAILY_SCAN_LIMIT),
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
