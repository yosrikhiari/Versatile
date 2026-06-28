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
  <div class="min-h-[100dvh] bg-manuscript ambient-glow grain flex">
    <div class="hidden lg:flex w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden">
      <div class="relative z-10 text-center max-w-md">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl liquid-glass mb-8">
          <BaseIcon name="feather" :size="40" class="text-accent" />
        </div>
        <h1 class="text-4xl font-bold text-text-primary mb-3 font-display">Versatile</h1>
        <p class="text-text-secondary text-lg leading-relaxed">A fiction writing assistant designed for focus, flow, and craft.</p>
        <div class="mt-12 space-y-4 text-left">
          <div class="flex items-start gap-3">
            <BaseIcon name="check-circle" :size="18" class="text-accent mt-0.5 shrink-0" />
            <span class="text-text-secondary text-sm">Distraction-free manuscript editing with a monospaced canvas</span>
          </div>
          <div class="flex items-start gap-3">
            <BaseIcon name="check-circle" :size="18" class="text-accent mt-0.5 shrink-0" />
            <span class="text-text-secondary text-sm">AI-powered revision, polish, and story analysis tools</span>
          </div>
          <div class="flex items-start gap-3">
            <BaseIcon name="check-circle" :size="18" class="text-accent mt-0.5 shrink-0" />
            <span class="text-text-secondary text-sm">Character webs, timeline maps, and storybible management</span>
          </div>
        </div>
      </div>
    </div>

    <div class="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
      <div class="w-full max-w-sm">
        <div class="spring-enter-active">
          <div class="lg:hidden flex justify-center mb-8">
            <div class="inline-flex items-center justify-center w-14 h-14 rounded-xl liquid-glass">
              <BaseIcon name="feather" :size="28" class="text-accent" />
            </div>
          </div>

          <div class="liquid-glass rounded-xl p-8">
            <h2 class="text-xl font-semibold text-text-primary mb-1">{{ isRegistering ? 'Create your account' : 'Sign in' }}</h2>
            <p class="text-sm text-text-secondary mb-6">{{ isRegistering ? 'Start your writing journey' : 'Welcome back' }}</p>

            <form class="space-y-4" @submit.prevent="handleSubmit">
              <div>
                <label class="block text-sm text-text-secondary mb-1">Username</label>
                <input
                  v-model="username"
                  type="text"
                  required
                  autocomplete="username"
                  class="w-full px-3 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                  placeholder="Enter your username"
                />
              </div>

              <div v-if="isRegistering">
                <label class="block text-sm text-text-secondary mb-1">Display Name</label>
                <input
                  v-model="displayName"
                  type="text"
                  autocomplete="name"
                  class="w-full px-3 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
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
                  class="w-full px-3 py-2.5 bg-bg-secondary border border-border-subtle rounded-lg text-text-primary placeholder-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
                  placeholder="Enter your password"
                />
              </div>

              <p v-if="localError" class="flex items-center gap-2 text-sm text-danger">
                <BaseIcon name="alert-circle" :size="14" class="shrink-0" />
                <span>{{ localError }}</span>
              </p>

              <button
                type="submit"
                :disabled="isSubmitting"
                class="btn-primary w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <template v-if="isSubmitting">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Please wait...
                </template>
                <template v-else>
                  {{ isRegistering ? 'Create Account' : 'Sign In' }}
                </template>
              </button>
            </form>

            <p class="text-sm text-text-secondary text-center mt-6">
              {{ isRegistering ? 'Already have an account?' : "Don't have an account?" }}
              <button class="text-accent hover:underline focus:outline-none ml-1" @click="toggleMode">
                {{ isRegistering ? 'Sign in' : 'Create one' }}
              </button>
            </p>
          </div>

          <p class="text-xs text-text-secondary/50 text-center mt-4">
            Demo: <span class="text-text-secondary">test / test123</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
