<script setup>
import { ref } from 'vue'

const activeFlow = ref('donate')

const screens = {
  donate: [
    { image: 'campaign', label: 'Chiến dịch quyên góp', caption: 'Xem mục tiêu và tiến độ của chiến dịch' },
    { image: 'camera', label: 'Thêm ảnh món đồ', caption: 'Chụp hoặc chọn ảnh để gửi kèm đơn' },
    { image: 'details', label: 'Thông tin quyên góp', caption: 'Chọn danh mục và điền thông tin món đồ' },
    { image: 'success', label: 'Xác nhận đã gửi', caption: 'Nhận mã đơn để theo dõi quyên góp' },
  ],
  receive: [
    { image: 'catalog', label: 'Kho đồ 0đ', caption: 'Tìm những món đồ đang được trao tặng' },
    { image: 'listing', label: 'Chi tiết món đồ', caption: 'Xem tình trạng và khu vực hẹn nhận' },
  ],
}
</script>

<template>
  <section id="preview" class="section preview-section">
    <div class="landing-container">
      <div class="preview-heading">
        <span class="eyebrow"><span class="eyebrow-dot"></span> KHÁM PHÁ ỨNG DỤNG</span>
        <h2>Tìm hiểu ReShare qua các màn hình chính</h2>
        <p>Khám phá cách gửi một đơn quyên góp hoặc tìm món đồ trong Kho đồ 0đ.</p>
        <p class="preview-disclaimer">
          <span aria-hidden="true">ⓘ</span>
          Ảnh chụp màn hình sử dụng dữ liệu minh họa.
        </p>
        <div class="preview-tabs" role="group" aria-label="Chọn luồng minh họa">
          <button
            class="preview-tab"
            :class="{ 'preview-tab--active': activeFlow === 'donate' }"
            type="button"
            :aria-pressed="activeFlow === 'donate'"
            @click="activeFlow = 'donate'"
          >
            Quyên góp
          </button>
          <button
            class="preview-tab"
            :class="{ 'preview-tab--active': activeFlow === 'receive' }"
            type="button"
            :aria-pressed="activeFlow === 'receive'"
            @click="activeFlow = 'receive'"
          >
            Nhận đồ
          </button>
        </div>
      </div>

      <div class="preview-grid" :class="{ 'preview-grid--receiving': activeFlow === 'receive' }">
        <article v-for="screen in screens[activeFlow]" :key="screen.image" class="preview-item">
          <div class="preview-photo-frame">
            <img
              class="preview-photo"
              :src="`/app-preview/${screen.image}.webp`"
              :alt="`Màn hình ${screen.label} trên ReShare iOS`"
              width="603"
              height="1311"
              loading="lazy"
              decoding="async"
            />
          </div>
          <h3>{{ screen.label }}</h3>
          <p>{{ screen.caption }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview-photo-frame {
  width: 100%;
  max-width: 232px;
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid #d5e4e1;
  border-radius: clamp(20px, 2.5vw, 32px);
  background: #f7faf6;
  box-shadow: 0 15px 23px rgba(36, 73, 61, 0.08);
}

.preview-photo {
  display: block;
  width: 100%;
  height: auto;
}
</style>
