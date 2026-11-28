# ReShare

ReShare là nền tảng quản lý quyên góp và tồn kho cho các tổ chức thiện nguyện. Người dùng gửi đơn quyên góp từ iPhone. Nhân sự dùng Web Admin để duyệt đơn, ghi nhận hàng thực nhận, nhập kho và lập phiếu phân phối. **Kho đồ 0đ** là luồng trao tặng trực tiếp giữa người dùng qua tin nhắn và lịch hẹn.

Đồ án **Capstone 1 · CMU-SE 450 · Nhóm C1SE.49** tại Viện Đào tạo Quốc tế, Đại học Duy Tân.

## Demo và mã nguồn

| Liên kết | Mục đích |
| --- | --- |
| [Landing Page](https://reshare.pages.dev/) | Giới thiệu hai cách trao tặng, các Hub minh họa, FAQ và form liên hệ |
| [Web Admin](https://reshare.pages.dev/admin/login) | Cổng quản trị dành cho tài khoản nhân sự được phân quyền |
| [Backend health check](https://reshare-ios-capstone1-1.onrender.com/health) | Kiểm tra API trên Render có phản hồi |
| [Mã nguồn v1.1.1](https://github.com/Minhhai3105/ReShare-iOS-Capstone1/tree/v1.1.1) | Mốc nộp Capstone tại commit `3ec0210`. Nhánh tích hợp là `dev`. |

Các Hub hiện dùng để minh họa. Hãy dùng tài khoản và dữ liệu thử nghiệm do nhóm cấp khi chạy demo.

## Luồng nghiệp vụ

1. **Quyên góp qua kho.** Người tặng chọn chiến dịch hoặc tạo đơn, đính kèm 3–6 ảnh và xác nhận danh mục. System Admin phân kho. Nhân sự có quyền duyệt đơn, thực nhận, nhập kho và phân phối cho người thụ hưởng đã được xác minh. Tồn khả dụng chỉ tăng khi **xác nhận nhập kho**. Đơn chuyển sang **Đã trao tặng** khi toàn bộ số lượng thực nhận đã được phân phối và đối soát.
2. **Kho đồ 0đ.** Người dùng đăng món, nhắn tin và thống nhất giờ nhận. Khi người đăng chấp nhận lịch hẹn, món được giữ cho người nhận. Hai bên xác nhận để hoàn tất trao nhận. Sau giờ hẹn 2 giờ, hệ thống mở lại món nếu cả hai bên chưa xác nhận. Món có một bên đã xác nhận được giữ để đối soát. Luồng này quản lý dữ liệu riêng và không làm thay đổi tồn kho tổ chức.

| Vai trò | Phạm vi |
| --- | --- |
| Người tặng / người nhận | Gửi và theo dõi đơn, đăng hoặc nhận món trong Kho đồ 0đ trên iOS |
| Warehouse Admin | Xử lý nghiệp vụ ở kho được giao và kiểm duyệt bài Kho đồ 0đ trong quận được phân công |
| System Admin | Quản lý nhân sự, phân kho, xác minh người thụ hưởng, quản lý chiến dịch, Hub và báo cáo vi phạm |
| Khách truy cập | Xem thông tin công khai và gửi liên hệ trên Landing Page |

## Kiến trúc và cấu trúc repo

| Đường dẫn | Trách nhiệm |
| --- | --- |
| [`ReShare/`](ReShare/) | App SwiftUI cho iPhone, model Core ML và bộ test Swift `ReShareCore` |
| [`ReShare-Web/`](ReShare-Web/) | Landing Page và Web Admin dùng Vue 3, Vite và Vue Router, triển khai trên Cloudflare Pages |
| [`backend/`](backend/) | Node.js HTTP API trên Render. Xác thực Firebase ID token, kiểm tra quyền theo kho và xử lý giao dịch qua Firebase Admin SDK. |
| [`firestore.rules`](firestore.rules) và [`firestore.indexes.json`](firestore.indexes.json) | Quyền truy cập dữ liệu và chỉ mục truy vấn Firestore |
| [`AI-Model/`](AI-Model/README.md) | Tài liệu về bộ dữ liệu, model và giới hạn đánh giá |
| [`Project-Docs/`](Project-Docs/) | Tài liệu và bằng chứng kỹ thuật trong repo |

Firebase Authentication quản lý danh tính. App iOS ghi những thao tác được Firestore Rules cho phép, như tạo đơn chờ duyệt và cập nhật trao nhận P2P. Các quyết định về duyệt đơn, nhập kho và phân phối đi qua API Node.js. Web Admin nhận tín hiệu thay đổi tồn kho qua SSE rồi tải lại dữ liệu theo quyền. Ảnh lưu ở Cloudinary theo chữ ký do backend cấp.

**AI có hai nhiệm vụ.** Model `ReShare_v8_baseline_01` chạy trên iPhone để gợi ý **quần áo, sách vở hoặc đồ gia dụng**. Người gửi xác nhận danh mục cuối cùng. Backend dùng Gemini để gắn cờ nội dung bài Kho đồ 0đ và hỗ trợ nhân sự kiểm duyệt. [Chi tiết model trên thiết bị](AI-Model/README.md)

## Chạy trên máy phát triển

Chuẩn bị **Node.js 24** và npm cho Web, backend. Dùng **macOS với Xcode 26** để build iOS. Target app hỗ trợ **iPhone từ iOS 17.6**. Các lệnh dưới đây chạy từ thư mục gốc của repo.

```bash
git clone --branch dev https://github.com/Minhhai3105/ReShare-iOS-Capstone1.git
cd ReShare-iOS-Capstone1
```

Nếu dựng môi trường riêng, dùng một Firebase project thử nghiệm cho cả iOS, Web và backend. Bật Email/Password trong Firebase Authentication, tạo cơ sở dữ liệu Firestore và triển khai Rules cùng indexes từ repo vào project thử nghiệm. Chuẩn bị tài khoản người tặng, tài khoản nhân sự và dữ liệu kho để chạy luồng nghiệp vụ.

### Backend

```bash
npm --prefix backend ci
cp backend/.env.example backend/.env
```

Trong `backend/.env`, điền `FIREBASE_PROJECT_ID` của dự án thử nghiệm, `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới tệp xác thực Firebase Admin trên máy và các biến `CLOUDINARY_*` của môi trường đó. Thêm `http://localhost:5173` vào `ADMIN_WEB_ORIGINS` hoặc dùng đúng origin Vite đang hiển thị. Cấu hình Turnstile và kiểm duyệt AI theo [mẫu biến môi trường](backend/.env.example) nếu cần bật các chức năng này. Giữ khóa API và tệp xác thực trên máy hoặc trong kho bí mật của môi trường triển khai.

```bash
npm --prefix backend run start:local
```

Mở terminal khác để kiểm tra API. Cổng mặc định là `3000`. Khi API sẵn sàng, phản hồi là `{"status":"ok"}`.

```bash
curl -fsS http://localhost:3000/health
```

### Web

```bash
npm --prefix ReShare-Web ci
cp ReShare-Web/.env.example ReShare-Web/.env.local
npm --prefix ReShare-Web run dev
```

Mở `http://localhost:5173` để xem Landing Page và `/admin/login` để vào Web Admin. `VITE_ADMIN_API_BASE_URL` trong `.env.local` mặc định trỏ đến backend local ở cổng `3000`. Khi chạy nghiệp vụ với Firebase thử nghiệm, cập nhật cấu hình Firebase Web trong [`firebase.js`](ReShare-Web/src/admin/auth/firebase.js) cho khớp dự án backend. Tài khoản nhân sự cần có phân công tương ứng trong `staff_assignments`. Dùng [script phân quyền](backend/scripts/staff-assignment-cli.cjs) để khởi tạo System Admin đầu tiên trong dự án thử nghiệm.

### iOS

1. Mở [`ReShare.xcodeproj`](ReShare/ReShare.xcodeproj) trong Xcode rồi chờ Swift Package Manager tải dependency.
2. Chọn scheme **ReShare** và một iPhone Simulator hoặc iPhone đã cấu hình Signing. Bấm **Run**.
3. Để chạy với Firebase thử nghiệm, dùng `GoogleService-Info.plist` của app iOS đã đăng ký trong dự án Firebase đó. Với build Debug trên Simulator, thêm `RESHARE_IMAGE_API_BASE_URL=http://127.0.0.1:3000` vào **Edit Scheme → Run → Arguments → Environment Variables** để dùng backend local. Trên iPhone thật, dùng địa chỉ LAN của máy Mac thay cho `127.0.0.1`.

## Kiểm thử

| Phạm vi | Lệnh |
| --- | --- |
| Backend unit test | `npm --prefix backend test` |
| Web unit test | `npm --prefix ReShare-Web test` |
| Build và kiểm tra Landing | `npm --prefix ReShare-Web run test:landing` |
| Firestore Rules và Backend trên Emulator | `npm run test:all:emulator` |
| Logic Swift dùng chung | `swift test --package-path ReShare` |

Để chạy bộ Emulator, cài **Java 21 trở lên** và Firebase CLI (`firebase-tools@15` theo CI), rồi chạy `npm ci` ở thư mục gốc và `npm --prefix backend ci`. Bộ này dùng project `demo-reshare`. [Cấu hình GitHub Actions](.github/workflows/ci.yml)

Khi kiểm tra luồng demo, ghi lại mã đơn, bản code và môi trường. Chạy từ lúc gửi đơn đến khi đối chiếu phiếu thực nhận, phiếu nhập, tồn kho, phiếu phân phối và báo cáo. Dùng iPhone thật để kiểm chứng riêng camera và suy luận Core ML.
