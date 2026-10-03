<script setup>
import LandingHeader from './components/LandingHeader.vue'
import HeroSection from './components/HeroSection.vue'
import ValuesSection from './components/ValuesSection.vue'
import HowItWorksSection from './components/HowItWorksSection.vue'
import AITechSection from './components/AITechSection.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import AppPreviewSection from './components/AppPreviewSection.vue'
import CollectionPointsSection from './components/CollectionPointsSection.vue'
import FAQSection from './components/FAQSection.vue'
import LandingFooter from './components/LandingFooter.vue'
</script>

<template>
  <div class="landing-page">
    <LandingHeader />
    <main>
      <HeroSection />
      <ValuesSection />
      <HowItWorksSection />
      <AITechSection />
      <FeaturesSection />
      <AppPreviewSection />
      <CollectionPointsSection />
      <FAQSection />
    </main>
    <LandingFooter />
  </div>
</template>

<style>
@import './landing.css';
</style>
