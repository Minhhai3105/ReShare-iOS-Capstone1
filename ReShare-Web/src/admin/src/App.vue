<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { staffRepository } from './features/staff/staffRepository.js'
import StaffDetail from './features/staff/StaffDetail.vue'
import StaffGrant from './features/staff/StaffGrant.vue'

const staff = ref([])
const isLoading = ref(true)
const loadError = ref('')
const showGrant = ref(false)
const staffRouteId = ref(getStaffRouteId())

const query = ref('')
const selectedRole = ref('all')
const selectedStatus = ref('all')
const searchInput = ref(null)
const filteredStaff = computed(() => staff.value.filter((person) => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase('vi')
  const matchesQuery = !normalizedQuery || `${person.name} ${person.email}`.toLocaleLowerCase('vi').includes(normalizedQuery)
  const matchesRole = selectedRole.value === 'all' || person.role === selectedRole.value
  const matchesStatus = selectedStatus.value === 'all' || person.status === selectedStatus.value
  return matchesQuery && matchesRole && matchesStatus
}))
const selectedStaff = computed(() => staff.value.find((person) => person.id === staffRouteId.value) || null)
const hasFilters = computed(() => Boolean(query.value.trim()) || selectedRole.value !== 'all' || selectedStatus.value !== 'all')

function getStaffRouteId() {
  const match = window.location.pathname.match(/^\/staff\/([^/]+)\/?$/)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function openStaff(person) {
  const nextPath = `/staff/${encodeURIComponent(person.id)}`
  window.history.pushState({ staffDetail: true }, '', nextPath)
  staffRouteId.value = person.id
}

function goBackToList() {
  if (window.history.state?.staffDetail) {
    window.history.back()
    return
  }

  window.history.replaceState({}, '', '/#')
  staffRouteId.value = ''
}

function navigateToStaffList() {
  showGrant.value = false
  staffRouteId.value = ''
  if (window.location.pathname !== '/') {
    window.history.pushState({}, '', '/#')
  }
}

function syncRoute() {
  staffRouteId.value = getStaffRouteId()
}

function clearFilters() {
  query.value = ''
  selectedRole.value = 'all'
  selectedStatus.value = 'all'
}

function roleLabel(role) {
  return role === 'system_admin' ? 'System Admin' : 'Warehouse Admin'
}

function statusLabel(status) {
  return status === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'
}

onMounted(async () => {
  window.addEventListener('popstate', syncRoute)
  try {
    staff.value = await staffRepository.list()
  } catch {
    loadError.value = 'Không thể tải danh sách nhân sự. Vui lòng thử lại.'
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => window.removeEventListener('popstate', syncRoute))
</script>

<template>
  <div class="admin-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="ReShare Ops Portal">
        <span class="brand__mark">R</span>
        <span class="brand__name">ReShare <small>PORTAL</small></span>
      </a>
      <div class="workspace"><strong>ReShare<br />Ops</strong><span>/</span><span>Công vận hành nội bộ</span></div>
      <button class="warehouse-switch"><i class="fa-solid fa-warehouse warehouse-switch__icon" aria-hidden="true"></i><span>Tất cả<br />kho</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
      <span class="environment"><i></i>Môi trường thử nghiệm</span>
      <label class="global-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input ref="searchInput" v-model="query" placeholder="Tìm kiếm nhân sự, email, kho phân công..." aria-label="Tìm kiếm nhân sự" /><kbd>⌘K</kbd></label>
      <button class="icon-button notification" aria-label="Thông báo"><i class="fa-solid fa-bell" aria-hidden="true"></i><i class="notification__dot"></i></button>
      <div class="user-menu"><span><strong>Nguyễn Văn An</strong><small>System Admin</small></span><span class="avatar avatar--solid">A</span></div>
    </header>

    <aside class="sidebar">
      <p class="nav-caption">VẬN HÀNH KHO &amp; XỬ LÝ</p>
      <a class="nav-item" href="#"><i class="fa-solid fa-table-columns" aria-hidden="true"></i>Tổng quan</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i>Yêu cầu quyên góp</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-warehouse" aria-hidden="true"></i>Kho hàng</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-people-group" aria-hidden="true"></i>Người thụ hưởng</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-chart-column" aria-hidden="true"></i>Báo cáo</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i>Nhật ký</a>
      <p class="nav-caption nav-caption--second">QUẢN TRỊ HỆ THỐNG</p>
      <a class="nav-item nav-item--active" href="/#" aria-current="page" @click.prevent="navigateToStaffList"><i class="fa-solid fa-user-gear" aria-hidden="true"></i>Nhân sự &amp; quyền</a>
      <a class="nav-item" href="#"><i class="fa-solid fa-gear" aria-hidden="true"></i>Cấu hình chung</a>
    </aside>

    <main class="page">
      <StaffGrant v-if="showGrant" @back="showGrant = false" />
      <div v-else-if="staffRouteId && isLoading" class="route-state"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang tải hồ sơ nhân sự...</div>
      <StaffDetail v-else-if="selectedStaff" :person="selectedStaff" @back="goBackToList" />
      <section v-else-if="staffRouteId" class="route-state route-state--error" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
        <h1>Không tìm thấy nhân sự</h1>
        <p>Không có hồ sơ với mã {{ staffRouteId }}.</p>
        <button class="detail-back" @click="goBackToList"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Quay lại danh sách</button>
      </section>
      <template v-else>
      <section class="page-heading">
        <div><h1>Nhân sự &amp; quyền</h1><p>Quản lý quyền quản trị và kho được phân công</p></div>
        <button class="primary-button" @click="showGrant = true"><i class="fa-solid fa-user-plus" aria-hidden="true"></i>Cấp quyền nhân sự</button>
      </section>

      <section class="filter-bar" aria-label="Tìm kiếm và lọc nhân sự">
        <label class="staff-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input v-model="query" placeholder="Tìm theo tên hoặc email" aria-label="Tìm theo tên hoặc email" /></label>
        <label class="select-wrap"><span class="sr-only">Lọc theo vai trò</span><select v-model="selectedRole"><option value="all">Tất cả vai trò</option><option value="system_admin">System Admin</option><option value="warehouse_admin">Warehouse Admin</option></select><span class="select-chevron">⌄</span></label>
        <label class="select-wrap"><span class="sr-only">Lọc theo trạng thái</span><select v-model="selectedStatus"><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Đã vô hiệu hóa</option></select><span class="select-chevron">⌄</span></label>
        <button class="clear-button" :disabled="!hasFilters" @click="clearFilters"><i class="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i>Xóa bộ lọc</button>
      </section>

      <section class="table-card" aria-label="Danh sách nhân sự quản trị">
        <div class="table-scroll">
          <table>
            <thead><tr><th>HỌ TÊN</th><th>EMAIL</th><th>VAI TRÒ</th><th>KHO ĐƯỢC PHÂN CÔNG</th><th>TRẠNG THÁI QUYỀN</th><th class="actions-heading">THAO TÁC</th></tr></thead>
            <tbody v-if="filteredStaff.length">
              <tr v-for="person in filteredStaff" :key="person.id">
                <td><div class="person-cell"><span class="avatar" :class="person.role === 'system_admin' ? 'avatar--green' : 'avatar--blue'">{{ person.name.split(' ').at(-1).charAt(0) }}</span><span><strong>{{ person.name }}</strong><small>{{ person.id }}</small></span></div></td>
                <td class="email-cell">{{ person.email }}</td>
                <td><span class="role-pill" :class="person.role === 'system_admin' ? 'role-pill--system' : 'role-pill--warehouse'"><i class="fa-solid" :class="person.role === 'system_admin' ? 'fa-shield-halved' : 'fa-warehouse'" aria-hidden="true"></i>{{ roleLabel(person.role) }}</span></td>
                <td><span v-if="person.role === 'system_admin'" class="scope-pill">Toàn hệ thống</span><span v-else class="warehouse-list">{{ person.warehouses.join(', ') }}</span></td>
                <td><span class="status-pill" :class="person.status === 'active' ? 'status-pill--active' : 'status-pill--inactive'"><i class="fa-solid" :class="person.status === 'active' ? 'fa-circle-check' : 'fa-circle-minus'" aria-hidden="true"></i>{{ statusLabel(person.status) }}</span></td>
                <td><button class="row-action" :aria-label="`Xem ${person.name}`" @click="openStaff(person)">Xem chi tiết <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="isLoading" class="empty-state">
            <div class="loading-indicator" aria-hidden="true"></div>
            <h2>Đang tải danh sách</h2>
          </div>
          <div v-else-if="loadError" class="empty-state" role="alert">
            <div class="empty-icon empty-icon--error"><span>!</span></div>
            <h2>Có lỗi xảy ra</h2>
            <p>{{ loadError }}</p>
          </div>
          <div v-else-if="!filteredStaff.length" class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-user-shield" aria-hidden="true"></i></div>
            <h2>{{ staff.length ? 'Chưa có nhân sự phù hợp' : 'Chưa có nhân sự được cấp quyền' }}</h2>
            <p>{{ staff.length ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.' : 'Cấp quyền quản trị cho tài khoản nhân sự để bắt đầu.' }}</p>
            <button v-if="hasFilters" class="empty-action" @click="clearFilters">↻ Xóa bộ lọc</button>
            <button v-else class="empty-action empty-action--green" @click="showGrant = true"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Cấp quyền nhân sự</button>
          </div>
        </div>
        <footer v-if="filteredStaff.length" class="table-footer"><span>Hiển thị <strong>{{ filteredStaff.length }}</strong> trong tổng số <strong>{{ staff.length }}</strong> nhân sự</span><div class="pagination"><button disabled aria-label="Trang trước">‹</button><button class="pagination__current" aria-current="page">1</button><button disabled aria-label="Trang sau">›</button></div></footer>
      </section>
      </template>
    </main>
  </div>
</template>
