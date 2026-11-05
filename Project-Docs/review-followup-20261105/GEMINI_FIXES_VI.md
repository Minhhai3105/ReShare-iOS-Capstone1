# Xử lý review Gemini sau commit 011ce79

Ngày 05/11/2026. Thực hiện trên nhánh `codex/document-review-followup-20261105`. Bản vá để review local; chưa push/merge/deploy hoặc cập nhật Drive/Jira/database thật. Phiên bản chính xác và hash nằm trong SOURCE_EVIDENCE.json của gói bàn giao mới. Bộ Word/Testcase CR01 cũ vẫn là hồ sơ tại 011ce79, không tự đổi thành hồ sơ nghiệm thu bản vá này.

## 1. URL sai và khả năng tiếp tục phục vụ

`backend/server.cjs` bắt lỗi parse URL trước khi phân tuyến, trả 400 JSON chung và `Cache-Control: no-store`. Không trả stack hoặc URL đầu vào. Những URL được parser chấp nhận như `/%zz` vẫn đi qua tuyến cũ; không biến chúng thành lỗi parse giả.

Test entry point dùng dịch vụ giả lập kiểm hai URL host sai, request tiếp theo, đường dẫn và CORS. Kiểm tra thêm qua socket HTTP local xác nhận mỗi URL sai trả 400 và cùng server tiếp tục trả 200 cho request kế tiếp. Firebase/Cloudinary trong phép thử này được giả lập, không chứng minh deploy.

## 2. SSE retry và xác thực

`inventory.events.js` retry lỗi mạng theo mức 1, 2, 4, 8, 16, 30 giây, có jitter ±20% và chặn trần 30 giây. Kết nối ổn định ít nhất 30 giây mới reset mức chờ; kết nối vừa mở rồi đứt không liên tục quay lại 1 giây. HTTP 401/403 và các lỗi token/session hết hiệu lực dừng retry. Lỗi `auth/network-request-failed` vẫn được thử lại. Các mã session được ánh xạ thành 401 để giao diện hiện lại trạng thái quyền.

Đóng subscription hủy timer/request. Token trả về sau khi đóng không tạo request mới. Reader được cancel và release khi kết nối kết thúc hoặc mất quyền. Kiểm tra bằng đồng hồ giả lập, gồm tăng/giới hạn thời gian, xác thực, token đến muộn, reset sau ổn định và đóng reader.

## 3. Ảnh cũ khi gửi bổ sung

Giữ quy tắc 3–6 ảnh Cloudinary thuộc batch được cấp quyền cho owner. Với bộ ảnh được giữ lại nhưng thiếu/sai định dạng/thiếu batch hoặc không xác minh được quyền, API trả 400 và mã `REPLACEMENT_IMAGES_REQUIRED`, hướng dẫn chọn 3–6 ảnh mới. Không nới kiểm quyền hoặc chấp nhận 1–2 ảnh. Những ảnh thay thế không được cấp quyền vẫn bị từ chối.

Form iOS nhận biết bộ ảnh thiếu ngay khi mở, hiển thị yêu cầu thay ảnh và khóa gửi cho tới khi chọn đủ ảnh. Nếu chỉ server phát hiện batch cũ không hợp lệ, app đọc mã lỗi và chuyển sang yêu cầu ảnh mới. Khi đang tải/không đọc đủ số ảnh đã chọn, chưa cho gửi. Các kiểm tra owner, state, version và idempotency được giữ; cập nhật thất bại không ghi dở đơn/audit. Unit và Emulator kiểm cả thất bại và phục hồi bằng batch mới, gồm replay.

## 4. Local iOS/Web/backend

- Backend và URL trong mẫu Web thống nhất cổng 3000. Chỉ file mẫu thay đổi; `.env` đang dùng của thành viên không tự cập nhật.
- `ReShareAPIConfiguration` là nơi kiểm URL chung cho API ảnh và resubmit. HTTPS được hỗ trợ ở cả hai cấu hình. HTTP chỉ cho Debug với localhost/loopback, IPv4 mạng riêng 10/8, 172.16/12, 192.168/16 hoặc tên `.local`. Không chấp nhận HTTP tới host công khai, URL có user/password/query/fragment hoặc port sai.
- Debug có plist riêng với `NSAllowsLocalNetworking` và mô tả quyền mạng nội bộ. Release có plist riêng không chứa hai khóa này. Không bật `NSAllowsArbitraryLoads`.
- Cả hai plist ghi khóa URL từ build setting `INFOPLIST_KEY_RESHARE_IMAGE_API_BASE_URL`. Debug còn cho phép override cùng tên `RESHARE_IMAGE_API_BASE_URL` qua Xcode Scheme Run → Arguments → Environment Variables. Release bỏ qua override môi trường này.

Chạy local sau khi tự cấu hình Firebase/Cloudinary theo môi trường test của nhóm:

```sh
# Thư mục backend: .env phải có credentials của môi trường test và PORT=3000.
npm run start:local
```

Ở thư mục `ReShare-Web`, copy `.env.example` sang `.env.local` nếu chưa có; nếu đã có thì sửa đúng biến, không ghi đè cấu hình riêng. Đặt `VITE_ADMIN_API_BASE_URL=http://localhost:3000` và chạy `npm run dev`. Không bật `VITE_INVENTORY_SOURCE=mock` cho nghiệm thu.

Trong Xcode dùng Debug. Simulator có thể đặt `RESHARE_IMAGE_API_BASE_URL=http://127.0.0.1:3000`; iPhone thật dùng IP LAN của máy chạy backend, ví dụ `http://192.168.1.5:3000`, cùng mạng và cho quyền Local Network khi hệ điều hành hỏi. `localhost` trên iPhone là chính iPhone. Đây là hướng dẫn cho dữ liệu/tài khoản test; không dùng HTTP local để nghiệm thu production. Chưa ghi nhận kết nối trên iPhone thật trong lượt này.

## 5. Index và nghiệm thu thật giao nhóm trưởng

Index bốn trường của worker đã có trong `firestore.indexes.json`; bản vá này không tự triển khai index. Chọn revision đã review và Firebase project test/demo trước khi chạy. Thay `PROJECT_ID_TEST` bằng project nhóm đã chọn:

```sh
firebase deploy --only firestore:indexes --project PROJECT_ID_TEST
```

Không dùng `--force`; nếu CLI đề nghị xóa index hiện có, đối chiếu trước khi tiếp tục. Đợi Console → Firestore → Indexes báo index dùng được, rồi kiểm query/worker trong môi trường đó. Worker bắt lỗi và thử lại theo chu kỳ; chỉ chạy khi backend còn hoạt động. Emulator không kiểm composite index nên kết quả Emulator không thay bước này.

| Ca nghiệm thu bổ sung | Kết quả cần ghi | Trạng thái |
| --- | --- | --- |
| GMR01 URL sai trên backend test | 400, không stack/URL; request hợp lệ tiếp theo chạy; log có revision | Not run |
| GMR02 Web mất mạng, nối lại, đóng màn | Backoff có trần, tự đồng bộ khi mạng lại, không giữ subscription của màn cũ | Not run |
| GMR03 Token hết hiệu lực/mất quyền | Dừng retry, không hiện dữ liệu không còn quyền, đăng nhập lại/đổi scope hoạt động | Not run |
| GMR04 Đơn cũ thiếu ảnh hoặc batch | Hướng dẫn chọn ảnh mới; không gửi dở, không kẹt vào lỗi chung không có đường phục hồi | Not run |
| GMR05 Thay ảnh thật rồi mất response/retry | 3–6 ảnh đúng quyền; gửi lại không thêm revision/audit trùng; staff xem được | Not run |
| GMR06 Debug local Simulator/iPhone | API ảnh và resubmit cùng URL; iPhone dùng IP LAN; ghi build/OS/quyền mạng | Not run |
| GMR07 Release trỏ HTTP và HTTPS | HTTP bị chặn; HTTPS đúng môi trường làm việc; không có ngoại lệ ATS Debug | Not run |
| GMR08 Index/worker live | Index sẵn sàng; hết hẹn +2h mở lại đúng điều kiện, một bên xác nhận được giữ | Not run |

Chạy tiếp checklist bước 5 của bộ CR01 cho iPhone–Web từ tạo đơn tới báo cáo. Các casebook thủ công cũ vẫn Not run; không chuyển Pass từ log tự động. Report/block, tranh chấp, xóa tài khoản và UI/Core ML test chưa được bổ sung trong bản vá này.

## Kiểm chứng và giới hạn

- Rules 14/14 và Backend 133/133, không skip, trên Firestore Emulator project `demo-reshare`.
- Web 99/99 và build thành công.
- Swift Package: 7 XCTest logic chung ở Debug và 7 ở Release. Đây là cùng 7 ca ở hai cấu hình, không tính thành 14 ca khác nhau và không phải coverage UI/Core ML.
- App iOS Simulator build Debug/Release; kiểm plist của sản phẩm build tách biệt cấu hình local và Release. Log cuối nằm trong gói bàn giao mới.
- Cảnh báo cũ ngoài phạm vi: Web chunk lớn; biến `imageData` chưa dùng trong StorageService và Map API cũ trong DonationDetailsView. Không sửa lan các file này.

Chưa có nghiệm thu thiết bị/live, kiểm soát proxy/quota hoặc xác nhận mentor CR01. Không có phần deploy tự động trong lượt này.

Nguồn đối chiếu: [Firebase AuthErrorCodes](https://firebase.google.com/docs/reference/js/auth#autherrorcodes), [giới hạn index của Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore#how_the_cloud_firestore_emulator_differs_from_production), [quản lý index](https://firebase.google.com/docs/firestore/query-data/indexing), [ATS và kết nối local của Apple](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/CocoaKeys.html).
