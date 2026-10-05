<script setup>
import { useRoute } from 'vue-router'
import { canAccessWarehouse, currentUser } from '../auth/auth.store'
import DonationDetail from './DonationDetail.vue'

const route = useRoute()
</script>

<template>
  <DonationDetail
    :warehouse-id="route.params.warehouseId"
    :donation-id="route.params.donationId"
    :actor-id="currentUser?.id || ''"
    :authorize-warehouse="canAccessWarehouse"
  />
</template>
