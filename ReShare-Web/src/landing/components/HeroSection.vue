<script setup>
import communitySharing from '../assets/community-sharing.jpg'
</script>

<template>
  <section id="home" class="hero-section">
    <div class="landing-container hero-layout">
      <div class="hero-copy">
        <span class="eyebrow"><span class="eyebrow-dot"></span> SẺ CHIA ĐÚNG CÁCH</span>
        <h1>Trao đúng thứ,<br />đến đúng nơi,<br /><span>vào đúng lúc.</span></h1>
        <p class="hero-subtitle">Nền tảng thông minh quản lý quyên góp và hàng hóa</p>
        <p class="hero-description">
          ReShare kết nối người trao tặng với cộng đồng cần hỗ trợ — để mỗi món đồ còn tốt tìm được hành trình ý nghĩa tiếp theo  .
        </p>
        <p class="hero-description">
        Sử dụng ứng dụng AI để phân loại, kiểm kê và điều phối hàng hóa minh bạch, hiệu quả.
        </p>
        <div class="hero-actions">
          <a class="button" href="#preview">
            Khám phá ReShare
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
          </a>
          <a class="button button--outline" href="#how-it-works">Xem cách hoạt động</a>
        </div>
        <div class="hero-promises" aria-label="Giá trị của ReShare">
          <span><i aria-hidden="true">✓</i> Minh bạch</span>
          <span><i aria-hidden="true">✓</i> Đúng nhu cầu</span>
          <span><i aria-hidden="true">✓</i> Giảm lãng phí</span>
        </div>
      </div>

      <div class="hero-visual">
        <div class="hero-art">
          <img :src="communitySharing" alt="Minh họa cộng đồng cùng sẻ chia vật phẩm" />
        </div>
        <div class="float-card float-card--top">
          <span class="float-icon float-icon--mint" aria-hidden="true">✳</span>
          <span><strong>Kết nối mới</strong><small>Mái ấm bình an</small></span>
        </div>
       <div class="float-card float-card--bottom confirmed-card">
  <div class="confirmed-icon" aria-hidden="true">
    ♡
  </div>

  <div class="confirmed-content">
    <strong>ĐÃ XÁC NHẬN</strong>
    <span class="confirmed-number">800 món đồ</span>
    <small>đã tìm thấy nơi cần nhất</small>
  </div>
</div>
      </div>
    </div>
  </section>
</template>
