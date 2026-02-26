<script setup lang="ts">
import { Check, Github, Loader2, Unplug } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useCopilot } from '../composables/useCopilot'
import { useOrganization } from '../composables/useOrganization'

const route = useRoute()
const {
  isConnected,
  githubUsername,
  hasCopilot,
  checkConnection,
  connect,
  disconnect,
} = useCopilot()

const { currentOrgId } = useOrganization()

const loading = ref(true)
const showSuccessToast = ref(false)

onMounted(async () => {
  await checkConnection()
  loading.value = false

  if (route.query.github === 'connected') {
    showSuccessToast.value = true
    setTimeout(() => {
      showSuccessToast.value = false
    }, 4000)
  }
})

async function handleDisconnect() {
  await disconnect()
}
</script>

<template>
  <div class="flex flex-col min-h-full px-8 py-6">
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-slate-900 m-0">User Settings</h1>
    </header>

    <!-- Success toast -->
    <div
      v-if="showSuccessToast"
      class="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
    >
      <Check :size="16" />
      GitHub Copilot connected successfully!
    </div>

    <div class="flex flex-col gap-6 max-w-2xl">
      <!-- Integrations section -->
      <section class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-200 px-6 py-4">
          <h2 class="text-lg font-semibold text-slate-900 m-0">Integrations</h2>
          <p class="text-sm text-slate-500 m-0 mt-1">Connect external services to enhance your experience.</p>
        </div>

        <div class="p-6">
          <!-- GitHub Copilot card -->
          <div class="flex items-start gap-4 rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-center h-10 w-10 shrink-0 rounded-lg bg-slate-900">
              <Github :size="20" class="text-white" />
            </div>

            <div class="flex flex-col gap-1 flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-slate-900 m-0">GitHub Copilot</h3>
              <p class="text-xs text-slate-500 m-0">
                Use your GitHub Copilot subscription to get AI-assisted query writing in Explore views.
              </p>

              <div v-if="loading" class="flex items-center gap-2 mt-2">
                <Loader2 :size="14" class="animate-spin text-slate-400" />
                <span class="text-xs text-slate-400">Checking connection...</span>
              </div>

              <div v-else-if="isConnected" class="flex items-center gap-3 mt-2">
                <span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <Check :size="12" />
                  Connected as {{ githubUsername }}
                </span>
                <span v-if="hasCopilot" class="text-xs text-emerald-600">Copilot active</span>
                <span v-else class="text-xs text-amber-600">No Copilot subscription</span>
              </div>
            </div>

            <div class="shrink-0">
              <button
                v-if="!loading && !isConnected"
                class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer border-none transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!currentOrgId"
                @click="currentOrgId && connect(currentOrgId)"
              >
                <Github :size="14" />
                Connect
              </button>

              <button
                v-else-if="!loading && isConnected"
                class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 cursor-pointer transition hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                @click="handleDisconnect"
              >
                <Unplug :size="12" />
                Disconnect
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
