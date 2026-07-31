<template>
  <!--
    Polite, not assertive: these announce results, they never interrupt a task.
    Bottom-centred on mobile, bottom-right on desktop, out of the thumb zone.
  -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    role="region"
    aria-live="polite"
    aria-label="Notifications"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-panel px-4 py-3 shadow-lg shadow-black/40"
        :class="toneClass(toast.tone)"
        role="status"
      >
        <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass(toast.tone)" />

        <div class="min-w-0 flex-1">
          <p class="text-sm text-fg">{{ toast.message }}</p>
          <p v-if="toast.detail" class="mt-0.5 text-xs text-mute">{{ toast.detail }}</p>
        </div>

        <button
          class="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-mute transition-colors hover:text-fg"
          aria-label="Dismiss notification"
          @click="dismiss(toast.id)"
        >
          <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script>
export default {
  setup() {
    const { toasts, dismiss } = useToasts()
    return { toasts, dismiss }
  },

  methods: {
    toneClass(tone) {
      return {
        error: 'border-signal/40',
        warn: 'border-warn/40',
        success: 'border-ok/40',
        info: 'border-line-2',
      }[tone] || 'border-line-2'
    },

    dotClass(tone) {
      return {
        error: 'bg-signal',
        warn: 'bg-warn',
        success: 'bg-ok',
        info: 'bg-mute',
      }[tone] || 'bg-mute'
    },
  },
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Leaving items are out of flow, so the survivors slide up smoothly. */
.toast-leave-active {
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: opacity 120ms ease;
  }

  .toast-enter-from,
  .toast-leave-to {
    transform: none;
  }
}
</style>
