# RC1D-94 — Màn Q: Báo cáo thống kê có thể đối chiếu

Mở rộng `../ReportScreen.vue` hiện hữu; dùng lại `AdminChrome.vue`, icon, logo và
guard phân quyền. Không tạo Reports page thứ hai. Các props layout mới là tùy chọn,
giữ hành vi mặc định cho E/F. Phần AI RC1D-59 vẫn hiện nếu màn cũ truyền `items`,
được ghi rõ là chỉ số riêng, không trộn vào báo cáo kho hoặc CSV.

## Chạy local

Dùng Node `^20.19.0 || >=22.12.0` theo lockfile. Từ `ReShare-Web`:

```powershell
npm ci
npm run dev
```

- `http://localhost:5173/src/admin/reports/preview.html`: độc lập, không Firebase;
  mặc định System Admin mô phỏng, có thể đổi vai trò demo ở cuối trang.
- `http://localhost:5173/admin/reports-preview`: qua guard và phân công staff
  hiện hữu. Không cho đổi vai trò, không dùng quyền demo nếu mất phân công.
- Hai điểm vào chỉ có trong development, chưa có route vận hành production.
- Demo Q cũ trong `src/admin/index.html?screen=Q` vẫn dùng cùng ReportScreen.

Node portable đã được chuẩn bị trong thư mục tạm của laptop ở phiên làm việc này.
Nếu Node chưa có trong PATH, có thể dùng trước khi chạy npm:

```powershell
$env:PATH = "$env:TEMP\reshare-rc1d82-tools\node-v22.14.0-win-x64;" + $env:PATH
npm.cmd run dev
```

## Dữ liệu, cách đối chiếu và giới hạn

- `reports.mock.js`: dữ liệu AI tạo, giả định, không chứa danh tính thật; mỗi dòng
  là một chứng từ nguồn. Donation, receipt, intake và distribution là các bản ghi
  riêng; chỉ receipt/intake/distribution đã xác nhận mới được tính.
- `reports.repository.js`: adapter đọc mock có delay, abort và kịch bản bình thường,
  rỗng, lỗi. Lọc quyền và chọn cột trước khi trả dữ liệu. Có thể thay qua prop
  `repository` với phương thức `load({ assignment, signal })`; không fallback sang
  mock khi API lỗi. Backend thật phải tự xác thực và lọc quyền phía server.
- `reports.model.js`: cùng một tập bản ghi đã lọc dùng cho cards, biểu đồ theo ngày,
  bảng tổng hợp, bảng nguồn và drill-down. Ngày tính ở `Asia/Ho_Chi_Minh` (UTC+7),
  bao gồm toàn bộ hai ngày biên. Bộ lọc chỉ có hiệu lực khi bấm Áp dụng.
- `reports.csv.js`: tính lại đúng bộ lọc/quyền đã áp dụng; chỉ xuất những bản ghi
  bảng nguồn. UTF-8 BOM, CRLF, escape dấu phẩy/dấu nháy/xuống dòng, chống formula
  injection. Có nhãn “Dữ liệu mẫu — không dùng làm báo cáo chính thức” trên mỗi dòng
  và tên file. Không xuất tên, email, điện thoại, địa chỉ hoặc nhân sự trong nguồn.
- Snapshot mẫu cố định tại 28/10/2026, độc lập khoảng thời gian; vẫn lọc theo kho và
  danh mục. Hiển thị số dòng vật phẩm–kho có tồn dương; không cộng chiếc/kg/bộ thành
  một tổng. Số dư fixture khớp các phiếu nhập/xuất mẫu đã xác nhận, không suy từ donation.
- Drill-down mở bảng nguồn trong dialog tại Q. Không mở hay sửa màn Y; không thay
  đổi màn L hoặc branch/PR #40. Các menu ngoài phạm vi giữ trạng thái demo hiện có.
- Chưa tích hợp API, dữ liệu thật, thời gian thực hoặc pagination cho tập dữ liệu lớn.
  Snapshot không phải số tồn live. Không dùng demo hoặc CSV mẫu làm báo cáo chính thức.
  PDF/Excel chưa triển khai.

## Kiểm thử

```powershell
node --test tests/reports.test.mjs tests/donation.service.test.mjs
npm run build
```

Đối chiếu mặc định tháng 5/2025, System Admin, mọi kho/danh mục:

| Loại | Số bản ghi |
| --- | ---: |
| Donation | 6 |
| Thực nhận | 3 |
| Nhập kho | 4 |
| Phân phối | 3 |

Tổng bảng nguồn và CSV: 16 dòng. Lọc Hải Châu + Quần áo: `2 / 1 / 1 / 1`, 5 dòng.
Warehouse Admin Hải Châu, mọi danh mục: `4 / 2 / 3 / 2`, 11 dòng.
Snapshot mặc định có 4 dòng tồn dương; Hải Châu + Quần áo có 1, không đổi khi
chuyển tháng 5 sang tháng 6.

Kiểm tra UI: áp dụng bộ lọc, mở từng Xem chi tiết, tải CSV đối chiếu mã nguồn,
ngày đảo/ngày trống, vai trò demo Warehouse Admin và Người xem, các kịch bản
rỗng/lỗi/thử lại/loading, dialog bằng Tab/Escape, desktop và mobile.
