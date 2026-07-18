<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import { createOrganization } from '../../services/orgApi'

const emit = defineEmits(['close'])
const auth = useAuthStore()

const name = ref('')
const slug = ref('')
const loading = ref(false)
const error = ref(null)

function generateSlug(val) {
  slug.value = val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function handleSubmit() {
  if (!name.value.trim() || !slug.value.trim()) return
  loading.value = true
  error.value = null
  try {
    const org = await createOrganization(name.value.trim(), slug.value.trim())
    await auth.switchOrg(org.id)
    emit('close')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
    @click.self="emit('close')"
  >
    <div
      class="bg-bg-secondary border border-border-subtle rounded-xl shadow-warm-lg p-6 w-full max-w-sm animate-fade-in"
    >
      <h2 class="text-lg font-semibold text-text-primary mb-4">
        Create organization
      </h2>
      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="org-name" class="block font-manuscript text-xs text-text-secondary mb-2">
            Organization name
          </label>
          <input
            id="org-name"
            v-model="name"
            type="text"
            required
            autofocus
            class="w-full px-3.5 py-2.5 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent placeholder:text-text-hint transition-colors"
            placeholder="My Writing Studio"
            @input="generateSlug($event.target.value)"
          />
        </div>
        <div>
          <label for="org-slug" class="block font-manuscript text-xs text-text-secondary mb-2">
            Slug
          </label>
          <input
            id="org-slug"
            v-model="slug"
            type="text"
            required
            class="w-full px-3.5 py-2.5 border border-border-subtle bg-bg-primary text-text-primary rounded-md text-sm focus:border-accent placeholder:text-text-hint transition-colors font-mono text-xs"
            placeholder="my-writing-studio"
          />
          <p class="text-[10px] text-text-hint mt-1">
            Used in URLs. Lowercase letters, numbers, and hyphens only.
          </p>
        </div>

        <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

        <div class="flex gap-3 pt-2">
          <button
            type="button"
            class="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-sm hover:bg-surface-hover transition-colors"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn-primary flex-1 py-2 rounded-md text-sm"
            :disabled="loading"
          >
            {{ loading ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
