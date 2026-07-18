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
  <!-- Manuscript Mono · login as the first page of a manuscript: bare canvas, hairline rules, ruled fields. -->
  <div
    class="min-h-[100dvh] w-full bg-manuscript text-text-primary flex items-center justify-center overflow-y-auto px-6 py-12"
  >
    <div class="w-full max-w-[21rem] animate-fade-in">
      <!-- top rule -->
      <div class="h-px w-full bg-border-subtle mb-10"></div>

      <!-- masthead -->
      <div class="text-center">
        <h1
          class="font-manuscript text-2xl font-medium uppercase tracking-[0.3em] text-text-primary"
        >
          Versatile
        </h1>
        <p class="mt-3 font-manuscript text-xs text-text-secondary tracking-wide">
          a place to write fiction
        </p>
      </div>

      <!-- mode line -->
      <p class="mt-9 mb-6 text-sm text-text-secondary">
        {{ isRegistering ? 'Start your writing journey.' : 'Welcome back.' }}
      </p>

      <form class="space-y-6" @submit.prevent="handleSubmit">
        <div>
          <label
            for="login-username"
            class="block font-manuscript text-xs text-text-secondary mb-2"
          >
            Username
          </label>
          <input
            id="login-username"
            v-model="username"
            type="text"
            required
            autocomplete="username"
            class="w-full bg-transparent border-0 border-b border-border-subtle px-1 py-2 text-text-primary placeholder-text-hint focus:border-accent transition-colors"
            placeholder="your name"
          />
        </div>

        <div v-if="isRegistering">
          <label
            for="login-displayname"
            class="block font-manuscript text-xs text-text-secondary mb-2"
          >
            Display name
          </label>
          <input
            id="login-displayname"
            v-model="displayName"
            type="text"
            autocomplete="name"
            class="w-full bg-transparent border-0 border-b border-border-subtle px-1 py-2 text-text-primary placeholder-text-hint focus:border-accent transition-colors"
            placeholder="how you'd like to be called"
          />
        </div>

        <div>
          <label
            for="login-password"
            class="block font-manuscript text-xs text-text-secondary mb-2"
          >
            Password
          </label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            required
            :autocomplete="isRegistering ? 'new-password' : 'current-password'"
            class="w-full bg-transparent border-0 border-b border-border-subtle px-1 py-2 text-text-primary placeholder-text-hint focus:border-accent transition-colors"
            placeholder="••••••••"
          />
        </div>

        <p v-if="localError" class="flex items-center gap-2 text-sm text-danger">
          <BaseIcon name="alert-circle" :size="14" class="shrink-0" />
          <span>{{ localError }}</span>
        </p>

        <button
          type="submit"
          :disabled="isSubmitting"
          class="btn-primary w-full rounded-md py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <template v-if="isSubmitting">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Please wait…
          </template>
          <template v-else>
            {{ isRegistering ? 'Create account' : 'Sign in' }}
          </template>
        </button>
      </form>

      <p class="mt-8 text-center text-sm text-text-secondary">
        {{ isRegistering ? 'Already have an account?' : "Don't have an account yet?" }}
        <button
          class="text-accent hover:underline focus-visible:underline ml-1"
          @click="toggleMode"
        >
          {{ isRegistering ? 'Sign in' : 'Create one' }}
        </button>
      </p>

      <!-- bottom rule -->
      <div class="mt-10 h-px w-full bg-border-subtle"></div>
      <p class="mt-4 text-center text-xs text-text-hint">
        Demo account — <span class="font-manuscript text-text-secondary">test / test123</span>
      </p>
    </div>
  </div>
</template>
