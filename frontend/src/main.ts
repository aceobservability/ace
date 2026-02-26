import { createApp } from 'vue'
import './composables/useTheme'  // initialize theme before render
import './style.css'
import App from './App.vue'
import { createPostHogPlugin } from './plugins/posthog'
import router from './router'

createApp(App).use(router).use(createPostHogPlugin(router)).mount('#app')
