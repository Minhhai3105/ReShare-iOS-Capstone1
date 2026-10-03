# 📊 Báo Cáo Phân Bố Dataset & Kiểm Tra Tái Lập (US04)

> **CHƯA HỢP LỆ — KHÔNG DÙNG LÀM BẰNG CHỨNG US04.** Kiểm tra trên máy ngày 02/10/2026: `manifest.csv` có 150 dòng ghi `approved`, nhưng cả 150 đường dẫn ảnh đều không có file tương ứng trong `AI-Model/dataset/`. Các số liệu bên dưới chỉ phản ánh nội dung CSV cũ, chưa xác minh ảnh, nguồn, nhãn hoặc người kiểm tra chéo. Chưa thể kết luận ảnh trùng/gần trùng hay tính độc lập của tập test.

- **Dự án:** ReShare Capstone 1 (AI Classification Module)
- **Thời gian khởi tạo:** 2026-10-02 15:11:07
- **Cố định Random Seed:** `42` (Đảm bảo khả năng tái lập 100%)
- **Số dòng CSV cũ:** `150`; **số ảnh hợp lệ đã xác minh:** `0`
- **Số ảnh trùng lặp đã loại bỏ:** chưa kiểm tra được
- **Tình trạng rò rỉ dữ liệu (Data Leakage):** chưa kiểm tra được

## 1. Bảng Phân Bố Số Lượng Theo Từng Lớp và Tập Dữ Liệu

| Lớp (Label) | Train (70%) | Validation (15%) | Test (15%) | Tổng cộng | Tỷ lệ trong Dataset |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`books`** | 35 | 8 | 7 | **50** | 33.3% |
| **`clothing`** | 35 | 8 | 7 | **50** | 33.3% |
| **`household_items`** | 35 | 8 | 7 | **50** | 33.3% |
| **Tổng cộng** | **105** | **24** | **21** | **150** | **100%** |

## 2. Tỷ Lệ Phân Chia Thực Tế

- **Tập Huấn luyện (Train):** 105 ảnh (70.0%)
- **Tập Đánh giá (Validation):** 24 ảnh (16.0%)
- **Tập Kiểm thử độc lập (Test):** 21 ảnh (14.0%)

## 3. Xác Nhận Tiêu Chuẩn Acceptance Criteria (AC)

- [ ] **AC 1:** Có file CSV và quy tắc gắn nhãn, nhưng manifest hiện không trỏ tới ảnh thật.
- [ ] **AC 2:** Bảng phân bố hiện dựa trên 150 dòng chưa xác minh; cần tạo lại từ ảnh đã duyệt.
- [ ] **AC 3:** Chưa kiểm tra được ảnh trùng hoặc gần trùng khi không có file ảnh.
- [ ] **AC 4:** Chưa thể tái tạo tập dữ liệu từ manifest hiện tại vì thiếu toàn bộ ảnh nguồn.
