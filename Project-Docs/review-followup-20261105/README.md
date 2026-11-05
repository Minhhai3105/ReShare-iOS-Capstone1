# ReShare CR01 — implementation follow-up

Ngày 05/11/2026. Nhánh `codex/document-review-followup-20261105`, tách từ `dev / 547b797`. Thay đổi local để nhóm và Claude review; chưa merge, push hoặc deploy, chưa sửa dữ liệu live/Jira/Drive.

## Phạm vi và kết quả

- Inventory dev/build mặc định API, không fallback dữ liệu mẫu. Dev cần `VITE_ADMIN_API_BASE_URL`; fixture chỉ opt-in bằng `VITE_INVENTORY_SOURCE=mock`, có cảnh báo đỏ và build guard.
- Đếm nguyên cho piece/bag/box/set; kg tối đa ba số lẻ. Phép tính dùng lượng cơ sở nguyên, thống nhất Backend/Web/logic Swift/Rules. Receipt damaged được giữ, intake/distribution bị chặn. Dữ liệu legacy không tự migrate hoặc làm tròn.
- `POST /v1/donations/{UUID}/resubmit`: owner, state/version, editable allowlist, authorized image batch, transaction/audit và idempotency; có form iOS trong lịch sử. Direct client donation update vẫn bị chặn.
- `GET /v1/admin/inventory/events`: Bearer-header SSE, scope theo assignment, listener revision dùng chung, thu hồi quyền, reconnect/ẩn tab. Nhập/xuất tăng một revision document của kho trong transaction; Web tải lại qua API kiểm quyền.
- Worker mỗi phút khi backend hoạt động: hết giờ hẹn + 2 giờ và cả hai chưa xác nhận thì transaction mở lại item, xóa reservation, hủy lịch và ghi một message ổn định. Một bên đã xác nhận được giữ đối soát; Rules ràng buộc reservation với lịch accepted và deadline đúng.
- Native XCTest cho file quantity dùng chung; không thêm dependency hoặc thay framework/SDK.

## Kiểm tra CR01 ban đầu (011ce79)

| Lớp | Kết quả | Phạm vi |
| --- | --- | --- |
| Rules | 14/14, 0 skip | Firestore Emulator |
| Backend | 127/127, 0 skip | Có Emulator, gồm HTTP SSE và nhiều ledger |
| Web | 95/95 | Node test runner |
| Landing | 1/1 | Kiểm tra hiện có |
| Swift XCTest | 3/3 | Swift Package trên macOS, file logic app dùng |
| Build | Web và iOS Simulator đạt | Không ký/cài trên iPhone, không deploy |
| Negative build | Mock bị chặn đúng kỳ vọng | Không có fallback API → fixture |

Không suy ra độ phủ toàn app hoặc nghiệm thu E2E từ tổng số test. Chưa có bộ app UI/ViewModel/Core ML test hay E2E tự động mobile–Web.

Lệnh local (cần dependency hiện có và môi trường Xcode/Java tương ứng):

```sh
firebase emulators:exec --only firestore --project demo-reshare 'npm run test:rules && npm --prefix backend test'
npm --prefix ReShare-Web test
npm --prefix ReShare-Web run build
swift test --package-path ReShare
```

Trên máy hiện tại cần Java 21 cho Emulator và `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` cho Xcode/Swift; dùng biến ở tiến trình, không đổi cấu hình hệ thống. Bộ log bàn giao ghi đầy đủ lệnh và môi trường chạy thực tế.

## Nghiệm thu còn lại

Review code rồi chọn revision môi trường test; xác nhận backend/Web/app cùng bản, Rules/index mới và tài khoản đúng quyền. Chạy iPhone–Web từ tạo đơn đến báo cáo; kg, damaged, resubmit/ảnh/retry; hai browser đo commit → hiển thị ≤5 giây; expiry khi app đóng và backend thực sự hoạt động; quyền, reconnect và usage/quota. Tất cả vẫn Not run trong checklist bước 5 của bộ tài liệu Review_2026-11-05.

Worker không chạy đúng lịch khi backend ngủ/ngừng. Revision listener chia sẻ không loại bỏ chi phí đọc của API reload, assignment, worker queries và reconnect. Giới hạn số dòng response không đồng nghĩa số Firestore reads bị giới hạn cùng mức. Legacy invalid quantities cần đối soát trước khi dùng demo.

Report/block/moderation, tranh chấp qua Admin và xóa tài khoản/retention chỉ được đưa vào backlog phát hành đề xuất, chưa triển khai. CR01 mới được nhóm trưởng chấp thuận; mentor còn chờ review. Điểm tiếp nhận/hub hằng số trên iOS chưa được xác nhận là dữ liệu vận hành.

Đợt CR01 ban đầu để lại malformed URL/liveness để review riêng. Bản vá tiếp theo đã bổ sung phản hồi 400, backoff SSE, phục hồi ảnh legacy và cấu hình local; xem [kết quả xử lý review Gemini](GEMINI_FIXES_VI.md). Log và số test ở bảng trên là lịch sử của 011ce79; kết quả bản vá mới được ghi riêng.

## Quy tắc review

Không coi lịch sử Done/sprint trong tài liệu là truy vấn Jira mới. Không lấy mock làm bằng chứng dữ liệu thật. Giữ riêng: yêu cầu, code, test local, deploy và acceptance. Bộ tài liệu có Markdown tiếng Việt, bảy Word tiếng Anh, ba casebook với 146 case thủ công Not run, source hashes và log để đối chiếu.
