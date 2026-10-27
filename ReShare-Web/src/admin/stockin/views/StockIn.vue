<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { currentUser, staffAssignment, canAccessWarehouse } from '../../auth/auth.store'
import { ADMIN_ROUTE } from '../../auth/auth.constants'
import { demoStockInRepository, STOCK_IN_ERROR, stockInRepository } from '../stockin.repository'
import brandLogo from '../../auth/assets/reshare-logo.png'

const route = useRoute()
const isDemoPreview = import.meta.env.DEV && route.meta.devPreview === true
const repository = isDemoPreview ? demoStockInRepository : stockInRepository
const loading = ref(true)
const loadError = ref('')
const submitError = ref('')
const saving = ref(false)
const showConfirm = ref(false)
const createdEntry = ref(null)
const donation = ref(null)
const receipt = ref(null)
const form = reactive({ location: '', note: '' })
const backRoute = computed(() => (isDemoPreview || !route.params.donationId
  ? { name: ADMIN_ROUTE.home }
  : { name: 'admin-donation-detail', params: { donationId: route.params.donationId } }))
// Lỗi khi gửi phiếu: { kind, message, status }. retryPayload giữ nguyên dữ liệu đã gửi để thử lại.
const submitFailure = ref(null)
const retryPayload = ref(null)
const failureNotice = ref(null)
const failureKind = computed(() => submitFailure.value?.kind ?? null)
// 403 và 409 khóa nút gửi cho đến khi tải lại trạng thái; lỗi tạm thời chỉ cho thử lại bằng payload cũ.
const submitLocked = computed(() => failureKind.value === STOCK_IN_ERROR.forbidden ||
  failureKind.value === STOCK_IN_ERROR.conflict || Boolean(retryPayload.value))

const isReceived = computed(() => donation.value?.status === 'received')
const warehouseName = computed(() => donation.value?.expectedWarehouseName || receipt.value?.warehouseId || '')
const quantityText = computed(() => receipt.value ? `${receipt.value.quantity} ${receipt.value.unitName}`.trim() : '—')
const receivedAtText = computed(() => {
  if (!receipt.value?.receivedAt) return ''
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(receipt.value.receivedAt))
})
const validForm = computed(() => !loadError.value && isReceived.value && receipt.value && form.location.trim())

async function load() {
  loading.value = true
  loadError.value = ''
  submitFailure.value = null
  retryPayload.value = null
  donation.value = null
  receipt.value = null
  try {
    const donationId = route.params.donationId || 'DEMO-REQ-2026-001'
    const [record, receiptRecord] = await Promise.all([
      repository.getDonation(donationId),
      repository.getReceipt(donationId),
    ])
    donation.value = record
    receipt.value = receiptRecord
    if (isDemoPreview && !form.location) form.location = 'Kệ A1-02 (demo)'
    if (record.status === 'in_stock') loadError.value = 'Yêu cầu này đã được nhập kho trước đó.'
    else if (record.status !== 'received') loadError.value = `Chỉ nhập kho cho yêu cầu đã thực nhận (received). Trạng thái hiện tại: ${record.status || 'không xác định'}.`
    else if (!isDemoPreview && !canAccessWarehouse(receiptRecord.warehouseId)) loadError.value = 'Bạn chưa được phân công vào kho đã thực nhận yêu cầu này.'
  } catch (error) {
    loadError.value = error?.message || 'Không thể tải thông tin nhập kho. Vui lòng thử lại.'
  } finally {
    loading.value = false
  }
}

function askToConfirm() {
  submitError.value = ''
  if (submitLocked.value) return
  if (!validForm.value) {
    submitError.value = 'Vui lòng nhập vị trí lưu kho.'
    return
  }
  showConfirm.value = true
}

async function sendStockIn(payload) {
  if (saving.value || createdEntry.value) return
  saving.value = true
  submitError.value = ''
  submitFailure.value = null
  retryPayload.value = null
  try {
    const result = await repository.createStockIn(payload)
    createdEntry.value = result ?? {}
  } catch (error) {
    const kind = error?.kind ?? STOCK_IN_ERROR.other
    submitFailure.value = {
      kind,
      status: error?.status ?? 0,
      message: error?.message || 'Không thể lưu phiếu nhập kho.',
    }
    if (kind === STOCK_IN_ERROR.retryable) retryPayload.value = payload
    await nextTick()
    failureNotice.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } finally {
    showConfirm.value = false
    saving.value = false
  }
}

function submitStockIn() {
  return sendStockIn(Object.freeze({
    donationId: donation.value.id,
    receiptId: receipt.value.id,
    warehouseId: receipt.value.warehouseId,
    quantity: receipt.value.quantity,
    unitId: receipt.value.unitId,
    location: form.location.trim(),
    note: form.note.trim(),
    // Khóa cố định theo phiếu thực nhận để Backend loại bỏ phiếu nhập trùng khi gửi lại.
    idempotencyKey: `stk_${receipt.value.id}`,
  }))
}

function retrySubmit() {
  if (retryPayload.value) sendStockIn(retryPayload.value)
}

// Người dùng sửa biểu mẫu thì payload cũ không còn khớp: bỏ lựa chọn thử lại.
watch(() => ({ ...form }), () => {
  if (!retryPayload.value) return
  retryPayload.value = null
  submitFailure.value = null
})

onMounted(load)
</script>

<template>
  <div class="admin-shell">
    <header class="topbar">
      <div class="brand"><img class="brand-logo" :src="brandLogo" alt="" /><strong>ReShare</strong><span class="brand-tag">PORTAL</span><span class="brand-caption">Hệ thống điều phối vận hành</span></div>
      <div class="topbar__warehouse"><AuthIcon name="warehouse" :size="18" /><span><strong>{{ warehouseName || 'Chưa xác định kho' }}</strong><small>{{ isDemoPreview ? 'Kho minh họa' : 'Kho nhập' }}</small></span></div>
      <span v-if="isDemoPreview" class="topbar__demo">Dữ liệu demo</span>
      <div class="topbar__profile"><span class="profile-avatar">NV</span><span><strong>{{ currentUser?.displayName || currentUser?.email || 'Nhân sự' }}</strong><small>{{ staffAssignment?.role || 'Chưa có quyền' }}</small></span></div>
    </header>

    <aside class="sidebar">
      <p class="sidebar__label">VẬN HÀNH KHO &amp; XỬ LÝ</p>
      <RouterLink :to="{ name: ADMIN_ROUTE.home }"><AuthIcon name="dashboard" />Tổng quan</RouterLink>
      <span class="sidebar__label sidebar__label--second">Nhập kho</span>
    </aside>

    <main class="admin-main">
    <div class="stock-page">
      <div class="breadcrumbs"><span>Yêu cầu quyên góp</span><b>/</b><span>Chi tiết yêu cầu</span><b>/</b><strong>Nhập kho</strong>
        <RouterLink class="breadcrumbs__back" :to="backRoute"><AuthIcon name="arrow-left" :size="14" />Quay lại chi tiết yêu cầu</RouterLink></div>

      <div v-if="isDemoPreview" class="stock-notice stock-notice--demo" role="status">
        <AuthIcon name="alert-triangle" /><div><strong>MÔI TRƯỜNG XEM THỬ</strong>
          <p>Dữ liệu mô phỏng; thao tác nhập kho không ghi vào tồn kho thật.</p></div>
      </div>

      <header class="stock-heading">
        <div>
          <div class="stock-heading__title"><h1>Nhập kho</h1>
            <span class="stock-status" :class="isReceived ? 'stock-status--received' : ''">{{ isReceived ? 'Đã thực nhận (received)' : donation?.status || 'Chờ kiểm tra' }}</span></div>
          <p>Tạo phiếu nhập và ghi nhận tồn sau khi đã kiểm tra hàng thực nhận.</p>
        </div>
        <div class="stock-location"><AuthIcon name="warehouse" :size="18" /><span><small>ĐỊA ĐIỂM XỬ LÝ</small><strong>{{ warehouseName || '—' }}</strong></span></div>
      </header>

      <div v-if="loading" class="stock-notice" role="status">Đang tải thông tin nhập kho…</div>
      <div v-if="createdEntry" class="stock-notice stock-notice--success" role="status">
        <AuthIcon name="badge-check" /><div><strong>Đã tạo phiếu nhập kho.</strong>
          <p v-if="createdEntry.id">Mã phiếu nhập: {{ createdEntry.id }}</p>
          <p>{{ createdEntry.simulated ? 'Đây là kết quả mô phỏng; không có dữ liệu nào được lưu.' : 'Phiếu nhập đã được dịch vụ lưu.' }}</p>
          <RouterLink v-if="createdEntry.id" class="stock-link-button"
            :to="isDemoPreview ? { name: 'admin-stock-entry-preview' } : { name: 'admin-stock-entry-detail', params: { entryId: createdEntry.id } }">Xem chi tiết phiếu nhập</RouterLink>
        </div>
      </div>
      <div v-else-if="loadError" class="stock-notice stock-notice--error" role="alert">
        <AuthIcon name="alert-circle" />
        <div><strong>Chưa thể nhập kho</strong><p>{{ loadError }}</p>
          <button class="stock-link-button" type="button" @click="load">Thử tải lại</button>
        </div>
      </div>

      <div v-if="submitFailure && !createdEntry" ref="failureNotice" class="stock-notice stock-notice--error" role="alert">
        <AuthIcon name="alert-circle" />
        <div v-if="failureKind === STOCK_IN_ERROR.forbidden">
          <strong>Không có quyền nhập kho (403)</strong>
          <p>{{ submitFailure.message }}</p>
          <p>Phiếu nhập chưa được tạo và nút xác nhận đã bị khóa để tránh gửi trùng. Hãy liên hệ quản trị hệ thống để kiểm tra vai trò và phân công kho của bạn, sau đó tải lại trạng thái.</p>
          <button class="stock-link-button" type="button" @click="load">Tải lại trạng thái quyền</button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.conflict">
          <strong>Yêu cầu đã thay đổi hoặc đã được nhập kho (409)</strong>
          <p>{{ submitFailure.message }}</p>
          <p>Dữ liệu trên màn hình có thể đã cũ, hoặc yêu cầu đã được nhập kho ở nơi khác. Hãy tải trạng thái mới nhất và kiểm tra lại trước khi gửi tiếp.</p>
          <button class="stock-link-button" type="button" @click="load">Tải lại trạng thái mới nhất</button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.retryable">
          <strong>Chưa lưu được phiếu nhập{{ submitFailure.status ? ` (${submitFailure.status})` : '' }}</strong>
          <p>{{ submitFailure.message }}</p>
          <p v-if="retryPayload">Bạn có thể thử lại với đúng dữ liệu vừa gửi. Nếu sửa biểu mẫu, lựa chọn thử lại sẽ bị hủy và bạn cần xác nhận lại.</p>
          <button v-if="retryPayload" class="button button--primary failure-retry" type="button" :disabled="saving" @click="retrySubmit">
            {{ saving ? 'Đang gửi lại…' : 'Thử lại' }}
          </button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.validation">
          <strong>Thông tin nhập kho chưa hợp lệ (400)</strong>
          <p>{{ submitFailure.message }}</p>
          <p>Sửa lại vị trí lưu kho hoặc ghi chú rồi xác nhận lại.</p>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.auth">
          <strong>Phiên đăng nhập không còn hiệu lực</strong>
          <p>{{ submitFailure.message }}</p>
          <RouterLink class="stock-link-button" :to="{ name: ADMIN_ROUTE.login, query: { redirect: route.fullPath } }">Đăng nhập lại</RouterLink>
        </div>
        <div v-else>
          <strong>Không thể lưu phiếu nhập kho{{ submitFailure.status ? ` (${submitFailure.status})` : '' }}</strong>
          <p>{{ submitFailure.message }}</p>
          <p>Kiểm tra lại thông tin đã nhập hoặc tải lại trạng thái trước khi gửi lại.</p>
          <button class="stock-link-button" type="button" @click="load">Tải lại trạng thái</button>
        </div>
      </div>

      <div v-if="donation && receipt" class="stock-columns">
        <div class="main-stack">
          <section class="stock-card" aria-labelledby="receipt-title">
            <div class="card-title"><span class="card-title__icon"><AuthIcon name="badge-check" /></span>
              <div><h2 id="receipt-title">Hàng đã thực nhận (Chỉ đọc)</h2><p>Dữ liệu đối chiếu từ biên bản thực nhận tại trạm tiếp nhận.</p></div></div>
            <dl class="readonly-grid">
              <div><dt>Vật phẩm</dt><dd>{{ donation.itemName || '—' }}</dd></div>
              <div><dt>Yêu cầu nguồn</dt><dd>{{ donation.id || '—' }}</dd></div>
              <div><dt>Kho dự kiến trên yêu cầu</dt><dd>{{ donation.expectedWarehouseName || '—' }}</dd></div>
              <div class="readonly-grid__match"><dt>Kho thực nhận</dt><dd>{{ warehouseName || '—' }}</dd></div>
              <div><dt>Số lượng thực nhận</dt><dd>{{ receipt.quantity ?? '—' }}</dd></div>
              <div><dt>Đơn vị</dt><dd>{{ receipt.unitName || '—' }}</dd></div>
              <div><dt>Tình trạng thực tế</dt><dd>{{ receipt.conditionName || '—' }}</dd></div>
              <div><dt>Người ghi nhận &amp; thời gian thực nhận</dt><dd>{{ [receipt.actorName, receivedAtText].filter(Boolean).join(' · ') || '—' }}</dd></div>
            </dl>
          </section>

          <form id="stock-in-form" class="stock-card form-card" @submit.prevent="askToConfirm">
            <div class="card-title"><span class="card-title__icon"><AuthIcon name="inbox" /></span>
              <div><h2>Chi tiết tạo phiếu nhập kho</h2><p>Khởi tạo bản ghi phiếu nhập vào dữ liệu tồn kho.</p></div></div>

            <div class="field-pair">
              <label class="field"><span>Số lượng nhập <AuthIcon name="lock" :size="13" /></span>
                <input :value="quantityText" type="text" readonly />
                <small>Kế thừa từ số lượng thực nhận; không sửa tại bước này.</small>
              </label>
              <label class="field"><span>Chứng từ nguồn (Biên bản thực nhận)</span>
                <input :value="receipt.id || '—'" type="text" readonly />
                <small>Mã biên bản thực nhận đã ghi nhận.</small>
              </label>
            </div>

            <label class="field"><span>Vị trí lưu kho <b>*</b></span>
              <input v-model="form.location" type="text" required maxlength="120" placeholder="Nhập vị trí lưu (ví dụ: Kệ A1-02)" />
            </label>

            <div class="stock-meta">
              <div><AuthIcon name="file-text" /><span><small>Mã phiếu nhập kho</small><strong>Hệ thống tạo sau khi xác nhận</strong></span></div>
              <div><AuthIcon name="clock" /><span><small>Thời gian nhập kho</small><strong>Ghi nhận khi xác nhận thành công</strong></span></div>
            </div>

            <label class="field"><span>Ghi chú nhập kho <em>Tùy chọn · tối đa 300 ký tự</em></span>
              <textarea v-model="form.note" rows="3" maxlength="300" placeholder="Ghi chú về quy cách đóng gói, nhãn phụ hoặc lưu ý bảo quản…" />
            </label>
            <p v-if="submitError" class="inline-error" role="alert"><AuthIcon name="alert-circle" />{{ submitError }}</p>
          </form>
        </div>

        <aside class="side-stack">
          <section class="stock-card side-card"><h2>Tiến trình tiếp nhận &amp; tồn</h2>
            <div class="progress-step is-done"><i>1</i><span><strong>Đã duyệt tiếp nhận</strong><small>Phê duyệt thông tin đề xuất quyên góp</small></span></div>
            <div class="progress-step" :class="isReceived ? 'is-done' : ''"><i>2</i><span><strong>Đã thực nhận</strong><small>Kiểm tra số lượng và lập biên bản</small></span></div>
            <div class="progress-step is-current"><i>3</i><span><strong>Nhập kho &amp; lưu trữ</strong><small>Ghi nhận tồn và gán vị trí kệ</small></span></div>
            <div class="progress-step"><i>4</i><span><strong>Sẵn sàng phân phối</strong><small>Được chọn để phân bổ người thụ hưởng</small></span></div>
          </section>
          <section class="stock-card side-card side-card--tinted"><h2><AuthIcon name="refresh" :size="16" />Hệ quả nghiệp vụ</h2>
            <p>Sau khi xác nhận, hệ thống tạo một phiếu nhập kho, ghi nhận số lượng vào kho thực nhận và chuyển yêu cầu sang trạng thái “Trong kho” (in_stock).</p>
          </section>
          <section class="stock-card side-card"><h2><AuthIcon name="shield-check" :size="16" />Lưu ý an toàn nghiệp vụ</h2>
            <ul><li>Mỗi phiếu thực nhận chỉ tạo một phiếu nhập; gửi lại cùng dữ liệu không tạo phiếu thứ hai.</li>
              <li>Sai lệch kho hoặc thiếu quyền sẽ bị từ chối; hãy tải lại trạng thái mới nhất trước khi gửi tiếp.</li></ul>
          </section>
        </aside>
      </div>

      <div v-if="donation && receipt" class="sticky-actions">
        <RouterLink :to="backRoute" class="button button--soft">Hủy</RouterLink>
        <div><span class="sticky-actions__hint">{{ isDemoPreview ? 'Chế độ xem thử, không lưu dữ liệu' : 'Phiếu được chốt ngay khi bấm xác nhận' }}</span>
          <button type="submit" form="stock-in-form" class="button button--primary" :disabled="saving || submitLocked || !isReceived || Boolean(loadError) || Boolean(createdEntry)"><AuthIcon name="inbox" />Xác nhận nhập kho</button></div>
      </div>

      <div v-if="showConfirm" class="dialog-backdrop" role="presentation" @click.self="showConfirm = false">
        <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h2 id="confirm-title">Xác nhận nhập kho?</h2>
          <p>Nhập {{ quantityText }} vào {{ warehouseName }}, vị trí {{ form.location.trim() }}. Phiếu nhập sẽ được chốt ngay sau khi xác nhận.</p>
          <div class="form-actions"><button class="button button--soft" type="button" :disabled="saving" @click="showConfirm = false">Quay lại</button>
            <button class="button button--primary" type="button" :disabled="saving" @click="submitStockIn">{{ saving ? 'Đang lưu…' : 'Xác nhận' }}</button></div>
        </section>
      </div>
    </div>
    </main>
    <footer class="admin-footer"><span>ReShare · Hệ thống điều phối nội bộ</span></footer>
  </div>
</template>

<style scoped>
.admin-shell{min-height:100vh;padding-top:72px;background:#f8f8ff;color:#182235;font:14px/1.45 'Be Vietnam Pro',system-ui,-apple-system,'Segoe UI',sans-serif}
.admin-shell *{box-sizing:border-box}
.topbar{position:fixed;z-index:8;inset:0 0 auto;height:72px;display:flex;align-items:center;gap:16px;padding:0 28px;background:#fff;border-bottom:1px solid #e5e8ef;white-space:nowrap}
.brand{height:100%;display:flex;align-items:center;gap:8px;min-width:250px;padding-right:18px;border-right:1px solid #edf0f4;color:#12652a}.brand strong{font-size:17px}.brand-logo{display:block;width:36px;height:36px;object-fit:contain}.brand-tag{padding:2px 5px;border-radius:3px;background:#eff8ef;font-size:8px;letter-spacing:.07em}.brand-caption{max-width:75px;white-space:normal;color:#596476;font-size:11px;line-height:1.15}
.topbar__warehouse{display:flex;align-items:center;gap:9px;color:#176b2b}.topbar__warehouse span:nth-child(2),.topbar__profile>span:nth-child(2){display:grid;line-height:1.25}.topbar__warehouse strong{color:#263247;font-size:13px}.topbar__warehouse small,.topbar__profile small{color:#697486;font-size:11px}
.topbar__demo{padding:7px 10px;border-radius:18px;background:#eef2ff;color:#45536b;font-size:11px}
.topbar__profile{display:flex;align-items:center;gap:8px;margin-left:auto}.topbar__profile strong{font-size:12px}.profile-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#075b25;color:#fff;font-size:10px;font-weight:700}
.sidebar{position:fixed;z-index:6;top:72px;bottom:0;left:0;display:flex;flex-direction:column;width:264px;padding:24px 18px;background:#fff;border-right:1px solid #edf0f4}.sidebar__label{margin:0 10px 12px;color:#626c78;font-size:11px;font-weight:700;letter-spacing:.025em}.sidebar__label--second{margin-top:27px}.sidebar>a{display:flex;align-items:center;gap:12px;min-height:42px;padding:0 11px;border-radius:8px;color:#404b46;text-decoration:none}
.admin-main{margin-left:264px;padding:12px 32px 24px}
.admin-footer{margin-left:264px;padding:14px 32px;background:#fff;color:#526070;font-size:11px}
.stock-page{display:grid;gap:16px;width:min(100%,1160px);margin:0 auto}.stock-page :where(h1,h2,p,dl,ul){margin:0}
.breadcrumbs{display:flex;align-items:center;gap:8px;min-height:32px;color:#697486;font-size:12px}.breadcrumbs b{color:#b4bccb;font-weight:400}.breadcrumbs strong{color:#182235}
.breadcrumbs__back{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:6px 12px;border-radius:8px;background:#fff;border:1px solid #e5e8ef;color:#176b2b;text-decoration:none;font-weight:600}
.stock-notice{display:flex;gap:12px;align-items:flex-start;padding:16px 20px;border:1px solid #dce4ff;border-radius:12px;background:#eef2ff}.stock-notice p{margin-top:4px}
.stock-notice--demo{border-color:#f2dea4;background:#fff8e6;color:#775513}
.stock-notice--error{border-color:#ffd9d5;background:#fff2f0;color:#8e2723}.stock-notice--error p+p{color:#6b3330}
.stock-notice--success{border-color:#c9e8cd;background:#eaf7ec;color:#175f27}
.stock-link-button{display:inline-block;margin-top:10px;padding:0;border:0;background:none;color:#176b2b;text-decoration:underline;font:inherit;font-weight:600;cursor:pointer}
.failure-retry{margin-top:12px;min-height:38px}
.stock-heading{display:flex;align-items:center;gap:16px;padding:8px 0}.stock-heading__title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.stock-heading h1{font-size:26px;letter-spacing:-.02em}.stock-heading p{margin-top:6px;color:#586272}
.stock-status{padding:4px 10px;border-radius:99px;background:#edf0f4;color:#586171;font-size:12px;font-weight:700}.stock-status--received{background:#dcf6dd;color:#18712c}
.stock-location{display:flex;align-items:center;gap:10px;margin-left:auto;padding:10px 14px;border-radius:12px;background:#fff;border:1px solid #e8ebf2;color:#176b2b}.stock-location span{display:grid;line-height:1.3}.stock-location small{color:#586272;font-size:10px;font-weight:700;letter-spacing:.04em}.stock-location strong{color:#182235;font-size:13px}
.stock-columns{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(270px,.92fr);gap:20px;align-items:start}
.main-stack,.side-stack{display:grid;gap:18px}
.stock-card{padding:22px 24px;border:1px solid #e8ebf2;border-radius:14px;background:#fff;box-shadow:0 2px 10px #18223508}
.card-title{display:flex;gap:12px;align-items:flex-start;margin-bottom:18px}.card-title__icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:9px;background:#e9f5eb;color:#176b2b}.card-title h2{font-size:17px}.card-title p{margin-top:3px;color:#606a78;font-size:13px}
.readonly-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.readonly-grid>div{padding:12px 14px;border-radius:10px;background:#f0f3ff}.readonly-grid dt{color:#586272;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.readonly-grid dd{margin:6px 0 0;font-weight:600;overflow-wrap:anywhere}.readonly-grid__match{background:#e8f6ea!important}.readonly-grid__match dd{color:#176b2b}
.form-card{display:grid;gap:18px}.form-card .card-title{margin-bottom:0}
.field{display:grid;gap:7px;font-weight:600}.field>span{display:flex;align-items:center;gap:6px}.field b{color:#c42e28}.field em{margin-left:auto;color:#657080;font-size:12px;font-style:normal;font-weight:500}
.field input,.field textarea{width:100%;min-height:42px;padding:10px 12px;border:1px solid #e5e8ef;border-radius:9px;background:#fff;color:#182235;font:inherit;font-weight:400}.field input[readonly]{background:#f0f3ff;color:#4b5666}.field textarea{min-height:90px;resize:vertical}.field :focus{outline:3px solid #1f6b2c2e;border-color:#1f6b2c}.field small{color:#626c7a;font-size:12px;font-weight:400}
.field-pair,.stock-meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.stock-meta>div{display:flex;gap:10px;padding:14px;border-radius:10px;background:#f0f3ff;color:#176b2b}.stock-meta span{display:grid;gap:2px}.stock-meta small{color:#586274;font-size:11px;font-weight:700;text-transform:uppercase}.stock-meta strong{color:#172238;font-size:13px}
.inline-error{display:flex;gap:8px;align-items:center;color:#b42318}
.side-card h2{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:15px;color:#192337}.side-card h2 :deep(svg){color:#176b2b}.side-card p,.side-card li{color:#4b5666;font-size:13px;line-height:1.55}.side-card ul{padding-left:18px}.side-card li+li{margin-top:8px}.side-card--tinted{background:#eef2ff;border-color:#dce4ff}
.progress-step{position:relative;display:flex;gap:12px;padding-bottom:18px}.progress-step:not(:last-child):after{content:"";position:absolute;left:12px;top:27px;bottom:3px;border-left:2px solid #e3e7ed}.progress-step i{z-index:1;display:grid;place-items:center;flex:none;width:25px;height:25px;border-radius:50%;background:#eef1f7;color:#637084;font-style:normal;font-size:12px}.progress-step.is-done i{background:#cdeccf;color:#176b2b}.progress-step.is-current i{background:#176b2b;color:#fff}.progress-step span{display:grid;gap:2px}.progress-step strong{font-size:13px}.progress-step small{color:#647084;font-size:12px}
.sticky-actions{position:sticky;z-index:7;bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border:1px solid #eaedf3;border-radius:12px;background:#fff;box-shadow:0 5px 18px #1722381c}.sticky-actions>div{display:flex;align-items:center;gap:14px}.sticky-actions__hint{color:#4e5a6c;font-size:12px}
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border:0;border-radius:9px;font:inherit;font-size:13px;font-weight:650;text-decoration:none;cursor:pointer}.button:disabled{opacity:.55;cursor:not-allowed}.button--soft{background:#edf0fa;color:#273347}.button--primary{background:#176b2b;color:#fff}
.dialog-backdrop{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:20px;background:#10182880}.confirm-dialog{width:min(480px,100%);padding:24px;border-radius:14px;background:#fff;box-shadow:0 20px 60px #0003}.confirm-dialog h2{font-size:20px}.confirm-dialog p{margin:12px 0 22px;color:#4e5a6c}.form-actions{display:flex;justify-content:flex-end;gap:10px}
@media(max-width:1150px){.sidebar{width:220px}.admin-main,.admin-footer{margin-left:220px;padding-right:20px;padding-left:20px}.brand{min-width:auto}.brand-caption{display:none}.stock-columns{grid-template-columns:1fr}.side-stack{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.admin-shell{padding-top:60px}.topbar{height:60px;padding:0 14px}.brand{border:0;padding:0}.topbar__warehouse,.topbar__demo,.topbar__profile>span:nth-child(2){display:none}.sidebar{display:none}.admin-main{margin:0;padding:12px 14px 24px}.admin-footer{display:none}.stock-heading{flex-wrap:wrap}.stock-location{margin-left:0}.side-stack,.readonly-grid,.field-pair,.stock-meta{grid-template-columns:1fr}.breadcrumbs{flex-wrap:wrap}.breadcrumbs__back{margin-left:0}.sticky-actions__hint{display:none}.stock-card{padding:18px 16px}}
</style>
