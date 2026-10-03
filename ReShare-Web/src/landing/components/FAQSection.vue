<script setup>
import { ref } from 'vue'

const activeQuestion = ref(0)
const questions = [
  {
    question: 'ReShare là gì?',
    answer: 'ReShare là nền tảng hỗ trợ quản lý quyên góp vật phẩm và kết nối quá trình trao tặng với các điểm tiếp nhận.',
  },
  {
    question: 'Tôi có thể quyên góp những gì?',
    answer: 'Hãy chọn những vật phẩm còn sử dụng tốt, sạch và an toàn. Danh mục phù hợp sẽ được hướng dẫn trong ứng dụng khi gửi yêu cầu.',
  },
  {
    question: 'Tôi gửi yêu cầu quyên góp như thế nào?',
    answer: 'Mở ứng dụng, chụp ảnh vật phẩm, kiểm tra thông tin gợi ý, chỉnh sửa nếu cần rồi gửi yêu cầu để tổ chức xem xét.',
  },
  {
    question: 'AI hoạt động như thế nào?',
    answer: 'AI có thể phân tích ảnh để gợi ý danh mục vật phẩm. Đây chỉ là gợi ý; người dùng luôn cần kiểm tra và xác nhận thông tin.',
  },
  {
    question: 'Tôi có thể chỉnh sửa thông tin do AI gợi ý không?',
    answer: 'Có. Bạn có thể xem lại và chỉnh sửa thông tin trước khi gửi yêu cầu.',
  },
  {
    question: 'Được duyệt có nghĩa là vật phẩm đã vào kho chưa?',
    answer: 'Chưa. Sau khi yêu cầu được duyệt, bạn cần mang hoặc gửi vật phẩm đến điểm tiếp nhận. Kho ghi nhận đồ sau khi tiếp nhận thực tế.',
  },
  {
    question: 'Làm thế nào để nhận đồ?',
    answer: 'Vật phẩm sau khi được tiếp nhận sẽ được tổ chức quản lý và phân phối phù hợp. Cách thức nhận cụ thể sẽ theo thông tin chính thức của chương trình.',
  },
  {
    question: 'Các điểm tiếp nhận ở đâu?',
    answer: 'ReShare dự kiến có ba điểm tiếp nhận tại Đà Nẵng. Địa chỉ và thời gian hoạt động sẽ được cập nhật khi có thông tin chính thức.',
  },
  {
    question: 'Khi nào có kênh liên hệ với ReShare?',
    answer: 'Kênh liên hệ chính thức sẽ được công bố trên trang này khi dự án sẵn sàng vận hành.',
  },
]

function toggleQuestion(index) {
  activeQuestion.value = activeQuestion.value === index ? -1 : index
}

</script>

<template>
  <section id="faq" class="section faq-section">
    <div class="landing-container faq-layout">
      <div class="faq-intro">
        <span class="eyebrow"><span class="eyebrow-dot"></span> CÂU HỎI THƯỜNG GẶP</span>
        <h2>Có điều gì bạn <span>muốn biết?</span></h2>
        <p>Một vài thông tin để bạn bắt đầu hành trình sẻ chia cùng ReShare.</p>
        <span class="faq-deco" aria-hidden="true">?</span>
      </div>
      <div class="faq-list">
        <article v-for="(item, index) in questions" :key="item.question" class="faq-item">
          <h3>
            <button
              class="faq-question"
              type="button"
              :aria-expanded="activeQuestion === index"
              :aria-controls="`faq-answer-${index}`"
              @click="toggleQuestion(index)"
            >
              <span>{{ item.question }}</span>
              <span class="faq-plus" aria-hidden="true">{{ activeQuestion === index ? '−' : '+' }}</span>
            </button>
          </h3>
          <div v-show="activeQuestion === index" :id="`faq-answer-${index}`" class="faq-answer">
            <p>{{ item.answer }}</p>
          </div>
        </article>
      </div>
    </div>

  </section>
</template>
