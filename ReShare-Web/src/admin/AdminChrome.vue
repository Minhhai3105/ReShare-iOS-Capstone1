<script setup lang="ts">
import AdminIcon from './AdminIcon.vue';
defineProps<{ screen: 'E' | 'F' | 'Q'; role: 'system_admin' | 'warehouse_admin' | 'viewer' }>();
const emit = defineEmits<{ navigate: [screen: 'E' | 'F' | 'Q']; role: [role: 'system_admin' | 'warehouse_admin' | 'viewer'] }>();
const menu = [
  { label: 'Tổng quan', icon: 'grid' }, { label: 'Yêu cầu quyên góp', icon: 'donation', screen: 'E' as const },
  { label: 'Kho hàng', icon: 'box' }, { label: 'Người thụ hưởng', icon: 'users' },
  { label: 'Báo cáo', icon: 'chart', screen: 'Q' as const }, { label: 'Nhật ký', icon: 'log' }
];
</script>

<template>
  <div class="admin-chrome">
    <aside class="ac-sidebar">
      <div class="ac-brand"><span>R</span><strong>ReShare</strong><small>PORTAL</small></div>
      <nav aria-label="Điều hướng quản trị">
        <div class="ac-group-label">VẬN HÀNH KHO &amp; XỬ LÝ</div>
        <button v-for="entry in menu" :key="entry.label" :disabled="!entry.screen" :class="['ac-nav-item', { active: entry.screen === (screen === 'Q' ? 'Q' : 'E') }]" :aria-current="entry.screen === (screen === 'Q' ? 'Q' : 'E') ? 'page' : undefined" @click="entry.screen && emit('navigate', entry.screen)"><AdminIcon :name="entry.icon" :size="19" />{{ entry.label }}</button>
        <div class="ac-group-label second">QUẢN TRỊ HỆ THỐNG</div>
        <button class="ac-nav-item" disabled><AdminIcon name="shield" :size="19" />Nhân sự &amp; Phân quyền</button>
        <button class="ac-nav-item" disabled><AdminIcon name="settings" :size="19" />Cấu hình chung</button>
      </nav>
      <div class="ac-station"><div>Bản xem thử RC1D-59</div><small>Không kết nối dữ liệu vận hành</small></div>
    </aside>
    <div class="ac-main">
      <header class="ac-topbar">
        <div class="ac-topbrand"><b>ReShare {{ screen === 'Q' ? 'Ops' : 'Portal' }}</b><small>{{ screen === 'Q' ? 'Cổng vận hành nội bộ' : 'Hệ thống điều phối vận hành' }}</small></div>
        <div class="ac-warehouse"><b>Kho demo Hải Châu <em>DEMO</em></b><small>Phạm vi mô phỏng</small></div>
        <div class="ac-search">Dữ liệu mẫu trong trình duyệt</div>
        <div class="ac-user"><span>Nguyễn Văn An<small>{{ role === 'warehouse_admin' ? 'Warehouse Admin' : role === 'viewer' ? 'Người xem' : 'System Admin' }}</small></span><span class="ac-avatar"><AdminIcon name="user" :size="17" /></span></div>
      </header>
      <main class="ac-content"><slot /><div class="ac-preview"><span>RC1D-59 · Preview dữ liệu mock</span><button @click="emit('navigate', 'E')">E · Chờ duyệt</button><button @click="emit('navigate', 'F')">F · Đã duyệt</button><button @click="emit('navigate', 'Q')">Q · Báo cáo</button><label>Vai trò: <select :value="role" @change="emit('role', ($event.target as HTMLSelectElement).value as 'system_admin' | 'warehouse_admin' | 'viewer')"><option value="system_admin">System Admin</option><option value="warehouse_admin">Warehouse Admin · Hải Châu</option><option value="viewer">Người xem</option></select></label></div></main>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.admin-chrome { position:relative; display:grid; grid-template-columns:256px minmax(0,1fr); min-height:100vh; background:#f8f9ff; color:#172334; font:14px/1.45 'Segoe UI',sans-serif; }
.ac-sidebar { background:#fff; min-height:800px; height:fit-content; padding:10px 12px 16px; display:flex; flex-direction:column; }
.ac-brand { height:68px; display:flex; align-items:center; gap:7px; padding:0 15px; color:#206427; }
.ac-brand span { display:grid;place-items:center;width:24px;height:24px;border-radius:5px;background:#298136;color:white;font-size:17px;font-weight:700; }
.ac-brand small { font-size:6px;background:#e7f5e7;padding:1px 3px; }
.ac-group-label { padding:17px 12px 8px;font-size:11px;letter-spacing:.5px;color:#677064;font-weight:700; }
.ac-group-label.second { margin-top:24px; }
.ac-nav-item { border:0;background:none;width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:10px 12px;height:40px;border-radius:8px;color:#455044;font-weight:600;cursor:pointer;font-size:14px;white-space:nowrap; }
.ac-nav-item.active { background:#1b5e24;color:#fff; }
.ac-station { background:#edf2ff;border-radius:8px;padding:12px;margin-top:285px;color:#465246;font-size:12px; }
.ac-station b { color:#20822e; }.ac-station strong {float:right;color:#267834}.ac-station small {display:block;margin-top:3px}
.ac-main { min-width:0; padding-top:68px; }.ac-topbar { position:absolute;top:0;left:152px;right:0;height:68px;display:flex;align-items:center;gap:20px;background:#fff;padding:0 22px; }
.ac-topbrand { width:115px;flex-shrink:0;line-height:1.2;color:#0f5d20;font-size:17px; }.ac-topbrand small {display:block;font-size:11px;color:#5c645c;font-weight:600}
.ac-warehouse { min-width:270px;background:#eef2ff;border-radius:8px;padding:6px 12px;line-height:1.3;font-size:13px; }.ac-warehouse em {font-style:normal;background:#a5f49d;border-radius:14px;padding:2px 7px;color:#236b28;font-size:10px}.ac-warehouse small {display:block;color:#55705c;font-size:11px;font-weight:600}
.ac-search { margin-left:auto;background:#f3f5fd;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;color:#758075;white-space:nowrap;font-size:12px; }.ac-search kbd {margin-left:6px;background:#e2e9f9;padding:2px 4px;border-radius:4px}
.ac-bell {position:relative;border:0;background:none;color:#465044;cursor:pointer}.ac-bell i {position:absolute;width:6px;height:6px;top:2px;right:4px;border-radius:50%;background:#cc1c27}
.ac-user {display:flex;align-items:center;gap:8px;white-space:nowrap;text-align:right;font-weight:700;font-size:12px;line-height:1.15}.ac-user small {display:block;color:#5a655d;font-weight:500}.ac-avatar {display:grid;place-items:center;width:31px;height:31px;background:#00551a;color:#fff;border-radius:50%}
.ac-content {padding:0 32px 20px;min-width:0}.ac-preview {display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:28px 0;color:#687267;font-size:12px}.ac-preview button {border:1px solid #bfd5bf;border-radius:7px;background:#fff;color:#185a22;padding:7px 9px;cursor:pointer}.ac-preview select {padding:6px;border:1px solid #b8c9b8;border-radius:7px}
@media(max-width:1100px){.admin-chrome{grid-template-columns:220px minmax(0,1fr)}.ac-content{padding:0 20px}.ac-topbar{left:136px;gap:8px}.ac-search{display:none}.ac-warehouse{min-width:210px}}
@media(max-width:760px){.admin-chrome{grid-template-columns:1fr}.ac-sidebar{min-height:auto}.ac-station{margin-top:15px}.ac-main{padding-top:0}.ac-topbar{position:static;height:auto;flex-wrap:wrap;padding:12px}.ac-content{padding:0 16px}}
</style>
