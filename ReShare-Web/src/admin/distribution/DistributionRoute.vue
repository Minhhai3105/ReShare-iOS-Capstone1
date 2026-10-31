<script setup>
import DistributionForm from './DistributionForm.vue'
import { currentUser, staffAssignment } from '../auth/auth.store'
import { createLiveDistributionRepository } from './distribution.repository.js'

const liveRepository = createLiveDistributionRepository()
</script>

<template>
  <DistributionForm :assignment="staffAssignment" :actor="currentUser" :repository="liveRepository" :preview="false" />
</template>
