<script setup lang="ts">
import { Sparkles, X, Check, Loader2 } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { useAIProvider } from '../composables/useAIProvider'


const props = defineProps<{
  query: string
  datasourceType: string
  datasourceName: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  apply: [query: string]
}>()

const { providers, fetchProviders, sendMessage, isLoading, error: aiError } = useAIProvider()

const suggestion = ref('')
const showPanel = ref(false)
const hasRequested = ref(false)

const hasProvider = computed(() => providers.value.length > 0)
const canSuggest = computed(() => props.query.trim().length > 0 && !props.disabled)

async function requestSuggestion() {
  if (!canSuggest.value) return

  suggestion.value = ''
  showPanel.value = true
  hasRequested.value = true

  // Ensure providers are loaded
  if (providers.value.length === 0) {
    await fetchProviders()
    if (providers.value.length === 0) {
      // No provider configured — panel is open, will show the no-provider message
      return
    }
  }

  const messages = [{
    role: 'user' as const,
    content: `I have this ${props.datasourceType} query:\n\n\`\`\`\n${props.query}\n\`\`\`\n\nSuggest improvements or optimizations. If the query could be more efficient, show the improved version. If it's already good, say so briefly. Keep your response concise, focus on the query itself.`,
  }]

  try {
    for await (const chunk of sendMessage(props.datasourceType, props.datasourceName, messages)) {
      suggestion.value += chunk
    }
  } catch {
    // Error is set in useAIProvider
  }
}

const applyError = ref('')

function applySuggestion() {
  applyError.value = ''

  // Extract code blocks from the suggestion
  const codeBlockMatch = suggestion.value.match(/```(?:\w+)?\n?([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    emit('apply', codeBlockMatch[1].trim())
    dismiss()
    return
  }

  // Try to find a line that looks like a query
  const lines = suggestion.value.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('*'))
  const queryLine = lines.find(l => /^[a-z_][\w]*[\s({]/.test(l.trim()) || /^SELECT\b/i.test(l.trim()))
  if (queryLine) {
    emit('apply', queryLine.trim())
    dismiss()
    return
  }

  // No extractable query found — show error instead of silently dismissing
  applyError.value = 'Could not extract a query from the suggestion. Copy it manually from above.'
}

function dismiss() {
  showPanel.value = false
  suggestion.value = ''
  hasRequested.value = false
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Trigger button -->
    <button
      type="button"
      data-testid="ai-suggest-btn"
      class="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
      :style="{
        backgroundColor: 'transparent',
        color: canSuggest ? 'var(--color-primary)' : 'var(--color-outline)',
        border: '1px solid var(--color-outline-variant)',
      }"
      :disabled="!canSuggest || isLoading"
      @click="requestSuggestion"
    >
      <Loader2 v-if="isLoading" :size="16" class="animate-spin" />
      <Sparkles v-else :size="16" />
      <span>{{ isLoading ? 'Analyzing...' : 'AI Suggest' }}</span>
    </button>

    <!-- Suggestion panel -->
    <div
      v-if="showPanel"
      class="rounded-lg p-4 animate-fade-in"
      :style="{
        backgroundColor: 'var(--color-surface-bright)',
        border: '1px solid var(--color-outline-variant)',
        boxShadow: 'var(--shadow-md)',
      }"
      data-testid="ai-suggest-panel"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-semibold uppercase tracking-wide" :style="{ color: 'var(--color-primary)' }">
          <Sparkles :size="12" class="inline mr-1" />
          AI Suggestion
        </span>
        <button
          type="button"
          class="flex items-center justify-center w-6 h-6 rounded bg-transparent border-none cursor-pointer transition"
          :style="{ color: 'var(--color-outline)' }"
          @click="dismiss"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading && !suggestion" class="flex items-center gap-2 py-4" :style="{ color: 'var(--color-outline)' }">
        <Loader2 :size="16" class="animate-spin" />
        <span class="text-sm">Discovering metrics and analyzing query...</span>
      </div>

      <!-- Error state -->
      <div v-else-if="aiError && !suggestion" class="text-sm py-2" :style="{ color: 'var(--color-error)' }">
        {{ aiError }}
      </div>

      <!-- No provider configured -->
      <div v-else-if="hasRequested && !hasProvider && !isLoading" class="flex flex-col gap-3 py-2">
        <p class="text-sm m-0" :style="{ color: 'var(--color-outline)' }">
          No AI provider configured for this organization.
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold transition"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }"
            @click="$router.push('/app/settings/ai')"
          >
            Configure AI Provider
          </button>
          <span class="text-xs" :style="{ color: 'var(--color-outline)' }">or use GitHub Copilot via Cmd+K</span>
        </div>
      </div>

      <!-- Suggestion content -->
      <div v-if="suggestion" class="flex flex-col gap-3">
        <div
          class="text-sm leading-relaxed whitespace-pre-wrap font-mono"
          :style="{ color: 'var(--color-on-surface-variant)' }"
          data-testid="ai-suggest-content"
        >{{ suggestion }}</div>

        <div class="flex items-center gap-2 pt-2" :style="{ borderTop: '1px solid var(--color-outline-variant)' }">
          <button
            type="button"
            data-testid="ai-suggest-apply"
            class="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold transition"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }"
            @click="applySuggestion"
          >
            <Check :size="12" />
            Apply
          </button>
          <button
            type="button"
            data-testid="ai-suggest-dismiss"
            class="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition bg-transparent border-none cursor-pointer"
            :style="{ color: 'var(--color-outline)' }"
            @click="dismiss"
          >
            Dismiss
          </button>
        </div>
        <p v-if="applyError" class="text-xs m-0 mt-1" :style="{ color: 'var(--color-tertiary)' }">{{ applyError }}</p>
      </div>
    </div>
  </div>
</template>
