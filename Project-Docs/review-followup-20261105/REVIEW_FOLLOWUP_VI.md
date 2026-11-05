# Kết quả xử lý review a8d926e

Ngày 05/11/2026. Thực hiện đúng thứ tự nhóm trưởng yêu cầu: **1 → 4 → 2 → validation mục 6 → tối ưu SSE → đóng gói lại**. Nhánh `codex/document-review-followup-20261105`, base `dev / 547b797`. Không gộp các PR giao diện #76–#78 vào nhánh này. Phiên bản cuối và hash nguồn nằm trong manifest của gói tổng hợp; không có thay đổi database live, merge hoặc deploy trong đợt này.

## 1 Timeline và audit resubmit

Commit `b7bb0a0`. `backend/donation-history.cjs` hợp nhất lịch sử public và private theo version/action; bản private được ưu tiên khi cùng sự kiện. Với bản ghi legacy thiếu version, dùng action/thời gian/trạng thái để khử trùng. API review đọc timeline hợp nhất để bù khoảng trống lịch sử cũ mà không cần migration. Resubmit ghi sự kiện vào cả donation public history và donation_reviews private history trong cùng transaction; audit before/after và idempotency vẫn ở donation_resubmissions. Mọi lần review sau tiếp tục dùng timeline đã hợp nhất.

Luồng information v2 → resubmit v3 → approve v4 phải giữ đủ ba sự kiện ở cả hai timeline. Retry cùng khóa/nội dung không thêm lần nữa. Public history chỉ xuất trường trong allowlist, không lộ actorUid hoặc internalNote. Web có nhãn tiếng Việt cho resubmit.

Đính chính review: ở a8d926e sự kiện resubmit vẫn còn trong public donation history và audit; lỗi thật là timeline thẩm định/Web bị thiếu, không phải toàn hệ thống xóa vĩnh viễn sự kiện.

## 4 Scope kho trống

Commit `ae8deae`. `inventory.scope.js` chuẩn hóa query một lần cho cả list và SSE. Với Warehouse Admin, query vắng/null/trống/chỉ khoảng trắng chọn kho đầu tiên được phân công. Với System Admin, trống nghĩa là tất cả kho. Query mảng, ID sai định dạng, tài khoản không có quyền/phân công và kho ngoài phân công bị chặn; không tự đổi một ID trái quyền thành kho hợp lệ. UI xóa dữ liệu khi thực sự mất quyền.

## 2 Refresh lịch sử iOS

Commit `ecc8ae7`. DonationResubmitView gọi callback chỉ sau khi API trả thành công. Card đánh dấu thành công và yêu cầu parent tải lại lịch sử khi sheet đóng. Hủy sheet không phát sinh refresh thành công. Thumbnail dùng image ID làm task key từ trước, nên dữ liệu mới sẽ tải ảnh theo ID mới. Debug/Release Simulator build đã qua; thao tác bằng tài khoản thật trên iPhone còn Not run.

## 6 Validation dữ liệu sau hợp nhất

Commit `b65b501`. API resubmit kiểm cặp quantity/unit sau khi hợp nhất payload với đơn hiện có. Nếu bỏ cả hai trường mà bản ghi cũ là 1.5 piece, API trả 400 và không ghi đơn/audit. Gửi rõ undefined hoặc cặp thiếu cũng bị từ chối. Piece, bag, box, set phải là số nguyên dương; kg tối đa ba số lẻ. Dữ liệu hợp lệ được chuẩn hóa, dữ liệu sai không tự làm tròn.

Reports kiểm từng dòng stock trong phạm vi quyền trước khi lọc dòng tồn bằng 0. Tồn âm, không hữu hạn, đơn vị sai, số đếm lẻ hoặc kg quá ba số lẻ báo lỗi đối soát. Bản ghi sai ngoài phạm vi kho không làm lộ dữ liệu hoặc gây lỗi phạm vi đang xem.

Đính chính review: upload record lạ mà không có bộ ảnh mới đã bị chặn trước bản vá; giữ regression test. CSV hiện xuất report.rows, không xuất report.stock, nên chưa có bằng chứng stock sai đã lọt vào CSV.

## Tối ưu SSE

Commit `cc66cd1`. Backend dùng fingerprint của scope, ID document, revision bền vững và updateTime đã sắp xếp; không dùng bộ đếm trong RAM cho all_warehouses. Token HTTP và SSE nhất quán khi backend/listener khởi động lại mà dữ liệu chưa đổi; việc tạo lại document với counter giống cũ vẫn được phát hiện qua updateTime.

List đọc revision trước khi truy vấn dữ liệu. Detail xác định/kiểm quyền kho, đọc revision rồi đọc lại item. Revision trả về là mốc bảo thủ của snapshot, không khẳng định toàn bộ API là một snapshot transaction. Nếu adapter gọi hai lần để lấy count và tab, giữ revision của lần đầu để không xác nhận nhầm dữ liệu count cũ.

Frontend theo dõi riêng revision đã thấy và revision của HTTP thành công. Bỏ callback lặp trong một kết nối; vẫn nhận baseline của mỗi lần nối lại để so với dữ liệu đã tải. Baseline khớp không gọi thêm GET. Nếu kho đổi khi GET đang chạy, gộp tín hiệu và tải bù khi kết quả chưa bao phủ revision mới. GET lỗi không được đánh dấu đã đồng bộ. Đổi kho/tài khoản xóa trạng thái sync và bỏ response cũ; lỗi quyền xóa dữ liệu. Giữ backoff, dừng/ẩn tab và xác thực Bearer trong header.

Test tích hợp HTTP + Firestore Emulator xác nhận: tải đầu và baseline dùng một GET; tạo mới event handler/nối lại cùng revision vẫn một GET; ghi thay đổi stock cùng revision khiến đúng một GET tiếp theo và đọc lượng mới. Unit test kiểm arrival order, event trong lúc GET, scope, dữ liệu revision sai và adapter nhiều lần đọc. Đây chưa phải đo độ trễ UI trên hai trình duyệt production.

Không chuyển revision write ra ngoài transaction nhập/xuất: có thể mất tín hiệu nếu process chết sau khi ledger đã commit. Chưa có load test để kết luận document revision theo kho đang gây contention. Tối ưu này thêm metadata read cho HTTP và một item read cho detail; list nhiều lần đọc, reconnect, listener assignment và worker vẫn tốn reads. Không cam kết quota hoặc giảm mọi request trong mọi trường hợp dữ liệu thay đổi.

## Kiểm chứng local

| Hạng mục | Kết quả hiện tại | Giới hạn |
| --- | --- | --- |
| Rules | 14/14, không skip | Firestore Emulator |
| Backend | 140/140, không skip | Có HTTP/SSE + Emulator; chưa phải live database |
| Web | 107/107 | Node test runner; chưa nghiệm thu UI đã đăng nhập trên môi trường deploy |
| Landing | 1/1 | Kiểm build metadata/assets; không chứng minh liên hệ live được nhận |
| Swift Package | 7/7 Debug và 7/7 Release | Cùng 7 XCTest: quantity và URL config trên macOS; không phải 14 ca khác nhau |
| Build | Web; app iOS Simulator Debug và Release đạt | Không ký/cài app trên iPhone, không deploy |

Log của từng lệnh được giữ trong gói tổng hợp. Web build còn cảnh báo chunk lớn đã có trước. Chưa có app UI/ViewModel/Core ML test hoặc E2E tự động xuyên suốt iPhone–Web; không công bố tỷ lệ coverage toàn app từ các con số trên.

Lệnh dùng để tái kiểm trong checkout đúng phiên bản, sau khi có dependencies và môi trường test riêng:

```sh
npm run test:all:emulator
npm --prefix ReShare-Web test
npm --prefix ReShare-Web run test:landing
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ReShare -c debug
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test --package-path ReShare -c release
```

Trên máy này cần Java 21 cho Emulator và Xcode đầy đủ cho app. Cấu hình theo tiến trình, không thay xcode-select hoặc hệ thống. Cache/build output mới đặt trong thư mục tạm; `.build` có sẵn được giữ nguyên.

## Đóng gói và việc nhóm cần làm

Gói tổng hợp có source từ Git đúng HEAD, full patch từ 547b797, delta từ a8d926e, log mới, manifest SHA256 và phụ lục Word/Markdown Việt–Anh cho lần review này. Bảy Word/Markdown CR01 cũ giữ nguyên trong baseline_011ce79, chỉ là tài liệu tham chiếu lịch sử. Khi có khác biệt, dùng đặc tả hiện tại trong phụ lục và source/manifest mới; không lấy kết quả hoặc lỗi cũ làm kết luận cho HEAD mới. Thư mục baseline không chứa manifest source thứ hai.

Ba casebook giữ nguyên 146 case thủ công ở trạng thái Not run và phân công All: thành viên viết/chạy theo task/subtask mình làm, story owner điều phối, leader kiểm tra và gộp. Log tự động không điền thay kết quả thủ công.

Nhóm tự thực hiện bước 5: thống nhất môi trường/revision; review và triển khai theo quy trình nhóm; kiểm Rules/index thật, tài khoản/phân công; quay luồng iPhone–Web với ảnh thật, timeline sau resubmit và refresh ngay khi đóng form; thử query kho trống/kho trái quyền; đổi tab/mất mạng/thu hồi quyền; đo commit tới UI ≤5 giây; đối soát kg và dữ liệu legacy; kiểm expiry khi app đóng, backend còn hoạt động, một bên xác nhận được giữ; ghi reads/writes/quota thực tế. Tất cả vẫn Not run cho tới khi có người chạy và bằng chứng.

Report/block/moderation, giải quyết tranh chấp, xóa tài khoản/retention và benchmark contention vẫn là công việc chưa triển khai/chưa thực thi trong phạm vi lần này. Mentor chưa phê duyệt CR01. Không tự gán owner, deadline, Jira Done hoặc trạng thái triển khai.
