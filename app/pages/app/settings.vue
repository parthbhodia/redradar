<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
      <p class="mt-1 text-sm text-mute">Your workspace team and seats.</p>
    </div>

    <p v-if="localMode" class="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-mute">
      Team management is part of the cloud workspace — not available in local mode.
    </p>

    <section v-else class="card">
      <div class="mb-1 flex items-baseline justify-between gap-3">
        <h2 class="font-medium">Team</h2>
        <span v-if="members.length" class="text-xs" :class="workspaceFull ? 'text-warn' : 'text-mute'">
          <span class="font-mono">{{ members.length }}</span> of {{ maxMembers }} seats
        </span>
      </div>
      <p class="mb-4 text-sm text-mute">
        Everyone here shares this workspace: same campaigns, same inbox.
      </p>

      <ul v-if="members.length" class="mb-4 space-y-2">
        <li
          v-for="member in members"
          :key="member.user_id"
          class="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-sm">{{ member.profiles?.display_name ?? 'Unknown' }}</p>
            <p class="truncate text-xs text-mute">{{ member.profiles?.email }}</p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <span class="chip capitalize">{{ member.role }}</span>

            <!-- Two-step, because removal also releases whatever they claimed. -->
            <template v-if="canRemove(member)">
              <template v-if="pendingRemoval === member.user_id">
                <button
                  class="btn-quiet text-signal"
                  :disabled="removing"
                  @click="removeMember(member)"
                >
                  {{ removing ? 'Removing…' : 'Confirm' }}
                </button>
                <button class="btn-quiet" :disabled="removing" @click="pendingRemoval = null">
                  Cancel
                </button>
              </template>
              <button v-else class="btn-quiet" @click="pendingRemoval = member.user_id">
                Remove
              </button>
            </template>
          </div>
        </li>
      </ul>

      <p v-if="workspaceFull" class="text-xs text-mute">
        This workspace is full. {{ maxMembers }} members is the limit.
      </p>
      <form v-else-if="canInvite" class="flex flex-col gap-2 sm:flex-row" @submit.prevent="invite">
        <input
          v-model="inviteEmail"
          class="input"
          type="email"
          autocomplete="off"
          placeholder="teammate@company.com"
          required
        >
        <button class="btn-ghost shrink-0" :disabled="inviting">
          {{ inviting ? 'Inviting…' : 'Invite' }}
        </button>
      </form>
      <p v-else-if="members.length" class="text-xs text-mute">
        Only owners and admins can invite.
      </p>

      <p v-if="inviteMessage" class="mt-3 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm text-ok">
        {{ inviteMessage }}
      </p>
      <p v-if="error" class="mt-3 rounded-lg border border-signal/30 bg-signal/10 px-3 py-2 text-sm text-signal-soft">
        {{ error }}
      </p>
    </section>
  </div>
</template>

<script>
export default {
  setup() {
    useHead({ title: 'Settings · RedIntelli' })
    const config = useRuntimeConfig()
    const team = useTeam()
    const { push: toast } = useToasts()
    return {
      localMode: config.public.localMode,
      me: useMe(),
      maxMembers: config.public.maxOrgMembers,
      toast,
      ...team,
    }
  },

  data() {
    return {
      error: '',
      inviteEmail: '',
      inviting: false,
      inviteMessage: '',
      pendingRemoval: null,
      removing: false,
    }
  },

  computed: {
    canInvite() {
      const meId = this.me?.id
      const mine = this.members.find(m => m.user_id === meId)
      return ['owner', 'admin'].includes(mine?.role)
    },

    workspaceFull() {
      return this.members.length >= this.maxMembers
    },
  },

  async mounted() {
    if (!this.localMode) await this.load()
  },

  methods: {
    // Owners are the workspace's anchor and the role can't be transferred, so
    // there's no safe way to remove one. Removing yourself isn't this button.
    canRemove(member) {
      return this.canInvite && member.role !== 'owner' && member.user_id !== this.me?.id
    },

    async removeMember(member) {
      this.removing = true
      this.error = ''
      this.inviteMessage = ''

      try {
        const result = await $fetch('/api/member-remove', {
          method: 'POST',
          body: { userId: member.user_id },
        })
        this.toast(`${result.removed} was removed.`, {
          tone: 'success',
          detail: result.released
            ? `${result.released} claimed ${result.released === 1 ? 'lead is' : 'leads are'} back in the inbox.`
            : undefined,
        })
        this.pendingRemoval = null
        await this.load(true)
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
        this.toast('Could not remove them.', { tone: 'error', detail: this.error })
      } finally {
        this.removing = false
      }
    },

    async invite() {
      this.inviting = true
      this.error = ''
      this.inviteMessage = ''

      try {
        const result = await $fetch('/api/invite', {
          method: 'POST',
          body: { email: this.inviteEmail },
        })
        this.inviteMessage = result.status === 'invited'
          ? `Invite sent to ${result.email}. They'll land in this workspace when they accept.`
          : `${result.email} already had an account, so they were added directly.`
        this.inviteEmail = ''
        this.toast('Invite sent.', { tone: 'success' })
        await this.load(true)
      } catch (e) {
        this.error = e.data?.statusMessage || e.message
        this.toast('Could not send the invite.', { tone: 'error', detail: this.error })
        // A full workspace usually means our seat count was stale — someone
        // else invited while this page sat open. Re-read so the form hides.
        if (e.statusCode === 409 || e.response?.status === 409) await this.load(true)
      } finally {
        this.inviting = false
      }
    },
  },
}
</script>
