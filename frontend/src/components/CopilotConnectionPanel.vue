<script setup lang="ts">
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ExternalLink,
  Github,
  Loader2,
  Unplug,
} from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useCopilot } from '../composables/useCopilot'

const props = defineProps<{ orgId: string }>()

const {
  isConnected,
  githubUsername,
  hasCopilot,
  error,
  deviceFlowActive,
  userCode,
  verificationUri,
  checkConnection,
  connect,
  cancelDeviceFlow,
  disconnect,
} = useCopilot()

const codeCopied = ref(false)

onMounted(() => {
  checkConnection()
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(userCode.value)
    codeCopied.value = true
    setTimeout(() => {
      codeCopied.value = false
    }, 2000)
  } catch {
    // fallback ignored
  }
}

function openGitHub() {
  window.open(verificationUri.value, '_blank')
}
</script>

<template>
  <section
    class="rounded p-6"
    :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
  >
    <!-- Header -->
    <div class="flex justify-between items-center mb-4">
      <h2
        class="flex items-center gap-2 m-0 text-base font-semibold"
        :style="{ color: 'var(--color-on-surface)' }"
      >
        <Github :size="20" />
        GitHub Copilot
      </h2>
    </div>

    <!-- Error banner (shown alongside any state) -->
    <div
      v-if="error"
      class="flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm mb-4"
      :style="{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        color: 'var(--color-error)',
      }"
    >
      <AlertTriangle :size="14" />
      <span>{{ error }}</span>
    </div>

    <!-- State 1: Device flow active -->
    <div
      v-if="deviceFlowActive"
      class="flex flex-col items-center gap-5 py-6 text-center"
    >
      <div class="flex flex-col gap-2">
        <h3
          class="text-sm font-semibold m-0"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Your device code
        </h3>
        <p
          class="text-xs m-0"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Copy the code below, then open GitHub to authorize.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <div
          data-testid="copilot-user-code"
          class="rounded px-4 py-2 font-mono text-2xl font-bold tracking-widest"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: 'var(--color-on-surface)',
          }"
        >
          {{ userCode }}
        </div>
        <button
          class="flex items-center justify-center h-10 w-10 rounded-sm cursor-pointer transition"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: 'var(--color-on-surface-variant)',
          }"
          title="Copy code"
          @click="copyCode"
        >
          <Check v-if="codeCopied" :size="14" :style="{ color: 'var(--color-secondary)' }" />
          <ClipboardCopy v-else :size="14" />
        </button>
      </div>

      <button
        data-testid="copilot-open-github-btn"
        class="inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold text-white cursor-pointer border-none transition"
        :style="{ backgroundColor: 'var(--color-primary)' }"
        @click="openGitHub"
      >
        <ExternalLink :size="14" />
        Open GitHub
      </button>

      <div
        class="flex items-center gap-2 text-xs"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        <Loader2 :size="12" class="animate-spin" />
        Waiting for authorization...
      </div>

      <button
        data-testid="copilot-cancel-btn"
        class="inline-flex items-center gap-1 text-xs cursor-pointer border-none bg-transparent transition"
        :style="{ color: 'var(--color-outline)' }"
        @click="cancelDeviceFlow"
      >
        Cancel
      </button>
    </div>

    <!-- State 2: Not connected -->
    <div
      v-else-if="!isConnected"
      class="flex flex-col items-center gap-4 py-6 text-center"
    >
      <p
        class="text-sm m-0 max-w-md"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        Connect your GitHub account to use AI-assisted query writing powered by your Copilot subscription.
      </p>
      <button
        data-testid="copilot-connect-btn"
        class="inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold text-white cursor-pointer border-none transition"
        :style="{ backgroundColor: 'var(--color-primary)' }"
        @click="connect(props.orgId)"
      >
        <Github :size="14" />
        Connect GitHub Copilot
      </button>
    </div>

    <!-- State 3: Connected with Copilot -->
    <div
      v-else-if="isConnected && hasCopilot"
      class="flex flex-col gap-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Github :size="18" :style="{ color: 'var(--color-on-surface-variant)' }" />
          <span
            class="text-sm font-medium"
            :style="{ color: 'var(--color-on-surface)' }"
          >
            {{ githubUsername }}
          </span>
          <span
            data-testid="copilot-active-badge"
            class="inline-flex items-center gap-1 rounded-sm px-2.5 py-0.5 text-xs font-semibold"
            :style="{
              backgroundColor: 'rgba(229, 160, 13, 0.1)',
              border: '1px solid rgba(229, 160, 13, 0.2)',
              color: 'var(--color-primary)',
            }"
          >
            Copilot Active
          </span>
        </div>
        <button
          data-testid="copilot-disconnect-btn"
          class="inline-flex items-center gap-1 text-xs cursor-pointer border-none bg-transparent transition"
          :style="{ color: 'var(--color-outline)' }"
          @click="disconnect"
        >
          <Unplug :size="12" />
          Disconnect
        </button>
      </div>
    </div>

    <!-- State 4: Connected without Copilot -->
    <div
      v-else-if="isConnected && !hasCopilot"
      class="flex flex-col gap-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <Github :size="18" :style="{ color: 'var(--color-on-surface-variant)' }" />
          <span
            class="text-sm font-medium"
            :style="{ color: 'var(--color-on-surface)' }"
          >
            {{ githubUsername }}
          </span>
        </div>
        <button
          data-testid="copilot-disconnect-btn"
          class="inline-flex items-center gap-1 text-xs cursor-pointer border-none bg-transparent transition"
          :style="{ color: 'var(--color-outline)' }"
          @click="disconnect"
        >
          <Unplug :size="12" />
          Disconnect
        </button>
      </div>
      <div
        class="flex items-center gap-2 rounded-sm px-3 py-2.5 text-sm"
        :style="{
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
          color: 'var(--color-tertiary)',
        }"
      >
        <AlertTriangle :size="14" />
        <span>No active Copilot subscription detected.</span>
      </div>
    </div>
  </section>
</template>
