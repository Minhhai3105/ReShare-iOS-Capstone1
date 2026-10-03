<script setup>
import { computed, ref } from 'vue'

const activeFlow = ref('donate')

const donationScreens = [
  { label: 'Khám phá', type: 'explore', caption: 'Trang chủ và các nhu cầu mới' },
  { label: 'Quyên góp', type: 'donate', caption: 'Chụp ảnh và bắt đầu quyên góp' },
  { label: 'Gợi ý danh mục', type: 'category', caption: 'Xem kết quả gợi ý từ AI' },
  { label: 'Xác nhận thông tin', type: 'review', caption: 'Kiểm tra và gửi yêu cầu' },
]

const receivingScreens = [
  { label: 'Khám phá', type: 'explore', caption: 'Trang chủ và các nhu cầu mới' },
  { label: 'Xác nhận thông tin', type: 'review', caption: 'Kiểm tra và gửi yêu cầu' },
]

const screens = computed(() =>
  activeFlow.value === 'donate' ? donationScreens : receivingScreens,
)
</script>

<template>
  <section id="preview" class="section preview-section">
    <div class="landing-container">
      <div class="preview-heading">
        <span class="eyebrow"><span class="eyebrow-dot"></span> KHÁM PHÁ ỨNG DỤNG</span>
        <h2>Tìm hiểu ReShare qua các màn hình chính</h2>
        <p>Bộ mockup này hiển thị các bước cơ bản mà người dùng trải qua khi bắt đầu quyên góp.</p>
        <p class="preview-disclaimer">
          <span aria-hidden="true">ⓘ</span>
          Bộ mockup này chỉ minh họa các màn hình hiện có và không tạo tính năng mới.
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
        <article v-for="screen in screens" :key="`${activeFlow}-${screen.type}`" class="preview-item">
          <div class="phone-frame">
            <div class="phone-screen">
              <div class="screen-statusbar">
                <span>9:41</span>
                <span class="screen-status-icons" aria-hidden="true"><i></i><i></i><i></i></span>
              </div>
              <div class="screen-topbar">
                <span class="screen-leading-icon" :class="{ 'screen-leading-icon--search': screen.type === 'explore' }">
                  <svg v-if="screen.type === 'explore'" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.8" cy="10.8" r="6.3" />
                    <path d="m15.5 15.5 4 4" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m14.5 5-7 7 7 7M8 12h12" />
                  </svg>
                </span>
                <strong>{{ screen.label }}</strong>
                <span class="screen-notification" aria-label="Thông báo">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
                  </svg>
                </span>
              </div>

              <template v-if="screen.type === 'explore'">
                <div class="screen-search">
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4 4" /></svg>
                  </span>
                  <span>Tìm nhu cầu, danh mục<br />hoặc địa điểm</span>
                </div>
                <div class="screen-category-row">
                  <div class="screen-category">
                    <span><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg></span>
                    <b>Quần áo</b>
                  </div>
                  <div class="screen-category">
                    <span><svg viewBox="0 0 24 24"><path d="M4 5.5c3.2-.9 5.9-.3 8 1.5v13c-2.1-1.8-4.8-2.4-8-1.5v-13ZM20 5.5c-3.2-.9-5.9-.3-8 1.5v13c2.1-1.8 4.8-2.4 8-1.5v-13Z" /></svg></span>
                    <b>Sách</b>
                  </div>
                </div>
                <div class="screen-need">
                  <div class="screen-need__heading"><b>Nhu cầu gần bạn</b><span>Xem thêm</span></div>
                  <div class="screen-need__content">
                    <span class="screen-need__icon"><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg></span>
                    <span><b>Thu gom quần áo cũ</b><small>Nhu cầu từ tổ chức tiếp nhận</small></span>
                  </div>
                </div>
                <div class="screen-info">
                  <span>ⓘ</span>
                  <small>Chọn nhu cầu phù hợp để bắt đầu quyên góp</small>
                </div>
              </template>

              <template v-else-if="screen.type === 'donate'">
                <div class="screen-info"><span>ⓘ</span><small>Chụp ảnh món đồ để bắt đầu quyên góp</small></div>
                <div class="screen-camera">
                  <span class="screen-camera__icon"><svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.3-2h5.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="12.5" r="3.5" /></svg></span>
                  <b>Chụp ảnh món đồ</b>
                  <small>Đặt món đồ lên nền sáng và giữ<br />khung hình rõ ràng</small>
                </div>
                <div class="screen-need screen-need--choose">
                  <b>Chọn nhu cầu</b>
                  <div class="screen-category-row">
                    <div class="screen-category"><span>⬡</span><b>Quần áo</b></div>
                    <div class="screen-category"><span>▤</span><b>Sách</b></div>
                  </div>
                </div>
              </template>

              <template v-else-if="screen.type === 'category'">
                <div class="screen-info"><span>ⓘ</span><small>AI gợi ý danh mục phù hợp cho món đồ của bạn</small></div>
                <div class="screen-result">
                  <b>Kết quả gợi ý</b>
                  <div class="screen-category-row">
                    <div class="screen-category screen-category--selected">
                      <span><svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></svg></span>
                      <b>Quần áo</b>
                    </div>
                    <div class="screen-category">
                      <span><svg viewBox="0 0 24 24"><path d="M4 5.5c3.2-.9 5.9-.3 8 1.5v13c-2.1-1.8-4.8-2.4-8-1.5v-13ZM20 5.5c-3.2-.9-5.9-.3-8 1.5v13c2.1-1.8 4.8-2.4 8-1.5v-13Z" /></svg></span>
                      <b>Sách</b>
                    </div>
                  </div>
                  <small>2 gợi ý phù hợp nhất cho hình ảnh vừa chụp</small>
                </div>
                <div class="screen-action-row">
                  <div>
                    <span><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 11.8-2L20 12M4 12l2.7 5a7 7 0 0 0 11.8-2" /></svg></span>
                    <b>Gợi ý lại</b>
                  </div>
                  <div class="screen-action-row__selected">
                    <span><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span>
                    <b>Chọn danh mục</b>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="screen-info"><span>ⓘ</span><small>Kiểm tra thông tin trước khi gửi yêu cầu</small></div>
                <div class="screen-summary">
                  <b>Tóm tắt yêu cầu</b>
                  <div><span>Danh mục</span><strong>Quần áo</strong></div>
                  <div><span>Số lượng</span><strong>Kiểm tra thông tin</strong></div>
                  <div><span>Địa điểm</span><strong>Theo thông tin tiếp nhận</strong></div>
                </div>
                <div class="screen-edit">Sửa thông tin</div>
                <div class="screen-submit">Gửi yêu cầu</div>
              </template>

              <div class="screen-tab">
                <i class="screen-tab__active"></i><i></i><i></i><i></i>
              </div>
            </div>
          </div>
          <h3>{{ screen.label }}</h3>
          <p>{{ screen.caption }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
