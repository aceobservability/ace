<script setup lang="ts">
import { ChevronRight, Loader2, Send, Sparkles, Wrench } from 'lucide-vue-next'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAIProvider } from '../composables/useAIProvider'
import { getToolsForDatasourceType } from '../composables/useCopilotTools'
import { useDashboardGeneration } from '../composables/useDashboardGeneration'
import { useAiSidebar } from '../composables/useAiSidebar'
import { useCommandContext } from '../composables/useCommandContext'
import { useOrganization } from '../composables/useOrganization'
import type { DashboardSpec } from '../utils/dashboardSpec'
import { initMarkdown, renderMarkdown } from '../utils/markdown'
import DashboardSpecPreview from './DashboardSpecPreview.vue'

const { isOpen, close, consumePendingContext } = useAiSidebar()
const { currentContext } = useCommandContext()
const { currentOrg } = useOrganization()

const {
  chatMessages,
  models,
  selectedModel,
  selectedProviderId,
  fetchModels,
  fetchProviders,
  providers,
} = useAIProvider()

const { generate, toolStatuses, isGenerating, error: genError, cancel } = useDashboardGeneration(
  () => currentContext.value?.datasourceId ?? '',
  () => currentOrg.value?.id ?? '',
  () => currentContext.value?.datasourceType ?? '',
)

// --- State ---
const input = ref('')
const dashboardSpec = ref<DashboardSpec | null>(null)
const renderedHtml = ref<Record<number, string>>({})
const messagesContainer = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const markdownReady = ref(false)

function buildSystemMessage(): string {
  const ctx = currentContext.value
  if (ctx?.datasourceId) {
    return `You have tools to explore datasource data. You are currently working with datasource '${ctx.datasourceName}' (type: ${ctx.datasourceType}, id: ${ctx.datasourceId}). You can use the data discovery tools directly.`
  }
  return 'You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools.'
}

type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }

function buildChatRequestMessages(): ChatRequestMessage[] {
  const messages: ChatRequestMessage[] = [
    { role: 'system', content: buildSystemMessage() },
  ]
  for (const m of chatMessages.value) {
    messages.push({ role: m.role as 'user' | 'assistant', content: m.content })
  }
  return messages
}

// --- Core generation via composable ---
async function handleSend(userMessage: string) {
  chatMessages.value.push({ role: 'user', content: userMessage })
  const requestMessages = buildChatRequestMessages()
  const dsType = currentContext.value?.datasourceType ?? ''
  const dsName = currentContext.value?.datasourceName ?? ''
  const tools = getToolsForDatasourceType(dsType)

  // Inject current spec so the AI can refine it
  if (dashboardSpec.value) {
    requestMessages.push({
      role: 'system',
      content: `Current dashboard spec to refine:\n${JSON.stringify(dashboardSpec.value, null, 2)}\nModify and call generate_dashboard with the full updated spec.`,
    })
  }

  const isRefinement = !!dashboardSpec.value

  const result = await generate(requestMessages, tools, dsName, {
    onContent(text) {
      chatMessages.value.push({ role: 'assistant', content: text })
    },
    onDashboardSpec(spec) {
      dashboardSpec.value = spec
      chatMessages.value.push({
        role: 'assistant',
        content: isRefinement
          ? 'Dashboard updated. See the revised preview below.'
          : 'Dashboard generated. See the preview below.',
        dashboardSpec: spec,
      })
    },
  })

  if (result.spec && !dashboardSpec.value) {
    dashboardSpec.value = result.spec
  }
}

function handleSubmit() {
  const msg = input.value.trim()
  if (!msg || isGenerating.value) return
  input.value = ''
  handleSend(msg)
}

onUnmounted(() => {
  cancel()
})

// --- Markdown rendering ---
async function renderMessages() {
  if (!markdownReady.value) return
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

// --- Focus input when opening ---
watch(isOpen, async (open) => {
  if (open) {
    await fetchProviders()
    await fetchModels(selectedProviderId.value || undefined)
    await nextTick()
    inputRef.value?.focus()

    // Check for pending context from inline insights
    const pending = consumePendingContext()
    if (pending) {
      handleSend(pending.message)
    }
  }
})

// --- Lifecycle ---
onMounted(async () => {
  await initMarkdown()
  markdownReady.value = true
  if (chatMessages.value.length > 0) {
    renderMessages()
  }
})

function toolStatusIcon(status: 'running' | 'complete' | 'error'): string {
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
  <aside
    v-if="isOpen"
    data-testid="ai-sidebar"
    class="fixed top-0 right-0 bottom-0 z-40 flex flex-col"
    :style="{
      width: '340px',
      backgroundColor: 'var(--color-surface)',
      borderLeft: '1px solid var(--color-stroke-subtle)',
    }"
  >
    <!-- Header -->
    <div
      class="flex items-center gap-2 px-3 py-2.5 shrink-0"
      :style="{ borderBottom: '1px solid var(--color-stroke-subtle)' }"
    >
      <div
        class="flex items-center justify-center shrink-0"
        :style="{
          width: '26px',
          height: '26px',
          background: 'var(--color-primary-muted)',
          borderRadius: '6px',
          color: 'var(--color-primary)',
        }"
      >
        <Sparkles :size="14" />
      </div>
      <span
        class="font-semibold text-sm flex-1"
        :style="{ fontFamily: 'var(--font-display)', color: 'var(--color-on-surface)' }"
      >Copilot</span>

      <!-- Model selector -->
      <select
        v-if="models.length > 0"
        v-model="selectedModel"
        data-testid="ai-sidebar-model"
        class="border rounded px-1.5 py-0.5"
        :style="{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-outline)',
          borderColor: 'var(--color-stroke-subtle)',
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

      <button
        data-testid="ai-sidebar-close"
        class="flex items-center justify-center shrink-0 cursor-pointer border-none bg-transparent"
        :style="{
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          color: 'var(--color-outline)',
        }"
        title="Close (Esc)"
        @click="close"
      >
        <ChevronRight :size="16" />
      </button>
    </div>

    <!-- Context bar -->
    <div
      v-if="currentContext"
      class="flex items-center gap-2 px-3 py-1.5 shrink-0"
      :style="{ borderBottom: '1px solid var(--color-stroke-faint, rgba(255,255,255,0.04))' }"
    >
      <div
        class="flex items-center gap-1.5 rounded px-2 py-0.5"
        :style="{
          fontSize: '11px',
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-outline)',
        }"
      >
        <span
          :style="{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-secondary)',
            display: 'inline-block',
          }"
        />
        {{ currentContext.viewName }}
      </div>
      <div
        v-if="currentContext.datasourceName"
        class="rounded px-2 py-0.5"
        :style="{
          fontSize: '11px',
          backgroundColor: 'var(--color-primary-muted)',
          color: 'var(--color-primary)',
        }"
      >
        {{ currentContext.datasourceName }}
      </div>
    </div>

    <!-- No providers message -->
    <div
      v-if="providers.length === 0 && !isGenerating"
      class="px-4 py-6 text-center"
    >
      <Sparkles :size="24" :style="{ color: 'var(--color-outline)', margin: '0 auto 8px', display: 'block', opacity: 0.4 }" />
      <p class="text-sm mb-1" :style="{ color: 'var(--color-on-surface-variant)' }">
        No AI provider configured
      </p>
      <p class="text-xs" :style="{ color: 'var(--color-outline)' }">
        Set one up in Settings &rarr; AI Configuration
      </p>
    </div>

    <!-- Messages area -->
    <div
      v-else
      ref="messagesContainer"
      class="flex-1 overflow-y-auto px-3 py-3 space-y-3"
    >
      <!-- Empty state -->
      <div
        v-if="chatMessages.length === 0 && !isGenerating"
        class="flex flex-col items-center justify-center h-full gap-2 text-center px-4"
      >
        <Sparkles :size="20" :style="{ color: 'var(--color-primary)', opacity: 0.5 }" />
        <p class="text-sm" :style="{ color: 'var(--color-on-surface-variant)' }">
          Ask about your metrics, logs, or traces
        </p>
        <p class="text-xs" :style="{ color: 'var(--color-outline)' }">
          I can query datasources, analyze anomalies, and generate dashboards.
        </p>
      </div>

      <template v-for="(msg, index) in chatMessages" :key="index">
        <!-- User message -->
        <div v-if="msg.role === 'user'" class="flex justify-end">
          <div
            class="rounded-lg px-3 py-2 text-sm"
            :style="{
              maxWidth: '90%',
              backgroundColor: 'var(--color-primary-muted)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(201, 150, 15, 0.2)',
            }"
          >
            {{ msg.content }}
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else-if="msg.role === 'assistant'" class="flex justify-start">
          <div
            class="rounded-lg px-3 py-2 text-sm prose prose-sm prose-invert"
            :style="{
              maxWidth: '90%',
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-stroke-subtle)',
            }"
            v-html="renderedHtml[index] || msg.content"
          />
        </div>
      </template>

      <!-- Tool statuses -->
      <div
        v-for="(ts, i) in toolStatuses"
        :key="'tool-' + i"
        class="flex items-center gap-2"
        :style="{ fontSize: '11px', color: 'var(--color-outline)' }"
      >
        <Wrench :size="11" />
        <span>{{ ts.name }}</span>
        <Loader2 v-if="ts.status === 'running'" :size="11" class="animate-spin" />
        <span v-else-if="ts.status === 'complete'" :style="{ color: 'var(--color-secondary)' }">{{ toolStatusIcon(ts.status) }}</span>
        <span v-else :style="{ color: 'var(--color-error)' }">{{ toolStatusIcon(ts.status) }}</span>
      </div>

      <!-- Loading indicator -->
      <div
        v-if="isGenerating && toolStatuses.length === 0"
        class="flex items-center gap-2"
        :style="{ fontSize: '11px', color: 'var(--color-outline)' }"
      >
        <Loader2 :size="12" class="animate-spin" />
        <span>Thinking...</span>
      </div>

      <!-- Error -->
      <div
        v-if="genError"
        class="rounded-lg px-3 py-2 text-sm"
        :style="{
          backgroundColor: 'var(--color-error-container)',
          color: 'var(--color-on-error-container)',
        }"
      >
        {{ genError }}
      </div>

      <!-- Dashboard spec preview -->
      <DashboardSpecPreview
        v-if="dashboardSpec"
        :spec="dashboardSpec"
      />
    </div>

    <!-- Input area -->
    <div
      v-if="providers.length > 0"
      class="flex items-end gap-2 px-3 py-2.5 shrink-0"
      :style="{ borderTop: '1px solid var(--color-stroke-subtle)' }"
    >
      <textarea
        ref="inputRef"
        v-model="input"
        data-testid="ai-sidebar-input"
        rows="1"
        class="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none"
        :style="{
          backgroundColor: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          borderColor: 'var(--color-stroke-subtle)',
          fontFamily: 'var(--font-body)',
        }"
        placeholder="Ask about your data..."
        :disabled="isGenerating"
        @keydown.enter.exact.prevent="handleSubmit"
      />
      <button
        data-testid="ai-sidebar-send"
        class="rounded-lg border-none px-2.5 py-2 cursor-pointer shrink-0"
        :style="{
          backgroundColor: 'var(--color-primary)',
          color: '#0B0D0F',
        }"
        :disabled="isGenerating || !input.trim()"
        @click="handleSubmit"
      >
        <Send :size="14" />
      </button>
    </div>
  </aside>
</template>
