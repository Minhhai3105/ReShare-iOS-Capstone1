<script setup>
// Tên 3 Hub đang có trong Firestore (hubs/hub-haichau, hub-lienchieu, hub-nguhanhson). Địa chỉ vẫn là minh hoạ
// nên trang chỉ ghi tên quận, chưa ghi địa chỉ hay giờ tiếp nhận (US23).
const hubs = [
  { code: 'HUB 01', name: 'Hải Châu' },
  { code: 'HUB 02', name: 'Liên Chiểu' },
  { code: 'HUB 03', name: 'Ngũ Hành Sơn' },
]
</script>

<template>
  <section id="collection-points" class="section points-section">
    <div class="landing-container">
      <div class="section-heading section-heading--left">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> HUB TIẾP NHẬN</span>
          <h2>Hub tiếp nhận tại Đà Nẵng</h2>
        </div>
        <p>Địa chỉ và giờ tiếp nhận của từng Hub sẽ được cập nhật khi Hub chính thức hoạt động.</p>
      </div>
      <ul class="points-grid points-grid--names" aria-label="Danh sách Hub tiếp nhận">
        <li v-for="hub in hubs" :key="hub.code" class="point-card point-card--name">
          <span class="point-index">{{ hub.code }}</span>
          <h3>{{ hub.name }}</h3>
          <p class="point-detail">Đà Nẵng</p>
        </li>
      </ul>
    </div>
  </section>
</template>
