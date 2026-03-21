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
  <section class="rounded border border-border bg-surface-raised p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-text-primary">
        <Github :size="20" />
        GitHub Copilot Integration
      </h2>
      <span
        v-if="!loading"
        class="inline-block rounded-sm px-2.5 py-0.5 text-xs border"
        :class="configured
          ? (enabled
            ? 'border-accent-border bg-accent-muted text-accent'
            : 'border-amber-200 bg-amber-50 text-amber-700')
          : 'border-border bg-surface-overlay text-text-muted'"
      >
        {{ configured ? (enabled ? 'Configured' : 'Disabled') : 'Not configured' }}
      </span>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-4">
      <Loader2 :size="16" class="animate-spin text-text-muted" />
      <span class="text-sm text-text-muted">Loading configuration...</span>
    </div>

    <template v-else-if="isAdmin">
      <p class="text-sm text-text-muted mb-4 mt-0">
        Configure a GitHub OAuth App so members of this organization can connect their GitHub Copilot subscriptions for AI-assisted query writing.
      </p>

      <div class="rounded border border-border bg-surface-overlay p-4">
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-text-primary">Client ID</label>
          <input
            v-model="clientId"
            type="text"
            :disabled="saving"
            data-testid="github-app-client-id-input"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-text-primary">Client Secret</label>
          <input
            v-model="clientSecret"
            type="password"
            :placeholder="configured ? '••••••••' : 'Enter client secret'"
            :disabled="saving"
            data-testid="github-app-client-secret-input"
            class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="inline-flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
            <input
              v-model="enabled"
              type="checkbox"
              :disabled="saving"
              data-testid="github-app-enabled-checkbox"
              class="rounded border-border-strong text-accent focus:ring-accent"
            />
            Enable GitHub Copilot
          </label>
        </div>

        <div class="rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-xs text-text-muted mb-4">
          Create a GitHub OAuth App at
          <strong>github.com/settings/developers</strong>.
          Set the callback URL to:
          <code class="rounded bg-surface-overlay px-1.5 py-0.5 text-xs font-mono text-text-primary">{{ callbackUrl }}</code>.
          Required scopes: <code class="rounded bg-surface-overlay px-1.5 py-0.5 text-xs font-mono text-text-primary">read:user, copilot</code>.
        </div>

        <div v-if="error" class="rounded-sm border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-500 mb-3">{{ error }}</div>
        <div v-if="notice" class="rounded-sm border border-accent-border bg-accent-muted px-3 py-2.5 text-sm text-accent mb-3">{{ notice }}</div>

        <div class="flex justify-end">
          <button
            class="inline-flex items-center gap-1.5 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
      <p class="text-sm text-text-muted mt-0 mb-0">
        GitHub Copilot is {{ configured ? (enabled ? 'configured' : 'configured but disabled') : 'not configured' }} for this organization. Contact an admin to update credentials.
      </p>
    </template>
  </section>
</template>
