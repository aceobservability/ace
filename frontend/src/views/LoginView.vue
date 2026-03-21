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
    <div class="absolute inset-0 bg-surface-base" />
    <div class="absolute inset-0 dark:opacity-100 opacity-0 transition-opacity" style="background: radial-gradient(ellipse 60% 50% at 50% 40%, rgba(52,211,153,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, rgba(99,102,241,0.04) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 80% 20%, rgba(52,211,153,0.03) 0%, transparent 50%)" />
    <!-- Subtle grid pattern -->
    <div class="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style="background-image: linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px); background-size: 64px 64px" />

    <div class="relative z-10 w-full max-w-md rounded border border-border p-8" style="background: var(--color-surface-raised);">
      <div class="mb-8 text-center">
        <div class="mb-6 flex flex-col items-center justify-center">
          <div class="relative inline-flex h-11 w-11 items-center justify-center rounded-sm font-mono text-sm font-bold text-white" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 0 20px rgba(52,211,153,0.2), 0 2px 8px rgba(0,0,0,0.3)">
            A
          </div>
          <span class="mt-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-text-muted">Ace Observability</span>
        </div>
        <h1 class="text-2xl font-bold text-text-primary text-center">{{ mode === 'login' ? 'Welcome back' : 'Create account' }}</h1>
        <p class="text-sm text-text-muted text-center mt-2">
          {{ mode === 'login' ? 'Sign in to your account to continue' : 'Get started with your new account' }}
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="handleSubmit" data-testid="login-form">
        <div v-if="error" class="flex items-center gap-2 rounded-sm bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400" data-testid="login-error">
          <AlertCircle :size="16" class="shrink-0" />
          <span>{{ error }}</span>
        </div>

        <div v-if="mode === 'register'" class="flex flex-col">
          <label for="name" class="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <div class="relative flex items-center">
            <User :size="18" class="absolute left-3.5 text-text-muted pointer-events-none" />
            <input
              id="name"
              v-model="name"
              type="text"
              placeholder="Your name (optional)"
              :disabled="loading"
              data-testid="name-input"
              class="w-full rounded-sm border border-border bg-surface-input pl-11 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="email" class="block text-sm font-medium text-text-secondary mb-1.5">Email</label>
          <div class="relative flex items-center">
            <Mail :size="18" class="absolute left-3.5 text-text-muted pointer-events-none" />
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :disabled="loading"
              data-testid="email-input"
              class="w-full rounded-sm border border-border bg-surface-input pl-11 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="password" class="block text-sm font-medium text-text-secondary mb-1.5">Password</label>
          <div class="relative flex items-center">
            <Lock :size="18" class="absolute left-3.5 text-text-muted pointer-events-none" />
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
              :disabled="loading"
              data-testid="password-input"
              class="w-full rounded-sm border border-border bg-surface-input pl-11 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <p v-if="mode === 'register'" class="text-xs text-text-muted mt-1">
            Min 8 characters with uppercase, lowercase, and number
          </p>
        </div>

        <button
          type="submit"
          class="flex w-full items-center justify-center gap-2 rounded-sm py-2.5 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)"
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
        <p class="text-sm text-text-muted">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="ml-1 text-sm text-accent hover:underline cursor-pointer bg-transparent border-none p-0 font-medium" @click="switchMode" data-testid="auth-mode-switch-btn">
            {{ mode === 'login' ? 'Create one' : 'Sign in' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
