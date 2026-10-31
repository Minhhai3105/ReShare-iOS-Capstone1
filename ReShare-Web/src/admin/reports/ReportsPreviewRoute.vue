<script setup>
import ReportScreen from '../ReportScreen.vue'
import { createMockReportsRepository } from './reports.repository.js'

const mockRepository = createMockReportsRepository()
</script>

<template>
  <ReportScreen :repository="mockRepository" />
</template>
