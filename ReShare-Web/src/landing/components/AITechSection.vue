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
          Khi quyên góp hoặc đăng món lên Kho đồ 0đ, AI trên điện thoại gợi ý một trong ba danh mục từ ảnh.
          Người dùng kiểm tra và có thể chọn lại trước khi gửi.
        </p>
        <ul class="ai-points">
          <li><span>✓</span> Phân loại ảnh thành Sách vở, Quần áo hoặc Gia dụng</li>
          <li><span>✓</span> Gợi ý danh mục khi quyên góp và khi đăng món ở Kho đồ 0đ</li>
          <li><span>✓</span> Người dùng có thể chọn lại danh mục</li>
          <li><span>✓</span> Tên và tình trạng món đồ do người dùng nhập</li>
        </ul>
        <span class="ai-disclaimer">AI chỉ gợi ý; danh mục cuối cùng luôn do người dùng xác nhận.</span>
      </div>
      <div class="ai-visual">
        <div class="ai-photo">
          <img :src="itemCheck" alt="Minh họa quét và kiểm tra vật phẩm bằng ứng dụng ReShare" />
          <span class="photo-label">Minh họa nhận diện vật phẩm</span>
        </div>
        <div class="ai-result">
          <div class="ai-result__heading">
            <span class="ai-sparkle" aria-hidden="true">✳</span>
            <span><strong>Gợi ý từ AI</strong><small>Danh mục để bạn kiểm tra</small></span>
          </div>
          <div class="suggestion-row"><span>Danh mục gợi ý</span><strong>Quần áo</strong></div>
          <div class="suggestion-row"><span>Trạng thái</span><strong class="suggestion-status">Chờ bạn xác nhận</strong></div>
        </div>
      </div>
    </div>
  </section>
</template>
