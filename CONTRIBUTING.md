# 🚀 QUY TRÌNH GIT CHUẨN CHO TEAM (CẤM LÀM SAI)

**Bước 1: Luôn kéo code mới nhất về TRƯỚC KHI code**
git checkout dev
git pull origin dev

**Bước 2: Tách nhánh riêng để làm việc** 
(Quy tắc đặt tên: feat/tên-việc, ví dụ: feat/tao-giao-dien-login)
git checkout -b feat/ten-nhanh-cua-ban

**Bước 3: Code xong thì lưu lại**
git add .
git commit -m "feat: [Ghi chú ngắn gọn bạn đã làm gì]"

**Bước 4: Đẩy nhánh lên mạng**
git push origin feat/ten-nhanh-cua-ban

👉 **Cuối cùng:** Lên trang GitHub, bấm nút **"Compare & pull request"**, sau đó nhắn vào group Zalo để Hải vào review và gộp code. Cấm tự ý merge!
