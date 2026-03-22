<script setup lang="ts">
import { Github, Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { configureGitHubApp, getGitHubAppConfig } from '../api/sso'

const props = defineProps<{
  orgId: string
  isAdmin: boolean
}>()

const callbackUrl = computed(() => `${window.location.origin}/api/auth/github/callback`)

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const configured = ref(false)
const enabled = ref(false)
const clientId = ref('')
const clientSecret = ref('')

onMounted(async () => {
  await loadConfig()
})

async function loadConfig() {
  loading.value = true
  error.value = null
  try {
    const config = await getGitHubAppConfig(props.orgId)
    clientId.value = config.client_id
    enabled.value = config.enabled
    configured.value = true
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load GitHub App config'
    if (message === 'GitHub Copilot not configured') {
      clientId.value = ''
      enabled.value = false
      configured.value = false
      return
    }
    error.value = message
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!props.isAdmin) return

  const id = clientId.value.trim()
  const secret = clientSecret.value.trim()

  if (!id) {
    error.value = 'Client ID is required'
    return
  }
  if (!secret) {
    error.value = 'Client Secret is required'
    return
  }

  saving.value = true
  error.value = null
  notice.value = null

  try {
    const updated = await configureGitHubApp(props.orgId, {
      client_id: id,
      client_secret: secret,
      enabled: enabled.value,
    })
    clientId.value = updated.client_id
    enabled.value = updated.enabled
    configured.value = true
    clientSecret.value = ''
    notice.value = 'GitHub Copilot credentials saved'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save GitHub App config'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="rounded bg-[var(--color-surface-container-low)] p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-[var(--color-on-surface)]">
        <Github :size="20" />
        GitHub Copilot Integration
      </h2>
      <span
        v-if="!loading"
        class="inline-block rounded-sm px-2.5 py-0.5 text-xs border"
        :class="configured
          ? (enabled
            ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            : 'border-[var(--color-tertiary)]/20 bg-[var(--color-tertiary)]/10 text-[var(--color-tertiary)]')
          : ' bg-[var(--color-surface-container-high)] text-[var(--color-outline)]'"
      >
        {{ configured ? (enabled ? 'Configured' : 'Disabled') : 'Not configured' }}
      </span>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-4">
      <Loader2 :size="16" class="animate-spin text-[var(--color-outline)]" />
      <span class="text-sm text-[var(--color-outline)]">Loading configuration...</span>
    </div>

    <template v-else-if="isAdmin">
      <p class="text-sm text-[var(--color-outline)] mb-4 mt-0">
        Configure a GitHub OAuth App so members of this organization can connect their GitHub Copilot subscriptions for AI-assisted query writing.
      </p>

      <div class="rounded bg-[var(--color-surface-container-high)] p-4">
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-[var(--color-on-surface)]">Client ID</label>
          <input
            v-model="clientId"
            type="text"
            :disabled="saving"
            data-testid="github-app-client-id-input"
            class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-[var(--color-on-surface)]">Client Secret</label>
          <input
            v-model="clientSecret"
            type="password"
            :placeholder="configured ? '••••••••' : 'Enter client secret'"
            :disabled="saving"
            data-testid="github-app-client-secret-input"
            class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-on-surface)] cursor-pointer">
            <input
              v-model="enabled"
              type="checkbox"
              :disabled="saving"
              data-testid="github-app-enabled-checkbox"
              class="rounded -strong text-[var(--color-primary)] focus:ring-accent"
            />
            Enable GitHub Copilot
          </label>
        </div>

        <div class="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2.5 text-xs text-[var(--color-outline)] mb-4">
          Create a GitHub OAuth App at
          <strong>github.com/settings/developers</strong>.
          Set the callback URL to:
          <code class="rounded bg-[var(--color-surface-container-high)] px-1.5 py-0.5 text-xs font-mono text-[var(--color-on-surface)]">{{ callbackUrl }}</code>.
          Required scopes: <code class="rounded bg-[var(--color-surface-container-high)] px-1.5 py-0.5 text-xs font-mono text-[var(--color-on-surface)]">read:user, copilot</code>.
        </div>

        <div v-if="error" class="rounded-sm border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 px-3 py-2.5 text-sm text-[var(--color-error)] mb-3">{{ error }}</div>
        <div v-if="notice" class="rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-2.5 text-sm text-[var(--color-primary)] mb-3">{{ notice }}</div>

        <div class="flex justify-end">
          <button
            class="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary)]-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="saving"
            data-testid="github-app-save-btn"
            @click="handleSave"
          >
            {{ saving ? 'Saving...' : 'Save Credentials' }}
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <p class="text-sm text-[var(--color-outline)] mt-0 mb-0">
        GitHub Copilot is {{ configured ? (enabled ? 'configured' : 'configured but disabled') : 'not configured' }} for this organization. Contact an admin to update credentials.
      </p>
    </template>
  </section>
</template>
