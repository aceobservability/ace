<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Unplug,
  X,
} from 'lucide-vue-next'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { type CopilotMessage, useCopilot } from '../composables/useCopilot'
import { getVictoriaMetricsTools, useCopilotToolExecutor } from '../composables/useCopilotTools'
import { useOrganization } from '../composables/useOrganization'

const props = defineProps<{
  datasourceType: string
  datasourceName: string
  datasourceId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  isConnected,
  githubUsername,
  hasCopilot,
  isLoading,
  error,
  models,
  selectedModel,
  deviceFlowActive,
  userCode,
  verificationUri,
  checkConnection,
  fetchModels,
  connect,
  cancelDeviceFlow,
  disconnect,
  sendMessage,
  sendChatRequest,
} = useCopilot()

const { executeTool } = useCopilotToolExecutor(() => props.datasourceId)

const { currentOrgId } = useOrganization()

const messages = ref<CopilotMessage[]>([])
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const modelSelectorRef = ref<HTMLElement | null>(null)

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await checkConnection()
  if (isConnected.value && hasCopilot.value) {
    fetchModels()
  }
})

const modelDropdownOpen = ref(false)

function formatMultiplier(multiplier: number): string {
  if (multiplier === 0) return 'Included'
  if (multiplier < 1) return `${multiplier}x`
  return `${multiplier}x`
}

function multiplierClass(multiplier: number): string {
  if (multiplier === 0) return 'text-emerald-400 bg-emerald-400/10'
  if (multiplier <= 0.33) return 'text-emerald-400 bg-emerald-400/10'
  if (multiplier <= 1) return 'text-amber-400 bg-amber-400/10'
  if (multiplier <= 3) return 'text-orange-400 bg-orange-400/10'
  return 'text-rose-400 bg-rose-400/10'
}

function selectModel(modelId: string) {
  selectedModel.value = modelId
  modelDropdownOpen.value = false
}

function selectedModelName(): string {
  const model = models.value.find((m) => m.id === selectedModel.value)
  return model?.name || 'Select model'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })

watch([isConnected, hasCopilot], ([connected, copilot], [prevConnected, prevCopilot]) => {
  if (connected && copilot && !(prevConnected && prevCopilot)) {
    fetchModels()
  }
})

const MAX_TOOL_ITERATIONS = 10

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  inputText.value = ''
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1
  const assistantMsg = messages.value[assistantIndex]!

  const tools = props.datasourceType === 'victoriametrics' ? getVictoriaMetricsTools() : undefined

  // If no tools, use streaming as before
  if (!tools) {
    const chatMessages = messages.value
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }))
    const generator = sendMessage(props.datasourceType, props.datasourceName, chatMessages)
    for await (const chunk of generator) {
      assistantMsg.content += chunk
    }
    if (error.value) {
      assistantMsg.content = assistantMsg.content || `Error: ${error.value}`
    }
    return
  }

  // Tool-calling loop
  isLoading.value = true
  error.value = null
  const chatHistory: Array<Record<string, unknown>> = messages.value.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const result = await sendChatRequest(
        props.datasourceType,
        props.datasourceName,
        chatHistory as Parameters<typeof sendChatRequest>[2],
        tools,
      )

      if (result.toolCalls.length === 0) {
        assistantMsg.content = result.content || ''
        break
      }

      chatHistory.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls,
      })

      for (const toolCall of result.toolCalls) {
        let toolResult: string
        try {
          toolResult = await executeTool(toolCall)
        } catch (e) {
          toolResult = `Error: ${e instanceof Error ? e.message : 'Tool execution failed'}`
        }
        chatHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })
      }

      const toolNames = result.toolCalls.map((tc) => tc.function.name).join(', ')
      assistantMsg.content += assistantMsg.content
        ? `\n\nUsing tools: ${toolNames}...`
        : `Using tools: ${toolNames}...`
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send message'
    assistantMsg.content = assistantMsg.content || `Error: ${error.value}`
  } finally {
    isLoading.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function clearChat() {
  messages.value = []
}

function formatMessage(content: string): string {
  // Replace code blocks with styled pre/code
  return content
    .replace(
      /```(\w*)\n?([\s\S]*?)```/g,
      '<pre class="rounded-sm bg-surface-overlay p-3 my-2 overflow-x-auto"><code class="text-xs font-mono text-accent whitespace-pre-wrap">$2</code></pre>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-surface-overlay px-1.5 py-0.5 text-xs font-mono text-accent">$1</code>',
    )
    .replace(/\n/g, '<br />')
}

const codeCopied = ref(false)

async function copyCode() {
  try {
    await navigator.clipboard.writeText(userCode.value)
    codeCopied.value = true
    setTimeout(() => {
      codeCopied.value = false
    }, 2000)
  } catch {
    // fallback
  }
}

function openGitHub() {
  window.open(verificationUri.value, '_blank')
}

async function handleDisconnect() {
  await disconnect()
  messages.value = []
  models.value = []
}

function handleClickOutside(e: MouseEvent) {
  if (
    modelDropdownOpen.value &&
    modelSelectorRef.value &&
    !modelSelectorRef.value.contains(e.target as Node)
  ) {
    modelDropdownOpen.value = false
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="flex flex-col h-screen w-80 shrink-0 bg-surface-raised border-l border-border sticky top-0">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <div class="flex items-center gap-2">
        <Sparkles :size="16" class="text-accent" />
        <span class="text-sm font-semibold text-text-primary">Copilot</span>
      </div>
      <button
        class="flex items-center justify-center h-6 w-6 rounded bg-transparent border-none text-text-muted cursor-pointer hover:text-text-primary hover:bg-surface-overlay"
        @click="emit('close')"
        title="Close panel"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Device flow in progress -->
    <div v-if="deviceFlowActive" class="flex flex-col items-center justify-center gap-5 p-6 text-center flex-1">
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-text-primary m-0">Your device code</h3>
        <p class="text-xs text-text-secondary m-0">Copy the code below, then open GitHub to authorize.</p>
      </div>

      <div class="flex items-center gap-2">
        <div class="rounded bg-surface-overlay border border-border px-4 py-2 font-mono text-lg font-bold text-text-primary tracking-widest">
          {{ userCode }}
        </div>
        <button
          class="flex items-center justify-center h-9 w-9 rounded-sm border border-border bg-surface-overlay cursor-pointer text-text-muted transition hover:text-text-primary hover:border-text-muted"
          title="Copy code"
          @click="copyCode"
        >
          <Check v-if="codeCopied" :size="14" class="text-emerald-500" />
          <ClipboardCopy v-else :size="14" />
        </button>
      </div>

      <button
        class="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white cursor-pointer border-none transition hover:bg-accent-hover"
        @click="openGitHub"
      >
        <ExternalLink :size="14" />
        Open GitHub
      </button>

      <div class="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 :size="12" class="animate-spin" />
        Waiting for authorization...
      </div>

      <button
        class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary"
        @click="cancelDeviceFlow"
      >
        Cancel
      </button>
    </div>

    <!-- Not connected state -->
    <div v-else-if="!isConnected" class="flex flex-col items-center justify-center gap-4 p-6 text-center flex-1">
      <Sparkles :size="32" class="text-accent" />
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-text-primary m-0">GitHub Copilot</h3>
        <p class="text-xs text-text-secondary m-0">Connect your GitHub account to get AI-assisted query writing powered by your Copilot subscription.</p>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white cursor-pointer border-none transition hover:bg-accent-hover"
        :disabled="!currentOrgId"
        @click="currentOrgId && connect(currentOrgId)"
      >
        Connect GitHub Copilot
      </button>
    </div>

    <!-- Connected but no subscription -->
    <div v-else-if="!hasCopilot" class="flex flex-col items-center justify-center gap-4 p-6 text-center flex-1">
      <Sparkles :size="32" class="text-text-muted" />
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-text-primary m-0">No Copilot Subscription</h3>
        <p class="text-xs text-text-secondary m-0">
          Connected as <strong class="text-text-primary">{{ githubUsername }}</strong>, but no active Copilot subscription was detected.
        </p>
        <a
          href="https://github.com/features/copilot"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-accent hover:text-accent"
        >
          Learn about GitHub Copilot
        </a>
      </div>
      <button
        class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary"
        @click="handleDisconnect"
      >
        <Unplug :size="12" />
        Disconnect
      </button>
    </div>

    <!-- Chat interface -->
    <template v-else>
      <!-- Messages -->
      <div ref="messagesContainer" class="flex flex-col gap-3 flex-1 overflow-y-auto p-4">
        <div v-if="messages.length === 0" class="flex flex-col items-center justify-center gap-2 text-center py-8 flex-1">
          <Sparkles :size="24" class="text-accent/50" />
          <p class="text-xs text-text-muted m-0">Ask Copilot to help write {{ datasourceType }} queries</p>
        </div>

        <div v-for="(msg, index) in messages" :key="index" class="flex flex-col gap-1">
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[85%]">
            <div class="rounded bg-accent px-3 py-2 text-sm text-white">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant message -->
          <div v-else class="self-start max-w-[95%]">
            <div class="rounded bg-surface-overlay px-3 py-2 text-sm text-text-primary">
              <div v-html="formatMessage(msg.content)" />
            </div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="isLoading && messages.length > 0 && messages[messages.length - 1]?.content === ''" class="self-start">
          <div class="rounded bg-surface-overlay px-3 py-2">
            <Loader2 :size="14" class="animate-spin text-accent" />
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 text-xs text-rose-500 bg-rose-500/10 border-t border-rose-500/20">
        {{ error }}
      </div>

      <!-- Input area -->
      <div class="flex flex-col gap-2 border-t border-border p-3">
        <div class="flex gap-2">
          <textarea
            v-model="inputText"
            class="flex-1 resize-none rounded-sm bg-surface-overlay border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent min-h-[38px] max-h-[120px]"
            placeholder="Ask about queries..."
            rows="1"
            @keydown="handleKeydown"
            :disabled="isLoading"
          />
          <button
            class="flex items-center justify-center h-[38px] w-[38px] shrink-0 rounded-sm border-none cursor-pointer transition"
            :class="inputText.trim() && !isLoading ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface-overlay text-text-muted cursor-not-allowed'"
            :disabled="!inputText.trim() || isLoading"
            @click="handleSend"
            title="Send message"
          >
            <Send :size="14" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <!-- Model selector -->
          <div v-if="models.length > 0" ref="modelSelectorRef" class="relative flex-1 min-w-0">
            <button
              class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary w-full"
              @click="modelDropdownOpen = !modelDropdownOpen"
            >
              <span class="truncate">{{ selectedModelName() }}</span>
              <span
                class="rounded px-1 py-0.5 text-[10px] font-semibold leading-none shrink-0"
                :class="multiplierClass(models.find(m => m.id === selectedModel)?.premium_multiplier ?? 1)"
              >
                {{ formatMultiplier(models.find(m => m.id === selectedModel)?.premium_multiplier ?? 1) }}
              </span>
              <ChevronDown :size="10" class="shrink-0 transition" :class="{ 'rotate-180': modelDropdownOpen }" />
            </button>

            <!-- Dropdown (opens upward) -->
            <div
              v-if="modelDropdownOpen"
              class="absolute left-0 bottom-full mb-1 z-10 w-56 rounded-sm bg-surface-raised border border-border shadow-lg max-h-64 overflow-y-auto"
            >
              <button
                v-for="model in models"
                :key="model.id"
                class="flex items-center justify-between w-full px-2.5 py-2 text-xs text-left cursor-pointer border-none transition"
                :class="model.id === selectedModel ? 'bg-accent/10 text-accent' : 'bg-transparent text-text-primary hover:bg-surface-overlay'"
                @click="selectModel(model.id)"
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="truncate font-medium">{{ model.name }}</span>
                  <span class="text-[10px] text-text-muted">{{ model.vendor }}</span>
                </div>
                <span
                  class="rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ml-2"
                  :class="multiplierClass(model.premium_multiplier)"
                >
                  {{ formatMultiplier(model.premium_multiplier) }}
                </span>
              </button>
            </div>
          </div>
          <span v-else class="flex-1" />

          <button
            v-if="messages.length > 0"
            class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary shrink-0"
            @click="clearChat"
          >
            <Trash2 :size="12" />
          </button>
          <button
            class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary shrink-0"
            @click="handleDisconnect"
          >
            <Unplug :size="12" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
