<script setup>
const values = [
  {
    number: '01',
    icon: 'box',
    title: 'Chia sẻ đồ còn sử dụng tốt',
    body: 'Món đồ còn giá trị được ghi nhận rõ ràng, giúp giảm lãng phí và tăng cơ hội được tiếp tục sử dụng.',
    tone: 'mint',
  },
  {
    number: '02',
    icon: 'users',
    title: 'Kết nối người cần',
    body: 'Nhu cầu thực tế của tổ chức tiếp nhận được công bố minh bạch để nguồn lực đến đúng nơi cần nhất.',
    tone: 'cream',
  },
  {
    number: '03',
    icon: 'leaf',
    title: 'Giảm lãng phí',
    body: 'Dữ liệu và quy trình minh bạch giúp giảm tình trạng hàng hóa không đúng nhu cầu hoặc bị tồn kho lâu.',
    tone: 'mint',
  },
]
</script>

<template>
  <section id="values" class="section values-section">
    <div class="landing-container">
      <div id="about" class="section-heading">
        <span class="eyebrow"><span class="eyebrow-dot"></span> GIÁ TRỊ RESHARE</span>
        <h2>Ba giá trị cốt lõi giúp hành trình sẻ chia bền vững hơn</h2>
        <p>Reshare tập trung vào việc giữ cho món đồ có ích, kết nối đúng nhu cầu và giảm lãng phí trong toàn bộ vòng đời quyên góp</p>
      </div>
      <div class="value-grid">
        <article v-for="value in values" :key="value.number" class="value-card">
          <div class="value-card__top">
            <span class="value-icon" :class="`value-icon--${value.tone}`" style="background-color: #fff" aria-hidden="true">
              <svg
                v-if="value.icon === 'box'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" />
                <path d="m4 7 8 4 8-4M12 11v10M8 5l8 4" />
              </svg>
              <svg
                v-else-if="value.icon === 'users'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="10" cy="7" r="4" />
                <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <svg
                v-else-if="value.icon === 'leaf'"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 4c-8 0-14 3.4-14 10a6 6 0 0 0 6 6c6.6 0 8-8 8-16Z" />
                <path d="M4 21c2.5-5.5 6-8.5 11-11" />
              </svg>
            </span>
            <span class="value-number">{{ value.number }}</span>
          </div>
          <h3>{{ value.title }}</h3>
          <p>{{ value.body }}</p>
          <span class="card-rule"></span>
        </article>
      </div>
    </div>
  </section>
</template>
