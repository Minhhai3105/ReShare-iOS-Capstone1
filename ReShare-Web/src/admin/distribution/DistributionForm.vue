<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import AdminIcon from '../AdminIcon.vue'
import brandLogo from '../auth/assets/reshare-logo.png'
import { canDistribute, createDemoDistributionRepository, newRequestKey, validateDistribution } from './distribution.repository.js'
import { mapLqError } from '../lq-errors.js'

const props = defineProps({
  assignment: Object,
  actor: Object,
  repository: Object,
  preview: { type: Boolean, default: false },
})
const activeRepo = computed(() => {
  if (props.repository) return props.repository
  return createDemoDistributionRepository({ getAssignment: () => props.assignment, getActor: () => props.actor })
})
const options = ref({ warehouses: [], inventory: [], beneficiaries: [] })
const warehouseId = ref('')
const itemId = ref('')
const quantity = ref('')
const beneficiaryId = ref('')
const note = ref('')
const handedOver = ref(false)
const scenario = ref('normal')
const saving = ref(false)
const submitError = ref('')
const result = ref(null)
const confirmation = ref(null)
const pendingRequestKey = ref(null)
const dialog = ref(null)
const resultPanel = ref(null)

watch(() => [props.assignment, activeRepo.value], async () => {
  try {
    const res = await Promise.resolve(activeRepo.value.list())
    options.value = res || { warehouses: [], inventory: [], beneficiaries: [] }
    if (!options.value.warehouses.some((entry) => entry.id === warehouseId.value)) {
      warehouseId.value = options.value.warehouses[0]?.id ?? ''
    }
  } catch (err) {
    submitError.value = err.message || 'Không thể tải danh sách kho.'
  }
  confirmation.value = null
  dialog.value?.close()
}, { immediate: true, deep: true })

const warehouse = computed(() => options.value.warehouses.find((entry) => entry.id === warehouseId.value))
const inventory = computed(() => options.value.inventory.filter((entry) => entry.warehouseId === warehouseId.value))
const item = computed(() => inventory.value.find((entry) => entry.id === itemId.value))
const beneficiaries = computed(() => options.value.beneficiaries.filter((entry) => entry.warehouseId === warehouseId.value))
const beneficiary = computed(() => beneficiaries.value.find((entry) => entry.id === beneficiaryId.value))
const draft = computed(() => ({ quantity: quantity.value, beneficiaryId: beneficiaryId.value, note: note.value, handedOver: handedOver.value }))
const errors = computed(() => validateDistribution(draft.value, item.value, beneficiaries.value))
const authorized = computed(() => canDistribute(props.assignment, warehouseId.value))
const valid = computed(() => authorized.value && !Object.keys(errors.value).length)
const stockAfter = computed(() => item.value && !errors.value.quantity ? item.value.available - Number(quantity.value) : null)
const actorName = computed(() => props.actor?.displayName || props.actor?.email || 'Chưa xác định nhân sự')
const roleName = computed(() => props.assignment?.role === 'system_admin' ? 'System Admin' : 'Warehouse Admin')
const menu = [
  { label: 'Tổng quan', icon: 'grid' }, { label: 'Yêu cầu quyên góp', icon: 'donation' },
  { label: 'Kho hàng', icon: 'box', active: true }, { label: 'Người thụ hưởng', icon: 'users' },
  { label: 'Báo cáo', icon: 'chart' }, { label: 'Nhật ký', icon: 'log' },
]
const checks = computed(() => [
  { label: 'Kho vật lý xác thực', detail: 'Vật phẩm thuộc kho được phân công.', ok: authorized.value && !!item.value },
  { label: 'Tồn khả dụng hợp lệ', detail: props.preview ? 'Số lượng xuất ≤ số còn trong sổ kho mẫu.' : 'Số lượng xuất ≤ tồn khả dụng trong sổ kho.', ok: !!item.value && !errors.value.quantity },
  { label: 'Người thụ hưởng hợp lệ', detail: 'Hồ sơ đã duyệt thuộc phạm vi kho.', ok: !errors.value.beneficiaryId },
  { label: 'Xác nhận bàn giao thực tế', detail: 'Cam kết vật phẩm đã được trao.', ok: handedOver.value },
  { label: 'Kiểm soát số dư không âm', detail: 'Tồn sau phân phối ≥ 0 đơn vị chuẩn.', ok: stockAfter.value !== null && stockAfter.value >= 0 },
])

function resetForm() {
  pendingRequestKey.value = null
  confirmation.value = null
  quantity.value = ''
  beneficiaryId.value = ''
  note.value = ''
  handedOver.value = false
  submitError.value = ''
  result.value = null
  scenario.value = 'normal'
}
watch(warehouseId, () => { itemId.value = inventory.value[0]?.id ?? ''; resetForm() }, { immediate: true })
watch(itemId, resetForm)
watch([quantity, beneficiaryId, note, handedOver], () => {
  pendingRequestKey.value = null
  confirmation.value = null
})

async function askToConfirm() {
  if (!valid.value || saving.value) return
  submitError.value = ''
  pendingRequestKey.value ||= newRequestKey()
  confirmation.value = {
    ...draft.value, quantity: Number(quantity.value), itemId: item.value.id, warehouseId: warehouseId.value,
    idempotencyKey: pendingRequestKey.value,
    expectedVersion: item.value.version, itemName: item.value.name, unit: item.value.unit,
    warehouseName: warehouse.value.name, beneficiaryName: beneficiary.value.name,
    before: item.value.available, after: stockAfter.value, scenario: scenario.value,
  }
  await nextTick()
  dialog.value.showModal()
}

async function submit() {
  if (saving.value || !confirmation.value) return
  saving.value = true
  const pending = confirmation.value
  try {
    result.value = await activeRepo.value.createVoucher(pending, pending.scenario)
    const listRes = await Promise.resolve(activeRepo.value.list()).catch(() => null)
    if (listRes) options.value = listRes
    pendingRequestKey.value = null
    handedOver.value = false
    if (dialog.value?.open) dialog.value.close()
    confirmation.value = null
    await nextTick()
    resultPanel.value?.focus()
  } catch (error) {
    // RC1D-114: phân loại lỗi để biết nên giữ khóa gửi lại hay dọn biểu mẫu.
    // Chỉ nhóm unknown + replayable mới được giữ confirmation (và cùng đó là
    // idempotencyKey) để nút "Kiểm tra lại lần gửi" dùng lại đúng khóa.
    const mapped = mapLqError(error, { write: true })
    const uncertainResult = mapped.kind === 'unknown' && mapped.replayable === true
    if (!uncertainResult) {
      const listRes = await Promise.resolve(activeRepo.value.list()).catch(() => null)
      if (listRes) options.value = listRes
    }
    submitError.value = `${mapped.title}. ${mapped.message}`
    // Mất quyền hoặc hết phiên: phải ẩn dữ liệu đang hiển thị, không để nhân sự
    // tiếp tục đọc tồn kho của kho mình không còn được xem.
    if (['permission', 'session'].includes(mapped.kind)) {
      options.value = { warehouses: [], inventory: [], beneficiaries: [] }
      result.value = null
    }
    if (!uncertainResult) {
      pendingRequestKey.value = null
      handedOver.value = false
      confirmation.value = null
    }
    scenario.value = 'normal'
    if (dialog.value?.open) dialog.value.close()
  } finally {
    saving.value = false
  }
}

function cancelConfirmation(event) {
  if (saving.value) { event?.preventDefault(); return }
  dialog.value.close()
  confirmation.value = null
}

function newDistribution() {
  // Options chỉ trả mục còn tồn: mục vừa xuất hết đã rời danh sách thì chọn sang mục kế tiếp.
  if (!item.value) itemId.value = inventory.value[0]?.id ?? ''
  resetForm()
  nextTick(() => document.getElementById('distribution-quantity')?.focus())
}
const formatTime = (value) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date(value))
</script>

<template>
  <div class="distribution-shell">
    <header class="d-topbar">
      <div class="d-brand"><img :src="brandLogo" alt="ReShare" /><b>ReShare <small>PORTAL</small></b><span><strong>ReShare Ops</strong><small>Hệ thống Điều phối Kho</small></span></div>
      <div class="d-search"><AdminIcon name="search" /><span>Tìm kiếm vận đơn, kiện hàng, quyền góp</span><kbd>⌘K</kbd></div>
      <span class="d-shift"><AdminIcon name="clock" :size="16" />{{ preview ? 'Ca trực mẫu: Sáng (08:00 – 16:30)' : 'Ca trực vận hành: Sáng (08:00 – 16:30)' }}</span>
      <div class="d-profile"><span>{{ actorName }}<small>{{ roleName }}</small></span><i><AdminIcon name="user" /></i></div>
    </header>

    <aside class="d-sidebar">
      <div class="d-station"><b><AdminIcon name="warehouse" :size="16" />{{ warehouse?.name || (preview ? 'Chưa có kho mẫu phù hợp' : 'Chưa có kho phù hợp') }}</b><span v-if="preview" class="d-tag">Demo</span><small>Đang thao tác tại kho <em v-if="preview">● Mô phỏng</em></small></div>
      <p class="d-nav-title">VẬN HÀNH KHO &amp; XỬ LÝ</p>
      <nav :aria-label="preview ? 'Điều hướng demo' : 'Điều hướng vận hành'"><button v-for="entry in menu" :key="entry.label" disabled :class="{ active: entry.active }" :aria-current="entry.active ? 'page' : undefined"><AdminIcon :name="entry.icon" />{{ entry.label }}</button></nav>
      <p class="d-nav-title">QUẢN TRỊ HỆ THỐNG</p>
      <button disabled><AdminIcon name="shield" />Nhân sự &amp; Phân quyền</button>
      <button disabled><AdminIcon name="settings" />Cấu hình chung</button>
      <div v-if="preview" class="d-sidebar-status"><span>● RC1D-82</span><span class="d-tag">Dữ liệu mẫu</span></div>
    </aside>

    <main class="d-main">
      <div class="d-breadcrumb"><AdminIcon name="box" :size="15" />Kho hàng <span>/</span> Chi tiết vật phẩm <span>/</span><b>Phân phối hàng</b></div>
      <section v-if="preview" class="d-card d-sandbox" aria-label="Thông báo dữ liệu mẫu">
        <span class="d-icon-tile"><AdminIcon name="flask" :size="24" /></span>
        <div><b><code>SANDBOX NODE: RC1D-82</code> MÔI TRƯỜNG THỬ NGHIỆM ĐỐI CHIẾU</b><p><strong>Dữ liệu mẫu.</strong> Mọi thao tác phân phối và phiếu xuất chỉ được mô phỏng trong bộ nhớ, tải lại trang để đặt lại. Không ghi dữ liệu vận hành thật, không dùng làm báo cáo chính thức. Chưa bảo đảm transaction Backend.</p></div>
      </section>

      <section class="d-card d-heading">
        <div><span class="d-tag">▤ CHỨNG TỪ XUẤT PHÂN PHỐI (DISTRIBUTION VOUCHER)</span><span class="d-pill"><AdminIcon name="warehouse" :size="13" />{{ warehouse?.name || 'Chưa chọn kho' }}</span></div>
        <h1>Phân phối hàng</h1><p>Ghi nhận hàng đã bàn giao thực tế cho người thụ hưởng và tạo chứng từ xuất kho theo chuẩn kế toán ReShare.</p>
        <div class="d-audit"><AdminIcon name="shield" />{{ preview ? 'Phiên kiểm toán: DEMO-RC1D-82' : 'Phiên làm việc: Xác thực bảo mật' }}</div>
      </section>

      <div v-if="!options.warehouses.length" class="d-alert" role="alert">{{ preview ? 'Không có kho mẫu trùng với phân công hiện tại. Không thể tạo phiếu. Bản preview độc lập có kho mẫu Hải Châu để đối chiếu giao diện.' : 'Không có kho trực thuộc quyền phân công của tài khoản hiện tại.' }}</div>

      <section v-if="result" ref="resultPanel" class="d-card d-success" tabindex="-1" aria-labelledby="distribution-result-title" role="status">
        <AdminIcon name="check" :size="30" /><div><span v-if="preview" class="d-tag">Dữ liệu mẫu</span><h2 id="distribution-result-title">{{ preview ? 'Đã tạo phiếu xuất mẫu' : 'Đã tạo phiếu xuất kho' }}</h2><p>Phiếu <strong>{{ result.voucher.id }}</strong> · Movement <strong>{{ result.movement.id }}</strong></p>
          <dl><div><dt>Vật phẩm / Kho</dt><dd>{{ result.voucher.itemName }} · {{ warehouse?.name }}</dd></div><div><dt>Số lượng / Người nhận</dt><dd>{{ result.voucher.quantity }} {{ result.voucher.unit }} · {{ beneficiaries.find(entry => entry.id === result.voucher.beneficiaryId)?.name }}</dd></div><div><dt>Đối chiếu tồn</dt><dd>{{ result.voucher.before }} − {{ result.voucher.quantity }} = {{ result.voucher.after }} {{ result.voucher.unit }}</dd></div><div><dt>Nhân sự / Thời gian</dt><dd>{{ result.voucher.actor.displayName || result.voucher.actor.email }} · {{ formatTime(result.voucher.timestamp) }}</dd></div></dl>
          <p>{{ preview ? 'Phân phối một phần chỉ giảm tồn mẫu; không đổi trạng thái toàn bộ yêu cầu quyên góp.' : 'Phân phối một phần trừ trực tiếp tồn khả dụng trong sổ kho; không làm thay đổi trạng thái đơn quyên góp nguồn.' }}</p><button class="d-primary" @click="newDistribution">Tạo lượt phân phối tiếp theo</button>
        </div>
      </section>

      <div class="d-columns">
        <div class="d-left">
          <section class="d-card d-source">
            <div class="d-section-heading"><span class="d-icon-tile"><AdminIcon name="log" :size="22" /></span><div><h2>Thông tin vật phẩm gốc (Chỉ đọc)</h2><p>Dữ liệu nguồn được bảo toàn liên kết</p></div><span class="d-tag">{{ preview ? '⇅ Sổ kho mẫu' : '⇅ Sổ kho điện tử' }}</span></div>
            <div class="d-selectors">
              <label v-if="options.warehouses.length > 1">Kho được phân công<select v-model="warehouseId" :disabled="saving"><option v-for="entry in options.warehouses" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></label>
              <label>Chọn vật phẩm trong kho được giao <span class="d-required">*</span><select v-model="itemId" :disabled="saving || !inventory.length"><option v-if="!inventory.length" value="">{{ preview ? 'Không có vật phẩm mẫu' : 'Không có vật phẩm trong kho' }}</option><option v-for="entry in inventory" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.available }} {{ entry.unit }}{{ entry.available === 0 ? ' · Hết tồn' : '' }}</option></select></label>
            </div>
            <dl class="d-source-grid"><div><dt>VẬT PHẨM</dt><dd>{{ item?.name || '—' }}</dd></div><div><dt>KHO LƯU</dt><dd>{{ warehouse?.name || '—' }}</dd></div><div><dt>SỐ LƯỢNG CÒN</dt><dd data-testid="available-stock">{{ item ? `${item.available} ${item.unit}` : '—' }}</dd></div><div><dt>ĐƠN VỊ CHUẨN</dt><dd>{{ item?.unit || '—' }}</dd></div><div><dt>VỊ TRÍ LƯU (RACK/BIN)</dt><dd>{{ item?.location || '—' }}</dd></div><div><dt>PHIẾU NHẬP NGUỒN</dt><dd>{{ item?.sourceReceipt || '—' }}</dd></div></dl>
            <div class="d-note"><AdminIcon name="shield" /><p><b>Quy chuẩn nguồn gốc kho:</b> Vật phẩm phân phối phải thuộc kho được phân công. Không phân phối chéo hoặc ghi nhận thay kho khác.</p></div>
          </section>

          <form v-if="!result" id="distribution-form" class="d-card d-form" @submit.prevent="askToConfirm">
            <div class="d-form-title"><div><h2>Thông tin phân phối &amp; Bàn giao</h2><p>Điền đầy đủ thông tin để cấp chứng từ xuất kho có thẩm quyền</p></div><small class="d-required">(*) Trường bắt buộc nhập</small></div>
            <div class="d-field"><label for="distribution-quantity">Số lượng phân phối <span class="d-required">*</span></label><small class="d-field-rule">Quy tắc: ≤ Số lượng còn</small><div class="d-quantity"><input id="distribution-quantity" v-model="quantity" type="text" inputmode="numeric" required placeholder="Nhập số lượng xuất..." :disabled="saving" :aria-invalid="quantity !== '' && !!errors.quantity" aria-describedby="quantity-help quantity-error" /><span>Đơn vị: {{ item?.unit || '—' }}</span></div><p id="quantity-help" class="d-help">Chỉ nhập số nguyên dương, không vượt tồn khả dụng hiện tại. Không nhập số âm.</p><p v-if="quantity !== '' && errors.quantity" id="quantity-error" class="d-error" role="alert">{{ errors.quantity }}</p></div>
            <div class="d-field"><label for="distribution-beneficiary">Người thụ hưởng <span class="d-required">*</span></label><select id="distribution-beneficiary" v-model="beneficiaryId" required :disabled="saving" aria-describedby="beneficiary-help"><option value="" disabled>Chọn người thụ hưởng từ danh sách đã thẩm định...</option><option v-for="entry in beneficiaries" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ entry.area }}</option></select><p id="beneficiary-help" class="d-help"><em>{{ preview ? 'Hồ sơ mẫu đã được duyệt trước khi bàn giao vật phẩm.' : 'Hồ sơ người thụ hưởng đã được thẩm định và phê duyệt.' }}</em></p><div class="d-note"><AdminIcon name="shield" /><p><b>Phân quyền bảo mật khu vực:</b> Chỉ hiển thị hồ sơ đã duyệt trong phạm vi kho đang chọn. Không tạo hồ sơ người thụ hưởng tại màn này.</p></div></div>
            <div class="d-field"><label for="distribution-note">Ghi chú bàn giao <span class="d-optional">(Tùy chọn)</span></label><small class="d-field-rule">{{ note.length }}/500 ký tự</small><textarea id="distribution-note" v-model="note" maxlength="500" :disabled="saving" rows="4" placeholder="Ghi chú bổ sung về mục đích hỗ trợ, đợt thiện nguyện, tình trạng gói quà hoặc lưu ý khi bàn giao cho người thụ hưởng..." /></div>
            <label class="d-handover"><input v-model="handedOver" type="checkbox" :disabled="saving" required /><span><b>Tôi xác nhận hàng đã được bàn giao thực tế cho người thụ hưởng (hoặc đại diện hợp pháp).</b><small>{{ preview ? 'Chỉ ghi nhận xuất kho sau khi hoàn tất giao nhận vật lý. Trong bản demo, xác nhận này chỉ mô phỏng quy trình.' : 'Chỉ ghi nhận xuất kho sau khi hoàn tất giao nhận vật lý.' }}</small></span></label>
            <div class="d-note d-actor"><AdminIcon name="lock" /><p><b>Bảo chứng hệ thống:</b> Người thực hiện (<strong>{{ actorName }}</strong>) và thời gian được tự động ghi nhận khi tạo phiếu. Không nhập thủ công hoặc lùi ngày xuất kho.</p></div>
          </form>

          <section class="d-card d-math"><div class="d-section-heading"><AdminIcon name="log" /><h2>Bảng tính toán đối chiếu tức thời</h2><code>{{ preview ? 'MATH PREVIEW' : 'ĐỐI CHIẾU SỐ DƯ' }}</code></div><div class="d-equation" aria-live="polite"><div><small>TỒN TRƯỚC</small><strong>{{ item?.available ?? '—' }}</strong><small>Hiện tại</small></div><b>−</b><div><small>SỐ XUẤT</small><strong>{{ quantity !== '' && !errors.quantity ? Number(quantity) : '—' }}</strong><small>Khấu trừ</small></div><b>=</b><div><small>TỒN SAU</small><strong>{{ stockAfter ?? '—' }}</strong><small>{{ preview ? 'Dự kiến (≥ 0)' : 'Sau xuất (≥ 0)' }}</small></div></div><p><b>Cơ chế kiểm soát an toàn tồn kho:</b> {{ preview ? 'Giá trị cuối cùng được kiểm tra lại ở bước xác nhận trên sổ kho mẫu. Mô phỏng này không chứng minh transaction Backend.' : 'Số dư khả dụng và phiên bản sổ kho được kiểm tra nguyên tử (atomic transaction) tại thời điểm commit, bảo đảm không bao giờ âm tồn.' }}</p></section>

          <section v-if="preview" class="d-card d-demo-controls"><h2><AdminIcon name="flask" />Kịch bản kiểm thử · Dữ liệu mẫu</h2><label for="distribution-scenario">Thay đổi tại thời điểm xác nhận</label><select id="distribution-scenario" v-model="scenario" :disabled="saving || !!result"><option value="normal">Bình thường — kiểm tra lại tồn mẫu</option><option value="shortage">Thiếu tồn — mô phỏng nhân sự khác vừa xuất hàng</option><option value="conflict">Xung đột — phiên bản sổ kho mẫu vừa thay đổi</option></select><p>Thiếu tồn sẽ cập nhật tồn mẫu; xung đột yêu cầu đối chiếu và xác nhận lại. Tải lại trang để trở về dữ liệu ban đầu (áo khoác: 3 chiếc).</p></section>
          <div v-if="submitError" class="d-alert" role="alert" data-testid="submit-error">{{ submitError }} <button v-if="confirmation" type="button" :disabled="saving" @click="submit">Kiểm tra lại lần gửi</button></div>
          <section v-if="!result" class="d-card d-actions"><p><AdminIcon name="shield" /><span><b>Chế độ khóa:</b> Cần vật phẩm hợp lệ, số lượng ≤ tồn khả dụng, người thụ hưởng và xác nhận bàn giao thực tế.</span></p><button type="button" class="d-secondary" :disabled="saving" @click="resetForm">Hủy</button><button type="submit" form="distribution-form" class="d-primary" :disabled="!valid || saving"><AdminIcon name="play" :size="15" />{{ preview ? 'Xác nhận phân phối' : 'Xác nhận xuất kho' }}</button></section>
        </div>

        <aside class="d-right">
          <section class="d-card d-checks"><h2><AdminIcon name="check" />Kiểm tra thông số xuất kho</h2><p>5 quy tắc kiểm tra tự động trước khi ghi sổ kho điện tử:</p><ul><li v-for="check in checks" :key="check.label" :class="{ passed: check.ok }"><AdminIcon :name="check.ok ? 'check' : 'clock'" :size="18" /><div><b>{{ check.label }}</b><small>{{ check.detail }}</small></div></li></ul><div class="d-note"><AdminIcon name="log" /><p>Trước khi ghi sổ, hệ thống sẽ mở bảng xác nhận đối chiếu toàn diện.</p></div></section>
          <section class="d-card d-rules"><h2><AdminIcon name="gavel" />Quy chế nghiệp vụ phân phối</h2><h3>1. Nguyên tắc bất biến (Append-only)</h3><p>Mỗi lần xuất thành công tạo một phiếu xuất và movement tham chiếu tương ứng. Không sửa chứng từ đã tạo.</p><h3>2. Phân phối từng phần (Partial)</h3><p>Chỉ giảm số lượng tồn còn lại tương ứng; <b>KHÔNG</b> tự động chuyển toàn bộ yêu cầu quyên góp sang “Đã phân phối”.</p><h3>3. Kiểm soát đồng thời (Concurrency)</h3><p>Nếu tồn hoặc phiên bản sổ kho thay đổi khi gửi, giao dịch có thể bị từ chối. Kiểm tra tồn mới, điều chỉnh và xác nhận lại.</p><h3>4. Tách biệt với P2P “Kho đồ 0đ”</h3><p>Biểu mẫu dành cho phân phối qua kho vật lý. Không xử lý bài đăng chia sẻ ngang hàng P2P.</p><div v-if="preview" class="d-note"><AdminIcon name="info" /><p>Bản demo RC1D-82. Không kết nối kho vận hành hoặc màn chi tiết phiếu xuất.</p></div></section>
        </aside>
      </div>
      <footer class="d-footer"><span>© ReShare Circular Fashion Hub · Hệ thống điều phối nội bộ</span><b>{{ preview ? '● Dữ liệu mẫu · Không dùng báo cáo chính thức' : '● Hệ thống quản trị ReShare Ops' }}</b></footer>
    </main>

    <dialog ref="dialog" class="d-dialog" aria-labelledby="distribution-confirm-title" @cancel="cancelConfirmation">
      <template v-if="confirmation"><span v-if="preview" class="d-tag">Dữ liệu mẫu</span><h2 id="distribution-confirm-title">{{ preview ? 'Xác nhận tạo phiếu xuất' : 'Xác nhận tạo phiếu xuất kho' }}</h2><p>{{ preview ? 'Kiểm tra thông tin trước khi ghi vào sổ kho mẫu.' : 'Kiểm tra kỹ thông tin trước khi ghi sổ kho và phát hành chứng từ xuất kho.' }}</p><dl><div><dt>Vật phẩm</dt><dd>{{ confirmation.itemName }}</dd></div><div><dt>Kho</dt><dd>{{ confirmation.warehouseName }}</dd></div><div><dt>Người thụ hưởng</dt><dd>{{ confirmation.beneficiaryName }}</dd></div><div><dt>Đối chiếu tồn ({{ confirmation.unit }})</dt><dd>{{ confirmation.before }} − {{ confirmation.quantity }} = {{ confirmation.after }}</dd></div><div><dt>Ghi chú</dt><dd>{{ confirmation.note || 'Không có' }}</dd></div><div><dt>Người thực hiện</dt><dd>{{ actorName }}</dd></div></dl><p class="d-note">Đã xác nhận bàn giao. Thời gian được ghi nhận tự động khi tạo phiếu. Tồn kho được kiểm tra nguyên tử khi gửi.</p><div class="d-dialog-actions"><button class="d-secondary" autofocus :disabled="saving" @click="cancelConfirmation">Quay lại chỉnh sửa</button><button class="d-primary" :disabled="saving" @click="submit">{{ saving ? 'Đang ghi nhận xuất kho...' : (preview ? 'Tạo phiếu xuất mẫu' : 'Xác nhận xuất kho') }}</button></div></template>
    </dialog>
  </div>
</template>

<style scoped src="./distribution.css"></style>
