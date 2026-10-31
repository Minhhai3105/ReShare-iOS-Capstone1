import { createApp } from 'vue'
import DistributionForm from './DistributionForm.vue'
import { previewActor, previewAssignment } from './distribution.mock.js'

// Vite serves this independent entry in development only; it is not a build input.
if (import.meta.env.DEV) {
  createApp(DistributionForm, { assignment: previewAssignment, actor: previewActor }).mount('#app')
}
