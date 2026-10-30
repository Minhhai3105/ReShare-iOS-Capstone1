# Deploy ReShare — kiến trúc chốt và checklist thao tác

Cập nhật: 30/10/2026. Áp dụng cho bản trình Hội đồng.

## Kiến trúc đã chốt

| Thành phần | Chạy ở | Ghi chú |
|---|---|---|
| Backend Node | **Render** — `https://reshare-ios-capstone1-1.onrender.com` | Giữ nguyên, không chuyển |
| Web Admin + Landing | **Cloudflare Pages** | Build từ `ReShare-Web/` |
| Core ML | **On-device trên iPhone** | Không deploy gì |
| Máy Windows ở nhà | **Dev/staging** | Không dùng làm production |

**Lý do không chuyển backend sang máy nhà:** iOS hardcode URL Render trong
`ReShare/ReShare.xcodeproj/project.pbxproj` (cả config Debug lẫn Release, key
`INFOPLIST_KEY_RESHARE_IMAGE_API_BASE_URL`). Đổi backend đi chỗ khác thì iOS phải
build lại — và `CloudinaryImageService.swift` còn có guard `scheme == "https"` nên
URL dạng `http://ip:port` bị từ chối ngay. Máy ở nhà cũng thêm failure mode không
xử lý được từ xa (mất điện, ISP, Windows Update reboot, sleep).

---

## 1. Chạy backend local (dev)

Backend **không có `dotenv`**, nên `npm start` KHÔNG đọc `backend/.env`.
Dùng script riêng:

```bash
npm --prefix backend run start:local
```

Script `start` (`node server.cjs`) để nguyên cho Render, vì Render inject env var
trực tiếp vào process chứ không có file `.env`.

Trên máy Windows, `GOOGLE_APPLICATION_CREDENTIALS` trong `.env` phải là đường dẫn
Windows, ví dụ `C:\reshare\firebase-service-account.json`.

Web local trỏ vào backend local qua `ReShare-Web/.env.local` (đã gitignore):

```
VITE_ADMIN_API_BASE_URL=http://localhost:3001
```

Không có file này thì web **fallback vào Render production** — dev tưởng đang test
local nhưng thực ra đang ghi vào dữ liệu thật.

---

## 2. Cloudflare Pages — cấu hình build

Settings → Build & deployments:

| Mục | Giá trị |
|---|---|
| Root directory | `ReShare-Web` |
| Build command | `npm run build` |
| Build output directory | `dist` |

Settings → Environment variables (**Production** và **Preview**):

| Biến | Giá trị | Bắt buộc? |
|---|---|---|
| `NODE_VERSION` | `22` | **Có** — Vite 8 cần Node ≥ 20.19/22.12, default của Cloudflare thấp hơn sẽ fail build |
| `VITE_ADMIN_API_BASE_URL` | `https://reshare-ios-capstone1-1.onrender.com` | **Có** — thiếu thì fallback đúng URL này, nhưng set tường minh để sau đổi không phải sửa code |
| `PUBLIC_SITE_URL` | origin thật của site, vd `https://reshare.pages.dev` | Nên — thiếu thì og-image là path tương đối, share link không hiện ảnh |
| `VITE_CONTACT_API_URL` | `https://reshare-ios-capstone1-1.onrender.com/v1/contact` | Nên — thiếu thì form liên hệ ở landing bị disable trên production |

**Lưu ý:** Vite inline các biến `VITE_*` lúc **build**, không phải runtime. Đổi
biến xong **phải trigger redeploy**, F5 không đủ.

Cloudflare Pages mặc định phục vụ SPA khi build không có `404.html` ở gốc.
`ReShare-Web/public/_redirects` giới hạn rewrite cho `/admin` và `/admin/*`;
không dùng `/*` vì quy tắc đó cũng khớp URL của JS, CSS và ảnh. Sau khi deploy,
cần thử F5 ở `/admin/login` trên URL Pages thật.

---

## 3. Firebase — Authorized domains (thao tác tay)

Thiếu bước này thì **không đăng nhập được**, dù code đúng.

1. Vào [Firebase Console](https://console.firebase.google.com) → project `reshare-13234`
2. **Authentication** → tab **Settings** → **Authorized domains**
3. **Add domain**, thêm cả hai:
   - `<tên-project>.pages.dev`
   - domain riêng, nếu có

Cloudflare Pages còn sinh preview URL dạng `<hash>.<project>.pages.dev` cho mỗi
branch. Các URL đó **không** được authorized bởi entry `<project>.pages.dev`, nên
login ở preview deploy sẽ fail — đây là hành vi bình thường, test login trên
production URL.

---

## 4. Render — biến môi trường (thao tác tay)

Render Dashboard → service backend → **Environment**:

| Biến | Giá trị |
|---|---|
| `ADMIN_WEB_ORIGINS` | origin Cloudflare, **không có dấu `/` cuối**, nhiều origin thì phẩy phân cách |
| `CONTACT_ALLOWED_ORIGIN` | cùng origin đó, nếu muốn form liên hệ chạy |

Ví dụ: `ADMIN_WEB_ORIGINS=https://reshare.pages.dev`

Sai hoặc thiếu → mọi call `/v1/admin/*` trả **403 `Origin is not allowed`**.
Origin phải khớp **chính xác** (scheme + host + port), không phải wildcard.

`http://localhost:*` và `http://127.0.0.1:*` đã được backend tự cho phép sẵn
(regex trong `server.cjs`), không cần thêm vào biến này khi dev.

Sửa env trên Render sẽ **tự redeploy**.

---

## 5. UptimeRobot — chống cold start (thao tác tay)

Render free tier spin-down sau ~15 phút idle; đo thực tế cold start **22.5 giây**.

1. Tạo account free ở [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor**
   - Monitor Type: `HTTP(s)`
   - URL: `https://reshare-ios-capstone1-1.onrender.com/health`
   - Monitoring Interval: **5 minutes**
3. Bật email alert

Được 2 trong 1: giữ backend thức + cảnh báo khi nó chết.

Đừng dùng GitHub Actions `schedule` cho việc này — delay bất định và tự disable
sau 60 ngày repo không hoạt động.

---

## Checklist ngày bảo vệ Hội đồng

**Trước 48h:**
- [ ] Freeze code, không deploy gì mới
- [ ] Chạy end-to-end thật một lượt: iOS tạo donation → admin duyệt → phân kho → xuất kho → báo cáo
- [ ] Quay **video demo full luồng** để backup — nếu mạng hội trường sập thì đây là thứ duy nhất cứu được
- [ ] Kiểm tra UptimeRobot không báo downtime trong 24h qua

**Trước 30 phút:**
- [ ] Mở `https://reshare-ios-capstone1-1.onrender.com/health` → phải thấy `{"status":"ok"}` ngay, không chờ
- [ ] Đăng nhập sẵn web admin, để tab mở
- [ ] iPhone: bật app, kiểm tra đã login
- [ ] **Bật hotspot 4G riêng**, đừng tin wifi hội trường

**Mức bằng chứng — đừng báo Done sớm:** build pass ≠ luồng chạy đúng; test local
≠ production hoạt động. Xem `CLAUDE.md` mục "Phân biệt mức bằng chứng".
