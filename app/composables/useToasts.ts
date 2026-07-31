export type ToastTone = 'info' | 'warn' | 'error' | 'success'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  /** Optional second line for the "why" behind the message. */
  detail?: string
}

let nextId = 0

/**
 * Minimal toast queue. A library would be more than this needs: the app shows
 * one message at a time, from a handful of places.
 */
export function useToasts() {
  const toasts = useState<Toast[]>('rr:toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function push(message: string, options: { tone?: ToastTone, detail?: string, duration?: number } = {}) {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message, tone: options.tone ?? 'info', detail: options.detail }]

    // Errors stay a little longer: they usually carry an instruction.
    const duration = options.duration ?? (options.tone === 'error' || options.tone === 'warn' ? 6000 : 4000)
    if (import.meta.client) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  return { toasts, push, dismiss }
}
