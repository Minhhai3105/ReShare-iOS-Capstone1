# 📋 Quy Tắc Gắn Nhãn Dữ Liệu (Dataset Labeling Guidelines)
**Dự án:** ReShare — Smart Donation & Inventory Management System  
**Story:** US04 — Chuẩn bị dataset có thể tái lập  
**Mã tài liệu:** `AI-DOC-US04-T01`  
**Phiên bản:** 1.0  
**Ngày ban hành:** 02/10/2026  

---

## 1. Mục Tiêu & Phạm Vi
Tài liệu này quy định tiêu chuẩn phân loại, định danh, gắn nhãn, kiểm tra chất lượng và xử lý các trường hợp ngoại lệ cho tập dữ liệu hình ảnh dùng để huấn luyện mô hình phân loại vật phẩm quyên góp trên thiết bị (On-Device CoreML Model) của ReShare.

Tất cả thành viên tham gia thu thập và kiểm tra chéo (Task `EP02-US04-T02 [ALL]`) bắt buộc phải tuân thủ hướng dẫn này.

---

## 2. Danh Mục Nhãn Ban Đầu (Target Classes)
Theo phê duyệt từ Proposal (Phiên bản 1.1, Mục 6 & Section 8), mô hình giai đoạn MVP / Sprint 1–2 tập trung vào **3 nhóm vật phẩm cơ bản**:

| Mã nhãn (`label`) | Tên tiếng Việt | Danh mục vật phẩm bao gồm | Danh mục KHÔNG bao gồm (Ngoại lệ) |
| :--- | :--- | :--- | :--- |
| **`clothing`** | Quần áo & Thời trang | Áo thun, sơ mi, áo khoác, quần jeans, quần tây, váy, đầm, áo len, khăn choàng, mũ nón vải. | Giày dép da hỏng, đồ lót đã qua sử dụng, giẻ lau, vải vụn. |
| **`books`** | Sách & Ấn phẩm | Sách giáo khoa, giáo trình đại học, truyện tranh, tiểu thuyết, từ điển, tập vở trắng, sách thiếu nhi. | Báo cũ mục nát, tài liệu mật, bìa carton rỗng, catalogue quảng cáo hết hạn. |
| **`household_items`** | Đồ gia dụng | Ấm đun nước siêu tốc, quạt bàn/quạt mini, nồi cơm điện nhỏ, đèn bàn học, bàn ủi, dụng cụ nhà bếp (nồi, chảo, bát đĩa lành lặn). | Đồ điện tử cồng kềnh (tủ lạnh, máy giặt), bình gas, hóa chất tẩy rửa độc hại, đồ vỡ nứt nguy hiểm. |

> **Lưu ý:** Bất kỳ sự thay đổi hoặc bổ sung nhãn nào (ví dụ: mở rộng sang `electronics` hoặc `toys`) đều phải được Mentor duyệt thông qua Change Request trước khi áp dụng vào dataset chính thức.

---

## 3. Quy Tắc Xử Lý Các Trường Hợp Ngoại Lệ (Edge Cases)

### 3.1. Ảnh chứa nhiều vật phẩm (Multi-Item Images)
* **Quy tắc 60% diện tích (Dominant Object Rule):** 
  - Nếu trong ảnh có nhiều vật phẩm nhưng có **1 vật phẩm mục tiêu chiếm từ 60% diện tích khung hình trở lên** và nằm ở vị trí trung tâm rõ ràng -> Gắn nhãn theo vật phẩm chủ đạo đó.
* **Quy tắc phân tán / Không rõ đối tượng chính:**
  - Nếu ảnh chụp một đống đồ hỗn tạp gồm cả quần áo, sách và đồ gia dụng nằm xen kẽ nhau mà không thể xác định được đối tượng quyên góp chính:
    - ❌ **Hành động:** Đánh dấu trạng thái `status = rejected`, ghi chú `rejected_multi_item_cluttered`.
    - **Khuyến nghị cho Mobile:** Người dùng trên app iOS phải được nhắc nhở chụp từng món đơn lẻ (Single-item intake flow).

### 3.2. Ảnh mờ, rung lắc, thiếu sáng hoặc biến dạng (Blur / Low Quality)
* **Tiêu chuẩn độ rõ nét:** Mắt người có thể nhận diện được hình dáng, chất liệu và ranh giới của vật phẩm trong vòng 1 giây ở độ phân giải hiển thị thông thường.
* **Tiêu chí loại bỏ:**
  - Ảnh bị nhòe chuyển động (motion blur) nặng hoặc out-focus hoàn toàn.
  - Ảnh quá tối (underexposed) không phân biệt được vật phẩm với nền, hoặc bị lóa sáng (overexposed / flash glare) làm mất chi tiết vật phẩm.
  - Ảnh bị che khuất quá 50% bởi ngón tay, bàn tay hoặc chướng ngại vật phía trước.
  - ❌ **Hành động:** Đánh dấu `status = rejected`, ghi chú `rejected_poor_quality`.

### 3.3. Ảnh ngoài ba nhóm mục tiêu (Out-of-Scope / Non-Target Items)
* Các vật phẩm không thuộc `clothing`, `books`, `household_items` (như thức ăn tươi sống, thuốc men men y tế, rác phế liệu, động vật nuôi, linh kiện máy móc hạng nặng):
  - ❌ **Hành động:** Không gán nhãn vào 3 class chính.
  - Gắn nhãn tạm thời: `label = out_of_scope`.
  - Phân loại trạng thái: Đưa vào tập kiểm thử biên (Negative Test Set) để kiểm tra khả năng phát hiện vật phẩm không hỗ trợ của app, không đưa vào tập Train.

---

## 4. Cấu Trúc Định Danh & Thuộc Tính Metadata

Mỗi hình ảnh trong dataset phải tương ứng với đúng **1 dòng trong file manifest (`manifest.csv`)** với đầy đủ các trường sau:

| Tên trường | Kiểu dữ liệu | Bắt buộc | Mô tả & Quy chuẩn định dạng |
| :--- | :--- | :---: | :--- |
| `image_id` | String | Có | Mã định danh duy nhất. Quy ước: `{LABEL_PREFIX}_{SOURCE_CODE}_{INDEX:05d}`<br>Ví dụ: `CLOTH_CAM_00001`, `BOOK_KAG_00042`, `HOU_DON_00105`. |
| `file_path` | String | Có | Đường dẫn tương đối từ thư mục gốc `dataset/` (VD: `processed/clothing/CLOTH_CAM_00001.jpg`). |
| `label` | String | Có | Một trong 3 giá trị: `clothing`, `books`, `household_items` (hoặc `out_of_scope` nếu là ảnh ngoài nhóm). |
| `source` | String | Có | Nguồn gốc ảnh: `camera_direct` (thành viên tự chụp), `donor_upload` (ảnh thật từ người dùng), `open_source_subset` (tập dữ liệu mở có bản quyền tương thích). |
| `split` | String | Có | Phân tập dữ liệu: `train`, `val`, `test` (được sinh tự động qua pipeline). |
| `status` | String | Có | `pending` (chờ duyệt), `approved` (đã duyệt đạt chuẩn), `rejected` (bị loại). |
| `md5_hash` | String | Có | Chuỗi MD5 hash của file ảnh dùng để phát hiện trùng lặp tuyệt đối. |
| `verified_by` | String | Có | Tên tài khoản hoặc email của thành viên thực hiện kiểm tra chéo (e.g. `caohai3105`, `thanhson`). |
| `notes` | String | Không | Ghi chú lý do reject hoặc đặc điểm ảnh (VD: `clear_single_item`, `edge_case_jacket`). |

---

## 5. Quy Trình Kiểm Tra Chéo (Cross-Verification Flow)
Để đảm bảo tính khách quan và đạt Acceptance Criteria của task Jira `EP02-US04-T02 [ALL]`:

1. **Người thu thập (Collector):**
   - Đưa ảnh thô vào thư mục tạm `AI-Model/dataset/raw/<label>/`.
   - Khởi tạo manifest với trạng thái `status = pending`.
2. **Người kiểm tra chéo (Reviewer - Phải là thành viên khác):**
   - Mở ảnh và đối chiếu với Mục 2 & Mục 3 của tài liệu này.
   - Nếu đạt yêu cầu: Đổi `status = approved`, điền tên vào `verified_by`.
   - Nếu không đạt yêu cầu: Đổi `status = rejected`, ghi rõ lý do vào `notes`.
3. **Quy tắc đóng gói:** Chỉ những hình ảnh có `status = approved` mới được đưa vào pipeline làm sạch và chia tập Train/Val/Test.
