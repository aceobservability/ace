<script setup lang="ts">
import { AlertCircle, Lock, LogIn, Mail, User, UserPlus } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { login, register } = useAuth()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const name = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true

  try {
    if (mode.value === 'login') {
      await login(email.value, password.value)
    } else {
      await register(email.value, password.value, name.value || undefined)
    }
    router.push('/dashboards')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <div class="login-page relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
    <!-- Atmospheric background -->
    <div class="absolute inset-0 bg-[var(--color-surface)]" />
    <div class="absolute inset-0" style="background: radial-gradient(ellipse 60% 50% at 50% 40%, rgba(163,166,255,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, rgba(96,99,238,0.04) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 80% 20%, rgba(105,246,184,0.03) 0%, transparent 50%)" />
    <!-- Subtle grid pattern -->
    <div class="absolute inset-0 opacity-[0.03]" style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 64px 64px" />

    <div class="relative z-10 w-full max-w-md rounded-lg p-8 bg-[var(--color-surface-container-low)]">
      <div class="mb-8 text-center">
        <div class="mb-6 flex flex-col items-center justify-center">
          <div class="relative inline-flex h-11 w-11 items-center justify-center rounded-sm font-mono text-sm font-bold text-white" style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%); box-shadow: 0 0 20px rgba(163,166,255,0.2), 0 2px 8px rgba(0,0,0,0.3)">
            A
          </div>
          <span class="mt-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-[var(--color-outline)]">Ace Observability</span>
        </div>
        <h1 class="text-2xl font-bold font-display text-[var(--color-on-surface)] text-center">{{ mode === 'login' ? 'Welcome back' : 'Create account' }}</h1>
        <p class="text-sm text-[var(--color-outline)] text-center mt-2">
          {{ mode === 'login' ? 'Sign in to your account to continue' : 'Get started with your new account' }}
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="handleSubmit" data-testid="login-form">
        <div v-if="error" class="flex items-center gap-2 rounded-sm bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]" data-testid="login-error">
          <AlertCircle :size="16" class="shrink-0" />
          <span>{{ error }}</span>
        </div>

        <div v-if="mode === 'register'" class="flex flex-col">
          <label for="name" class="block text-sm font-medium text-[var(--color-on-surface-variant)] mb-1.5">Name</label>
          <div class="relative flex items-center">
            <User :size="18" class="absolute left-3.5 text-[var(--color-outline)] pointer-events-none" />
            <input
              id="name"
              v-model="name"
              type="text"
              placeholder="Your name (optional)"
              :disabled="loading"
              data-testid="name-input"
              class="w-full rounded-sm bg-[var(--color-surface-container-high)] pl-11 pr-4 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="email" class="block text-sm font-medium text-[var(--color-on-surface-variant)] mb-1.5">Email</label>
          <div class="relative flex items-center">
            <Mail :size="18" class="absolute left-3.5 text-[var(--color-outline)] pointer-events-none" />
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :disabled="loading"
              data-testid="email-input"
              class="w-full rounded-sm bg-[var(--color-surface-container-high)] pl-11 pr-4 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="password" class="block text-sm font-medium text-[var(--color-on-surface-variant)] mb-1.5">Password</label>
          <div class="relative flex items-center">
            <Lock :size="18" class="absolute left-3.5 text-[var(--color-outline)] pointer-events-none" />
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
              :disabled="loading"
              data-testid="password-input"
              class="w-full rounded-sm bg-[var(--color-surface-container-high)] pl-11 pr-4 py-2.5 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed border-none"
            />
          </div>
          <p v-if="mode === 'register'" class="text-xs text-[var(--color-outline)] mt-1">
            Min 8 characters with uppercase, lowercase, and number
          </p>
        </div>

        <button
          type="submit"
          class="flex w-full items-center justify-center gap-2 rounded-sm py-2.5 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style="background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%); box-shadow: 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)"
          :disabled="loading"
          data-testid="login-submit-btn"
        >
          <template v-if="loading">
            <span class="animate-spin h-4 w-4 rounded-full border-2 border-white/30 border-t-white"></span>
            {{ mode === 'login' ? 'Signing in...' : 'Creating account...' }}
          </template>
          <template v-else>
            <LogIn v-if="mode === 'login'" :size="18" />
            <UserPlus v-else :size="18" />
            {{ mode === 'login' ? 'Sign in' : 'Create account' }}
          </template>
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-sm text-[var(--color-outline)]">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="ml-1 text-sm text-[var(--color-primary)] hover:underline cursor-pointer bg-transparent border-none p-0 font-medium" @click="switchMode" data-testid="auth-mode-switch-btn">
            {{ mode === 'login' ? 'Create one' : 'Sign in' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
