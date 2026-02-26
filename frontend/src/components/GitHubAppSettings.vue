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
  <section class="rounded-xl border border-slate-200 bg-white p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="flex items-center gap-2 m-0 text-base font-semibold text-slate-900">
        <Github :size="20" />
        GitHub Copilot Integration
      </h2>
      <span
        v-if="!loading"
        class="inline-block rounded-full px-2.5 py-0.5 text-xs border"
        :class="configured
          ? (enabled
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700')
          : 'border-slate-200 bg-slate-50 text-slate-500'"
      >
        {{ configured ? (enabled ? 'Configured' : 'Disabled') : 'Not configured' }}
      </span>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-4">
      <Loader2 :size="16" class="animate-spin text-slate-400" />
      <span class="text-sm text-slate-500">Loading configuration...</span>
    </div>

    <template v-else-if="isAdmin">
      <p class="text-sm text-slate-500 mb-4 mt-0">
        Configure a GitHub OAuth App so members of this organization can connect their GitHub Copilot subscriptions for AI-assisted query writing.
      </p>

      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-slate-700">Client ID</label>
          <input
            v-model="clientId"
            type="text"
            :disabled="saving"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="block mb-1.5 text-sm font-medium text-slate-700">Client Secret</label>
          <input
            v-model="clientSecret"
            type="password"
            :placeholder="configured ? '••••••••' : 'Enter client secret'"
            :disabled="saving"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
        </div>
        <div class="mb-4">
          <label class="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input
              v-model="enabled"
              type="checkbox"
              :disabled="saving"
              class="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Enable GitHub Copilot
          </label>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500 mb-4">
          Create a GitHub OAuth App at
          <strong>github.com/settings/developers</strong>.
          Set the callback URL to:
          <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{{ callbackUrl }}</code>.
          Required scopes: <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">read:user, copilot</code>.
        </div>

        <div v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600 mb-3">{{ error }}</div>
        <div v-if="notice" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 mb-3">{{ notice }}</div>

        <div class="flex justify-end">
          <button
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? 'Saving...' : 'Save Credentials' }}
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <p class="text-sm text-slate-500 mt-0 mb-0">
        GitHub Copilot is {{ configured ? (enabled ? 'configured' : 'configured but disabled') : 'not configured' }} for this organization. Contact an admin to update credentials.
      </p>
    </template>
  </section>
</template>
