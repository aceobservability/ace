<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAnalytics, type AnalyticsConsent } from '../composables/useAnalytics'

const router = useRouter()
const {
  consent,
  dntEnabled,
  sessionRecordingEnabled,
  setAnalyticsConsent,
  setSessionRecordingEnabled,
  trackEvent,
} = useAnalytics()

const analyticsEnabled = computed(() => consent.value === 'granted' && !dntEnabled.value)

function goBack() {
  router.back()
}

function updateConsent(nextConsent: AnalyticsConsent) {
  setAnalyticsConsent(nextConsent)
  trackEvent('analytics_consent_updated', {
    consent: nextConsent,
    source: 'privacy_settings',
  })
}

function toggleSessionRecording(event: Event) {
  const target = event.target as HTMLInputElement
  setSessionRecordingEnabled(target.checked)
  trackEvent('analytics_session_recording_updated', {
    enabled: target.checked,
    source: 'privacy_settings',
  })
}
</script>

<template>
  <div class="privacy-settings">
    <header class="page-header">
      <button class="btn-back" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <div>
        <h1>Privacy Settings</h1>
        <p>Control product analytics, feature flags, and session recording preferences.</p>
      </div>
    </header>

    <section class="settings-card">
      <div class="row">
        <div>
          <h2>Product analytics</h2>
          <p>Anonymous usage events for page visits, dashboard actions, and settings interactions.</p>
        </div>
        <div class="actions">
          <button
            class="btn btn-secondary"
            :disabled="dntEnabled"
            @click="updateConsent('denied')"
          >
            Disable
          </button>
          <button
            class="btn btn-primary"
            :disabled="dntEnabled"
            @click="updateConsent('granted')"
          >
            Enable
          </button>
        </div>
      </div>
      <p class="status" :class="{ enabled: analyticsEnabled }">
        Status:
        <strong>
          {{ dntEnabled ? 'Disabled by browser Do Not Track' : analyticsEnabled ? 'Enabled' : 'Disabled' }}
        </strong>
      </p>
      <p v-if="consent === 'pending' && !dntEnabled" class="hint">
        You have not chosen yet. Analytics stays disabled until you opt in.
      </p>
    </section>

    <section class="settings-card">
      <div class="row">
        <div>
          <h2>Session recording</h2>
          <p>Optional replay sessions to debug UI flows. Requires analytics to be enabled.</p>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            :checked="sessionRecordingEnabled"
            :disabled="!analyticsEnabled"
            @change="toggleSessionRecording"
          />
          <span>Enable session recording</span>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.privacy-settings {
  padding: 1.35rem 1.5rem;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.page-header h1 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.page-header p {
  margin: 0.25rem 0 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.btn-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border-primary);
  background: var(--surface-2);
  color: var(--text-secondary);
  cursor: pointer;
}

.settings-card {
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
  padding: 1.2rem;
}

.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.settings-card h2 {
  margin: 0;
  font-size: 0.95rem;
}

.settings-card p {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.actions {
  display: inline-flex;
  gap: 0.55rem;
}

.btn {
  border-radius: 9px;
  border: 1px solid transparent;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-primary {
  color: #1a0f00;
  background: #F59E0B;
  border-color: rgba(245, 158, 11, 0.4);
}

.btn-secondary {
  color: #FCD34D;
  background: transparent;
  border-color: #F59E0B;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.status {
  margin-top: 0.9rem;
  color: var(--text-secondary);
}

.status.enabled {
  color: var(--accent-success);
}

.hint {
  margin-top: 0.45rem;
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  font-size: 0.82rem;
}

@media (max-width: 900px) {
  .row {
    flex-direction: column;
  }
}
</style>
