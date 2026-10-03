<script setup>
import { computed } from 'vue'

const props = defineProps({
  person: { type: Object, required: true },
})

const emit = defineEmits(['back'])
const roleName = computed(() => props.person.role === 'system_admin' ? 'System Admin' : 'Warehouse Admin')
const accessScope = computed(() => {
  if (props.person.role === 'system_admin') return 'Toàn hệ thống'
  return props.person.warehouses?.length ? props.person.warehouses.join(', ') : 'Chưa gán kho'
})
const accountStatus = computed(() => props.person.status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa')
</script>

<template>
  <div class="staff-detail-page">
    <div class="detail-toolbar">
      <div class="breadcrumbs"><i class="fa-solid fa-user-gear breadcrumbs__icon" aria-hidden="true"></i><strong>Nhân sự &amp; quyền</strong><span>/</span><b>Chi tiết nhân sự</b></div>
      <button class="detail-back" @click="emit('back')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Quay lại danh sách</button>
    </div>

    <section class="detail-hero">
      <div class="detail-hero__main">
        <div class="detail-hero__eyebrow">
          <span class="detail-tag detail-tag--scope"><i class="fa-solid fa-earth-asia" aria-hidden="true"></i> PHẠM VI: {{ person.role === 'system_admin' ? 'TOÀN HỆ THỐNG' : 'THEO KHO ĐƯỢC GÁN' }}</span>
          <span class="detail-tag detail-tag--profile"><i class="fa-solid fa-id-card" aria-hidden="true"></i> HỒ SƠ NHÂN SỰ QUẢN TRỊ</span>
          <span class="detail-tag detail-tag--approval">Chế độ kiểm duyệt</span>
        </div>
        <h1>Chi tiết nhân sự</h1>
        <p>Xem quyền quản trị và phạm vi kho được phân công trong hệ thống vận hành ReShare.</p>
      </div>
      <div class="detail-hero__status">
        <span>TRẠNG THÁI HỒ SƠ</span>
        <strong>{{ accountStatus }}</strong>
        <i class="fa-solid detail-status-icon" :class="person.status === 'active' ? 'fa-circle-check detail-status-icon--active' : 'fa-circle-minus detail-status-icon--inactive'" aria-hidden="true"></i>
      </div>
    </section>

    <div class="detail-layout">
      <div class="detail-main-column">
        <section class="detail-access-panel">
          <div class="access-panel__heading">
            <span class="access-panel__icon"><i class="fa-solid fa-user-shield" aria-hidden="true"></i></span>
            <div class="access-panel__title"><h2>Vai trò và phạm vi truy cập <i class="fa-solid fa-circle" aria-hidden="true"></i></h2><p>Quyền truy cập được áp dụng theo vai trò và kho được phân công.</p></div>
            <span class="authority-tag"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Cấp thẩm quyền</span>
          </div>
          <div class="access-values">
            <article class="access-value"><span>VAI TRÒ QUẢN TRỊ <i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><strong>{{ roleName }}</strong><small>{{ person.role === 'system_admin' ? 'Quản lý toàn bộ hệ thống' : 'Quản lý nghiệp vụ tại kho được phân công' }}</small></article>
            <article class="access-value"><span>KHO ĐƯỢC PHÂN CÔNG <i class="fa-solid fa-warehouse" aria-hidden="true"></i></span><strong>{{ accessScope }}</strong><small>{{ person.role === 'system_admin' ? 'Phạm vi áp dụng toàn hệ thống' : 'Kho được gán để xử lý tác vụ' }}</small></article>
          </div>
          <div class="access-action-panel">
            <p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Đang xem quyền của {{ person.name }}</p>
            <div class="access-actions">
              <button type="button"><i class="fa-solid fa-user-minus" aria-hidden="true"></i> Thu hồi quyền admin</button>
              <button type="button"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Chỉnh sửa quyền</button>
            </div>
          </div>
        </section>

        <section class="detail-account-panel">
          <div class="detail-section-heading">
            <span class="section-icon section-icon--blue"><i class="fa-regular fa-id-card" aria-hidden="true"></i></span>
            <div><h2>Thông tin tài khoản</h2><p>Thông tin định danh người dùng trong phân hệ quản trị</p></div>
            <span class="section-trailing">ĐỊNH DANH</span>
          </div>
          <div class="account-value-grid">
            <article><span>HỌ TÊN</span><strong>{{ person.name }}</strong><i class="fa-solid fa-user" aria-hidden="true"></i></article>
            <article><span>EMAIL</span><strong>{{ person.email }}</strong><i class="fa-regular fa-envelope" aria-hidden="true"></i></article>
            <article><span>MÃ TÀI KHOẢN</span><strong>{{ person.id }}</strong><i class="fa-solid fa-key" aria-hidden="true"></i></article>
            <article><span>TRẠNG THÁI QUYỀN ADMIN</span><strong>{{ accountStatus }}</strong><i class="fa-solid fa-lock" aria-hidden="true"></i></article>
          </div>
        </section>

        <section class="detail-history-panel">
          <div class="detail-section-heading">
            <span class="section-icon section-icon--blue"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span>
            <div><h2>Lịch sử thay đổi quyền</h2><p>Nhật ký kiểm toán truy cập bảo toàn tính toàn vẹn</p></div>
            <span class="history-count">0 bản ghi</span>
          </div>
          <div class="history-empty">
            <span class="history-empty__icon"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span>
            <strong>Chưa có thay đổi quyền để hiển thị</strong>
            <p>Các hoạt động phân công, thu hồi hoặc điều chỉnh phạm vi kho sẽ được lưu vết kiểm toán tại đây.</p>
          </div>
        </section>
      </div>

      <aside class="detail-side-column">
        <section class="policy-panel">
          <h2><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Quy chuẩn phân quyền</h2>
          <ul>
            <li><i class="fa-regular fa-circle-check" aria-hidden="true"></i><span>Mỗi tài khoản vận hành cần được liên kết tối thiểu một phạm vi kho cụ thể để xử lý tác vụ.</span></li>
            <li><i class="fa-regular fa-circle-check" aria-hidden="true"></i><span>Quyền System Admin cấp cao có thể bao quát toàn bộ cụm kho trên toàn quốc.</span></li>
            <li><i class="fa-regular fa-circle-check" aria-hidden="true"></i><span>Mọi thay đổi vai trò được ghi nhận bất biến vào nhật ký kiểm toán hệ thống.</span></li>
          </ul>
        </section>

        <section class="current-admin-panel">
          <h2>Tài khoản quản trị viên <i class="fa-solid fa-shield-halved" aria-hidden="true"></i></h2>
          <div class="current-admin-identity"><span>VA</span><div><strong>Nguyễn Văn An</strong><small>System Admin (Hiện tại)</small></div></div>
          <p>Bạn đang phiên làm việc với thẩm quyền tối cao. Hãy thận trọng khi tiến hành cấp hoặc thu hồi quyền truy cập đối với các điều phối viên kho.</p>
        </section>
      </aside>
    </div>
  </div>
</template>
