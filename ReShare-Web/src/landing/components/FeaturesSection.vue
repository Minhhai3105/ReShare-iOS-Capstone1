<script setup>
const features = [
  { icon: '♡', title: 'Quyên góp vật phẩm', body: 'Tạo yêu cầu trao tặng những món đồ còn sử dụng tốt.' },
  { icon: '✳', title: 'Gợi ý danh mục bằng AI', body: 'Nhận gợi ý danh mục từ ảnh để việc khai báo thuận tiện hơn.' },
  { icon: '⌕', title: 'Kiểm tra và chỉnh sửa', body: 'Xem lại thông tin, xác nhận hoặc chỉnh sửa trước khi gửi.' },
  { icon: '⌂', title: 'Tiếp nhận tại kho', body: 'Kho ghi nhận và quản lý vật phẩm sau khi được bàn giao.' },
]
</script>

<template>
  <section id="features" class="section features-section">
    <div class="landing-container">
      <div class="section-heading section-heading--left">
        <div>
          <span class="eyebrow"><span class="eyebrow-dot"></span> TÍNH NĂNG</span>
          <h2>Những tính năng chính của ReShare</h2>
        </div>
        <p>Công cụ hỗ trợ quy trình quyên góp từ lúc khai báo đến khi vật phẩm được tiếp nhận.</p>
      </div>
      <div class="feature-grid">
        <article v-for="(feature, index) in features" :key="feature.title" class="feature-card">
          <span class="feature-card__number">0{{ index + 1 }}</span>
          <span class="feature-icon" aria-hidden="true">{{ feature.icon }}</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.body }}</p>
          <span class="feature-arrow" aria-hidden="true">↗</span>
        </article>
      </div>
    </div>
  </section>
</template>
