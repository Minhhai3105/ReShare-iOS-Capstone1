<script setup>
import DistributionForm from './DistributionForm.vue'
import { previewActor, previewAssignment } from './distribution.mock.js'
import { createDemoDistributionRepository } from './distribution.repository.js'

const demoRepository = createDemoDistributionRepository({
  getAssignment: () => previewAssignment,
  getActor: () => previewActor,
})
</script>

<template>
  <DistributionForm
    :assignment="previewAssignment"
    :actor="previewActor"
    :repository="demoRepository"
    preview
  />
</template>
