<script setup>
import ReportScreen from '../ReportScreen.vue'
import { currentUser, staffAssignment } from '../auth/auth.store'
import { createLiveReportsRepository } from './reports.repository.js'

const liveRepository = createLiveReportsRepository()
</script>
<template>
  <ReportScreen authenticated-context data-mode="live" :assignment="staffAssignment" :actor-name="currentUser?.displayName || currentUser?.email || 'Nhân sự'" :repository="liveRepository" />
</template>
