<script setup>
const steps = [
  { number: '01', icon: 'package', title: 'Mở ứng dụng', body: 'Người dùng truy cập ReShare để bắt đầu quy trình quyên góp.' },
  { number: '02', icon: 'camera', title: 'Chụp ảnh', body: 'Người dùng chụp ảnh món đồ để hệ thống bắt đầu nhận diện.' },
  { number: '03', icon: 'scan', title: 'Kiểm tra thông tin', body: 'Người dùng xem lại danh mục, số lượng và tình trạng gợi ý.' },
  { number: '04', icon: 'document', title: 'Gửi yêu cầu', body: 'Yêu cầu được gửi đến tổ chức để xem xét và xác nhận.' },
  { number: '05', icon: 'shield', title: 'Duyệt', body: 'Đội ngũ xác nhận thông tin trước khi chuyển sang bước tiếp theo.' },
  { number: '06', icon: 'truck', title: 'Tiếp nhận tại kho', body: 'Người dùng mang hàng đến điểm tiếp nhận đã được chỉ định.' },
]
</script>

<template>
  <section id="how-it-works" class="section process-section">
    <div class="landing-container">
      <div class="section-heading process-heading">
        <span class="eyebrow"><span class="eyebrow-dot"></span> CÁCH HOẠT ĐỘNG</span>
        <h2>Quy trình đơn giản từ ý định đến bàn<br />giao</h2>
        <p>
          Mỗi bước đều tập trung vào sự minh bạch, dễ theo dõi và không yêu cầu thanh toán hoặc
          đặt lịch vận chuyển.
        </p>
      </div>
      <div class="process-grid">
        <article
          v-for="step in steps"
          :key="step.number"
          class="process-card"
          :class="{ 'process-card--active': step.number === '02' }"
        >
          <div class="process-card__top">
            <span class="process-icon" aria-hidden="true">
              <svg v-if="step.icon === 'package'" viewBox="0 0 24 24">
                <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
                <path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v8.5M9 4.7l8 4.6" />
              </svg>
              <svg v-else-if="step.icon === 'camera'" viewBox="0 0 24 24">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.3-2h5.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9Z" />
                <circle cx="12" cy="12.5" r="3.5" />
              </svg>
              <svg v-else-if="step.icon === 'scan'" viewBox="0 0 24 24">
                <path d="M8 4H6a2 2 0 0 0-2 2v2m12-4h2a2 2 0 0 1 2 2v2M4 16v2a2 2 0 0 0 2 2h2m12-4v2a2 2 0 0 1-2 2h-2M8 12h8" />
              </svg>
              <svg v-else-if="step.icon === 'document'" viewBox="0 0 24 24">
                <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10l-7-7Z" />
                <path d="M13 3v7h7m-11 4h6m-6 4h6" />
              </svg>
              <svg v-else-if="step.icon === 'shield'" viewBox="0 0 24 24">
                <path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <svg v-else-if="step.icon === 'truck'" viewBox="0 0 24 24">
                <path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z" />
                <circle cx="7.5" cy="18" r="2" />
                <circle cx="18" cy="18" r="2" />
              </svg>
            </span>
            <span class="process-number">{{ step.number }}</span>
          </div>
          <span class="process-card__rule" aria-hidden="true"></span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.body }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
