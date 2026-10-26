<script setup>
import { computed } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'
import logoUrl from '../auth/assets/reshare-logo.png'
import { currentUser, staffAssignment } from '../auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE, USER_ROLE_LABEL } from '../auth/auth.constants'

const props = defineProps({
  warehouses: { type: Array, default: () => [] },
  selectedWarehouseId: { type: String, default: '' },
})
const emit = defineEmits(['select-warehouse'])

const NAV = [
  { label: 'Tổng quan', icon: 'dashboard', to: { name: ADMIN_ROUTE.home } },
  { label: 'Yêu cầu quyên góp', icon: 'heart-handshake', to: { name: ADMIN_ROUTE.donationQueue } },
  { label: 'Kho hàng', icon: 'archive', to: { name: ADMIN_ROUTE.inventory }, active: true },
  { label: 'Người thụ hưởng', icon: 'users' },
  { label: 'Báo cáo', icon: 'chart' },
  { label: 'Nhật ký', icon: 'scroll' },
]

const isSystemAdmin = computed(() => staffAssignment.value?.role === USER_ROLE.systemAdmin)
const roleLabel = computed(() => {
  const role = staffAssignment.value?.role
  return role ? `${USER_ROLE_LABEL[role]} (${isSystemAdmin.value ? 'System' : 'Warehouse'} Admin)` : ''
})
const selectedWarehouse = computed(() => props.warehouses.find(({ id }) => id === props.selectedWarehouseId))
const currentYear = new Date().getFullYear()
</script>

<template>
  <div class="inv">
    <aside class="inv-sidebar">
      <div class="inv-brand">
        <img :src="logoUrl" alt="" />
        <div><strong>ReShare Portal</strong><small>Hệ thống điều phối vận hành</small></div>
      </div>

      <div class="inv-workplace">
        <div class="inv-workplace__top">
          <span><AuthIcon name="warehouse" :size="15" />Kho làm việc</span>
          <span class="inv-chip inv-chip--green">Demo</span>
        </div>
        <select
          v-if="warehouses.length > 1"
          :value="selectedWarehouseId"
          aria-label="Chọn kho làm việc"
          @change="emit('select-warehouse', $event.target.value)"
        >
          <option v-if="isSystemAdmin" value="">Tất cả kho</option>
          <option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
        </select>
        <strong v-else>{{ warehouses[0]?.name ?? '—' }}</strong>
        <small>{{ selectedWarehouse?.area || 'Toàn bộ kho được phân quyền' }}</small>
        <span class="inv-live"><i />Đang thao tác tại kho</span>
      </div>

      <nav aria-label="Điều hướng quản trị">
        <p class="inv-nav-group">Vận hành kho &amp; xử lý</p>
        <template v-for="item in NAV" :key="item.label">
          <RouterLink v-if="item.to" :to="item.to" class="inv-nav" :class="{ 'is-active': item.active }">
            <AuthIcon :name="item.icon" :size="19" />{{ item.label }}
          </RouterLink>
          <span v-else class="inv-nav is-disabled"><AuthIcon :name="item.icon" :size="19" />{{ item.label }}</span>
        </template>
        <p class="inv-nav-group">Quản trị hệ thống</p>
        <RouterLink v-if="isSystemAdmin" :to="{ name: ADMIN_ROUTE.staff }" class="inv-nav">
          <AuthIcon name="users" :size="19" />Nhân sự &amp; Phân quyền
        </RouterLink>
        <span v-else class="inv-nav is-disabled"><AuthIcon name="users" :size="19" />Nhân sự &amp; Phân quyền</span>
        <span class="inv-nav is-disabled"><AuthIcon name="settings" :size="19" />Cấu hình chung</span>
      </nav>

      <div class="inv-station"><span><AuthIcon name="terminal" :size="15" />WH-SGN-02</span><span class="inv-chip inv-chip--green"><i />Online</span></div>
    </aside>

    <div class="inv-main">
      <header class="inv-topbar">
        <div class="inv-search"><AuthIcon name="search" :size="18" />Tìm kiện hàng, mã đơn, vật phẩm...<kbd>⌘K</kbd></div>
        <div class="inv-shift"><AuthIcon name="clock" :size="18" />Ca trực:<b>Sáng (08:00 - 16:30)</b></div>
        <span class="inv-bell"><AuthIcon name="bell" :size="20" /><i /></span>
        <div class="inv-user">
          <span><b>{{ currentUser?.displayName }}</b><small>{{ roleLabel }}</small></span>
          <span class="inv-avatar"><AuthIcon name="user" :size="18" /></span>
        </div>
      </header>

      <main class="inv-content"><slot /></main>

      <footer class="inv-footer">
        <span><i />Hệ thống máy chủ: Sẵn sàng</span>
        <span>© {{ currentYear }} ReShare Circular Fashion Hub. Hệ thống điều phối nội bộ.</span>
        <span>Trung tâm trợ giúp vận hành</span>
        <span>Chính sách an toàn kho</span>
      </footer>
    </div>
  </div>
</template>

<style>
/* Style dùng chung cho các màn kho hàng (tiền tố inv-). */
.inv {
  --inv-green: #1f6b2c;
  --inv-green-soft: #c9f2c9;
  --inv-accent: #eef1fb;
  --inv-bg: #f7f8fd;
  --inv-border: #e1e5ee;
  --inv-text: #1c2331;
  --inv-muted: #4b5464;
  --inv-faint: #7b8392;
  --inv-danger: #c62828;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--inv-bg);
  color: var(--inv-text);
  font-family: 'Be Vietnam Pro', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
}
.inv *, .inv *::before, .inv *::after { box-sizing: border-box; }
:where(.inv) :where(h1, h2, h3, p, dl, dd, ul) { margin: 0; }
:where(.inv) :where(button, input, select) { font: inherit; color: inherit; }
.inv .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.inv i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--inv-green); flex-shrink: 0; }

.inv-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 18px; padding: 20px 16px; background: #fff; border-right: 1px solid var(--inv-border); overflow-y: auto; }
.inv-brand { display: flex; align-items: center; gap: 12px; }
.inv-brand img { width: 40px; height: 40px; }
.inv-brand strong { display: block; font-size: 20px; color: var(--inv-green); line-height: 1.2; }
.inv-brand small { color: var(--inv-muted); font-size: 13px; }
.inv-workplace { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 12px; background: var(--inv-bg); }
.inv-workplace__top { display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.inv-workplace__top span:first-child { display: inline-flex; gap: 6px; align-items: center; }
.inv-workplace strong, .inv-workplace select { font-size: 17px; font-weight: 600; }
.inv-workplace select { padding: 4px 6px; border: 1px solid var(--inv-border); border-radius: 8px; background: #fff; }
.inv-workplace small { color: var(--inv-muted); }
.inv-live { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: var(--inv-green); }
.inv-nav-group { margin-top: 10px !important; padding: 0 10px 6px; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--inv-muted); }
.inv-nav { display: flex; align-items: center; gap: 14px; min-height: 46px; padding: 0 14px; border-radius: 10px; color: var(--inv-text); text-decoration: none; font-size: 16px; }
.inv-nav:hover:not(.is-disabled) { background: var(--inv-accent); }
.inv-nav.is-active { background: var(--inv-green); color: #fff; font-weight: 600; }
.inv-nav.is-disabled { color: var(--inv-faint); cursor: not-allowed; }
.inv-station { margin-top: auto; display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 10px; background: var(--inv-accent); font-family: 'JetBrains Mono', monospace; font-size: 14px; }
.inv-station span:first-child { display: inline-flex; gap: 8px; align-items: center; }

.inv-main { display: flex; flex-direction: column; min-width: 0; }
.inv-topbar { display: flex; align-items: center; gap: 18px; padding: 14px 28px; background: #fff; border-bottom: 1px solid var(--inv-border); }
.inv-search { flex: 1; display: flex; align-items: center; gap: 10px; max-width: 520px; padding: 10px 14px; border-radius: 10px; background: var(--inv-bg); color: var(--inv-faint); }
.inv-search kbd { margin-left: auto; padding: 2px 8px; border-radius: 6px; background: var(--inv-accent); font-size: 12px; }
.inv-shift { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: var(--inv-accent); font-size: 14px; }
.inv-shift b { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
.inv-bell { position: relative; display: grid; color: var(--inv-muted); }
.inv-bell i { position: absolute; top: -2px; right: -2px; background: var(--inv-danger); }
.inv-user { display: flex; align-items: center; gap: 12px; margin-left: auto; text-align: right; }
.inv-user b { display: block; font-size: 17px; }
.inv-user small { font-size: 13px; color: var(--inv-muted); }
.inv-avatar { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--inv-green); color: #fff; }
.inv-content { flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 28px 32px; }
.inv-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px 24px; padding: 18px 28px; background: var(--inv-accent); font-size: 14px; font-weight: 500; color: var(--inv-muted); }
.inv-footer span:first-child { display: inline-flex; align-items: center; gap: 8px; color: var(--inv-text); }

/* Thành phần dùng chung */
.inv-card { padding: 24px; border-radius: 16px; background: #fff; box-shadow: 0 1px 3px rgb(28 35 49 / 0.06); }
.inv-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; background: var(--inv-accent); font-size: 13px; font-weight: 600; color: var(--inv-muted); white-space: nowrap; }
.inv-chip--green { background: var(--inv-green-soft); color: var(--inv-green); }
.inv-chip--danger { background: #fdeceb; color: var(--inv-danger); }
.inv-chip--danger i { background: var(--inv-danger); }
.inv-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border: none; border-radius: 10px; background: var(--inv-accent); font-weight: 600; color: var(--inv-green); text-decoration: none; cursor: pointer; }
.inv-btn--primary { background: var(--inv-green); color: #fff; }
.inv-btn:disabled { cursor: not-allowed; opacity: 0.55; }
.inv-sandbox { display: flex; align-items: center; gap: 16px; padding: 18px 22px; border-radius: 14px; background: var(--inv-accent); }
.inv-sandbox > svg { flex-shrink: 0; color: var(--inv-green); }
.inv-sandbox p { color: var(--inv-muted); }
.inv-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 56px 24px; text-align: center; }
.inv-state__icon { display: grid; place-items: center; width: 88px; height: 88px; border-radius: 50%; background: var(--inv-accent); color: var(--inv-green); }
.inv-state h2 { font-size: 24px; }
.inv-state p { max-width: 540px; color: var(--inv-muted); }
.inv-state--danger .inv-state__icon { background: #fdeceb; color: var(--inv-danger); }
.inv-table { width: 100%; border-collapse: collapse; }
.inv-table th { padding: 16px 18px; background: var(--inv-accent); font-size: 14px; font-weight: 600; letter-spacing: 0.04em; text-align: left; text-transform: uppercase; color: var(--inv-muted); }
.inv-table td { padding: 14px 18px; border-bottom: 1px solid var(--inv-border); vertical-align: middle; }
.inv-table small { display: block; font-size: 13px; color: var(--inv-faint); }
.inv-rules { display: flex; flex-direction: column; gap: 16px; }
.inv-rules li { display: flex; gap: 12px; list-style: none; }
.inv-rules li > svg { flex-shrink: 0; margin-top: 3px; color: var(--inv-green); }
.inv-rules p { color: var(--inv-muted); }
.inv-rules strong { color: var(--inv-text); }

@media (max-width: 1100px) {
  .inv { grid-template-columns: 1fr; }
  .inv-sidebar { position: static; height: auto; }
  .inv-search, .inv-shift { display: none; }
}
</style>
