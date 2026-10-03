<script setup>
import { computed, onMounted, ref } from 'vue'
import { accountRepository } from './accountRepository.js'

const props = defineProps({ person: { type: Object, required: true } })
const emit = defineEmits(['back', 'save'])
const role = ref(props.person.role)
const status = ref(props.person.status)
const assignedWarehouses = ref([...props.person.warehouses])
const warehouseToAdd = ref('')
const warehouses = ref([])
const saveError = ref('')
const roleLabel = (value) => value === 'system_admin' ? 'System Admin' : 'Warehouse Admin'
const statusLabel = (value) => value === 'active' ? 'Đang hoạt động' : 'Đã vô hiệu hóa'
const isWarehouseAdmin = computed(() => role.value === 'warehouse_admin')
const canSave = computed(() => (role.value === 'system_admin' || assignedWarehouses.value.length > 0)
  && (role.value !== props.person.role || status.value !== props.person.status
    || JSON.stringify(assignedWarehouses.value) !== JSON.stringify(props.person.warehouses)))
const currentScope = computed(() => props.person.role === 'system_admin' ? 'Toàn hệ thống' : props.person.warehouses.join(', ') || 'Chưa gán kho')
const nextScope = computed(() => role.value === 'system_admin' ? 'Toàn hệ thống' : assignedWarehouses.value.join(', ') || 'Chưa gán kho')

function selectRole(nextRole) {
  role.value = nextRole
  if (nextRole === 'system_admin') {
    assignedWarehouses.value = []
    warehouseToAdd.value = ''
  }
}

function addWarehouse() {
  if (warehouseToAdd.value && !assignedWarehouses.value.includes(warehouseToAdd.value)) {
    assignedWarehouses.value.push(warehouseToAdd.value)
  }
  warehouseToAdd.value = ''
}

function saveChanges() {
  if (!canSave.value) return
  saveError.value = ''
  emit('save', {
    role: role.value,
    status: status.value,
    warehouses: [...assignedWarehouses.value],
  })
}

onMounted(async () => {
  try {
    warehouses.value = await accountRepository.listWarehouses()
  } catch {
    saveError.value = 'Không thể tải danh sách kho. Vui lòng thử lại.'
  }
})
</script>

<template>
  <div class="staff-edit-page">
    <div class="detail-toolbar">
      <div class="breadcrumbs"><i class="fa-solid fa-user-gear breadcrumbs__icon" aria-hidden="true"></i><strong>Nhân sự &amp; quyền</strong><span>/</span><span>Chi tiết nhân sự</span><span>/</span><b>Chỉnh sửa quyền</b></div>
      <button class="detail-back" type="button" @click="emit('back')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Quay lại chi tiết nhân sự</button>
    </div>

    <div class="staff-edit-heading"><div><div class="detail-hero__eyebrow"><span class="detail-tag detail-tag--scope">PHẠM VI: {{ role === 'system_admin' ? 'TOÀN HỆ THỐNG' : 'THEO KHO ĐƯỢC GÁN' }}</span><span class="detail-tag detail-tag--approval">ĐIỀU CHỈNH PHÂN QUYỀN</span></div><h1>Chỉnh sửa quyền nhân sự</h1><p>Kiểm tra quyền hiện tại và phạm vi truy cập sau khi thay đổi</p></div></div>

    <section class="staff-edit-identity">
      <div class="detail-section-heading"><span class="section-icon section-icon--blue"><i class="fa-solid fa-id-card" aria-hidden="true"></i></span><div><h2>Nhân sự được chỉnh sửa</h2><p>Hồ sơ định danh tài khoản nội bộ</p></div><span class="required-tag">Dữ liệu cố định</span></div>
      <div class="staff-edit-identity__grid"><article><span>HỌ TÊN</span><strong>{{ person.name }}</strong></article><article><span>EMAIL</span><strong>{{ person.email }}</strong></article><article><span>MÃ TÀI KHOẢN</span><strong>{{ person.id }}</strong></article></div>
    </section>

    <div class="staff-edit-columns">
      <section class="staff-edit-current">
        <div class="detail-section-heading"><span><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></span><div><h2>Quyền hiện tại</h2><p>Giá trị đang có hiệu lực trong hệ thống.</p></div></div>
        <article><small>VAI TRÒ</small><strong>{{ roleLabel(person.role) }}</strong></article>
        <article><small>KHO ĐƯỢC PHÂN CÔNG</small><strong>{{ currentScope }}</strong></article>
        <article><small>TRẠNG THÁI QUYỀN ADMIN</small><strong>{{ statusLabel(person.status) }}</strong></article>
      </section>

      <section class="staff-edit-form">
        <div class="detail-section-heading"><span class="section-icon section-icon--green"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></span><div><h2>Quyền dự kiến</h2><p>Thiết lập lại vai trò, trạng thái và kho được phân công.</p></div><span class="status-pill status-pill--active">Đang thiết lập</span></div>

        <fieldset class="staff-edit-fieldset"><legend>Vai trò quản trị</legend><div class="role-options">
          <button type="button" class="role-option" :class="{ 'role-option--selected': role === 'system_admin' }" role="radio" :aria-checked="role === 'system_admin'" @click="selectRole('system_admin')"><span class="role-option__icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span><span class="role-option__radio"></span><strong>System Admin</strong><p>Quản lý toàn bộ hệ thống và quyền nhân sự</p><small>Phạm vi: Toàn hệ thống</small></button>
          <button type="button" class="role-option" :class="{ 'role-option--selected': role === 'warehouse_admin' }" role="radio" :aria-checked="role === 'warehouse_admin'" @click="selectRole('warehouse_admin')"><span class="role-option__icon"><i class="fa-solid fa-warehouse" aria-hidden="true"></i></span><span class="role-option__radio"></span><strong>Warehouse Admin</strong><p>Quản lý nghiệp vụ tại các kho được phân công</p><small>Phạm vi: Theo kho gán</small></button>
        </div></fieldset>

        <fieldset class="staff-edit-fieldset"><legend>Trạng thái quyền admin</legend><div class="staff-edit-status-options"><label><input v-model="status" type="radio" value="active"><span class="status-pill status-pill--active"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Đang hoạt động</span></label><label><input v-model="status" type="radio" value="inactive"><span class="status-pill status-pill--inactive"><i class="fa-solid fa-circle-minus" aria-hidden="true"></i> Đã vô hiệu hóa</span></label></div></fieldset>

        <div class="staff-edit-warehouse"><label for="edit-warehouse">Kho được phân công</label><div class="staff-edit-warehouse__row"><select id="edit-warehouse" v-model="warehouseToAdd" :disabled="!isWarehouseAdmin || !warehouses.length"><option value="">{{ isWarehouseAdmin ? 'Chọn kho để gán...' : 'Chỉ áp dụng cho Warehouse Admin' }}</option><option v-for="warehouse in warehouses.filter((item) => !assignedWarehouses.includes(item.name))" :key="warehouse.id" :value="warehouse.name">{{ warehouse.name }}</option></select><button type="button" :disabled="!warehouseToAdd" @click="addWarehouse">Thêm kho</button></div>
          <ul v-if="isWarehouseAdmin && assignedWarehouses.length" class="staff-edit-warehouse__list"><li v-for="name in assignedWarehouses" :key="name"><span><i class="fa-solid fa-warehouse" aria-hidden="true"></i>{{ name }}</span><button type="button" :aria-label="`Bỏ ${name}`" @click="assignedWarehouses = assignedWarehouses.filter((item) => item !== name)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></li></ul>
          <p class="field-help"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Warehouse Admin cần ít nhất một kho. System Admin có phạm vi toàn hệ thống.</p>
        </div>
      </section>
    </div>

    <section class="staff-edit-preview"><div class="detail-section-heading"><span><i class="fa-solid fa-right-left" aria-hidden="true"></i></span><div><h2>Thay đổi dự kiến</h2><p>Đối chiếu giá trị hiện hữu và thiết lập mới</p></div></div><div class="staff-edit-preview__values"><p><span>Vai trò</span><strong>{{ roleLabel(person.role) }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> {{ roleLabel(role) }}</strong></p><p><span>Kho</span><strong>{{ currentScope }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> {{ nextScope }}</strong></p><p><span>Trạng thái</span><strong>{{ statusLabel(person.status) }} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i> {{ statusLabel(status) }}</strong></p></div></section>

    <div class="staff-edit-footer"><p><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>{{ saveError || (canSave ? 'Có thay đổi hợp lệ để lưu.' : 'Hãy thay đổi ít nhất một giá trị trước khi lưu.') }}</p><div><button class="grant-cancel" type="button" @click="emit('back')">Hủy</button><button class="grant-review-button" type="button" :disabled="!canSave" @click="saveChanges"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Lưu thay đổi</button></div></div>
  </div>
</template>
