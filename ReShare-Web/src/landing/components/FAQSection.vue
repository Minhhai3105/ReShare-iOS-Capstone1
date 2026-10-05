<script setup>
import { ref } from 'vue'

const activeQuestion = ref(0)
const questions = [
  {
    question: 'ReShare là gì?',
    answer: 'ReShare hỗ trợ hai luồng trao tặng: Quyên góp tập trung về Trạm và Kho đồ 0đ Cộng đồng.',
  },
  {
    question: 'Tôi có thể quyên góp những gì?',
    answer: 'Danh mục quyên góp hiện có trong ứng dụng là Quần áo, Sách vở và Gia dụng. Hãy tham khảo hướng dẫn tiếp nhận áp dụng cho yêu cầu của bạn.',
  },
  {
    question: 'Tôi gửi quyên góp như thế nào?',
    answer: 'Trong ứng dụng, chụp ảnh vật phẩm, kiểm tra và xác nhận thông tin cùng danh mục gợi ý rồi gửi yêu cầu. Sau khi được duyệt, hãy làm theo thông tin tiếp nhận trong ứng dụng; việc duyệt chưa có nghĩa vật phẩm đã được tiếp nhận vào kho.',
  },
  {
    question: 'Sau khi gửi thì bao lâu có phản hồi?',
    answer: 'Thời gian phản hồi phụ thuộc vào quá trình tiếp nhận và xử lý của ReShare.',
  },
  {
    question: 'Quyên góp tập trung về Trạm khác Kho đồ 0đ Cộng đồng như thế nào?',
    answer: 'Quyên góp tập trung về Trạm là gửi yêu cầu để tổ chức xem xét và tiếp nhận vật phẩm tại Trạm. Kho đồ 0đ Cộng đồng là luồng P2P trao tặng trực tiếp giữa người dân: người nhận liên hệ người cho để thống nhất thời gian nhận.',
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
    answer: 'Thông tin Hub đã được xác minh sẽ được cập nhật tại khu vực Hub trên trang này. Hiện thông tin đang sắp cập nhật.',
  },
  {
    question: 'Khi nào có kênh liên hệ với ReShare?',
    answer: 'Biểu mẫu liên hệ nằm ở cuối trang và sẽ mở khi kênh tiếp nhận được kết nối. Trang sẽ báo rõ nếu kênh này chưa sẵn sàng.',
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
