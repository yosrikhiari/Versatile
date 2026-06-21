<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'
import BaseIcon from '../components/shared/BaseIcon.vue'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const displayName = ref('')
const isRegistering = ref(false)
const localError = ref('')
const isSubmitting = ref(false)

async function handleSubmit() {
  localError.value = ''
  isSubmitting.value = true
  try {
    if (isRegistering.value) {
      await auth.localRegister(username.value, password.value, displayName.value || username.value)
    } else {
      await auth.localLogin(username.value, password.value)
    }
    router.push('/workspace')
  } catch (err) {
    localError.value = err.message
  } finally {
    isSubmitting.value = false
  }
}

function toggleMode() {
  isRegistering.value = !isRegistering.value
  localError.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-manuscript ambient-glow grain flex items-center justify-center p-4">
    <div class="glass-modal rounded-xl shadow-warm-lg p-8 w-full max-w-sm animate-scale-in">
      <div class="flex justify-center mb-6">
        <BaseIcon name="feather" :size="48" class="text-accent" />
      </div>
      <h1 class="text-xl font-semibold text-text-primary text-center mb-1">Versatile</h1>
      <p class="text-text-secondary text-sm text-center mb-6">{{ isRegistering ? 'Create your account' : 'Sign in to continue' }}</p>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label class="block text-sm text-text-secondary mb-1">Username</label>
          <input
            v-model="username"
            type="text"
            required
            autocomplete="username"
            class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Enter your username"
          />
        </div>

        <div v-if="isRegistering">
          <label class="block text-sm text-text-secondary mb-1">Display Name</label>
          <input
            v-model="displayName"
            type="text"
            autocomplete="name"
            class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="How you want to be called"
          />
        </div>

        <div>
          <label class="block text-sm text-text-secondary mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Enter your password"
          />
        </div>

        <p v-if="localError" class="text-red-400 text-sm text-center">{{ localError }}</p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="w-full py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
        >
          {{ isSubmitting ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In') }}
        </button>
      </form>

      <p class="text-sm text-text-secondary text-center mt-6">
        {{ isRegistering ? 'Already have an account?' : "Don't have an account?" }}
        <button class="text-accent hover:underline focus:outline-none" @click="toggleMode">
          {{ isRegistering ? 'Sign in' : 'Create one' }}
        </button>
      </p>

      <p class="text-xs text-text-tertiary text-center mt-4">
        Test user: <span class="text-text-secondary">test / test123</span>
      </p>
    </div>
  </div>
</template>
