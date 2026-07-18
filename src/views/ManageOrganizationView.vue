<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import { listOrganizations, inviteMember, removeMember } from '../services/orgApi'
import BaseIcon from '../components/shared/BaseIcon.vue'

const router = useRouter()
const auth = useAuthStore()

const orgs = ref([])
const loading = ref(true)
const error = ref(null)

// Invite state
const selectedOrgId = ref(null)
const inviteEmail = ref('')
const inviteRole = ref(1)
const inviting = ref(false)
const inviteError = ref(null)
const inviteSuccess = ref(null)

const selectedOrg = computed(() =>
  orgs.value.find(o => o.id === selectedOrgId.value) || orgs.value[0]
)

onMounted(async () => {
  try {
    orgs.value = await listOrganizations()
    if (orgs.value.length > 0) {
      selectedOrgId.value = orgs.value[0].id
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})

async function handleInvite() {
  if (!inviteEmail.value.trim() || !selectedOrg.value) return
  inviting.value = true
  inviteError.value = null
  inviteSuccess.value = null
  try {
    const userId = inviteEmail.value.trim()
    await inviteMember(selectedOrg.value.id, userId, inviteRole.value)
    inviteSuccess.value = 'Member invited successfully'
    inviteEmail.value = ''
  } catch (err) {
    inviteError.value = err.message
  } finally {
    inviting.value = false
  }
}

async function handleRemove(orgId, userId) {
  if (!confirm('Remove this member from the organization?')) return
  try {
    await removeMember(orgId, userId)
    orgs.value = await listOrganizations()
  } catch (err) {
    inviteError.value = err.message
  }
}

function switchOrg(orgId) {
  auth.switchOrg(orgId)
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

const roleLabels = {
  0: 'Admin',
  1: 'Member',
  2: 'Viewer'
}
</script>

<template>
  <div class="min-h-[100dvh] bg-manuscript text-text-primary overflow-y-auto">
    <header
      class="h-14 border-b border-border-subtle flex items-center justify-between px-6 lg:px-8"
    >
      <button
        class="flex items-center gap-2 text-xs tracking-[0.15em] text-text-secondary hover:text-text-primary transition-colors"
        @click="router.push('/workspace')"
      >
        <BaseIcon name="arrow-left" :size="14" />
        <span class="uppercase tracking-[0.2em]">Back</span>
      </button>
      <span class="font-manuscript text-sm uppercase tracking-[0.2em] text-text-primary">
        Organizations
      </span>
      <div class="w-20" />
    </header>

    <main class="max-w-3xl mx-auto px-6 lg:px-8 py-10 animate-fade-in">
      <div v-if="loading" class="flex justify-center py-20">
        <svg class="animate-spin h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <div v-else-if="error" class="text-center py-20">
        <p class="text-red-400 text-sm">{{ error }}</p>
      </div>

      <template v-else-if="orgs.length === 0">
        <div class="text-center py-20">
          <BaseIcon name="building-2" :size="28" class="text-text-hint mb-4" />
          <p class="text-text-primary font-medium mb-1">No organizations</p>
          <p class="text-text-secondary text-sm">Create an organization to collaborate with others.</p>
        </div>
      </template>

      <template v-else>
        <!-- Org selector tabs -->
        <div class="flex gap-2 mb-8 flex-wrap">
          <button
            v-for="org in orgs"
            :key="org.id"
            class="px-4 py-2 rounded-md text-sm border transition-colors"
            :class="
              org.id === selectedOrgId
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            "
            @click="selectedOrgId = org.id"
          >
            {{ org.name }}
          </button>
        </div>

        <div v-if="selectedOrg">
          <!-- Org details -->
          <section class="mb-10">
            <h2 class="text-lg font-semibold text-text-primary mb-1">{{ selectedOrg.name }}</h2>
            <p class="text-xs text-text-hint font-mono">/{{ selectedOrg.slug }}</p>
            <p class="text-xs text-text-hint mt-1">Created {{ formatDate(selectedOrg.createdAt) }}</p>

            <button
              class="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
              @click="switchOrg(selectedOrg.id)"
            >
              Switch to this organization
            </button>
          </section>

          <!-- Invite form -->
          <section class="mb-10">
            <h3 class="text-sm font-medium text-text-primary mb-3">Invite member</h3>
            <form class="flex flex-wrap gap-3 items-end" @submit.prevent="handleInvite">
              <div class="flex-1 min-w-[200px]">
                <label class="block font-manuscript text-xs text-text-secondary mb-1">
                  User ID
                </label>
                <input
                  v-model="inviteEmail"
                  type="text"
                  class="w-full px-3 py-2 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent placeholder:text-text-hint transition-colors"
                  placeholder="Enter user GUID"
                />
              </div>
              <div>
                <label class="block font-manuscript text-xs text-text-secondary mb-1">
                  Role
                </label>
                <select
                  v-model="inviteRole"
                  class="px-3 py-2 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent transition-colors"
                >
                  <option :value="0">Admin</option>
                  <option :value="1">Member</option>
                  <option :value="2">Viewer</option>
                </select>
              </div>
              <button
                type="submit"
                class="btn-primary px-4 py-2 rounded-md text-sm"
                :disabled="inviting"
              >
                {{ inviting ? 'Inviting…' : 'Invite' }}
              </button>
            </form>
            <p v-if="inviteError" class="text-xs text-red-400 mt-2">{{ inviteError }}</p>
            <p v-if="inviteSuccess" class="text-xs text-green-400 mt-2">{{ inviteSuccess }}</p>
          </section>

          <!-- Members list -->
          <section>
            <h3 class="text-sm font-medium text-text-primary mb-3">Members</h3>
            <p class="text-xs text-text-hint">
              Member listing requires a backend endpoint that returns members with user details.
            </p>
          </section>
        </div>
      </template>
    </main>
  </div>
</template>
