<script setup>
// Chính sách quyền riêng tư công khai (App Store Review Guideline 5.1.1(i)).
// Danh sách dữ liệu phải khớp với ReShare/ReShare/PrivacyInfo.xcprivacy và với code thật:
// thêm trường dữ liệu mới vào app thì cập nhật cả trang này.
import LegalPageLayout from './LegalPageLayout.vue'
import { LEGAL_CONTACT_EMAIL } from './legal.js'
</script>

<template>
  <LegalPageLayout title="Chính sách quyền riêng tư" effective-date="13/11/2026">
    <p class="legal-note">
      ReShare là sản phẩm đồ án Capstone của nhóm sinh viên C1SE.49, đang trong giai đoạn thử nghiệm.
      Trang này giải thích ReShare thu thập dữ liệu gì, dùng để làm gì, ai được xem và bạn có quyền gì với dữ liệu của mình.
    </p>

    <h2>1. Dữ liệu chúng tôi thu thập</h2>
    <ul>
      <li><strong>Tài khoản:</strong> họ tên hiển thị, email, số điện thoại và mã người dùng do Firebase cấp.</li>
      <li><strong>Đơn quyên góp:</strong> tên và mô tả món đồ, danh mục, tình trạng, số lượng và đơn vị, điểm tiếp nhận, hình thức gửi,
        3–6 ảnh món đồ, danh mục do AI gợi ý kèm độ tin cậy và phiên bản model, danh mục bạn xác nhận.</li>
      <li><strong>Kho đồ 0đ (trao đồ trực tiếp):</strong> tiêu đề, mô tả, ảnh, tình trạng món đồ và địa chỉ nhận đồ bạn nhập.</li>
      <li><strong>Tin nhắn:</strong> nội dung chat, lịch hẹn nhận đồ và xác nhận bàn giao giữa người cho và người nhận.</li>
      <li><strong>Form liên hệ trên website:</strong> họ tên, email và nội dung bạn gửi.</li>
      <li><strong>Nhân sự vận hành:</strong> email, vai trò, kho được giao và nhật ký thao tác (ai làm gì, lúc nào) để truy vết chứng từ kho.</li>
    </ul>
    <p>
      Chúng tôi <strong>không</strong> thu thập vị trí GPS, danh bạ, mã quảng cáo của thiết bị, và không dùng công cụ phân tích hay quảng cáo.
      ReShare không theo dõi bạn trên ứng dụng hoặc website khác, và không bán dữ liệu.
    </p>

    <h2>2. AI gợi ý danh mục chạy ngay trên điện thoại</h2>
    <p>
      Việc gợi ý danh mục (quần áo, sách vở, gia dụng) chạy bằng model trên chính iPhone của bạn. Ảnh không được gửi lên máy chủ để phân loại.
      Ảnh chỉ được tải lên khi bạn bấm gửi đơn quyên góp hoặc đăng món đồ.
    </p>

    <h2>3. Chúng tôi dùng dữ liệu để làm gì</h2>
    <ul>
      <li>Tạo và quản lý tài khoản, cho bạn đăng nhập.</li>
      <li>Tiếp nhận, thẩm định, nhập kho và phân phối đồ quyên góp, và cho bạn xem trạng thái đơn của mình.</li>
      <li>Kết nối người cho và người nhận trong Kho đồ 0đ.</li>
      <li>Trả lời liên hệ, xử lý báo cáo vi phạm và giữ an toàn cho cộng đồng.</li>
    </ul>

    <h2>4. Ai được xem dữ liệu của bạn</h2>
    <ul>
      <li>Bạn xem được đơn quyên góp và hồ sơ của chính mình. Người dùng khác không xem được đơn của bạn.</li>
      <li>Nhân sự kho chỉ xem đơn thuộc kho được giao; quản trị hệ thống xem được toàn hệ thống. Ghi chú nội bộ của nhân sự không hiển thị cho người khác ngoài nhân sự.</li>
      <li>Bài đăng trong Kho đồ 0đ hiển thị cho người dùng đã đăng nhập. <strong>Địa chỉ nhận đồ</strong> chỉ người đăng và người đang được giữ đồ xem được.</li>
      <li>Tin nhắn chỉ hai người trong cuộc trò chuyện đọc được.</li>
      <li>Thông tin người thụ hưởng chỉ nhân sự được phân quyền xem. Người quyên góp chỉ thấy trạng thái công khai của đơn.</li>
    </ul>

    <h2>5. Bên thứ ba xử lý dữ liệu</h2>
    <p>ReShare dùng các dịch vụ sau để lưu trữ và vận hành. Máy chủ của các dịch vụ này có thể đặt ngoài Việt Nam.</p>
    <ul>
      <li><strong>Google Firebase</strong> (Authentication, Cloud Firestore): tài khoản và dữ liệu của ứng dụng.</li>
      <li><strong>Cloudinary</strong>: lưu ảnh món đồ. Chỉ người có quyền mới nhận được đường dẫn xem ảnh.</li>
      <li><strong>Render</strong>: máy chủ API kiểm tra quyền trước mọi thao tác ghi quan trọng.</li>
      <li><strong>Cloudflare Pages</strong>: lưu trữ website này và trang quản trị.</li>
    </ul>

    <h2>6. Lưu trữ và xoá dữ liệu</h2>
    <ul>
      <li>Dữ liệu tài khoản được giữ cho tới khi bạn xoá tài khoản.</li>
      <li>Bạn có thể xoá tài khoản ngay trong app tại <strong>Tài khoản cá nhân → Xoá tài khoản</strong>, hoặc gửi yêu cầu qua email bên dưới.</li>
      <li>Khi xoá tài khoản, chúng tôi xoá tài khoản đăng nhập và hồ sơ (họ tên, email, số điện thoại), gỡ các bài đăng đang mở
        và đổi tên hiển thị trong tin nhắn thành “Người dùng đã xoá”.</li>
      <li>Đơn quyên góp đã gửi được giữ lại ở dạng <strong>ẩn danh</strong> vì phiếu thực nhận, tồn kho và phiếu phân phối tham chiếu tới chúng.
        Các đơn này không còn gắn với thông tin cá nhân của bạn.</li>
    </ul>

    <h2>7. Quyền của bạn</h2>
    <ul>
      <li>Xem và sửa họ tên, số điện thoại trong app.</li>
      <li>Yêu cầu một bản sao dữ liệu hoặc yêu cầu xoá dữ liệu qua email.</li>
      <li>Rút lại sự đồng ý bằng cách xoá tài khoản.</li>
    </ul>
    <p>Chúng tôi tham chiếu các nguyên tắc của Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân khi xây dựng chính sách này.</p>

    <h2>8. Người dùng dưới 16 tuổi</h2>
    <p>Người dưới 16 tuổi chỉ được dùng ReShare khi có sự đồng ý của cha mẹ hoặc người giám hộ.</p>

    <h2>9. Bảo mật</h2>
    <p>
      Dữ liệu được truyền qua HTTPS. Quyền đọc và ghi trên cơ sở dữ liệu được giới hạn bằng Firestore Security Rules.
      Các quyết định nghiệp vụ như duyệt đơn, nhập kho hay phân phối chỉ đi qua máy chủ API sau khi kiểm tra vai trò và kho được giao.
    </p>

    <h2>10. Thay đổi chính sách</h2>
    <p>Khi chính sách thay đổi, chúng tôi cập nhật ngày hiệu lực ở đầu trang. Nếu thay đổi quan trọng, chúng tôi sẽ thông báo trong app.</p>

    <h2>11. Liên hệ</h2>
    <p>
      Mọi câu hỏi hoặc yêu cầu về dữ liệu cá nhân, vui lòng gửi email tới
      <a :href="`mailto:${LEGAL_CONTACT_EMAIL}`">{{ LEGAL_CONTACT_EMAIL }}</a>
      hoặc dùng <a href="/#contact">form liên hệ</a> trên trang chủ.
    </p>
  </LegalPageLayout>
</template>
