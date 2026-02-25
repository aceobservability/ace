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
    router.push('/app/dashboards')
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
  <div class="login-page min-h-screen flex items-center justify-center bg-transparent p-6 relative overflow-hidden">
    <div class="w-full max-w-[440px] border border-border rounded-[18px] p-[38px] relative z-1 shadow-md backdrop-blur-[8px]" style="background: linear-gradient(180deg, rgba(16, 27, 43, 0.94), rgba(13, 22, 36, 0.92))">
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-[12px] flex items-center justify-center text-white" style="background: linear-gradient(140deg, var(--color-accent), var(--color-accent-secondary)); box-shadow: 0 10px 22px rgba(217, 119, 6, 0.3)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6">
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-3 3" />
            </svg>
          </div>
          <span class="text-[22px] font-bold font-mono tracking-[0.04em] uppercase text-accent">Ace</span>
        </div>
        <h1 class="text-[23px] font-semibold text-text-0 mb-2">{{ mode === 'login' ? 'Welcome back' : 'Create account' }}</h1>
        <p class="text-text-1 text-[13px]">
          {{ mode === 'login' ? 'Sign in to your account to continue' : 'Get started with your new account' }}
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="handleSubmit">
        <div v-if="error" class="flex items-center gap-2 px-4 py-3 rounded-[8px] text-danger text-sm" style="background: rgba(251, 113, 133, 0.1); border: 1px solid var(--color-danger)">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div v-if="mode === 'register'" class="flex flex-col gap-2">
          <label for="name" class="text-sm font-medium text-text-0">Name</label>
          <div class="relative flex items-center">
            <User :size="18" class="absolute left-3.5 text-text-2 pointer-events-none" />
            <input
              id="name"
              v-model="name"
              type="text"
              placeholder="Your name (optional)"
              :disabled="loading"
              class="w-full py-3 pr-3.5 pl-11 bg-bg-2 border border-border rounded-[10px] text-text-0 text-sm transition-colors duration-200 placeholder:text-text-2 focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label for="email" class="text-sm font-medium text-text-0">Email</label>
          <div class="relative flex items-center">
            <Mail :size="18" class="absolute left-3.5 text-text-2 pointer-events-none" />
            <input
              id="email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :disabled="loading"
              class="w-full py-3 pr-3.5 pl-11 bg-bg-2 border border-border rounded-[10px] text-text-0 text-sm transition-colors duration-200 placeholder:text-text-2 focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label for="password" class="text-sm font-medium text-text-0">Password</label>
          <div class="relative flex items-center">
            <Lock :size="18" class="absolute left-3.5 text-text-2 pointer-events-none" />
            <input
              id="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
              :disabled="loading"
              class="w-full py-3 pr-3.5 pl-11 bg-bg-2 border border-border rounded-[10px] text-text-0 text-sm transition-colors duration-200 placeholder:text-text-2 focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <p v-if="mode === 'register'" class="text-xs text-text-2">
            Min 8 characters with uppercase, lowercase, and number
          </p>
        </div>

        <button type="submit" class="flex items-center justify-center gap-2 py-3.5 px-5 bg-accent text-[#1a0f00] border-none rounded-[10px] text-sm font-semibold cursor-pointer transition-all duration-200 hover:not-disabled:bg-accent-hover hover:not-disabled:-translate-y-px disabled:opacity-70 disabled:cursor-not-allowed" style="box-shadow: 0 10px 24px rgba(217, 119, 6, 0.24)" :disabled="loading">
          <template v-if="loading">
            <span class="w-4 h-4 border-2 border-[rgba(26,15,0,0.3)] border-t-[#1a0f00] rounded-full animate-[spin_0.8s_linear_infinite]"></span>
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
        <p class="text-text-1 text-[13px]">
          {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
          <button type="button" class="bg-none border-none text-accent text-[13px] font-medium cursor-pointer p-0 ml-1 hover:underline" @click="switchMode">
            {{ mode === 'login' ? 'Create one' : 'Sign in' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>

<style>
.login-page::before,
.login-page::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  filter: blur(70px);
  pointer-events: none;
}
.login-page::before {
  width: 340px;
  height: 340px;
  background: rgba(245, 158, 11, 0.28);
  top: -110px;
  left: -100px;
}
.login-page::after {
  width: 360px;
  height: 360px;
  background: rgba(99, 102, 241, 0.2);
  right: -120px;
  bottom: -160px;
}
</style>
