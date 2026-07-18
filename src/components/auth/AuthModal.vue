<script setup>
import { ref, watch, computed } from 'vue'
import { useAuthStore } from '../../stores/authStore'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close'])

const authStore = useAuthStore()
const mode = ref('login')
const username = ref('')
const email = ref('')
const password = ref('')
const displayName = ref('')
const submitting = ref(false)
const formError = ref('')

watch(
  () => props.show,
  (val) => {
    if (val) resetForm()
  }
)

function resetForm() {
  username.value = ''
  email.value = ''
  password.value = ''
  displayName.value = ''
  formError.value = ''
  submitting.value = false
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  formError.value = ''
}

async function handleSubmit() {
  submitting.value = true
  formError.value = ''
  try {
    if (mode.value === 'login') {
      await authStore.login({ username: username.value, password: password.value })
    } else {
      await authStore.register({
        username: username.value,
        email: email.value,
        password: password.value,
        displayName: displayName.value || null
      })
    }
    emit('close')
  } catch (err) {
    formError.value = err.message || 'An error occurred'
  } finally {
    submitting.value = false
  }
}

const isValid = computed(() => {
  if (!username.value || !password.value) return false
  if (mode.value === 'register' && !email.value) return false
  return true
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in"
    @click.self="emit('close')"
  >
    <div class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-sm w-full animate-scale-in">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-lg font-semibold text-text-primary">
          {{ mode === 'login' ? 'Sign In' : 'Create Account' }}
        </h2>
        <button
          class="text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent rounded"
          @click="emit('close')"
        >
          <BaseIcon name="x" :size="20" />
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label class="block text-sm font-medium text-text-secondary mb-1">Username</label>
          <input
            v-model="username"
            type="text"
            placeholder="your username"
            class="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-sm transition-all duration-150"
            autocomplete="username"
          />
        </div>

        <div v-if="mode === 'register'">
          <label class="block text-sm font-medium text-text-secondary mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="you@example.com"
            class="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-sm transition-all duration-150"
            autocomplete="email"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-text-secondary mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            placeholder="your password"
            class="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-sm transition-all duration-150"
            autocomplete="current-password"
          />
        </div>

        <div v-if="mode === 'register'">
          <label class="block text-sm font-medium text-text-secondary mb-1">
            Display Name <span class="text-text-hint">(optional)</span>
          </label>
          <input
            v-model="displayName"
            type="text"
            placeholder="how others see you"
            class="w-full px-3 py-2 bg-bg-primary border border-border-subtle rounded-lg text-text-primary placeholder-text-hint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-sm transition-all duration-150"
          />
        </div>

        <div
          v-if="formError"
          class="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
        >
          {{ formError }}
        </div>

        <button
          type="submit"
          :disabled="!isValid || submitting"
          class="w-full py-2 btn-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <BaseIcon v-if="submitting" name="loader" :size="16" class="animate-spin" />
          {{ mode === 'login' ? 'Sign In' : 'Create Account' }}
        </button>
      </form>

      <p class="mt-4 text-xs text-text-hint text-center">
        {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
        <button class="text-accent hover:text-accent-hover underline ml-1" @click="switchMode">
          {{ mode === 'login' ? 'Create one' : 'Sign in' }}
        </button>
      </p>
    </div>
  </div>
</template>
