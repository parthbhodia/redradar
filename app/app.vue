<template>
  <NuxtLayout :name="layoutName">
    <NuxtPage />
  </NuxtLayout>
</template>

<script>
export default {
  setup() {
    return { route: useRoute() }
  },

  computed: {
    // The dashboard gets its own chrome; everything else is marketing.
    layoutName() {
      return this.route.path.startsWith('/app') ? 'app' : 'default'
    },
  },
}
</script>
