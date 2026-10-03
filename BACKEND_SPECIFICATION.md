# ReShare — Backend specification

**Cập nhật:** 2026-10-02  
**Phạm vi:** contract dùng chung cho app iOS, Web Admin, Firebase và dịch vụ ảnh Cloudinary.  
**Cách đọc:** **Hiện có** = đã đối chiếu với repository; **Đã chốt** = yêu cầu nghiệp vụ nhóm thống nhất nhưng có thể chưa code; **Cần chốt** = quyết định còn mở. Tài liệu được cập nhật thủ công, không tự đồng bộ với code hoặc cấu hình Firebase đã deploy.

### US01 — tài khoản donor (RC1D-44 và RC1D-45)

- Nhánh US01 dùng Firebase Auth email/mật khẩu. Sau đăng ký, app ghi `users/{uid}` và đợi Firestore xác nhận; sau đăng nhập hoặc mở lại app, app tải hồ sơ trước khi vào màn hồ sơ. Nếu Firestore xác nhận document không tồn tại, app chỉ tạo hồ sơ donor bằng transaction; lỗi mạng không kích hoạt tạo hồ sơ.
- App theo dõi thay đổi phiên Firebase Auth và kiểm tra token khi trở lại foreground; khi phiên hết hiệu lực, app xóa trạng thái cục bộ và đưa người dùng về đăng nhập. Lỗi mạng không tự đăng xuất. Lỗi Auth/Firestore được phân loại theo mã SDK để hiển thị thông báo phù hợp.
- Schema client hiện tại: `id`, `email`, `displayName`, `phoneNumber`, `role`, `createdAt`. App chỉ cho sửa `displayName` và `phoneNumber`; `email` gắn với Firebase Auth, còn `role` và phân công kho thuộc nguồn tin cậy phía server.
- `firestore.rules` cho chính chủ `get` hồ sơ; tạo hồ sơ mới chỉ với `role = donor`, `id = auth.uid`, `email = auth.token.email`, không nhận trường kho. Update từ client chỉ được thay `displayName`/`phoneNumber`; không cho list/delete. File Rules này đã deploy riêng lên Firebase project `reshare-13234` ngày 2026-10-02.
- Kiểm thử quyền chạy bằng Firestore Emulator: `PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npm run test:rules:emulator` trên macOS đã có JDK 21, Firebase CLI và npm. Test gồm quyền hồ sơ, chat, đơn quyên góp và giao dịch chốt hẹn/bàn giao. Không dùng tài khoản hoặc dữ liệu production.
- Mã Donation/P2P và các API chat đã được ghép lại với US01 trong working tree. Build toàn app cho iPhone và iOS Simulator đã thành công trước thay đổi xử lý phiên US01 ngày 2026-10-01. Thay đổi phiên mới chỉ được kiểm tra cú pháp theo yêu cầu không chạy build/simulator; vẫn cần kiểm tra trên thiết bị thật.

### US02 — quyền nhân sự và phạm vi kho (EP01-US02-T02)

- Nhánh `story/ep01-us02-role-warehouse-access` triển khai nguồn quyền `staff_assignments/{uid}` gồm `uid`, `role` (`system_admin` hoặc `warehouse_admin`), `active`, `warehouseIds[]`, `updatedAt`. Đây là dữ liệu đặc quyền do Firebase Admin SDK ghi; client chỉ được đọc quyền của chính mình, System Admin đang hoạt động được đọc danh sách, không client nào được ghi. Hồ sơ `users/{uid}` trên app vẫn là hồ sơ donor, không dùng trường `role` của hồ sơ đó để cấp quyền Web Admin.
- Firestore Rules đọc assignment còn hiệu lực cho mỗi yêu cầu. System Admin được xem các kho và đơn quyên góp trên toàn hệ thống; Warehouse Admin chỉ được `get` từng `warehouses/{id}` nằm trong `warehouseIds`, không được `list` toàn bộ. Web phải đọc từng kho được gán, không truy vấn toàn bộ collection. Tài khoản không có assignment hoặc `active=false` bị từ chối kể cả khi ID token cũ còn mang custom claim admin.
- `warehouse_admin` vẫn không được đọc/sửa `donations` hoặc xem ảnh quyên góp: `hubId` trên app là dữ liệu demo, chưa phải `warehouseId` đã xác minh. Quyền này chỉ mở sau khi có kho thật, định danh kho trên đơn và contract nghiệp vụ phù hợp. Việc ghi `campaigns` từ client tạm chỉ dành cho System Admin.
- Backend ảnh kiểm tra assignment đang hoạt động trước khi cấp URL ảnh quyên góp cho System Admin; không tin `claims.role`. Donor vẫn đọc ảnh của đơn mình. Backend dùng Admin SDK nên tự kiểm tra quyền, không dựa vào Firestore Rules.
- Module `backend/staff-assignment.cjs` có thao tác bootstrap một lần, cấp quyền và thu hồi qua Admin SDK; chỉ System Admin đang hoạt động được cấp/thu hồi, nhân viên kho không tự cấp quyền. Kho gán cho Warehouse Admin phải có document `warehouses/{id}` với `status='active'`. Mỗi thay đổi ghi `staff_assignment_audit` trong cùng transaction. Script `backend/scripts/staff-assignment-cli.cjs` là công cụ vận hành đặc quyền, không đưa vào web/iOS; không chạy với tài khoản Firebase của người dùng.
- **Trạng thái:** mới kiểm thử cục bộ bằng Firestore Emulator và Node test; chưa triển khai Rules US02 lên Firebase thật, chưa chạy script cấp tài khoản nhân sự và chưa có kho thật. Web Admin FE cần theo dõi document assignment của UID để cập nhật route/menu khi `active`, `role` hoặc `warehouseIds` đổi. Trang 403, đăng xuất và session UI thuộc task FE.

## 1. Ranh giới sản phẩm

- App iOS phục vụ người dùng. Một website Vue 3 + Vite có landing page ở `/` và Web Admin tại `/admin/login`, `/admin/...`; đội web phụ trách giao diện.
- Hai luồng riêng: **quyên góp qua kho** và **trao đồ trực tiếp P2P**. Đồ P2P vẫn ở phía người cho, không tính vào tồn kho.
- **Đã chốt:** Web Admin có hai vai trò `system_admin` và `warehouse_admin`, dùng chung giao diện. Một nhân viên kho có thể được phân công một hoặc nhiều kho. Người dùng app (`donor`) không được vào admin.
- **Hiện có:** ba Hub trên app là dữ liệu demo, **chưa có trạm tiếp nhận đồ thật**. Các mã `hub-haichau`, `hub-nguhanhson`, `hub-lienchieu`, địa chỉ và giờ mở cửa mẫu không phải cam kết vận hành. Chỉ bật quy trình kho thật khi địa điểm đã được xác minh hoạt động.

## 2. Contract và khả năng hiện có

| Phần | Hiện có trong repository | Chưa có hoặc chưa xác minh |
| --- | --- | --- |
| Firebase Auth, `users/{uid}` | App tạo/đọc `UserProfile`: `id`, `email`, `displayName`, `phoneNumber`, `role`, `createdAt` | Luồng cấp/thu hồi quyền nhân sự từ server. Trường `role` trong profile không tự chứng minh quyền admin. |
| `donations/{id}` | App có mã luồng upload ảnh Cloudinary có chữ ký, ghi đơn, đọc đơn của chính donor; API ảnh đã live trên Render và app đã có base URL | Upload thật chưa được thử trên iPhone; duyệt, tiếp nhận, tồn kho, phân phối và API xử lý trạng thái đáng tin cậy. |
| `catalog_items/{id}` | Bài P2P, giữ đồ và xác nhận bàn giao | Không phải collection tồn kho. |
| `conversations/{id}/messages` | Chat và hẹn gặp P2P | Không phải chứng từ nhập/xuất. |
| `campaigns`, `hubs` | Mẫu collection và giao diện dữ liệu minh họa | Nguồn chiến dịch/kho vận hành thật. |
| `firestore.rules` | Đã deploy riêng lên `reshare-13234` ngày 2026-10-02; CLI báo biên dịch và release thành công | `warehouse_admin` tạm bị chặn với `donations`; `system_admin` được đọc/sửa nhưng chưa giới hạn trường/trạng thái. Cần nguồn phân công kho tin cậy trước khi mở quyền nhân viên kho. |

### `donations/{id}` hiện có

Model iOS `DonationItem` dùng: `id`, `donorId`, `title`, `description`, `category`, `condition`, `status`, `imageUrl?`, `images?`, `imageProvider?`, `imagePublicIds?`, `createdAt`, `statusNote?`, `campaignId?`, `hubId?`, `deliveryMethod?`, `confirmationCode?`.

- `category`: `clothing | books | household`. `condition`: `new | like_new | good | fair`.
- `status`: `pending | approved | received | in_stock | distributed | rejected`.
- Tên trường là `title`, không phải `itemTitle` trong bản tài liệu cũ. App ưu tiên ảnh đầu từ `images`, sau đó mới dùng `imageUrl`. `campaignId` có thể vắng mặt.
- `hubId` hiện là **điểm dự kiến/demo do app chọn**. Không suy ra hàng đã ở kho từ `hubId`, `approved` hay `received`.
- Donor chỉ tạo document `pending`; retry cùng ID dùng transaction: nếu document đã tồn tại với cùng chủ, tiêu đề và bộ ảnh thì coi là thành công, không ghi đè trạng thái mới. `system_admin` có thể cập nhật; xóa đơn bằng client bị chặn. `warehouse_admin` chưa được đọc/sửa đơn cho đến khi có kiểm tra kho được phân công. Rules này đã deploy lên `reshare-13234`.
- Luồng mới trên iOS chuẩn bị upload Cloudinary loại `authenticated`, rồi ghi `imageProvider = "cloudinary"` và `imagePublicIds[]` vào đơn; **không lưu URL ảnh quyên góp vào Firestore**. Màn lịch sử xin URL xem ảnh tạm thời từ backend. Bài cũ có `images[]`/`imageUrl` vẫn đọc được.
- `GoogleService-Info.plist` còn khai báo bucket Firebase Storage, nhưng project `reshare-13234` hiện chưa có Storage hoạt động: Firebase Console ngày 2026-10-02 chỉ hiện “Upgrade project”. `StorageService.swift` cũ vẫn trong repo để có thể chuyển về sau; luồng gửi đơn mới không gọi nó. Chủ dự án đã cung cấp Cloudinary Cloud name `c9ide1cv`. API signer Node.js đã deploy trên Render tại `https://reshare-ios-capstone1-1.onrender.com`; `/health` trả `{"status":"ok"}`. Bản iPhone build ngày 2026-10-02 04:35 không chứa khóa custom `RESHARE_IMAGE_API_BASE_URL` trong Info.plist dù project có `INFOPLIST_KEY_` tương ứng; iOS hiện dùng URL Render này làm mặc định khi khóa vắng mặt. Chủ dự án xác nhận đã thêm Secret File Firebase và biến `GOOGLE_APPLICATION_CREDENTIALS` trên Render, nhưng **upload thật vẫn chưa được xác minh** bằng tài khoản đăng nhập và thao tác trên điện thoại.
- **Chưa có** trường số lượng/đơn vị khai báo trong model. Cần chốt contract trước khi bổ sung.

### P2P hiện có

- `catalog_items/{id}`: `donorId`, `title`, `category`, `condition`, `district`, `imageUrl?`, `images?`, `imageProvider?`, `imagePublicIds?`, `status` (`available | reserved | completed`) và các trường giữ đồ/bàn giao. Bài P2P mới cần 3–6 ảnh: upload Cloudinary loại `upload` (công khai), lưu URL vào `images[]`, giữ `imageUrl` là ảnh đầu và `imagePublicIds[]` để quản lý tài sản. Bài cũ chỉ có `imageUrl` hoặc `imageBase64` vẫn đọc được. Kiểm định UV-C và `hubId` trong tài liệu cũ không thuộc contract P2P.
- `conversations/{id}` chứa hai người tham gia, tin nhắn, trạng thái hẹn và thời điểm đọc. Đồ P2P không tự chuyển sang tồn kho khi hoàn tất bàn giao.
- Rules mới không cho client gửi tin có `senderId = "system"` hoặc `messageType = "system"`; thông báo thao tác do app tạo mang UID của người thực hiện. Mỗi người chỉ cập nhật `lastReadTimes` của mình. Thao tác từ chối hẹn dùng batch, còn gửi tin/đề xuất đọc header bằng transaction để không ghi đè metadata cũ. Tin `system` đã có từ trước vẫn được app đọc; thông báo hệ thống đáng tin cậy trong tương lai phải phát từ backend.
- Nếu đội web làm kiểm duyệt P2P, đó là module bài đăng cộng đồng riêng; cần chốt với đội app trước khi thêm vào admin.

### API ảnh Cloudinary — mã server trong `backend/`, đã live trên Render

- App gửi Firebase ID token ở header `Authorization: Bearer <token>` tới HTTPS base URL cấu hình bằng `RESHARE_IMAGE_API_BASE_URL` trong Info.plist (Debug và Release). Backend xác minh token bằng Firebase Admin SDK, lấy UID từ token, kiểm tra quyền **trên từng request**. `cloud_name` và API key công khai chỉ nằm trong response ký; **API secret chỉ nằm trong secret store của backend**, không đưa vào iOS/Firestore/repository. Đã chọn Render Free để chạy Node.js API thay vì Firebase Functions cần Blaze; Render có thể khởi động chậm sau thời gian không hoạt động, nên iOS đặt timeout riêng 120 giây cho request backend. URL Render hiện là `https://reshare-ios-capstone1-1.onrender.com`.
- `POST /v1/images/upload-intents`: body `{ "purpose": "catalog_item" | "donation", "recordId": "<ID>", "clientImageId": "<UUID>" }`; trả JSON `{ "cloudName": "...", "apiKey": "...", "timestamp": 123, "signature": "...", "publicId": "catalog_items/<recordId>/<uuid>" | "donations/<recordId>/<uuid>", "deliveryType": "upload" | "authenticated" }`. Backend tạo và ký đúng các tham số Cloudinary gửi lên (`timestamp`, `public_id`, `type`, `overwrite=false`); không nhận chữ ký, đường dẫn hay loại truy cập do client tự quyết. Giới hạn tối đa 6 intent mỗi record và 60 intent mới mỗi UID/ngày UTC; intent lưu trong `image_upload_batches`, quota lưu trong `image_upload_quotas`. Với `donation`, chỉ dùng `authenticated`.
- iOS `POST https://api.cloudinary.com/v1_1/{cloudName}/image/upload` dạng multipart JPEG với `file`, `api_key`, `timestamp`, `signature`, `public_id`, `type`, `overwrite=false`; kiểm tra `public_id`, `type`, HTTPS URL trong response. App xin chữ ký từng ảnh theo thứ tự, sau đó upload tối đa 3 ảnh cùng lúc và trả kết quả theo thứ tự ảnh gốc. Sau khi toàn bộ ảnh thành công mới ghi Firestore; nếu một ảnh lỗi, app chờ các upload cùng đợt kết thúc rồi gọi cleanup mọi ảnh đã tải thành công. Rules đã deploy yêu cầu 3–6 `imagePublicIds` khác nhau, thuộc batch do server cấp cho đúng UID trước khi tạo đơn/bài Cloudinary. Backend xác nhận tài sản thuộc intent/UID trước khi cấp quyền xem hoặc xóa. Lỗi upload không tạo document thành công giả.
- `POST /v1/images/cleanup`: body `{ "purpose": "catalog_item" | "donation", "recordId": "<ID>", "publicIds": ["..."] }`; trả `{}`. Chỉ chủ intent được xóa ảnh **chưa gắn với document đã hoàn tất**; kiểm tra từng `publicId`, từ chối ID ngoài phạm vi. Backend phải quét/xóa intent hoặc ảnh mồ côi sau timeout, kể cả trường hợp app thoát giữa chừng hoặc Cloudinary upload thành công nhưng app mất response. Khi người dùng hủy đơn đang soạn, iOS gọi API này.
- `POST /v1/images/read-access`: body `{ "donationId": "<ID>", "publicId": "donations/<ID>/<uuid>" }`; trả `{ "url": "https://..." }`. Backend lấy đơn từ Firestore, xác minh asset thuộc đơn và người gọi là donor của đơn hoặc nhân sự có quyền trên kho của đơn; sau đó cấp **URL tải có hạn ngắn** cho tài sản `authenticated` (ví dụ Cloudinary `private_download_url` với `expires_at`). Không cấp URL ký thông thường không thời hạn. URL tạm không lưu trong Firestore, cache hoặc log; phía web admin dùng cùng kiểm tra quyền. Lưu ý link tạm là bearer URL, người có link có thể xem đến khi hết hạn.
- Lỗi API: `401` token không hợp lệ; `403` không có quyền; `413` request vượt giới hạn; mã `5xx` lỗi server. JSON lỗi có thể kèm `{ "message": "..." }`, nhưng iOS hiện hiển thị thông báo theo HTTP status. Phản hồi thành công phải đúng camelCase trên. Đã biết Cloud name `c9ide1cv` và URL backend; **chưa thể xác nhận upload thật chỉ từ `/health`**. Không dùng unsigned upload preset cho ảnh quyên góp. `backend/README.md` ghi cách triển khai Render Free; mã hiện chưa có job tự dọn ảnh mồ côi khi app thoát đột ngột và chưa có giao dịch hoàn tất ảnh nguyên tử với Firestore.

## 3. Luồng quyên góp qua kho đã chốt

| Hành động | Điều kiện trước | Kết quả |
| --- | --- | --- |
| Donor gửi yêu cầu | Đã đăng nhập; dữ liệu/ảnh hợp lệ | Tạo `pending`; tồn kho chưa tăng. |
| Duyệt | `pending`, nhân sự có quyền với kho liên quan | `approved`, chờ bàn giao; tồn kho chưa tăng. |
| Từ chối | `pending`, nhân sự có quyền | `rejected`, lưu lý do nội bộ và phản hồi riêng cho donor. |
| Xác nhận thực nhận | `approved`, có bàn giao thật | Lưu số lượng/đơn vị/tình trạng thực nhận, kho thật, người nhận và thời điểm. |
| Nhập kho | Đã thực nhận, chưa nhập trước đó | Tạo vật phẩm kho và chứng từ nhập **một lần**; chỉ số lượng thực nhận được tính tồn. |
| Phân phối | Vật phẩm còn tồn, có bàn giao thật | Tạo chứng từ xuất, giảm tồn, ghi lịch sử hỗ trợ. Xuất một phần vẫn theo dõi số còn lại. |

`received` và `in_stock` đã tồn tại trong enum iOS. **Cần chốt** hai trạng thái này là hai bước quan sát được hay xác nhận nhận hàng + nhập kho là một giao dịch cho ra `in_stock`. Dù chọn cách nào, `approved` không làm tăng tồn. `distributed` chỉ áp dụng khi vật phẩm đã xuất hết; xuất một phần vẫn giữ số lượng còn lại.

Backend không nhận cập nhật `status` hoặc `quantity` tùy ý từ client. Hành động duyệt, nhập, xuất, điều chỉnh phải kiểm tra trạng thái trước, chống gửi lặp và ghi lịch sử.

## 4. Dữ liệu cần thiết kế cho Web Admin

Bảng này là **contract mục tiêu, chưa phải collection/API đã triển khai**. Tên collection, trường và cách truy vấn phải thống nhất trước khi code.

| Nhóm dữ liệu | Thông tin tối thiểu | Quy tắc |
| --- | --- | --- |
| Kho/trạm | ID ổn định, tên, địa chỉ/liên hệ đã xác minh, trạng thái hoạt động | Chỉ kho thật đang hoạt động mới được nhận đơn thật. |
| Quyền nhân sự | UID, vai trò, trạng thái, danh sách kho được phân công | Chỉ server đặc quyền cấp/thu hồi. Warehouse Admin chỉ thao tác các kho được giao. |
| Yêu cầu quyên góp | Donor, kho dự kiến, vật phẩm/ảnh, trạng thái, thời điểm, phản hồi cho donor | Kho dự kiến không thay thế kho thực lưu khi nhận hàng. Ghi chú nội bộ phải nằm ở document/collection riêng có quyền đọc khác. |
| Vật phẩm tồn kho | Đơn nguồn, kho thực lưu, tình trạng, số lượng thực nhận, đơn vị, số lượng còn, vị trí | Không tạo từ đơn P2P hoặc đơn chỉ mới được duyệt. |
| Chứng từ nhập/xuất/điều chỉnh | ID thao tác, loại, vật phẩm, kho, số lượng, đơn vị, người làm, thời điểm server, lý do/nguồn | Không xóa lịch sử để sửa tồn; tạo điều chỉnh có lý do. |
| Phân phối và người thụ hưởng | Người nhận/hồ sơ hỗ trợ, số lượng, ngày bàn giao, người thực hiện | Hồ sơ thụ hưởng không mặc định là tài khoản đăng nhập; chỉ thu dữ liệu cần thiết. |
| Bài đăng từ kho | Vật phẩm nguồn, nội dung công khai, trạng thái đăng | Không lộ ghi chú nội bộ, hồ sơ thụ hưởng hoặc vị trí kệ. |
| Nhật ký | Người làm, hành động, đối tượng, kho, thời điểm server, lý do/thay đổi cần truy vết | Ghi ở lớp tin cậy cùng nghiệp vụ quan trọng. |

`inventory`, chứng từ, người thụ hưởng, phân phối và audit chưa có model/collection tương ứng trong repository. **Cần chốt** giới hạn MVP: một đơn chứa một loại vật phẩm và chỉ tiếp nhận một lần, hay cho phép nhiều loại/nhiều đợt.

## 5. Phân quyền và tính nhất quán

- **Đã chốt:** System Admin xem toàn hệ thống hoặc từng kho; Warehouse Admin chỉ xem/sửa kho được phân công. “Tất cả kho” dùng để xem, tìm và báo cáo; mọi lệnh nhập/xuất phải chỉ rõ một kho. Hiện chưa có nguồn phân công kho đáng tin cậy nên Rules local **tạm từ chối mọi quyền của Warehouse Admin với `donations`**; cần triển khai BE phân quyền trước khi mở lại.
- Người dùng không tự cấp vai trò nhân sự. Không tin `role`, danh sách kho, `donorId` hoặc mã kho từ client khi chúng quyết định quyền. Vai trò đặc quyền phải đến từ nguồn cấp tin cậy phía server; từng tác vụ kiểm tra lại vai trò, kho, đối tượng và trạng thái.
- Firestore/Storage Rules bảo vệ truy cập SDK. Cloud Functions/server dùng Admin SDK phải tự xác thực và phân quyền vì Admin SDK không chịu Firestore Security Rules. Không đưa khóa service account vào Vue hoặc iOS.
- Firestore Rules cấp quyền đọc theo **document**, không ẩn riêng một field trong document đã đọc được. Vì donor được đọc đơn của mình, không đặt ghi chú nội bộ hoặc dữ liệu người thụ hưởng trong chính document `donations/{id}` mà donor đọc; tách sang document/collection riêng với Rules phù hợp.
- Thay đổi tồn cần chạy ở lớp tin cậy, kiểm tra trạng thái và số lượng trong transaction, đồng thời ghi chứng từ/lịch sử. ID thao tác ổn định giúp retry không tạo thêm nhập/xuất. Trả lỗi rõ cho sai quyền, sai kho, trạng thái đã đổi, thao tác trùng và không đủ tồn.
- Thu hồi quyền phải xét phiên/token cũ; xác thực nhiều yếu tố cho nhân sự đặc quyền cần chốt trước khi mở cổng online. File `firestore.rules` hiện chưa đáp ứng quyền theo kho cho `donations`; ẩn menu trên web không thay thế kiểm tra quyền.

## 6. Quyết định cần chốt giữa app, backend và web

1. Donor chọn kho **đã xác minh** trên app hay nhân sự phân công sau khi gửi? Nếu phân công sau, app không được hứa địa điểm tiếp nhận trước khi xác nhận.
2. Kho thực nhận có thể khác kho dự kiến không; ai được đổi và donor nhận thông báo gì?
3. Donor khai báo số lượng/đơn vị ra sao; nhân sự xác nhận số thực nhận theo đơn vị nào?
4. `received` và `in_stock` là một hay hai bước trong MVP; thời điểm tăng tồn chính xác là khi nào?
5. Nguồn cấp vai trò, phân công kho, cách thu hồi quyền và phiên nhân sự.
6. Giới hạn một đơn/một loại/một lần nhận hay hỗ trợ nhiều loại/nhiều đợt.
7. Kho và chiến dịch nào đã hoạt động thật trước khi bỏ nhãn demo trên app/web.

## 7. Tiêu chí nghiệm thu backend khi triển khai

- Donor gửi đơn, web thấy `pending`; duyệt không tăng tồn; chỉ nhập kho với số thực nhận mới tăng tồn.
- Nhập cùng đơn hai lần không tạo hai bản ghi/chứng từ; gửi lại sau mất mạng không tạo thêm tác vụ.
- Xuất vượt tồn bị từ chối; xuất một phần giữ số lượng còn; chứng từ và lịch sử khớp tồn.
- Donor, nhân sự sai vai trò hoặc sai kho bị chặn tại backend/Rules kể cả khi gọi API trực tiếp.
- Hai nhân sự thao tác đồng thời không duyệt/nhập/xuất trùng; donor thấy phản hồi phù hợp nhưng không thấy ghi chú nội bộ.
- Dữ liệu demo không được hiển thị như trạm tiếp nhận đang hoạt động.

## Tài liệu Firebase tham chiếu

- [Client SDK dùng Firestore Rules; server SDK dùng IAM và bỏ qua Rules](https://firebase.google.com/docs/firestore/security/overview).
- [Firestore Rules không thể ẩn từng field khi document đã được đọc](https://firebase.google.com/docs/firestore/security/rules-fields).
- [Custom Claims chỉ được cấp từ server đặc quyền](https://firebase.google.com/docs/auth/admin/custom-claims).
