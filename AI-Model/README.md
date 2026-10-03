# 🤖 AI Data & Models — ReShare (Sprint 1)

Nơi lưu trữ tài nguyên AI, tập dữ liệu huấn luyện (Dataset), pipeline tiền xử lý và mô hình phân loại vật phẩm quyên góp cho ReShare.

---

## 📌 Các Tài Liệu & Thành Phần Cốt Lõi (Sprint 1 — US04)

1. **[Quy tắc gắn nhãn dữ liệu (LABELING_GUIDELINES.md)](LABELING_GUIDELINES.md):**
   - Định nghĩa 3 nhãn chuẩn: `clothing`, `books`, `household_items`.
   - Quy tắc xử lý ảnh nhiều vật phẩm (Dominant > 60%), ảnh mờ/tối, và ảnh ngoài phạm vi (`out_of_scope`).
   - Quy trình kiểm tra chéo (Cross-verification flow) giữa các thành viên.

2. **[Đặc tả kỹ thuật & Hướng dẫn tái lập (DATASET_SPEC.md)](DATASET_SPEC.md):**
   - Cấu trúc thư mục dữ liệu chuẩn `raw/` và `processed/`.
   - Schema chi tiết của [manifest.csv](dataset/manifest.csv).
   - Hướng dẫn các bước chạy pipeline tái lập tập dữ liệu với fixed random seed.

3. **[Pipeline tự động hóa (scripts/dataset_pipeline.py)](scripts/dataset_pipeline.py):**
   - Quét ảnh raw, tính MD5 hash chống trùng lặp.
   - Phân chia Stratified Train (70%) / Val (15%) / Test (15%) với seed cố định (`--seed 42`).
   - Có bước kiểm tra trùng lặp; kết quả chỉ có giá trị khi các file ảnh thật tồn tại và được xác minh.

4. **[Báo cáo phân bố dữ liệu (dataset/DATASET_REPORT.md)](dataset/DATASET_REPORT.md):**
   - Thống kê chi tiết số lượng, tỷ lệ phân bố của từng lớp trên cả 3 tập Train/Val/Test.
   - **Chưa đạt US04:** manifest hiện có 150 dòng nhưng thiếu toàn bộ file ảnh tương ứng. Báo cáo cũ chỉ là số liệu CSV chưa xác minh; cần thu ảnh thật, kiểm tra chéo và chạy lại pipeline trước khi dùng làm bằng chứng Jira.
