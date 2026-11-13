<script setup>
// Điều khoản sử dụng công khai. Mục 5–6 là phần App Store Review Guideline 1.2 yêu cầu với app có
// nội dung do người dùng tạo: không dung thứ nội dung xấu, có báo cáo/chặn và xử lý báo cáo kịp thời.
import LegalPageLayout from './LegalPageLayout.vue'
import { LEGAL_CONTACT_EMAIL, PRIVACY_POLICY_PATH } from './legal.js'
</script>

<template>
  <LegalPageLayout title="Điều khoản sử dụng" effective-date="13/11/2026">
    <p class="legal-note">
      ReShare là sản phẩm đồ án Capstone của nhóm sinh viên C1SE.49, đang trong giai đoạn thử nghiệm.
      Khi tạo tài khoản hoặc sử dụng ReShare, bạn đồng ý với các điều khoản dưới đây và với
      <RouterLink :to="PRIVACY_POLICY_PATH">Chính sách quyền riêng tư</RouterLink>.
    </p>

    <h2>1. Độ tuổi sử dụng</h2>
    <p>Bạn cần đủ 16 tuổi để dùng ReShare. Người dưới 16 tuổi chỉ được dùng khi có sự đồng ý của cha mẹ hoặc người giám hộ.</p>

    <h2>2. Tài khoản</h2>
    <ul>
      <li>Cung cấp thông tin đúng và giữ bí mật mật khẩu. Bạn chịu trách nhiệm cho hoạt động trên tài khoản của mình.</li>
      <li>Không giả danh người khác hoặc tổ chức khác.</li>
      <li>Bạn có thể xoá tài khoản bất cứ lúc nào trong app tại <strong>Tài khoản cá nhân → Xoá tài khoản</strong>.</li>
    </ul>

    <h2>3. Quyên góp qua kho</h2>
    <ul>
      <li>ReShare tiếp nhận ba nhóm đồ: quần áo, sách vở, đồ gia dụng. Đồ cần sạch, an toàn và còn dùng được.</li>
      <li>Kho có quyền từ chối đơn, hoặc ghi nhận số lượng và tình trạng thực tế khác với khai báo. Tiến độ chiến dịch chỉ tính đồ đã được kho nhập.</li>
      <li>Đồ đã nhập kho được phân phối miễn phí cho người thụ hưởng. ReShare không mua bán đồ quyên góp.</li>
      <li>Danh mục do AI gợi ý chỉ để tham khảo. Bạn là người xác nhận danh mục cuối cùng.</li>
    </ul>

    <h2>4. Kho đồ 0đ (trao đồ trực tiếp)</h2>
    <ul>
      <li>Món đồ được cho miễn phí. Không dùng Kho đồ 0đ để mua bán, đổi chác lấy tiền hoặc quảng cáo.</li>
      <li>Người cho chịu trách nhiệm mô tả đúng món đồ. Hai bên tự thoả thuận và nên hẹn gặp ở nơi công cộng.</li>
      <li>ReShare kết nối hai bên nhưng không kiểm định món đồ và không chịu trách nhiệm cho việc bàn giao giữa các bên.</li>
    </ul>

    <h2>5. Nội dung bị cấm — ReShare không dung thứ</h2>
    <p>Bài đăng, ảnh, tin nhắn và hồ sơ <strong>không được</strong> chứa:</p>
    <ul>
      <li>Nội dung khiêu dâm, bạo lực, thù ghét, phân biệt đối xử, quấy rối hoặc đe doạ người khác.</li>
      <li>Lừa đảo, nội dung sai sự thật nhằm trục lợi, spam hoặc quảng cáo.</li>
      <li>Hàng cấm hoặc nguy hiểm: vũ khí, chất cấm, thuốc kê đơn, động vật, thực phẩm hết hạn và các mặt hàng pháp luật cấm trao đổi.</li>
      <li>Thông tin cá nhân của người khác khi chưa được đồng ý.</li>
    </ul>

    <h2>6. Báo cáo, chặn và xử lý vi phạm</h2>
    <ul>
      <li>Bạn có thể <strong>báo cáo</strong> bài đăng, tin nhắn hoặc người dùng vi phạm, và <strong>chặn</strong> người dùng để không nhận tin nhắn hay thấy bài của họ nữa.</li>
      <li>ReShare xem xét báo cáo trong vòng <strong>24 giờ</strong>. Nội dung vi phạm sẽ bị gỡ, và tài khoản vi phạm có thể bị khoá.</li>
      <li>Ứng dụng tự chặn một số từ ngữ thô tục khi đăng bài và gửi tin nhắn. Bộ lọc này không thay thế việc báo cáo.</li>
    </ul>

    <h2>7. Giới hạn của sản phẩm thử nghiệm</h2>
    <ul>
      <li>ReShare là đồ án sinh viên. Dịch vụ có thể gián đoạn, thay đổi hoặc dừng mà không báo trước.</li>
      <li>Các điểm tiếp nhận được ghi “minh hoạ” trong app <strong>chưa</strong> nhận đồ thật. Đừng mang đồ tới các điểm này.</li>
    </ul>

    <h2>8. Chấm dứt</h2>
    <p>Bạn có thể ngừng sử dụng và xoá tài khoản bất cứ lúc nào. ReShare có thể tạm khoá hoặc chấm dứt tài khoản vi phạm các điều khoản này.</p>

    <h2>9. Thay đổi điều khoản</h2>
    <p>Khi điều khoản thay đổi, chúng tôi cập nhật ngày hiệu lực ở đầu trang. Tiếp tục sử dụng sau ngày đó nghĩa là bạn đồng ý với bản mới.</p>

    <h2>10. Liên hệ</h2>
    <p>
      Câu hỏi về điều khoản hoặc báo cáo vi phạm khẩn cấp, vui lòng gửi email tới
      <a :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a>.
    </p>
  </LegalPageLayout>
</template>
