# CLAUDE.md — Hướng dẫn cho AI agent làm việc trên ReShare

Đồ án Capstone 1 (C1SE.49). Monorepo 5 phần. Toàn bộ comment và tài liệu dùng tiếng Việt — giữ nguyên quy ước đó khi viết code mới.

## Bản đồ repo

| Phần | Đường dẫn | Stack |
|---|---|---|
| iOS app | `ReShare/ReShare/` | SwiftUI, MVVM nhẹ, async/await, Core ML |
| Web Admin | `ReShare-Web/src/admin/` | Vue 3 + Vite + vue-router (KHÔNG phải React) |
| Landing | `ReShare-Web/src/landing/` | Vue 3, cùng app, route `/` |
| Backend | `backend/` | Node `node:http` thuần + firebase-admin (KHÔNG dùng Express) |
| Firebase | `firestore.rules`, `firestore.indexes.json`, `tests/` | Firestore + Auth |
| AI | `AI-Model/`, model nhúng tại `ReShare/ReShare/ReShare_v8_baseline_01.mlmodel` | Create ML → Core ML |

`Document/`, `ai_instructions.md`, `.agents/` bị gitignore — là tài liệu/cấu hình riêng, không theo repo.

## Lệnh hay dùng

```bash
npm --prefix backend test
```

```bash
npm run test:rules:emulator
```

```bash
npm run test:all:emulator
```

```bash
npm --prefix ReShare-Web run build
```

- Backend test có 2 loại: `*.test.cjs` (unit, chạy trực tiếp) và `*.emulator.test.cjs` (cần Firestore Emulator, sẽ skip nếu không có).
- **Emulator cần Java 21+.** `firebase-tools` 15 từ chối chạy với Java thấp hơn ("no longer supports Java version before 21"). Máy hiện tại default là JDK 17 nên phải trỏ lại trước khi chạy: `export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`. Nếu không, lệnh emulator fail ngay mà không chạy test nào.
- CI ở `.github/workflows/ci.yml` chạy đúng các lệnh trên cho **mọi** pull request (không lọc nhánh đích, để PR stacked vào nhánh story cũng có check).
- Chạy backend local: `npm --prefix backend start` (cần `backend/.env`, xem `backend/.env.example`).
- Web dev: `npm --prefix ReShare-Web run dev`.
- iOS: build bằng Xcode. **Máy hiện tại chỉ có CommandLineTools, không có Xcode đầy đủ** → agent không build/chạy được iOS, phải nhờ người dùng chạy rồi gửi log.

## Kiến trúc: ranh giới tin cậy (quan trọng nhất — đừng phá)

Client **không bao giờ** được ghi quyết định nghiệp vụ. Mọi hành động thật đi qua backend Node với Admin SDK, sau khi verify Firebase ID token rồi tra `staff_assignments` để lấy vai trò + phạm vi kho.

Trong `firestore.rules`:
- `donations`: client chỉ `create` được đơn `status == 'pending'`, **bị cấm** kèm `warehouseId`/`warehouseName`; `allow update: if false`.
- `donation_reviews`: `read, write: if false` tuyệt đối (chứa internal note, tách khỏi dữ liệu donor thấy được).
- `receipts`: read-only theo phân công kho; mọi ghi qua API.
- **Không có match block** (⇒ client deny mặc định, chỉ Admin SDK chạm được): `inventory`, `inventory_movements`, `distribution_vouchers`, `beneficiaries`, `categories`, `staff_bootstrap`, `image_upload_batches`, `image_upload_quotas`.

Hệ quả: đừng bao giờ "sửa cho nhanh" bằng cách cho web client ghi trực tiếp Firestore. Nếu một rules test cũ mong client ghi được, sửa kỳ vọng của test thành *client bị từ chối* + mô phỏng ghi tin cậy qua Admin SDK.

Vai trò: `donor` (iOS) · `warehouse_admin` (chỉ đơn thuộc kho được giao) · `system_admin` (toàn hệ thống; là người duy nhất phân kho và quản lý nhân sự). `warehouseId` ≠ `hubId` — hub là điểm tiếp nhận hiển thị cho donor, warehouse là kho vận hành nội bộ.

## Endpoint backend

| Module | Endpoint |
|---|---|
| `image-api` | `POST /v1/images/upload-intents`, `/cleanup`, `/read-access` · `GET /health` |
| `staff-api` | `GET /v1/admin/staff`, `/warehouses`, `/staff/audit` · `POST /staff/lookup`, `/assign`, `/revoke` |
| `donation-review-api` | `GET /v1/admin/donations/:id`, `…/ai-summary` · `POST …/:id/decide`, `/confirm-category`, `/assign-warehouse` |
| `receipt-api` | `GET` + `POST /v1/admin/donations/:id/receipt` |
| `distribution-api` | `GET /v1/admin/distribution/options` · `GET` + `POST /v1/admin/distribution` |
| `reports-api` | `GET /v1/admin/reports` (timezone `Asia/Ho_Chi_Minh`) |
| `contact-api` | `POST` + `GET /v1/contact` |

`server.cjs` route theo prefix path, có allowlist origin (`ADMIN_WEB_ORIGINS`) và chặn body > 8KB (32KB cho `/v1/contact`).

Nhiều endpoint dùng **optimistic concurrency** qua `expectedVersion`. Khi thêm thao tác ghi mới lên donation, giữ nguyên pattern này — đừng để hai request đồng thời âm thầm ghi đè nhau.

## Ranh giới mock vs thật — đừng gọi mock là tính năng đã xong

Web Admin tách rõ bằng `import.meta.env.DEV`:
- **Route production (dữ liệu thật):** `/admin/login`, `/admin/staff`, `/admin/donations`, `/admin/donations/:id`, `/admin/donations/:id/receipt`, `/admin/distribution`, `/admin/reports`.
- **Route chỉ có trong DEV (fixture/mock, không có trong build production):** `*-preview` (`reports-preview`, `distribution-preview`, `receipt-preview`, `ai-review-preview`) và `/admin/warehouses/:wid/donations/:did`.
- Component dùng chung cho cả hai (`ReportScreen.vue`, `DonationDetail.vue`, `ActualReceipt.vue`, `DistributionForm.vue`) nhận repository/prop từ route. **Khi sửa, đừng làm rò mock sang nhánh live hoặc ngược lại.**
- `/admin` (`AdminHome.vue`) vẫn là trang tạm sau đăng nhập, chưa phải dashboard vận hành.

iOS còn mock: `DonationCampaign.mockCampaigns` hardcode trong Swift và danh sách `ReShareHub` hardcode trong `DonationDetailsView.swift` — `FirestoreService` chưa có hàm đọc `campaigns`/`hubs` dù rules đã mở sẵn hai collection đó.

## AI / Core ML

`CatalogCategoryClassifier.swift` load `ReShare_v8_baseline_01.mlmodel` qua Vision, chạy off main thread, phân 3 nhãn `books` / `clothing` / `household_items` (lưu xuống là `household`).

- Donation lưu `aiPredictedCategory`, `aiConfidence` (0–1), `aiModelVersion`, và `donorConfirmedCategory` riêng biệt.
- `firestore.rules` validate ngược: `aiModelVersion` phải đúng chuỗi `'ReShare_v8_baseline_01'`, confidence trong `[0,1]`, và 3 field AI phải có đủ hoặc không có field nào. **Đổi tên/phiên bản model là breaking change với rules** — phải sửa rules cùng lúc.
- Ngưỡng 60% chỉ điều khiển gợi ý trên UI, không phải độ chính xác đã hiệu chuẩn. Donor luôn phải tự xác nhận danh mục.
- `DonationCategoryConfirmView.swift` là **dead code** (chỉ tự tham chiếu trong `#Preview`); con số 94% trong đó là giá trị cứng, đừng dùng làm bằng chứng AI chạy.

## Quy trình Git

Theo `CONTRIBUTING.md`: nhánh từ `dev`, đặt tên `feat/…` hoặc `story/…`, PR về `dev`. **Cấm tự merge** — Hải review và gộp. Agent không commit/push/merge nếu người dùng không yêu cầu rõ. `main` là nhánh mặc định của repo nhưng `dev` là nhánh tích hợp.

## Quy tắc làm việc

1. Đọc file liên quan trước khi sửa. Nếu điểm cốt lõi còn mơ hồ, gom câu hỏi trong **một lượt** kèm mặc định đề xuất rồi chờ trả lời.
2. Nêu boundary và acceptance criteria trước khi đưa code. Chưa có tiêu chí nghiệm thu thì đề xuất rồi xin xác nhận.
3. **Chỉ sửa đúng scope.** Không dọn code xung quanh, không đổi tên/format toàn file, không xoá comment/TODO có sẵn. Bug ngoài phạm vi thì ghi chú cuối, không tự sửa.
4. Phải chạm thêm file thì liệt kê danh sách file ảnh hưởng trước.
5. Không tự thêm dependency, đổi framework, hay nâng version SDK. Cần thì giải thích và hỏi trước.
6. Bảo vệ thay đổi local chưa commit của người dùng/team. Không reset, không ghi đè.
7. Sau thay đổi đáng kể, tổng kết 3–5 dòng: **Ưu điểm · Nhược điểm/Risk · Bước tiếp theo**. iOS soi thêm retain cycle / main thread; Web+Backend soi security / race condition / performance.

## Phân biệt mức bằng chứng (đừng báo Done sớm)

Build pass ≠ luồng người dùng chạy đúng. Test local ≠ production hoạt động. PR `MERGEABLE` ≠ đạt acceptance criteria. Luôn tách rõ: **đã viết code** / **đã vào `dev`** / **đã test** / **đã deploy** / **đã chạy end-to-end** / **trạng thái Jira thực tế**.

Không để nút nhìn như dùng được nhưng bấm không phản hồi — tính năng chưa sẵn sàng thì phải nói rõ trên UI.

Gate trước khi merge vào `dev`: build + unit/API test + Firestore Rules Emulator + integration thật + trạng thái PR. Không merge chỉ vì không conflict.

## Bí mật

`backend/firebase-service-account.json`, `backend/.env` đã được gitignore — giữ nguyên như vậy. Không in secret ra chat, không mở `.env`/service account khi chia sẻ màn hình hay demo. Chỉ `.env.example` được commit.

## Tài liệu tham chiếu

- `Project-Docs/BAN_GIAO_CHO_AI_MOI.md` — bàn giao chi tiết (12/10/2026, cập nhật 21/10). **Là ghi chép theo thời điểm, không phải trạng thái hiện tại** — phải xác minh lại trước khi dùng để quyết định merge/deploy/Jira.
- `Document/ReShare_Jira_Import_2026_FIXED.csv` — nguồn acceptance criteria (thư mục bị gitignore).
- `AI-Model/README.md` — mô tả model v8 baseline và giới hạn.
