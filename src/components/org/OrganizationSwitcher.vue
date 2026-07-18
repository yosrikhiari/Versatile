<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import BaseIcon from '../shared/BaseIcon.vue'

const emit = defineEmits(['createOrg'])
const router = useRouter()
const auth = useAuthStore()

const open = ref(false)

const currentOrg = computed(() => auth.activeOrganization)

function selectOrg(orgId) {
  if (orgId === currentOrg.value?.id) return
  open.value = false
  auth.switchOrg(orgId)
}

function manage() {
  open.value = false
  router.push('/org/manage')
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-text-secondary hover:text-text-primary transition-colors"
      @click="open = !open"
    >
      <BaseIcon name="building-2" :size="14" />
      <span class="hidden sm:inline">
        {{ currentOrg?.name || 'No organization' }}
      </span>
      <BaseIcon name="chevron-down" :size="12" />
    </button>

    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="open = false"
    />

    <Transition name="fade">
      <div
        v-if="open"
        class="absolute left-0 top-full mt-2 z-50 w-64 bg-bg-secondary border border-border-subtle rounded-xl shadow-warm-lg py-1 animate-fade-in"
      >
        <div class="px-3 py-2 text-[10px] uppercase tracking-wider text-text-hint">
          Switch organization
        </div>

        <button
          v-for="org in auth.organizations"
          :key="org.id"
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-text-primary hover:bg-surface-hover transition-colors"
          :class="{ 'bg-accent/10 text-accent': org.id === currentOrg?.id }"
          @click="selectOrg(org.id)"
        >
          <BaseIcon name="building-2" :size="14" class="shrink-0" />
          <span class="min-w-0 truncate flex-1">{{ org.name }}</span>
          <BaseIcon
            v-if="org.id === currentOrg?.id"
            name="check"
            :size="14"
            class="text-accent shrink-0"
          />
        </button>

        <div class="border-t border-border-subtle my-1" />

        <button
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-text-primary hover:bg-surface-hover transition-colors"
          @click="emit('createOrg')"
        >
          <BaseIcon name="plus" :size="14" class="shrink-0" />
          <span>Create organization</span>
        </button>

        <button
          class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-text-primary hover:bg-surface-hover transition-colors"
          @click="manage"
        >
          <BaseIcon name="settings" :size="14" class="shrink-0" />
          <span>Manage organizations</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
