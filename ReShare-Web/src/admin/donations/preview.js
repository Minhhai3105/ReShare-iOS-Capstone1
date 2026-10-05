// Standalone Vite dev entry: do not import main.js, router or auth modules here.
// This entry is not part of the production build and only runs on loopback in DEV.
const localHosts = ['localhost', '127.0.0.1', '[::1]']
if (import.meta.env.DEV && localHosts.includes(window.location.hostname)) {
  const [{ createApp }, { default: DonationDetail }] = await Promise.all([
    import('vue'), import('./DonationDetail.vue'),
  ])
  createApp(DonationDetail, {
    warehouseId: 'demo-hub', donationId: 'demo-001', actorId: 'demo-staff-local',
    authorizeWarehouse: (hubId) => hubId === 'demo-hub', localPreview: true,
  }).mount('#app')
} else {
  document.querySelector('#app').textContent = 'DEMO / MOCK — Preview chỉ chạy với Vite dev trên localhost.'
}
