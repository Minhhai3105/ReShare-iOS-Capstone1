<script setup>
const points = [
  { number: '01', name: 'Trung tâm tiếp nhận cộng đồng' },
  { number: '02', name: 'Nhà kho hỗ trợ cộng đồng' },
  { number: '03', name: 'Điểm tiếp nhận khu vực' },
]
</script>

<template>
  <section id="collection-points" class="section points-section">
    <div class="landing-container">
      <div class="section-heading section-heading--left">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> ĐIỂM TIẾP NHẬN</span>
          <h2>Ba điểm tiếp nhận tại Đà Nẵng</h2>
        </div>
        <p>Mỗi thẻ hiển thị địa chỉ, giờ tiếp nhận và nút chỉ đường. Dữ liệu dưới đây chỉ mang tính minh họa.</p>
      </div>
      <div class="points-grid">
        <article v-for="point in points" :key="point.number" class="point-card">
          <div class="point-card__top">
            <span class="point-sample-label">DỮ LIỆU MẪU</span>
            <span class="point-index">KHO {{ point.number }}</span>
          </div>
          <h3>{{ point.name }}</h3>
          <p class="point-detail">[Địa chỉ sẽ cập nhật]</p>
          <p class="point-detail">[Giờ tiếp nhận sẽ cập nhật]</p>
          <button
            class="button point-directions"
            type="button"
            disabled
            title="Liên kết chỉ đường sẽ được bổ sung khi địa chỉ chính thức được xác nhận"
          >
            Chỉ đường
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M6 14 14 6M7 6h7v7" />
            </svg>
          </button>
        </article>
      </div>
    </div>
  </section>
</template>
