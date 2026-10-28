import { createApp } from 'vue'
import ReportScreen from '../ReportScreen.vue'

// Independent development entry only, deliberately not a production build input.
if (import.meta.env.DEV) createApp(ReportScreen, { role: 'system_admin' }).mount('#app')
