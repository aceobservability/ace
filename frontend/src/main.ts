import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { createPostHogPlugin } from './plugins/posthog'

createApp(App).use(router).use(createPostHogPlugin(router)).mount('#app')
