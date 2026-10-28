<script setup>
import ReportScreen from '../ReportScreen.vue'
import { currentUser, staffAssignment } from '../auth/auth.store'
</script>
<template>
  <ReportScreen authenticated-context :assignment="staffAssignment" :actor-name="currentUser?.displayName || currentUser?.email || 'Nhân sự'" />
</template>
