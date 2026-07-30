<template>
  <div class="min-h-screen bg-void">
    <header class="border-b border-line/60">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <RadarMark class="h-7 w-7" />
          <span class="text-lg font-semibold tracking-tight">RedRadar</span>
        </NuxtLink>

        <nav class="flex items-center gap-2">
          <NuxtLink v-if="user" to="/app" class="btn-ghost">Dashboard</NuxtLink>
          <NuxtLink v-else to="/login" class="btn-primary">Get started</NuxtLink>
        </nav>
      </div>
    </header>

    <main>
      <slot />
    </main>

    <footer class="mt-24 border-t border-line/60">
      <div class="mx-auto max-w-6xl px-6 py-8 text-sm text-mute">
        RedRadar — Reddit lead discovery with AI reply drafts.
      </div>
    </footer>
  </div>
</template>

<script>
export default {
  setup() {
    return { user: useSupabaseUser() }
  },
}
</script>
