<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { currentUser, staffAssignment, canAccessWarehouse } from '../../auth/auth.store'
import { ADMIN_ROUTE } from '../../auth/auth.constants'
import { demoReceiptRepository, receiptRepository } from '../receipt.repository'

const route = useRoute()
const isDemoPreview = import.meta.env.DEV && route.meta.devPreview === true
const repository = isDemoPreview ? demoReceiptRepository : receiptRepository
const loading = ref(true)
const loadError = ref('')
const submitError = ref('')
const saving = ref(false)
const showConfirm = ref(false)
const createdReceipt = ref(null)
const donation = ref(null)
const options = ref(null)
const form = reactive({ warehouseId: '', quantity: '', unitId: '', conditionId: '', note: '' })
const backRoute = computed(() => isDemoPreview ? { name: 'admin-donation-receipt-preview' } : { name: ADMIN_ROUTE.home })

const allowedWarehouses = computed(() => (options.value?.warehouses ?? []).filter((warehouse) =>
  isDemoPreview || canAccessWarehouse(warehouse.id),
))
const isApproved = computed(() => donation.value?.status === 'approved')
const selectedWarehouse = computed(() => allowedWarehouses.value.find((item) => item.id === form.warehouseId))
const validForm = computed(() => isApproved.value && selectedWarehouse.value &&
  Number.isFinite(Number(form.quantity)) && Number(form.quantity) > 0 && form.unitId && form.conditionId)

async function load() {
  loading.value = true
  loadError.value = ''
  donation.value = null
  options.value = null
  try {
    const [record, config] = await Promise.all([
      repository.getDonation(route.params.donationId || 'DEMO-REQ-2026-001'),
      repository.getOptions(),
    ])
    donation.value = record
    options.value = config
    const firstAllowed = (config.warehouses ?? []).find((warehouse) => isDemoPreview || canAccessWarehouse(warehouse.id))
    form.warehouseId = firstAllowed?.id ?? ''
    if (isDemoPreview) {
      form.quantity = '10'
      form.unitId = 'piece'
      form.conditionId = 'minor-wear'
      form.note = 'Demo: kiểm đếm thực tế ít hơn số lượng khai báo.'
    }
    if (!record || record.status !== 'approved') loadError.value = 'Yêu cầu này chưa được duyệt hoặc không còn khả dụng để ghi nhận thực nhận.'
    else if (!firstAllowed) loadError.value = 'Bạn chưa được phân công vào kho có thể tiếp nhận yêu cầu này.'
  } catch (error) {
    loadError.value = error?.message || 'Không thể tải thông tin yêu cầu. Vui lòng thử lại.'
  } finally {
    loading.value = false
  }
}

function askToConfirm() {
  submitError.value = ''
  if (!validForm.value) {
    submitError.value = 'Vui lòng nhập số lượng hợp lệ và chọn kho, đơn vị, tình trạng.'
    return
  }
  showConfirm.value = true
}

async function submitReceipt() {
  saving.value = true
  submitError.value = ''
  try {
    const result = await repository.createReceipt({
      donationId: donation.value.id,
      warehouseId: form.warehouseId,
      quantity: Number(form.quantity),
      unitId: form.unitId,
      conditionId: form.conditionId,
      note: form.note.trim(),
      actorId: isDemoPreview ? 'preview-staff' : currentUser.value.uid,
    })
    createdReceipt.value = result ?? {}
    showConfirm.value = false
  } catch (error) {
    showConfirm.value = false
    submitError.value = error?.message || 'Không thể lưu phiếu thực nhận. Vui lòng thử lại.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark"><AuthIcon name="clipboard-check" :size="20" /></span><strong>ReShare</strong><span class="brand-tag">PORTAL</span><span class="brand-caption">Hệ thống điều phối vận hành</span></div>
      <div class="topbar__warehouse"><AuthIcon name="warehouse" :size="18" /><span><strong>Kho demo Hải Châu</strong><small>Khu vực Hải Châu &amp; Sơn Trà</small></span><span>⌄</span></div>
      <span class="topbar__active"><i></i>Đang thao tác tại kho</span>
      <span class="topbar__demo">Dữ liệu demo</span>
      <span class="topbar__shift"><AuthIcon name="clock" :size="17" /><span><strong>Ca trực: Sáng</strong><small>(08:00 - 16:30)</small></span></span>
      <button class="topbar__search" type="button"><AuthIcon name="search" :size="17" />Tìm kiếm hàng, mã đơn...<kbd>⌘K</kbd></button>
      <button class="topbar__icon" type="button" aria-label="Thông báo"><AuthIcon name="bell" :size="19" /></button>
      <div class="topbar__profile"><span class="profile-avatar">NV</span><span><strong>Nhân sự xem thử</strong><small>Quản trị kho (demo)</small></span><span>⌄</span></div>
    </header>

    <aside class="sidebar">
      <p class="sidebar__label">VẬN HÀNH KHO &amp; XỬ LÝ</p>
      <a href="#overview"><AuthIcon name="dashboard" />Tổng quan</a>
      <a href="#donations" class="is-active"><AuthIcon name="heart-handshake" />Yêu cầu quyên góp</a>
      <a href="#warehouse"><AuthIcon name="warehouse" />Kho hàng</a>
      <a href="#beneficiaries"><AuthIcon name="users" />Người thụ hưởng</a>
      <a href="#reports"><AuthIcon name="chart" />Báo cáo</a>
      <a href="#logs"><AuthIcon name="file-text" />Nhật ký</a>
      <p class="sidebar__label sidebar__label--second">QUẢN TRỊ HỆ THỐNG</p>
      <a href="#staff"><AuthIcon name="shield-check" />Nhân sự &amp; Phân quyền</a>
      <a href="#settings"><AuthIcon name="settings" />Cấu hình chung</a>
      <div class="station-status"><span>Trạng thái kết nối <b><i></i>Online</b></span><small>▣ Máy trạm: WH-SGN-02</small></div>
    </aside>

    <main class="admin-main">
    <div class="receipt-page">
      <div class="breadcrumbs"><RouterLink :to="backRoute">‹ Quay lại chi tiết yêu cầu</RouterLink><span>Yêu cầu quyên góp</span><b>›</b><span>Chi tiết yêu cầu</span><b>›</b><strong>Ghi nhận thực nhận</strong></div>

      <div v-if="isDemoPreview" class="receipt-notice receipt-notice--demo" role="status">
        <AuthIcon name="info" /><div><strong>MÔI TRƯỜNG XEM THỬ <span>•</span> Dữ liệu mô phỏng quy trình tiếp nhận thực tế</strong>
        </div>
      </div>

      <header class="receipt-heading receipt-card">
        <div class="receipt-heading__icon"><AuthIcon name="clipboard-check" :size="26" /></div>
        <div>
          <h1>Ghi nhận hàng thực nhận</h1>
          <p>Chỉ xác nhận sau khi đã kiểm tra hàng được bàn giao thực tế tại kho vật lí.</p>
        </div>
        <div class="receipt-status-block"><small>TRẠNG THÁI YÊU CẦU GỐC</small>
          <span class="receipt-status" :class="isApproved ? 'receipt-status--approved' : ''">
            <AuthIcon :name="isApproved ? 'badge-check' : 'clock'" :size="14" />
            {{ isApproved ? 'Đã duyệt (approved)' : 'Chờ kiểm tra' }}
          </span>
        </div>
      </header>

      <div v-if="loading" class="receipt-notice" role="status">Đang tải thông tin yêu cầu…</div>
      <div v-if="createdReceipt" class="receipt-notice receipt-notice--success" role="status">
        <AuthIcon name="badge-check" /><div><strong>Đã ghi nhận hàng thực nhận.</strong>
          <p v-if="createdReceipt.id">Mã phiếu: {{ createdReceipt.id }}</p>
          <p>{{ createdReceipt.simulated ? 'Đây là kết quả mô phỏng; không có dữ liệu nào được lưu.' : 'Thông tin phiếu đã được dịch vụ lưu.' }} Bước này không tự động nhập kho.</p>
        </div>
      </div>
      <div v-else-if="loadError" class="receipt-notice receipt-notice--error" role="alert">
        <AuthIcon name="alert-circle" />
        <div><strong>Chưa thể ghi nhận</strong><p>{{ loadError }}</p>
          <button class="receipt-link-button" type="button" @click="load">Thử tải lại</button>
        </div>
      </div>

      <template v-if="donation && options">
        <section class="receipt-card donor-card" aria-labelledby="donor-title">
          <div class="section-title"><AuthIcon name="file-text" /><h2 id="donor-title">Thông tin yêu cầu quyên góp (Chỉ đọc)</h2><span>Tham chiếu quy trình gốc</span></div>
          <dl class="donor-grid">
            <div><dt>Mã yêu cầu</dt><dd>{{ donation.id || '—' }}</dd></div>
            <div><dt>Tên vật phẩm</dt><dd>{{ donation.itemName || '—' }}</dd></div>
            <div><dt>Người gửi</dt><dd>{{ donation.donorName || '—' }}</dd></div>
            <div><dt>Kho dự kiến ban đầu (địa điểm demo đăng ký qua app)</dt><dd>{{ donation.expectedWarehouseName || '—' }}</dd></div>
            <div><dt>Tình trạng người gửi khai báo</dt><dd>{{ donation.declaredConditionName || '—' }}</dd></div>
            <div><dt>Trạng thái hồ sơ gốc</dt><dd>{{ donation.status === 'approved' ? 'Đã duyệt (approved)' : donation.status || '—' }}</dd></div>
          </dl>
        </section>

        <div class="receipt-columns">
          <form id="actual-receipt-form" class="receipt-card form-card" @submit.prevent="askToConfirm">
            <div class="form-title"><div><h2>Nghiệm thu và thông số kiểm đếm thực tế</h2>
              <p>Nhập kết quả kiểm tra trực tiếp tại trạm tiếp nhận.</p></div><small>* Trường bắt buộc</small></div>

            <label class="field"><span>Kho thực nhận <b>*</b></span>
              <select v-model="form.warehouseId" required>
                <option value="" disabled>Chọn kho được phân công</option>
                <option v-for="warehouse in allowedWarehouses" :key="warehouse.id" :value="warehouse.id">{{ warehouse.name }}</option>
              </select>
              <small v-if="selectedWarehouse">Kho trong phân công của bạn</small>
            </label>

            <div class="field-pair">
              <label class="field"><span>Số lượng thực nhận <b>*</b></span>
                <input v-model="form.quantity" type="number" min="0.000001" step="any" required placeholder="Nhập số lượng (> 0)" />
                <small>Ghi theo số lượng thực tế đã kiểm đếm.</small>
              </label>
              <label class="field"><span>Đơn vị tính <b>*</b></span>
                <select v-model="form.unitId" required><option value="" disabled>Chọn đơn vị</option>
                  <option v-for="unit in options.units" :key="unit.id" :value="unit.id">{{ unit.name }}</option>
                </select>
              </label>
            </div>

            <label class="field"><span>Tình trạng thực tế tại trạm tiếp nhận <b>*</b></span>
              <select v-model="form.conditionId" required><option value="" disabled>Chọn tình trạng sau thẩm định</option>
                <option v-for="condition in options.conditions" :key="condition.id" :value="condition.id">{{ condition.name }}</option>
              </select>
              <small>Đánh giá trực tiếp, độc lập với tình trạng người gửi tự khai báo.</small>
            </label>

            <label class="field"><span>Ghi chú khi kiểm tra <em>Tùy chọn</em></span>
              <textarea v-model="form.note" rows="3" maxlength="1000" placeholder="Ghi nhận sai lệch, hao hụt, hư hại bao bì hoặc lưu ý nghiệp vụ…" />
            </label>

            <div class="receipt-meta">
              <div><AuthIcon name="user" /><span><small>Nhân sự tiếp nhận</small><strong>{{ isDemoPreview ? 'Nhân sự xem thử (demo)' : currentUser?.displayName || currentUser?.email || 'Nhân sự kho' }}</strong>
                <small>{{ isDemoPreview ? 'Danh tính mô phỏng' : staffAssignment?.role || 'Nhân viên được phân quyền' }}</small></span></div>
              <div><AuthIcon name="clock" /><span><small>Thời gian thực nhận</small><strong>Ghi nhận khi xác nhận</strong><small>Thời gian hệ thống</small></span></div>
            </div>
            <p v-if="submitError" class="inline-error" role="alert"><AuthIcon name="alert-circle" />{{ submitError }}</p>
          </form>

          <aside class="side-stack">
            <section class="receipt-card guidance-card"><div class="section-title"><AuthIcon name="network" /><h2>Lưu ý nghiệp vụ</h2><span>Quy trình cần chốt</span></div>
              <ul><li>Chỉ ghi nhận yêu cầu đã được duyệt.</li><li>Số lượng thực tế được nhập độc lập với số người gửi khai báo.</li>
                <li>Xác nhận thực nhận không tự động nhập kho hoặc tăng tồn.</li></ul>
              <p>Kho nhận phải nằm trong phân công hiện tại của nhân sự.</p>
              <em>Thao tác này không tự động tạo phiếu nhập kho hay làm tăng số lượng tồn kho khả dụng.</em>
            </section>
            <section class="receipt-card progress-card"><h2>Tiến trình vận hành</h2>
              <div class="progress-step is-done"><i>1</i><span><strong>Phê duyệt quyên góp</strong><small>{{ isApproved ? 'Hoàn tất (approved)' : 'Chưa hoàn tất' }}</small></span></div>
              <div class="progress-step is-current"><i>2</i><span><strong>Ghi nhận thực nhận tại kho</strong><small>Đang thực hiện (received)</small></span></div>
              <div class="progress-step"><i>3</i><span><strong>Nhập kho &amp; xếp giá kệ</strong><small>Chờ chuyển giao (in_stock)</small></span></div>
            </section>
            <section class="receipt-card safety-card"><div class="section-title"><AuthIcon name="shield-check" /><h2>Quy chuẩn an toàn vận hành</h2></div>
              <p>Trước khi gửi dữ liệu, hệ thống phải xác thực lại quyền thao tác tại kho đã chọn và kiểm tra trạng thái đơn phải còn hiệu lực “Đã duyệt”.</p>
              <p>Nếu mất kết nối hoặc quyền truy cập thay đổi, hãy tải lại trạng thái mới nhất trước khi xác nhận.</p>
            </section>
          </aside>
        </div>
      </template>

      <div v-if="donation && options" class="sticky-actions">
        <span class="sticky-actions__hint"><AuthIcon name="terminal" /> Phiên bản giao diện mẫu 1.0.4-rc <b>•</b> Sandbox ReShare Ops</span>
        <div><RouterLink :to="backRoute" class="button button--soft">Hủy bỏ</RouterLink>
          <button type="submit" form="actual-receipt-form" class="button button--primary" :disabled="saving || !isApproved || Boolean(createdReceipt)"><AuthIcon name="check" />Xác nhận thực nhận</button></div>
      </div>

      <div v-if="showConfirm" class="dialog-backdrop" role="presentation" @click.self="showConfirm = false">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h2 id="confirm-title">Xác nhận hàng thực nhận?</h2>
          <p>Ghi nhận {{ form.quantity }} {{ options?.units?.find((unit) => unit.id === form.unitId)?.name || '' }} tại {{ selectedWarehouse?.name }}. Số liệu tồn kho không thay đổi ở bước này.</p>
          <div class="form-actions"><button class="button button--soft" type="button" :disabled="saving" @click="showConfirm = false">Quay lại</button>
            <button class="button button--primary" type="button" :disabled="saving" @click="submitReceipt">{{ saving ? 'Đang lưu…' : 'Xác nhận' }}</button></div>
        </section>
      </div>
    </div>
    </main>
    <footer class="admin-footer"><span>© 2024 ReShare Circular Fashion Hub. Hệ thống điều phối nội bộ.</span><span>Trung tâm trợ giúp vận hành</span><span>Chính sách an toàn kho</span><b><i></i>Hệ thống máy chủ: Sẵn sàng</b></footer>
  </div>
</template>

<style scoped>
.receipt-page{width:min(1120px,100%);margin:0 auto;display:grid;gap:18px;color:#182235}.receipt-page :where(h1,h2,p,dl){margin:0}.receipt-back{display:inline-flex;align-items:center;gap:8px;color:#435064;text-decoration:none;font-weight:600}.receipt-card{background:#fff;border:1px solid #e8ebf2;border-radius:14px;box-shadow:0 3px 14px #1c23310a}.receipt-heading{display:flex;align-items:center;gap:14px;padding:22px 26px}.receipt-heading__icon{display:grid;place-items:center;width:48px;height:48px;border-radius:10px;background:#e9f5eb;color:#176b2b;flex:none}.receipt-heading h1{font-size:24px;line-height:1.3}.receipt-heading p{margin-top:4px;color:#596476}.receipt-status{margin-left:auto;padding:6px 12px;border-radius:99px;background:#edf0f4;color:#586171;font-size:13px;font-weight:700;white-space:nowrap}.receipt-status--approved{background:#dcf6dd;color:#18712c}.receipt-notice{display:flex;gap:12px;align-items:flex-start;padding:20px;background:#eef2ff;border:1px solid #dce4ff;border-radius:12px}.receipt-notice--error{background:#fff2f0;border-color:#ffd9d5;color:#8e2723}.receipt-notice p{margin-top:4px}.receipt-link-button{margin-top:10px;padding:0;border:0;background:none;color:#176b2b;text-decoration:underline;font:inherit;font-weight:600;cursor:pointer}.section-title{display:flex;align-items:center;gap:10px;color:#176b2b}.section-title h2{color:#192337;font-size:16px}.section-title span{margin-left:auto;padding:4px 9px;border-radius:6px;background:#eff2fb;color:#515d72;font-size:12px}.donor-card{padding:20px 24px}.donor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 26px;margin-top:20px!important}.donor-grid dt{color:#667080;font-size:13px;font-weight:600}.donor-grid dd{margin-top:4px;font-weight:600;overflow-wrap:anywhere}.receipt-columns{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(260px,.9fr);gap:18px;align-items:start}.form-card{padding:22px 24px;display:grid;gap:20px}.form-title{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e9edf3;padding-bottom:16px}.form-title h2{font-size:18px}.form-title p{margin-top:5px;color:#606a78;font-size:14px}.form-title small,.field b{color:#c42e28}.field{display:grid;gap:7px;font-weight:600}.field>span{font-size:15px}.field em{margin-left:auto;color:#657080;font-size:12px;font-style:normal;font-weight:500}.field input,.field select,.field textarea{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;border:1px solid #dce1e8;border-radius:9px;background:#fff;color:#182235;font:inherit;font-weight:400}.field textarea{resize:vertical}.field :focus{outline:3px solid #1f6b2c2e;border-color:#1f6b2c}.field small{color:#626c7a;font-size:13px;font-weight:400}.field-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.receipt-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px}.receipt-meta>div{display:flex;gap:11px;padding:14px;border-radius:10px;background:#eff2ff;color:#176b2b}.receipt-meta span{display:grid;gap:2px}.receipt-meta small{color:#586274;font-size:12px}.receipt-meta strong{color:#172238;font-size:14px}.side-stack{display:grid;gap:18px}.guidance-card,.progress-card{padding:20px}.guidance-card ul{margin:16px 0;padding-left:20px;color:#475264}.guidance-card li+li{margin-top:10px}.guidance-card>p{margin-top:14px;padding:12px;border-radius:8px;background:#f4f6ff;color:#4d586a;font-size:13px}.progress-card h2{margin-bottom:18px;font-size:15px}.progress-step{display:flex;gap:12px;position:relative;padding:0 0 20px}.progress-step:not(:last-child):after{content:"";position:absolute;left:12px;top:27px;bottom:3px;border-left:2px solid #e3e7ed}.progress-step i{z-index:1;display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#eef1f7;color:#637084;font-style:normal;font-size:12px}.progress-step.is-done i,.progress-step.is-current i{background:#19712c;color:white}.progress-step span{display:grid;gap:3px}.progress-step strong{font-size:13px}.progress-step small{color:#647084;font-size:12px}.progress-step.is-done small{color:#19712c}.inline-error{display:flex;gap:8px;align-items:center;color:#b42318;font-size:14px}.form-actions{display:flex;justify-content:flex-end;gap:10px;padding-top:4px}.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:0;border-radius:9px;font:inherit;font-weight:650;text-decoration:none;cursor:pointer}.button:disabled{opacity:.55;cursor:not-allowed}.button--soft{background:#edf0fa;color:#273347}.button--primary{background:#176b2b;color:#fff}.dialog-backdrop{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:20px;background:#10182880}.confirm-dialog{width:min(480px,100%);padding:24px;border-radius:14px;background:#fff;box-shadow:0 20px 60px #0003}.confirm-dialog h2{font-size:20px}.confirm-dialog p{margin:12px 0 22px;color:#4e5a6c}@media(max-width:780px){.receipt-columns{grid-template-columns:1fr}.side-stack{grid-template-columns:1fr 1fr}.receipt-heading{align-items:flex-start;flex-wrap:wrap}.receipt-status{margin-left:62px}}@media(max-width:560px){.donor-grid{grid-template-columns:1fr 1fr}.field-pair,.receipt-meta,.side-stack{grid-template-columns:1fr}.receipt-heading{padding:18px}.receipt-heading h1{font-size:20px}.receipt-heading p{font-size:14px}.donor-card,.form-card{padding:18px}}
.receipt-notice--success{background:#eaf7ec;border-color:#c9e8cd;color:#175f27}
.receipt-notice--demo{background:#fff8e6;border-color:#f2dea4;color:#775513}
.admin-shell{--ink:#182235;--muted:#596476;--green:#176b2b;min-height:100vh;background:#f8f8ff;color:var(--ink);font:14px/1.45 'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',sans-serif;padding-top:72px;padding-bottom:58px}
.admin-shell *{box-sizing:border-box}.topbar{height:72px;position:fixed;z-index:8;inset:0 0 auto;display:flex;align-items:center;gap:16px;padding:0 28px;background:#fff;border-bottom:1px solid #e5e8ef;white-space:nowrap}.brand{height:100%;display:flex;align-items:center;gap:8px;min-width:250px;padding-right:18px;border-right:1px solid #edf0f4;color:#12652a}.brand strong{font-size:17px}.brand-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:6px;background:#19732e;color:white}.brand-tag{font-size:8px;letter-spacing:.07em;padding:2px 5px;background:#eff8ef;border-radius:3px}.brand-caption{margin-left:12px;max-width:100px;white-space:normal;color:#596476;font-size:11px;line-height:1.15}.topbar__warehouse{display:flex;align-items:center;gap:9px;min-width:155px;color:#176b2b}.topbar__warehouse span:nth-child(2),.topbar__shift span{display:grid;line-height:1.25}.topbar__warehouse strong,.topbar__shift strong{color:#263247;font-size:13px}.topbar__warehouse small,.topbar__shift small{font-size:11px;color:#697486}.topbar__active,.topbar__demo{padding:7px 10px;border-radius:18px;background:#e7f6e8;color:#247332;font-size:11px}.topbar__active i,.station-status i,.admin-footer i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#25893c;margin-right:6px}.topbar__demo{background:#eef2ff;color:#45536b}.topbar__shift{display:flex;align-items:center;gap:8px;padding:6px 13px;border-radius:9px;background:#f6f7fa}.topbar__search{display:flex;align-items:center;gap:8px;min-width:180px;flex:1;padding:9px 12px;border:0;border-radius:9px;background:#f7f8fb;color:#626d7d;text-align:left;font:inherit;font-size:12px}.topbar__search kbd{margin-left:auto;padding:1px 5px;border-radius:4px;background:#e8ebf2}.topbar__icon{border:0;background:transparent;color:#435064}.topbar__profile{display:flex;align-items:center;gap:8px}.profile-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#075b25;color:white;font-size:10px;font-weight:700}.topbar__profile>span:nth-child(2){display:grid;line-height:1.25}.topbar__profile strong{font-size:12px}.topbar__profile small{color:#657080;font-size:10px}.sidebar{position:fixed;z-index:6;top:72px;bottom:0;left:0;display:flex;flex-direction:column;width:264px;padding:24px 18px;background:#fff;border-right:1px solid #edf0f4}.sidebar__label{margin:0 10px 12px;color:#626c78;font-size:11px;font-weight:700;letter-spacing:.025em}.sidebar__label--second{margin-top:27px}.sidebar>a{display:flex;align-items:center;gap:12px;min-height:42px;padding:0 11px;border-radius:8px;color:#404b46;text-decoration:none;font-size:14px}.sidebar>a :deep(svg){color:#506154}.sidebar>a.is-active{background:#eef3ff;color:#15263c;font-weight:650}.station-status{display:grid;gap:6px;margin-top:auto;padding:14px;border-radius:10px;background:#f1f3ff;color:#606a78;font-size:11px}.station-status span{display:flex;justify-content:space-between}.station-status b{color:#176b2b;font-weight:600}.station-status small{font-size:11px}.admin-main{min-height:calc(100vh - 130px);margin-left:264px;padding:12px 32px 100px}.receipt-page{width:min(100%,1160px);margin:0 auto;gap:16px}.breadcrumbs{display:flex;align-items:center;gap:10px;min-height:24px;color:#697486;font-size:12px}.breadcrumbs a{padding:4px 10px;border-radius:8px;background:#eef2ff;color:#3d4c63;text-decoration:none;font-weight:600}.breadcrumbs strong{color:#176b2b}.receipt-notice--demo{padding:10px 15px;border:0;border-radius:24px;background:#e6edff;color:#355079;font-size:12px}.receipt-notice--demo>svg{color:#176b2b;flex:none}.receipt-notice--demo strong{color:#176b2b;font-size:12px;letter-spacing:.04em}.receipt-notice--demo strong span{padding:0 8px;color:#c5cfe3}.receipt-notice--demo p{display:inline;margin-left:8px;color:#52617a}.receipt-heading{min-height:100px;padding:20px 24px;border:0;border-radius:14px;box-shadow:0 2px 8px #18223508}.receipt-heading__icon{width:42px;height:42px;background:#176b2b;color:#fff}.receipt-heading h1{font-size:23px;font-weight:700;letter-spacing:-.02em}.receipt-heading p{font-size:13px;color:#586272}.receipt-status{align-self:center;margin-left:auto}.donor-card{padding:0 24px 22px;overflow:hidden}.donor-card .section-title{margin:0 -24px;padding:14px 22px;background:#f0f3ff}.donor-grid{row-gap:18px}.donor-grid dd{font-size:14px;font-weight:500}.receipt-columns{grid-template-columns:minmax(0,1.8fr) minmax(285px,.92fr);gap:20px}.form-card{padding:22px 24px;gap:18px}.form-title{padding-bottom:15px}.form-title h2{font-size:17px}.field input,.field select,.field textarea{min-height:42px;border-color:#e5e8ef;border-radius:9px;font-size:13px}.field textarea{min-height:90px}.field>span{font-size:14px}.field small{font-size:12px}.receipt-meta>div{min-height:94px;background:#f0f3ff}.side-stack{gap:18px}.guidance-card,.progress-card{border:0;box-shadow:0 2px 10px #18223508}.guidance-card{background:#fff}.guidance-card ul{font-size:13px}.progress-card{background:#fff}.sticky-actions{position:fixed;z-index:7;left:264px;right:28px;bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:none;padding:12px 16px;background:#fff;border:1px solid #eaedf3;border-radius:12px;box-shadow:0 5px 18px #1722381c}.sticky-actions>div{display:flex;gap:10px}.sticky-actions__hint{display:flex;align-items:center;gap:8px;color:#4e5a6c;font-family:ui-monospace,monospace;font-size:12px}.sticky-actions__hint b{color:#9ba4b1}.button{min-height:42px;font-size:13px}.button--primary{background:#176b2b}.admin-footer{position:fixed;z-index:4;right:0;bottom:0;left:264px;display:flex;align-items:center;gap:22px;min-height:48px;padding:8px 32px;background:#fff;color:#526070;font-size:11px}.admin-footer b{margin-left:auto;color:#176b2b;font-weight:500}.admin-footer i{width:7px;height:7px}@media(max-width:1150px){.topbar{gap:9px;padding:0 16px}.brand{min-width:215px}.brand-caption,.topbar__active,.topbar__shift{display:none}.sidebar{width:220px}.admin-main{margin-left:220px;padding-right:20px;padding-left:20px}.sticky-actions{left:220px;right:16px}.admin-footer{left:220px;padding-right:20px;padding-left:20px}.receipt-columns{grid-template-columns:minmax(0,1.5fr) minmax(270px,.9fr)}}@media(max-width:760px){.admin-shell{padding-top:60px;padding-bottom:0}.topbar{height:60px}.brand{min-width:auto;border:0;padding:0}.brand-caption,.topbar__warehouse,.topbar__demo,.topbar__search,.topbar__profile>span:nth-child(2){display:none}.topbar__profile{margin-left:auto}.sidebar{display:none}.admin-main{margin:0;padding:12px 14px 100px}.receipt-columns{grid-template-columns:1fr}.side-stack{grid-template-columns:1fr 1fr}.sticky-actions{left:10px;right:10px;bottom:10px}.sticky-actions__hint{display:none}.admin-footer{display:none}.receipt-heading{flex-wrap:wrap}.receipt-status{margin-left:54px}.donor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.topbar{padding:0 14px}.side-stack,.field-pair,.receipt-meta{grid-template-columns:1fr}.breadcrumbs{gap:5px;font-size:10px}.receipt-heading{gap:10px;padding:16px}.receipt-heading h1{font-size:19px}.receipt-heading p{font-size:12px}.receipt-status{margin-left:0}.donor-grid{grid-template-columns:1fr 1fr}.form-card,.donor-card{padding-right:16px;padding-left:16px}.sticky-actions{padding:9px}.sticky-actions>div{width:100%}.sticky-actions .button{flex:1;padding:0 8px;font-size:12px}}
.sticky-actions{position:sticky;left:auto;right:auto;bottom:10px;width:100%;margin-top:0}
.admin-footer{position:relative;right:auto;bottom:auto;left:auto;margin-left:264px}
@media(max-width:1150px){.admin-footer{left:auto;margin-left:220px}}
.receipt-status-block{display:grid;justify-items:end;gap:3px;margin-left:auto;white-space:nowrap}.receipt-status-block>small{font-size:10px;font-weight:700;color:#586272;letter-spacing:.045em}.receipt-status{display:inline-flex;align-items:center;gap:6px;margin-left:0}
.field-pair{align-items:start}.field-pair>.field{grid-template-rows:20px 44px auto;align-content:start}.field-pair>.field>span{display:flex;align-items:center;min-height:20px;line-height:20px}.field-pair>.field>input,.field-pair>.field>select{align-self:start;height:44px;min-height:44px;margin:0}
.guidance-card .section-title span{padding:5px 10px;border-radius:99px;background:#e3eaff;color:#334c79;white-space:nowrap}.guidance-card>em{display:block;margin-top:14px;color:#596476;font-size:12px;line-height:1.5}.safety-card{padding:20px;background:#fff}.safety-card p{margin-top:12px;color:#4b5666;font-size:13px;line-height:1.55}
@media(max-width:1150px){.receipt-columns{grid-template-columns:1fr}.side-stack{grid-template-columns:1fr 1fr}.safety-card{grid-column:1/-1}}
@media(max-width:1000px){.brand{min-width:auto;padding-right:10px}.topbar__warehouse{min-width:145px}.topbar__warehouse span:nth-child(2){display:grid}.topbar__profile>span:nth-child(2){display:none}.topbar__search{display:none}.topbar__active{display:inline-flex}.topbar__shift{display:flex}}
@media(max-width:760px){.sticky-actions{left:auto;right:auto;bottom:10px;width:100%}.admin-footer{display:none}.topbar__shift{display:none}.receipt-status-block{justify-items:start;margin:0 0 0 54px}.side-stack{grid-template-columns:1fr}.safety-card{grid-column:auto}}
</style>
