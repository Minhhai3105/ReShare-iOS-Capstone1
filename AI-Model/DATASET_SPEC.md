# 📦 Đặc Tả Kỹ Thuật Dataset & Hướng Dẫn Tái Lập (Dataset Specification)
**Dự án:** ReShare (Capstone 1)  
**Story:** US04 — Chuẩn bị dataset có thể tái lập  
**Mã tài liệu:** `AI-SPEC-US04`  

---

## 1. Cấu Trúc Thư Mục Chuẩn (Directory Layout)

Cấu trúc lưu trữ dữ liệu trong thư mục `AI-Model/`:

```text
AI-Model/
├── LABELING_GUIDELINES.md      # Quy tắc gắn nhãn và tiêu chuẩn loại trừ ảnh lỗi
├── DATASET_SPEC.md             # Tài liệu đặc tả kỹ thuật và hướng dẫn tái lập (File này)
├── dataset/
│   ├── raw/                    # Thư mục chứa ảnh thô thu thập ban đầu
│   │   ├── clothing/           # Ảnh quần áo thô
│   │   ├── books/              # Ảnh sách thô
│   │   └── household_items/    # Ảnh đồ gia dụng thô
│   ├── manifest.csv            # Manifest chuẩn lưu trữ toàn bộ metadata từng ảnh
│   ├── dataset_summary.json    # File JSON thống kê phân bố và tỷ lệ split
│   └── DATASET_REPORT.md       # Báo cáo phân bố tự động cho báo cáo Sprint
└── scripts/
    └── dataset_pipeline.py     # Pipeline tự động: Deduplicate, Stratified Split, Kiểm tra Leakage
```

---

## 2. Đặc Tả Dữ Liệu Trong `manifest.csv`

Mỗi hình ảnh được quản lý qua một dòng trong file `manifest.csv`:

```csv
image_id,file_path,label,source,split,status,md5_hash,verified_by,notes
CLOTH_00001,dataset/raw/clothing/img_01.jpg,clothing,camera_direct,train,approved,e4d909c290d0fb1ca068ffaddf22cbd0,caohai3105,verified_clear
BOOK_00001,dataset/raw/books/img_01.jpg,books,camera_direct,val,approved,79cfeb94595de33b3326c06ab16efdcb,thanhson,verified_clear
HOUSE_00001,dataset/raw/household_items/img_01.jpg,household_items,open_subset,test,approved,b10a8db164e0754105b7a99be72e3fe5,caodinhbao,verified_clear
```

### Các trường dữ liệu:
1. **`image_id`** *(Bắt buộc)*: Mã duy nhất theo định dạng `{PREFIX}_{INDEX}`.
2. **`file_path`** *(Bắt buộc)*: Đường dẫn file ảnh.
3. **`label`** *(Bắt buộc)*: `clothing` | `books` | `household_items`.
4. **`source`** *(Bắt buộc)*: Nguồn ảnh (`camera_direct`, `open_source_subset`, `donor_upload`).
5. **`split`** *(Bắt buộc)*: `train` (70%), `val` (15%), `test` (15%).
6. **`status`** *(Bắt buộc)*: Trạng thái kiểm tra (`approved`, `pending`, `rejected`).
7. **`md5_hash`** *(Bắt buộc)*: Chuỗi băm 32 ký tự để kiểm tra tính toàn vẹn và chống trùng lặp.
8. **`verified_by`** *(Bắt buộc)*: Tên/ID người kiểm tra chéo (AC 1).
9. **`notes`** *(Tùy chọn)*: Ghi chú đặc tính ảnh hoặc nguyên nhân loại bỏ.

---

## 3. Hướng Dẫn Tái Lập Cách Chia Tập (Step-by-step Replication Guide)

Bất kỳ thành viên nào trong nhóm hoặc giảng viên/mentor đều có thể tái lập chính xác 100% cách chia tập bằng các bước sau:

### Bước 1: Mở Terminal tại thư mục gốc dự án
```bash
cd /Users/caohai3105/ReShare-iOS-Capstone1/AI-Model
```

### Bước 2: Chạy Pipeline với Cố Định Random Seed
```bash
python3 scripts/dataset_pipeline.py --seed 42 --train-ratio 0.70 --val-ratio 0.15 --test-ratio 0.15
```

### Bước 3: Kiểm tra tính toàn vẹn (Anti-Leakage Verification)
Pipeline sẽ tự động:
- Tính hàm băm MD5 cho từng ảnh.
- Loại bỏ toàn bộ ảnh trùng lặp tuyệt đối.
- Chia Stratified theo từng class với tỷ lệ 70% Train, 15% Val, 15% Test.
- Kiểm tra tính rời rạc tuyệt đối: `Train ∩ Val = ∅`, `Train ∩ Test = ∅`, `Val ∩ Test = ∅`.
- Xuất cập nhật `dataset/manifest.csv` và `dataset/DATASET_REPORT.md`.

---

## 4. Cam Kết Tiêu Chuẩn Cho Mô Hình (Model Constraints)
- **Tập Test Độc Lập:** Tập `test` được đóng băng tuyệt đối, **không bao giờ** được sử dụng trong quá trình huấn luyện hoặc tinh chỉnh siêu tham số (Hyperparameter tuning) của mô hình.
- **Tiêu chuẩn đầu ra Sprint 2:** Tập test độc lập này sẽ là bộ chuẩn để đo Top-1 Accuracy (mục tiêu đạt tối thiểu $\ge 80\%$ theo Proposal và Plan).
