<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getOrganization, updateOrgBranding } from '../api/organizations'
import { useOrganization } from '../composables/useOrganization'
import type { Organization } from '../types/organization'

const props = defineProps<{ orgId: string }>()

const { fetchOrganizations } = useOrganization()

const org = ref<Organization | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const appTitle = ref('')
const primaryColor = ref('#10b981')
const logoDataURI = ref<string | null>(null)
const logoError = ref<string | null>(null)

const isAdmin = computed(() => org.value?.role === 'admin')

const previewColor = computed(() => primaryColor.value || '#10b981')
const previewColorMuted = computed(() => {
  const hex = previewColor.value
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},0.15)`
})

onMounted(async () => {
  try {
    org.value = await getOrganization(props.orgId)
    if (org.value.branding?.primary_color) primaryColor.value = org.value.branding.primary_color
    if (org.value.branding?.logo_data_uri) logoDataURI.value = org.value.branding.logo_data_uri
    if (org.value.branding?.app_title) appTitle.value = org.value.branding.app_title
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load organization'
  } finally {
    loading.value = false
  }
})

watch(() => props.orgId, async (newId) => {
  loading.value = true
  error.value = null
  try {
    org.value = await getOrganization(newId)
    if (org.value.branding?.primary_color) primaryColor.value = org.value.branding.primary_color
    else primaryColor.value = '#10b981'
    if (org.value.branding?.logo_data_uri) logoDataURI.value = org.value.branding.logo_data_uri
    else logoDataURI.value = null
    if (org.value.branding?.app_title) appTitle.value = org.value.branding.app_title
    else appTitle.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load organization'
  } finally {
    loading.value = false
  }
})

function handleLogoUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  logoError.value = null

  if (file.size > 512000) {
    logoError.value = 'Logo must be under 500KB'
    input.value = ''
    return
  }

  const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/gif', 'image/webp']
  if (!validTypes.includes(file.type)) {
    logoError.value = 'Unsupported image type. Use PNG, JPEG, SVG, GIF, or WebP.'
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    logoDataURI.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

function removeLogo() {
  logoDataURI.value = null
  logoError.value = null
}

async function handleSave() {
  saving.value = true
  error.value = null
  success.value = null
  try {
    await updateOrgBranding(props.orgId, {
      primary_color: primaryColor.value === '#10b981' ? null : primaryColor.value,
      logo_data_uri: logoDataURI.value || null,
      app_title: appTitle.value || null,
    })
    await fetchOrganizations()
    success.value = 'Branding updated successfully'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save branding'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-12">
    <div class="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600"></div>
  </div>

  <div v-else class="flex flex-col gap-6">
    <!-- App Title -->
    <section class="rounded-xl border border-slate-200 bg-white p-6">
      <h2 class="m-0 mb-4 text-base font-semibold text-slate-900">App Title</h2>
      <p class="m-0 mb-3 text-sm text-slate-500">Custom title replaces "Ace" in the sidebar header.</p>
      <input
        v-model="appTitle"
        type="text"
        maxlength="100"
        placeholder="Ace"
        :disabled="!isAdmin"
        class="w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
      />
    </section>

    <!-- Primary Accent Color -->
    <section class="rounded-xl border border-slate-200 bg-white p-6">
      <h2 class="m-0 mb-4 text-base font-semibold text-slate-900">Primary Accent Color</h2>
      <p class="m-0 mb-3 text-sm text-slate-500">Replaces the default emerald accent across the app for your organisation.</p>
      <div class="flex items-center gap-3">
        <input
          v-model="primaryColor"
          type="color"
          :disabled="!isAdmin"
          class="h-10 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <input
          v-model="primaryColor"
          type="text"
          maxlength="7"
          placeholder="#10b981"
          :disabled="!isAdmin"
          class="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        />
      </div>

      <!-- Color Preview -->
      <div class="mt-4 rounded-lg border border-slate-200 p-4">
        <p class="m-0 mb-3 text-xs text-slate-500">Preview</p>
        <div class="flex items-center gap-3 flex-wrap">
          <button
            class="rounded-md px-3 py-1.5 text-sm font-medium text-white cursor-default"
            :style="{ backgroundColor: previewColor }"
          >Primary button</button>
          <span
            class="rounded px-2 py-0.5 text-xs font-semibold"
            :style="{ backgroundColor: previewColorMuted, color: previewColor }"
          >Badge</span>
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: previewColor }"></div>
            <span class="text-sm text-slate-500">Active indicator</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Organisation Logo -->
    <section class="rounded-xl border border-slate-200 bg-white p-6">
      <h2 class="m-0 mb-4 text-base font-semibold text-slate-900">Organisation Logo</h2>
      <p class="m-0 mb-3 text-sm text-slate-500">Upload a logo (PNG, JPEG, SVG, GIF, or WebP, max 500KB). Replaces the default "A" icon in the sidebar.</p>

      <div v-if="logoDataURI" class="mb-4 flex items-center gap-4">
        <img :src="logoDataURI" alt="Logo preview" class="h-14 w-14 rounded-lg border border-slate-200 object-contain bg-slate-50 p-1" />
        <button
          v-if="isAdmin"
          class="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 cursor-pointer"
          @click="removeLogo"
        >Remove logo</button>
      </div>

      <input
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp"
        :disabled="!isAdmin"
        class="block w-full max-w-sm text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 file:cursor-pointer hover:file:bg-emerald-100 disabled:opacity-50"
        @change="handleLogoUpload"
      />

      <div v-if="logoError" class="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{{ logoError }}</div>
    </section>

    <!-- Live Preview -->
    <section class="rounded-xl border border-slate-200 bg-white p-6">
      <h2 class="m-0 mb-4 text-base font-semibold text-slate-900">Sidebar Preview</h2>
      <div class="w-56 rounded-xl border border-slate-700 bg-slate-950 p-4">
        <div class="flex items-center gap-2.5">
          <img
            v-if="logoDataURI"
            :src="logoDataURI"
            :alt="appTitle || 'Ace'"
            class="h-8 w-8 rounded-lg object-contain"
          />
          <span
            v-else
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs font-bold text-white"
            :style="{ backgroundColor: previewColor }"
          >A</span>
          <span class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">{{ appTitle || 'Ace' }}</span>
        </div>
        <div class="mt-3 flex flex-col gap-1">
          <div class="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-slate-400">
            <div class="h-4 w-4 rounded bg-slate-700"></div>
            <span>Dashboards</span>
          </div>
          <div
            class="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-slate-100"
            :style="{ backgroundColor: previewColorMuted, borderLeft: `2px solid ${previewColor}` }"
          >
            <div class="h-4 w-4 rounded" :style="{ backgroundColor: previewColor, opacity: 0.6 }"></div>
            <span>Explore</span>
          </div>
          <div class="flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-slate-400">
            <div class="h-4 w-4 rounded bg-slate-700"></div>
            <span>Alerts</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Save -->
    <div class="flex items-center gap-3">
      <button
        v-if="isAdmin"
        class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="saving"
        @click="handleSave"
      >{{ saving ? 'Saving...' : 'Save Branding' }}</button>
      <p v-if="!isAdmin" class="m-0 text-sm text-slate-500">Only admins can change branding settings.</p>
    </div>

    <div v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-600">{{ error }}</div>
    <div v-if="success" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">{{ success }}</div>
  </div>
</template>
