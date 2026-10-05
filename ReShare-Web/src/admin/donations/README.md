# RC1D-67 — Donation Detail demo (US10)

Chỉ dữ liệu donation và quyết định được mock; đăng nhập Firebase, role và phân công kho dùng auth hiện có. Không có API quyết định donation, không ghi Firestore, không gửi thông báo donor và không ghi inventory. Dữ liệu quyết định nằm trong bộ nhớ, mất khi reload trình duyệt. Ảnh là SVG minh họa demo, không phải ảnh donor thật.

## Xem local

Không có tài khoản staff: chạy `npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort` trong `ReShare-Web`, mở `http://127.0.0.1:5174/src/admin/donations/preview.html`. Đây là entry HTML riêng, chỉ hoạt động ở Vite dev trên loopback, không nằm trong build production. Dùng lại `DonationDetail.vue` và `donation.demo.js`; nhân sự `demo-staff-local` và kho `demo-hub` là mock. Preview không import app router/auth/Firebase, không gọi API thật, không thay đổi guard Admin. Reload trình duyệt để reset quyết định mock và chụp lại trạng thái pending.

Đã kiểm tra preview trên Chrome headless qua dev server: render, gallery/phóng to, reject bắt buộc lý do, lưu mock với ghi chú riêng; không có lỗi JavaScript hoặc request Firebase/API bên ngoài local. Build production pass (còn cảnh báo bundle >500 kB).

Từ `ReShare-Web`, chạy `npm.cmd ci` rồi `npm.cmd run dev -- --host 127.0.0.1`. Mở URL Vite in ra (thường `http://127.0.0.1:5173/admin/login`). Đăng nhập tài khoản staff active có phân công kho, chọn **Xem Donation Detail — demo RC1D-67** ở `/admin`.

URL: `/admin/warehouses/<warehouseId>/donations/demo-001`. Warehouse admin phải dùng kho trong `staff_assignments.warehouseIds`; system admin có thể dùng `demo-hub`. Không có bypass auth hoặc tài khoản mock. Mã donation khác trả về không tìm thấy.

## Đối chiếu US10

- Pending có gallery/phóng to ảnh, donor, khai báo, AI prediction mock (nếu có), donor confirmation và lịch sử. Select tình huống demo cho phép xem trạng thái sau duyệt, thiếu dữ liệu, sai kho, lỗi tải/gửi và xung đột.
- Chỉ pending chưa chờ bổ sung mới cho quyết định. Reject và request information bắt buộc nội dung công khai sau trim. Internal note là trường riêng, không dùng thay `statusNote`.
- Request information giữ `status=pending` với `reviewState=needs_information`, khóa quyết định trong demo. Đây là quy ước FE tạm thời vì enum iOS chưa có trạng thái bổ sung; cần nhóm thống nhất state machine và luồng donor gửi bổ sung trước khi tích hợp.
- Mock so version và trạng thái trước khi cập nhật; ghi actor UID, timestamp, previousVersion/version, from/to và action trong lịch sử quyết định. Xung đột khóa form, yêu cầu tải dữ liệu mới, không tự gửi lại. Lỗi mạng giữ nội dung form để thử lại.
- Mỗi sự kiện quyết định lưu snapshot `publicMessage` và `internalNote` riêng. Lịch sử hiển thị lý do từ chối/nội dung bổ sung công khai cho donor và khối **Ghi chú riêng cho staff** tách biệt; không lấy ghi chú riêng làm lý do công khai. Sau thay đổi này, reload trình duyệt để reset các sự kiện mock cũ chưa có snapshot.
- Approve chỉ chuyển sang approved; module không có thao tác inventory.
- Guard route kiểm tra role/kho theo URL; chi tiết và submit kiểm tra hubId của bản ghi theo auth hiện tại. Đây là kiểm soát giao diện, chưa chứng minh backend từ chối sai quyền/kho.

Đã kiểm tra riêng từng luồng trên Chrome sau khi reload reset về pending v1:

- Reject: lý do trống/chỉ khoảng trắng bị chặn; lý do hợp lệ hiển thị trong lịch sử, pending → rejected v2, internal note riêng.
- Approve: lời nhắn công khai có thể để trống; pending → approved v2, audit có actor/thời gian và ghi chú riêng; số lượng khai báo không thay đổi, không gọi API inventory.
- Request information: nội dung trống/chỉ khoảng trắng bị chặn; nội dung hợp lệ hiện trong lịch sử, pending → pending v2 với `needs_information`, form khóa chờ bổ sung, ghi chú riêng.

Cả ba luồng giữ snapshot lịch sử khi nhấn **Tải lại dữ liệu**, không có lỗi JavaScript hoặc request Firebase/API thật. Đây là kiểm tra FE/mock, không xác nhận transaction, phân quyền hoặc tồn kho backend.

## Backend còn cần

API đọc chi tiết và quyết định phải kiểm tra token, staff active, role và hubId từ dữ liệu server; không tin kho, actor hay timestamp do client gửi. API quyết định cần transaction/compare-and-set trên version và current state, idempotency chống gửi lặp, trả 403/404/409 và dữ liệu trạng thái mới. Lưu public reason và internal note riêng với quyền đọc riêng, audit actor/thời gian server, gửi thông báo công khai cho donor. Inventory chỉ thay đổi theo nghiệp vụ tiếp nhận, không theo approve.

AC1/AC4 có thể trình diễn FE bằng mock. AC2/AC3/AC5 cần kiểm thử tích hợp backend (kể cả hai client đồng thời và kiểm tra inventory trước/sau); build/mock không xác nhận được các bảo đảm này. Dữ liệu AI, xác nhận donor, ảnh và lịch sử thật cần nối API. Timestamp demo hiển thị theo múi giờ Việt Nam.
