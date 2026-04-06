<script setup lang="ts">
import { ArrowLeft, Loader2, Send, Wrench } from 'lucide-vue-next'
import { nextTick, onMounted, ref, watch } from 'vue'
import type { ToolCall } from '../composables/useAIProvider'
import { useAIProvider } from '../composables/useAIProvider'
import { getToolsForDatasourceType, useCopilotToolExecutor } from '../composables/useCopilotTools'
import { useOrganization } from '../composables/useOrganization'
import type { DashboardSpec } from '../utils/dashboardSpec'
import { initMarkdown, renderMarkdown } from '../utils/markdown'
import DashboardSpecPreview from './DashboardSpecPreview.vue'

const props = defineProps<{
  initialQuery: string
  datasourceType: string
  datasourceName: string
  datasourceId: string
}>()

const emit = defineEmits<{ 'exit-chat': [] }>()

const { sendChatRequest, chatMessages, models, selectedModel, selectedProviderId, fetchModels, isLoading, error, providers } =
  useAIProvider()

const { currentOrg } = useOrganization()

const lastUsedDatasourceType = ref('')

const { executeTool } = useCopilotToolExecutor(
  () => props.datasourceId,
  () => currentOrg.value?.id ?? '',
  () => props.datasourceType || lastUsedDatasourceType.value,
)

// --- State ---

const followUp = ref('')
const dashboardSpec = ref<DashboardSpec | null>(null)
const renderedHtml = ref<Record<number, string>>({})
const messagesContainer = ref<HTMLDivElement | null>(null)

interface ToolStatus {
  name: string
  status: 'running' | 'complete' | 'error'
}
const toolStatuses = ref<ToolStatus[]>([])

const MAX_TOOL_ITERATIONS = 10

// --- Chat request message types ---

type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

// --- Build request messages from AIMessage[] ---

function buildChatRequestMessages(): ChatRequestMessage[] {
  const messages: ChatRequestMessage[] = []

  if (props.datasourceId) {
    messages.push({
      role: 'system',
      content: `You have tools to explore datasource data. You are currently working with datasource '${props.datasourceName}' (type: ${props.datasourceType}, id: ${props.datasourceId}). You can use the data discovery tools directly.`,
    })
  } else {
    messages.push({
      role: 'system',
      content:
        'You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools.',
    })
  }

  messages.push(...chatMessages.value.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })))
  return messages
}

// --- Core tool-calling loop ---

async function handleSend(userMessage: string) {
  chatMessages.value.push({ role: 'user', content: userMessage })
  const requestMessages = buildChatRequestMessages()
  const tools = getToolsForDatasourceType(props.datasourceType)
  toolStatuses.value = []
  dashboardSpec.value = null

  isLoading.value = true
  error.value = null

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const { content, toolCalls } = await sendChatRequest(
        props.datasourceType,
        props.datasourceName,
        requestMessages,
        tools,
      )

      if (content) {
        chatMessages.value.push({ role: 'assistant', content })
        requestMessages.push({ role: 'assistant', content })
      }

      if (!toolCalls.length) break

      for (const tc of toolCalls) {
        if (tc.function.name === 'generate_dashboard') {
          try {
            const spec = JSON.parse(tc.function.arguments) as DashboardSpec
            spec.panels?.forEach((p) => {
              if (p.query) p.query.datasource_id = props.datasourceId
            })
            dashboardSpec.value = spec
            chatMessages.value.push({
              role: 'assistant',
              content: 'Dashboard generated. See the preview below.',
              dashboardSpec: spec,
            })
          } catch {
            chatMessages.value.push({
              role: 'assistant',
              content: 'Failed to parse dashboard specification.',
            })
          }
          return // exit loop on generate_dashboard
        }

        // Execute other tools
        toolStatuses.value.push({ name: tc.function.name, status: 'running' })
        const statusIndex = toolStatuses.value.length - 1
        const result = await executeTool(tc).catch((err: unknown) => {
          toolStatuses.value[statusIndex]!.status = 'error'
          return `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`
        })
        if (toolStatuses.value[statusIndex]!.status === 'running') {
          toolStatuses.value[statusIndex]!.status = 'complete'
        }
        requestMessages.push(
          { role: 'assistant', content: null, tool_calls: [tc] },
          { role: 'tool', tool_call_id: tc.id, content: result },
        )
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Chat request failed'
  } finally {
    isLoading.value = false
  }
}

// --- Follow-up ---

function handleFollowUp() {
  const msg = followUp.value.trim()
  if (!msg || isLoading.value) return
  followUp.value = ''
  handleSend(msg)
}

// --- Markdown rendering ---

async function renderMessages() {
  for (let i = 0; i < chatMessages.value.length; i++) {
    const msg = chatMessages.value[i]!
    if (msg.role === 'assistant' && !(i in renderedHtml.value)) {
      renderedHtml.value[i] = await renderMarkdown(msg.content)
    }
  }
}

watch(chatMessages, renderMessages, { deep: true })

// --- Auto-scroll ---

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(chatMessages, scrollToBottom, { deep: true })

// --- Lifecycle ---

onMounted(async () => {
  await initMarkdown()
  await fetchModels(selectedProviderId.value || undefined)
  handleSend(props.initialQuery)
})

// --- Tool status icon ---

function toolStatusIcon(status: ToolStatus['status']): string {
  switch (status) {
    case 'running':
      return '...'
    case 'complete':
      return 'done'
    case 'error':
      return 'failed'
  }
}
</script>

<template>
  <div class="flex flex-col" :style="{ height: '460px' }">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2 border-b"
      :style="{ borderColor: 'var(--color-outline-variant)' }"
    >
      <button
        data-testid="chat-back-btn"
        class="flex items-center gap-1 text-sm border-none bg-transparent cursor-pointer"
        :style="{ color: 'var(--color-on-surface-variant)' }"
        @click="emit('exit-chat')"
      >
        <ArrowLeft :size="16" />
        Back to search
      </button>

      <select
        v-if="models.length > 0"
        v-model="selectedModel"
        data-testid="model-selector"
        class="text-xs rounded border px-2 py-1"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          borderColor: 'var(--color-outline-variant)',
        }"
      >
        <template v-if="providers.length > 1">
          <optgroup v-for="p in providers" :key="p.id" :label="p.display_name">
            <option v-for="m in models.filter(mod => mod.provider_id === p.id)" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </optgroup>
        </template>
        <template v-else>
          <option v-for="m in models" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </template>
      </select>
    </div>

    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-4 py-3 space-y-3"
    >
      <template v-for="(msg, index) in chatMessages" :key="index">
        <!-- User message -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div
            class="rounded-lg px-3 py-2 text-sm max-w-[80%]"
            :style="{
              backgroundColor: 'var(--color-primary-container)',
              color: 'var(--color-on-primary-container)',
            }"
          >
            {{ msg.content }}
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else-if="msg.role === 'assistant'" class="flex justify-start">
          <div
            class="rounded-lg px-3 py-2 text-sm max-w-[80%] prose prose-sm prose-invert"
            :style="{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
            }"
            v-html="renderedHtml[index] || msg.content"
          />
        </div>
      </template>

      <!-- Tool statuses -->
      <div v-for="(ts, i) in toolStatuses" :key="'tool-' + i" class="flex items-center gap-2 text-xs"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        <Wrench :size="12" />
        <span>{{ ts.name }}</span>
        <Loader2 v-if="ts.status === 'running'" :size="12" class="animate-spin" />
        <span v-else-if="ts.status === 'complete'" :style="{ color: 'var(--color-secondary)' }">{{ toolStatusIcon(ts.status) }}</span>
        <span v-else :style="{ color: 'var(--color-error)' }">{{ toolStatusIcon(ts.status) }}</span>
      </div>

      <!-- Loading indicator -->
      <div v-if="isLoading && toolStatuses.length === 0" class="flex items-center gap-2 text-xs"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        <Loader2 :size="14" class="animate-spin" />
        <span>Thinking...</span>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="rounded-lg px-3 py-2 text-sm"
        :style="{
          backgroundColor: 'var(--color-error-container)',
          color: 'var(--color-on-error-container)',
        }"
      >
        {{ error }}
      </div>

      <!-- Dashboard spec preview -->
      <DashboardSpecPreview
        v-if="dashboardSpec"
        :spec="dashboardSpec"
        data-testid="dashboard-spec-preview"
      />
    </div>

    <!-- Input area -->
    <div
      class="flex items-end gap-2 px-4 py-3 border-t"
      :style="{ borderColor: 'var(--color-outline-variant)' }"
    >
      <textarea
        v-model="followUp"
        data-testid="chat-input"
        rows="1"
        class="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          borderColor: 'var(--color-outline-variant)',
        }"
        placeholder="Ask a follow-up..."
        :disabled="isLoading"
        @keydown.enter.exact.prevent="handleFollowUp"
      />
      <button
        data-testid="chat-send-btn"
        class="rounded-lg border-none px-3 py-2 cursor-pointer"
        :style="{
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
        }"
        :disabled="isLoading || !followUp.trim()"
        @click="handleFollowUp"
      >
        <Send :size="16" />
      </button>
    </div>
  </div>
</template>
