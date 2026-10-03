<script setup>
import itemCheck from '../assets/ai-item-check.png'
</script>

<template>
  <section id="ai-tech" class="ai-section">
    <div class="landing-container ai-layout">
      <div class="ai-copy">
        <span class="eyebrow eyebrow--light"><span class="eyebrow-dot"></span> CÔNG NGHỆ AI</span>
        <h2>Ảnh vật phẩm → AI phân tích →<br /><span>Gợi ý danh mục → Người dùng xác nhận hoặc chỉnh sửa</span></h2>
        <p>
          AI hỗ trợ gợi ý thông tin từ ảnh để người dùng khai báo thuận tiện hơn. Mọi kết quả đều
          cần được kiểm tra và xác nhận trước khi gửi.
        </p>
        <ul class="ai-points">
          <li><span>✓</span> Nhận diện và phân loại vật phẩm từ ảnh</li>
          <li><span>✓</span> Gợi ý thông tin để khai báo thuận tiện hơn</li>
          <li><span>✓</span> Người dùng có thể kiểm tra, chỉnh sửa</li>
          <li><span>✓</span> Xác nhận trước khi gửi yêu cầu</li>
        </ul>
        <span class="ai-disclaimer">AI là công cụ hỗ trợ và đang được phát triển theo phạm vi dự án.</span>
      </div>
      <div class="ai-visual">
        <div class="ai-photo">
          <img :src="itemCheck" alt="Minh họa quét và kiểm tra vật phẩm bằng ứng dụng ReShare" />
          <span class="photo-label">Minh họa nhận diện vật phẩm</span>
        </div>
        <div class="ai-result">
          <div class="ai-result__heading">
            <span class="ai-sparkle" aria-hidden="true">✳</span>
            <span><strong>Gợi ý từ AI</strong><small>Thông tin để bạn kiểm tra</small></span>
          </div>
          <div class="suggestion-row"><span>Danh mục gợi ý</span><strong>Quần áo</strong></div>
          <div class="suggestion-row"><span>Trạng thái</span><strong class="suggestion-status">Chờ bạn xác nhận</strong></div>
        </div>
      </div>
    </div>
  </section>
</template>
