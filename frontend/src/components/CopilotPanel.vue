<script setup lang="ts">
import { Loader2, Send, Sparkles, Trash2, Unplug, X } from 'lucide-vue-next'
import { nextTick, onMounted, ref, watch } from 'vue'
import { type CopilotMessage, useCopilot } from '../composables/useCopilot'
import { useOrganization } from '../composables/useOrganization'

const props = defineProps<{
  datasourceType: string
  datasourceName: string
  onInsertQuery: (query: string) => void
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
  checkConnection,
  connect,
  disconnect,
  sendMessage,
} = useCopilot()

const { currentOrgId } = useOrganization()

const messages = ref<CopilotMessage[]>([])
const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

onMounted(() => {
  checkConnection()
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(messages, scrollToBottom, { deep: true })

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  inputText.value = ''
  messages.value.push({ role: 'user', content: text })

  const chatMessages = messages.value.map((m) => ({ role: m.role, content: m.content }))
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1
  const assistantMsg = messages.value[assistantIndex]!

  const generator = sendMessage(props.datasourceType, props.datasourceName, chatMessages)
  for await (const chunk of generator) {
    assistantMsg.content += chunk
  }

  if (error.value) {
    assistantMsg.content = assistantMsg.content || `Error: ${error.value}`
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

function extractCodeBlock(content: string): string | null {
  const match = content.match(/```[\w]*\n?([\s\S]*?)```/)
  return match?.[1]?.trim() ?? null
}

function handleInsertQuery(content: string) {
  const code = extractCodeBlock(content)
  if (code) {
    props.onInsertQuery(code)
  }
}

function hasCodeBlock(content: string): boolean {
  return /```[\w]*\n?[\s\S]*?```/.test(content)
}

function formatMessage(content: string): string {
  // Replace code blocks with styled pre/code
  return content.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    '<pre class="rounded-lg bg-slate-950 p-3 my-2 overflow-x-auto"><code class="text-xs font-mono text-emerald-400 whitespace-pre-wrap">$2</code></pre>',
  ).replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-slate-950 px-1.5 py-0.5 text-xs font-mono text-emerald-400">$1</code>',
  ).replace(/\n/g, '<br />')
}

async function handleDisconnect() {
  await disconnect()
  messages.value = []
}
</script>

<template>
  <div class="flex flex-col h-full w-80 shrink-0 bg-slate-900 border-l border-slate-700">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
      <div class="flex items-center gap-2">
        <Sparkles :size="16" class="text-amber-400" />
        <span class="text-sm font-semibold text-slate-200">Copilot</span>
      </div>
      <button
        class="flex items-center justify-center h-6 w-6 rounded bg-transparent border-none text-slate-400 cursor-pointer hover:text-slate-200 hover:bg-slate-800"
        @click="emit('close')"
        title="Close panel"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Not connected state -->
    <div v-if="!isConnected" class="flex flex-col items-center justify-center gap-4 p-6 text-center flex-1">
      <Sparkles :size="32" class="text-amber-400" />
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-slate-200 m-0">GitHub Copilot</h3>
        <p class="text-xs text-slate-400 m-0">Connect your GitHub account to get AI-assisted query writing powered by your Copilot subscription.</p>
      </div>
      <button
        class="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 cursor-pointer border-none transition hover:bg-amber-600"
        :disabled="!currentOrgId"
        @click="currentOrgId && connect(currentOrgId)"
      >
        Connect GitHub Copilot
      </button>
    </div>

    <!-- Connected but no subscription -->
    <div v-else-if="!hasCopilot" class="flex flex-col items-center justify-center gap-4 p-6 text-center flex-1">
      <Sparkles :size="32" class="text-slate-500" />
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-slate-200 m-0">No Copilot Subscription</h3>
        <p class="text-xs text-slate-400 m-0">
          Connected as <strong class="text-slate-300">{{ githubUsername }}</strong>, but no active Copilot subscription was detected.
        </p>
        <a
          href="https://github.com/features/copilot"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-amber-400 hover:text-amber-300"
        >
          Learn about GitHub Copilot
        </a>
      </div>
      <button
        class="inline-flex items-center gap-1 text-xs text-slate-500 cursor-pointer border-none bg-transparent hover:text-slate-300"
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
          <Sparkles :size="24" class="text-amber-400/50" />
          <p class="text-xs text-slate-500 m-0">Ask Copilot to help write {{ datasourceType }} queries</p>
        </div>

        <div v-for="(msg, index) in messages" :key="index" class="flex flex-col gap-1">
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="self-end max-w-[85%]">
            <div class="rounded-xl bg-slate-700 px-3 py-2 text-sm text-slate-100">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant message -->
          <div v-else class="self-start max-w-[95%]">
            <div class="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-200">
              <div v-html="formatMessage(msg.content)" />
              <button
                v-if="hasCodeBlock(msg.content) && !isLoading"
                class="mt-2 inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-950 cursor-pointer border-none transition hover:bg-amber-600"
                @click="handleInsertQuery(msg.content)"
              >
                Insert query
              </button>
            </div>
          </div>
        </div>

        <!-- Loading indicator -->
        <div v-if="isLoading && messages.length > 0 && messages[messages.length - 1]?.content === ''" class="self-start">
          <div class="rounded-xl bg-slate-800 px-3 py-2">
            <Loader2 :size="14" class="animate-spin text-amber-400" />
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-2 text-xs text-rose-400 bg-rose-500/10 border-t border-rose-500/20">
        {{ error }}
      </div>

      <!-- Input area -->
      <div class="flex flex-col gap-2 border-t border-slate-700 p-3">
        <div class="flex gap-2">
          <textarea
            v-model="inputText"
            class="flex-1 resize-none rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-amber-500 min-h-[38px] max-h-[120px]"
            placeholder="Ask about queries..."
            rows="1"
            @keydown="handleKeydown"
            :disabled="isLoading"
          />
          <button
            class="flex items-center justify-center h-[38px] w-[38px] shrink-0 rounded-lg border-none cursor-pointer transition"
            :class="inputText.trim() && !isLoading ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'"
            :disabled="!inputText.trim() || isLoading"
            @click="handleSend"
            title="Send message"
          >
            <Send :size="14" />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <button
            v-if="messages.length > 0"
            class="inline-flex items-center gap-1 text-xs text-slate-500 cursor-pointer border-none bg-transparent hover:text-slate-300"
            @click="clearChat"
          >
            <Trash2 :size="12" />
            Clear chat
          </button>
          <span v-else />
          <button
            class="inline-flex items-center gap-1 text-xs text-slate-500 cursor-pointer border-none bg-transparent hover:text-slate-300"
            @click="handleDisconnect"
          >
            <Unplug :size="12" />
            Disconnect
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
