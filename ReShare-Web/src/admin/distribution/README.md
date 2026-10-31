# RC1D-82 — Màn L: Phân phối hàng

Phạm vi: form, validation, xác nhận và kết quả tạo phiếu xuất mẫu. Không triển khai
màn Y (RC1D-85), màn Q, API hoặc transaction Backend.

## Chạy local

Từ `ReShare-Web`, dùng Node phù hợp với lockfile (`^20.19.0 || >=22.12.0`):

```powershell
npm ci
npm run dev
```

- Preview độc lập: `http://localhost:5173/src/admin/distribution/preview.html`.
  Dùng nhân sự và phân công kho Hải Châu giả lập, không cần đăng nhập Firebase.
- Preview trong router: `http://localhost:5173/admin/distribution-preview`.
  Dùng guard, tài khoản và phân công staff hiện hữu. Chỉ hiển thị dữ liệu mẫu
  trùng kho được phân công; không có kho phù hợp thì khóa form.
- Cả hai entry chỉ phục vụ development. Production build không đăng ký route
  hoặc đóng gói entry preview. Không tự chuyển sang mock khi một API thật lỗi.

## Dữ liệu và giới hạn

`distribution.mock.js` chứa dữ liệu AI tạo: inventory, kho và người thụ hưởng
giả định. Không có thông tin cá nhân thật. Số tồn khởi tạo của áo khoác là 3 chiếc.
Mỗi instance repository giữ sổ kho riêng trong bộ nhớ; tải lại trang đặt lại dữ liệu.
Không ghi Firebase, API, localStorage hoặc báo cáo vận hành thật.

Repository kiểm tra lại quyền, tồn và phiên bản tại bước commit mẫu, trả về
phiếu, movement tham chiếu, actor và timestamp. Mô phỏng đồng thời chỉ có giá trị
trong cùng instance; không đồng bộ tab, trình duyệt hoặc nhân sự thật. Backend
phải thực hiện transaction, phân quyền và ghi movement/chứng từ nguyên tử khi
tích hợp sau này. Một lần xuất một phần không đổi trạng thái toàn bộ donation.

## Kiểm thử

```powershell
node --test tests/distribution.test.mjs
npm run build
```

Các bước kiểm tra giao diện:

1. Chọn áo khoác (3 chiếc), nhập 2, chọn người nhận, xác nhận bàn giao.
2. Bấm “Xác nhận phân phối”, đối chiếu `3 − 2 = 1` trong dialog, rồi tạo phiếu.
   Kết quả có `DEMO-PX-0001` và `DEMO-MOV-0001`, tồn còn 1.
3. Tạo lượt tiếp theo, nhập 2: form bị khóa, báo chỉ còn 1; tồn không đổi.
   Nhập 1 hợp lệ thì có thể xuất hết phần còn lại.
4. Tải lại trang, điền hợp lệ với số lượng 2; ở kịch bản kiểm thử chọn “Thiếu tồn”.
   Xác nhận: báo tồn mới 1, không tạo phiếu; phải sửa số lượng và xác nhận bàn giao lại.
5. Tải lại trang, chọn “Xung đột”: khi gửi báo phiên bản thay đổi, tồn vẫn 3.
   Đối chiếu và xác nhận bàn giao lại trước khi thử tiếp.
6. Thử số âm, 0, số thập phân, vượt tồn, bỏ người nhận, bỏ xác nhận bàn giao,
   vật phẩm hết tồn. Không thể tạo phiếu với dữ liệu này.
7. Kiểm tra dialog bằng bàn phím (Tab/Escape), desktop và mobile.

Không mở màn Y từ kết quả; chưa chốt hợp đồng route với người phụ trách RC1D-85.
