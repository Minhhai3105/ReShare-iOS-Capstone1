<script setup>
import DistributionForm from './DistributionForm.vue'
import { currentUser, staffAssignment } from '../auth/auth.store'
</script>

<template>
  <DistributionForm :assignment="staffAssignment" :actor="currentUser" />
</template>
