<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { LogIn, UserPlus, Mail, Lock, User, AlertCircle } from 'lucide-vue-next'

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
  <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4">
    <div class="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8">
      <div class="mb-8 text-center">
        <div class="mb-6 flex flex-col items-center justify-center">
          <div class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 font-mono text-sm font-bold text-white">
            A
          </div>
          <span class="mt-2 font-mono text-xs uppercase tracking-[0.16em] text-slate-400">Ace</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-100 text-center">{{ mode === 'login' ? 'Welcome back' : 'Create account' }}</h1>
        <p class="text-sm text-slate-400 text-center mt-2">
          {{ mode === 'login' ? 'Sign in to your account to continue' : 'Get started with your new account' }}
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="handleSubmit">
        <div v-if="error" class="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
          <AlertCircle :size="16" class="shrink-0" />
          <span>{{ error }}</span>
        </div>

        <div v-if="mode === 'register'" class="flex flex-col">
          <label for="name" class="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
          <div class="relative flex items-center">
            <User :size="18" class="absolute left-3.5 text-slate-500 pointer-events-none" />
            <input
              id="name"
              v-model="name"
              type="text"
              placeholder="Your name (optional)"
              :disabled="loading"
              class="w-full rounded-lg border border-slate-700 bg-slate-800 pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="email" class="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
          <div class="relative flex items-center">
            <Mail :size="18" class="absolute left-3.5 text-slate-500 pointer-events-none" />
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-slate-700 bg-slate-800 pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col">
          <label for="password" class="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
          <div class="relative flex items-center">
            <Lock :size="18" class="absolute left-3.5 text-slate-500 pointer-events-none" />
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
              :disabled="loading"
              class="w-full rounded-lg border border-slate-700 bg-slate-800 pl-11 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <p v-if="mode === 'register'" class="text-xs text-slate-500 mt-1">
            Min 8 characters with uppercase, lowercase, and number
          </p>
        </div>

        <button type="submit" class="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="loading">
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
        <p class="text-sm text-slate-400">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="ml-1 text-sm text-emerald-400 hover:text-emerald-300 cursor-pointer bg-transparent border-none p-0 font-medium" @click="switchMode">
            {{ mode === 'login' ? 'Create one' : 'Sign in' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
