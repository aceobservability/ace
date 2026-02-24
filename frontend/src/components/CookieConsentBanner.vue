<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAnalytics } from '../composables/useAnalytics'

const router = useRouter()
const { consent, dntEnabled, setAnalyticsConsent, trackEvent } = useAnalytics()

const visible = computed(() => consent.value === 'pending' && !dntEnabled.value)

function acceptAnalytics() {
  setAnalyticsConsent('granted')
  trackEvent('analytics_consent_updated', {
    consent: 'granted',
    source: 'cookie_banner',
  })
}

function declineAnalytics() {
  setAnalyticsConsent('denied')
}

function openPrivacySettings() {
  router.push('/app/settings/privacy')
}
</script>

<template>
  <div v-if="visible" class="consent-banner" data-testid="cookie-consent-banner">
    <div class="consent-copy">
      <strong>Analytics preferences</strong>
      <p>
        Ace can use privacy-focused analytics and optional session recording to improve product quality.
      </p>
    </div>
    <div class="consent-actions">
      <button class="btn-link" @click="openPrivacySettings">Privacy settings</button>
      <button class="btn-secondary" @click="declineAnalytics">Decline</button>
      <button class="btn-primary" @click="acceptAnalytics">Allow analytics</button>
    </div>
  </div>
</template>

<style>
.consent-banner {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  left: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(252, 211, 77, 0.34);
  border-radius: 12px;
  background: rgba(11, 20, 31, 0.96);
  box-shadow: var(--shadow-md);
  z-index: 250;
}

.consent-copy {
  min-width: 0;
}

.consent-copy strong {
  display: block;
  color: var(--color-text-0);
  font-size: 0.9rem;
}

.consent-copy p {
  margin: 0.25rem 0 0;
  color: var(--color-text-1);
  font-size: 0.8rem;
}

.consent-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-link,
.btn-secondary,
.btn-primary {
  border-radius: 9px;
  padding: 0.45rem 0.7rem;
  border: 1px solid transparent;
  font-size: 0.78rem;
  cursor: pointer;
}

.btn-link {
  background: transparent;
  color: var(--color-accent);
}

.btn-secondary {
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-primary {
  background: #F59E0B;
  border-color: rgba(245, 158, 11, 0.44);
  color: #1a0f00;
}

@media (max-width: 900px) {
  .consent-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .consent-actions {
    justify-content: flex-start;
  }
}
</style>
