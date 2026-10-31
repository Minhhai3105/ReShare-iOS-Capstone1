# 🤖 AI Data & Models
Nơi lưu trữ tài nguyên AI của project.
Anh em gom Dataset (ảnh), script train model và các file output ở đây. Khi nào train xong và convert ra file `.mlmodel` (CoreML) thì chốt vào đây để Hải lấy nhúng thẳng vào app iOS nhé.

## ReShare v8 baseline (US06–US07)

- Model tích hợp iOS: `ReShare_v8_baseline_01.mlmodel`, phân loại ảnh thành `books`, `clothing`, `household_items` (trên app/API, nhãn cuối được lưu là `household`). Đầu vào là ảnh màu; Create ML/Vision đưa về 299 × 299. Đầu ra gồm nhãn và xác suất dự đoán của model.
- Form quyên góp chạy Core ML trên thiết bị với ảnh đầu tiên, hiển thị nhãn và confidence thực. Nếu confidence dưới 60% hoặc inference lỗi, người gửi chọn thủ công. Dù AI gợi ý thế nào, người gửi phải xác nhận danh mục trước khi gửi. Ngưỡng 60% chỉ điều khiển gợi ý trên giao diện, không phải mức độ chính xác đã được hiệu chuẩn.
- Donation lưu riêng `aiPredictedCategory`, `aiConfidence` (0–1), `aiModelVersion` khi có kết quả, và `donorConfirmedCategory`. Xác nhận của nhân sự cùng lịch sử nằm trong `donation_reviews`, không ghi đè nhãn AI hay lựa chọn của người gửi.
- Bộ ảnh v8 đã chia `train`/`validation`/`test`: 748/156/156 ảnh. Lần kiểm tra Create ML trước đây cho kết quả test 154/156 ảnh đúng; đây là số liệu của bộ test đã tách, chưa thay cho thử nghiệm trên ảnh ngoài bộ dữ liệu và thiết bị thật.
- Giới hạn: model chỉ gợi ý 3 danh mục lớn; không nhận diện tên món đồ, tình trạng hay vật thể ngoài 3 lớp. Thời gian inference được ghi vào log Core ML trên thiết bị để kiểm tra hiệu năng thực tế.
