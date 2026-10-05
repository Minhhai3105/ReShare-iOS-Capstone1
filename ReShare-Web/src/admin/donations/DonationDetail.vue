<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import AuthShell from '../auth/components/AuthShell.vue'
import { decideDemoDonation, loadDemoDonation, statusLabels, steps } from './donation.demo'

// Auth belongs to the routed adapter; the shared view has no Firebase dependency.
const props = defineProps({
  warehouseId: { type: String, required: true },
  donationId: { type: String, required: true },
  actorId: { type: String, required: true },
  authorizeWarehouse: { type: Function, required: true },
  localPreview: { type: Boolean, default: false },
})
const donation = ref(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref('')
const conflict = ref(false)
const scenario = ref('normal')
const selectedImage = ref(0)
const enlarged = ref(false)
const imageDialog = ref(null)
const action = ref('approve')
const publicMessage = ref('')
const internalNote = ref('')
let generation = 0
const allowed = computed(() => donation.value && props.authorizeWarehouse(donation.value.hubId)
  && donation.value.hubId === props.warehouseId)
const canDecide = computed(() => allowed.value && donation.value.status === 'pending'
  && donation.value.reviewState !== 'needs_information' && !conflict.value)
const activeImage = computed(() => donation.value?.images[selectedImage.value])
const actionLabels = { approve: 'Duyệt donation', reject: 'Từ chối donation', information: 'Yêu cầu bổ sung' }
const messages = {
  NETWORK: 'Không thể kết nối. Dữ liệu và quyết định chưa được lưu; hãy thử lại.',
  NOT_FOUND: 'Không tìm thấy donation. Kiểm tra mã đơn hoặc quay về quản trị.',
  FORBIDDEN: 'Bạn không có quyền xử lý donation tại kho này.',
  CONFLICT: 'Donation đã được nhân sự khác xử lý hoặc đổi phiên bản. Tải trạng thái mới trước khi quyết định tiếp.',
  VALIDATION: 'Kiểm tra nội dung công khai và độ dài ghi chú.',
}
function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
}
async function load(resetForm = false) {
  const ticket = ++generation
  donation.value = null
  loading.value = true
  error.value = ''
  success.value = ''
  conflict.value = false
  enlarged.value = false
  selectedImage.value = 0
  if (resetForm) {
    action.value = 'approve'
    publicMessage.value = ''
    internalNote.value = ''
  }
  try {
    const result = await loadDemoDonation(props.warehouseId, props.donationId, scenario.value)
    if (ticket !== generation) return
    donation.value = result
  } catch (cause) {
    if (ticket === generation) error.value = messages[cause.code] || 'Không tải được donation.'
  } finally {
    if (ticket === generation) loading.value = false
  }
}
async function submit() {
  if (submitting.value || !canDecide.value) return
  error.value = ''
  success.value = ''
  if (action.value !== 'approve' && !publicMessage.value.trim()) {
    error.value = action.value === 'reject' ? 'Bắt buộc nhập lý do công khai cho donor.' : 'Bắt buộc nhập nội dung yêu cầu bổ sung cho donor.'
    return
  }
  const ticket = generation
  submitting.value = true
  try {
    const result = await decideDemoDonation({
      donation: donation.value, action: action.value, publicMessage: publicMessage.value,
      internalNote: internalNote.value, actor: props.actorId, scenario: scenario.value,
      authorize: (hubId) => hubId === props.warehouseId && props.authorizeWarehouse(hubId),
    })
    if (ticket !== generation) return
    donation.value = result
    publicMessage.value = ''
    internalNote.value = ''
    success.value = 'Đã lưu quyết định trong bộ nhớ demo. Không gửi thông báo thật; không cập nhật inventory.'
  } catch (cause) {
    if (ticket !== generation) return
    error.value = messages[cause.code] || 'Không lưu được quyết định. Hãy thử lại.'
    conflict.value = cause.code === 'CONFLICT'
  } finally {
    submitting.value = false
  }
}
function refreshAfterConflict() {
  scenario.value = 'normal'
  load()
}
watch(() => [props.warehouseId, props.donationId], () => load(true), { immediate: true })
watch(action, () => { publicMessage.value = ''; error.value = ''; success.value = '' })
watch(enlarged, async (value) => {
  await nextTick()
  if (value) imageDialog.value?.showModal()
})
</script>

<template>
  <AuthShell :show-server-status="!localPreview">
    <div class="donation-page">
      <p v-if="localPreview" class="eyebrow">PREVIEW LOCAL ĐỘC LẬP · KHÔNG CẦN ĐĂNG NHẬP</p>
      <RouterLink v-else :to="{ name: 'admin-home' }">← Về quản trị</RouterLink>
      <header class="page-heading"><div><p class="eyebrow">THẨM ĐỊNH DONATION</p><h1>Chi tiết donation</h1></div><span class="demo-tag">DEMO / MOCK · RC1D-67</span></header>
      <p class="demo-notice">Dữ liệu và ảnh minh họa mock; quyết định chỉ lưu trong bộ nhớ và mất khi tải lại trang. Backend quyết định donation chưa có. {{ localPreview ? 'Preview local dùng nhân sự và kho mock; không đọc/ghi Firebase hoặc gọi API thật.' : 'Quyền đăng nhập/kho vẫn dùng auth hiện tại.' }}</p>
      <div class="demo-controls">
        <label for="scenario">Tình huống demo</label>
        <select id="scenario" v-model="scenario" :disabled="loading || submitting" @change="load(true)">
          <option value="normal">Pending — xử lý bình thường</option>
          <option value="information">Pending — chờ donor bổ sung</option>
          <option v-for="state in steps.slice(1)" :key="state" :value="state">{{ statusLabels[state] }} — chỉ xem</option>
          <option value="rejected">Đã từ chối — chỉ xem</option>
          <option value="conflict">Xung đột khi gửi quyết định</option>
          <option value="network-submit">Lỗi mạng khi gửi quyết định</option>
          <option value="network">Lỗi tải dữ liệu</option>
          <option value="missing">Không tìm thấy đơn</option>
          <option value="wrong-warehouse">Donation thuộc kho khác</option>
          <option value="no-images">Không có ảnh</option>
          <option value="no-ai">Không có AI / donor confirmation</option>
        </select>
        <button :disabled="loading || submitting" @click="load()">Tải lại dữ liệu</button>
      </div>
      <p v-if="loading" role="status" class="notice">Đang tải donation…</p>
      <div v-if="error" role="alert" class="notice error">{{ error }} <button v-if="conflict" :disabled="submitting" @click="refreshAfterConflict">Tải trạng thái mới</button></div>
      <p v-if="success" role="status" class="notice success">{{ success }}</p>
      <p v-if="donation && !allowed" role="alert" class="notice error">Donation thuộc kho ngoài phân công hoặc không khớp kho trên URL. Không hiển thị chi tiết và không cho xử lý.</p>
      <template v-if="donation && allowed">
        <section class="card status-card" aria-labelledby="status-title">
          <div class="section-heading"><h2 id="status-title">{{ statusLabels[donation.status] }}</h2><span>Phiên bản {{ donation.version }}</span></div>
          <p v-if="donation.reviewState === 'needs_information'" class="notice">Chờ donor bổ sung thông tin. Donation vẫn pending; khóa quyết định trong demo cho đến khi có dữ liệu bổ sung từ backend.</p>
          <ol class="stepper" aria-label="Tiến trình donation">
            <li v-for="(state, index) in steps" :key="state" :class="{ completed: donation.status !== 'rejected' && index <= steps.indexOf(donation.status) }" :aria-current="donation.status === state ? 'step' : undefined"><span>{{ index + 1 }}</span>{{ statusLabels[state] }}</li>
          </ol>
          <p v-if="donation.status === 'rejected'" class="rejected">Đơn đã bị từ chối; không tiếp tục luồng tiếp nhận.</p>
          <p v-if="donation.statusNote"><strong>Nội dung công khai cho donor:</strong> {{ donation.statusNote }}</p>
        </section>
        <div class="detail-grid">
          <div class="details">
            <section class="card" aria-labelledby="item-title">
              <p class="eyebrow">{{ donation.id }} · Kho {{ donation.hubId }}</p><h2 id="item-title">{{ donation.title }}</h2>
              <figure v-if="activeImage" class="gallery">
                <button class="main-image" aria-label="Phóng to ảnh đang chọn" @click="enlarged = true"><img :src="activeImage.url" :alt="activeImage.alt" /></button>
                <figcaption>Ảnh {{ selectedImage + 1 }}/{{ donation.images.length }} · Nhấn ảnh để phóng to</figcaption>
                <div class="thumbnails"><button v-for="(photo, index) in donation.images" :key="photo.url" :aria-label="`Xem ảnh ${index + 1}`" :aria-pressed="selectedImage === index" @click="selectedImage = index"><img :src="photo.url" :alt="photo.alt" /></button></div>
              </figure>
              <p v-else class="notice">Donor chưa cung cấp ảnh.</p>
              <dl class="facts"><div><dt>Danh mục</dt><dd>{{ donation.category }}</dd></div><div><dt>Tình trạng khai báo</dt><dd>{{ donation.condition }}</dd></div><div><dt>Số lượng khai báo</dt><dd>{{ donation.quantity }}</dd></div><div><dt>Hình thức giao</dt><dd>{{ donation.deliveryMethod }}</dd></div></dl>
              <p class="description">{{ donation.description }}</p>
            </section>
            <section class="card"><h2>Người tặng & xác nhận</h2><dl class="facts"><div><dt>Donor</dt><dd>{{ donation.donor.name }}</dd></div><div><dt>Email</dt><dd>{{ donation.donor.email }}</dd></div><div><dt>Ngày gửi</dt><dd>{{ formatDate(donation.createdAt) }}</dd></div><div><dt>Donor confirmation</dt><dd>{{ donation.donorConfirmation || 'Chưa có dữ liệu xác nhận từ donor.' }}</dd></div></dl></section>
            <section class="card"><h2>AI prediction</h2><template v-if="donation.aiPrediction"><p>{{ donation.aiPrediction.label }} · Độ tin cậy {{ donation.aiPrediction.confidence }}%</p><p>Thông tin tham khảo, nhân sự chịu trách nhiệm thẩm định.</p></template><p v-else>Chưa có kết quả AI cho donation này.</p></section>
            <section class="card">
              <h2>Lịch sử trạng thái</h2>
              <ol class="history">
                <li v-for="(event, index) in donation.history" :key="index">
                  <strong>{{ event.label }}</strong>
                  <time :datetime="event.at">{{ formatDate(event.at) }}</time>
                  <span v-if="event.version">Actor: {{ event.actor }} · {{ event.from }} → {{ event.to }} · v{{ event.version }}</span>
                  <p v-if="event.reviewState === 'needs_information'">Chờ donor bổ sung thông tin.</p>
                  <div v-if="event.publicMessage" class="history-public">
                    <strong>{{ event.action === 'reject' ? 'Lý do từ chối công khai cho donor' : event.action === 'information' ? 'Nội dung yêu cầu bổ sung cho donor' : 'Lời nhắn công khai cho donor' }}</strong>
                    <p>{{ event.publicMessage }}</p>
                  </div>
                  <div v-if="event.internalNote" class="history-internal">
                    <strong>Ghi chú riêng cho staff</strong>
                    <p>{{ event.internalNote }}</p>
                  </div>
                </li>
              </ol>
            </section>
          </div>
          <aside class="card decision"><h2>Quyết định thẩm định</h2>
            <p v-if="!canDecide" class="notice">{{ conflict ? 'Cần tải phiên bản mới để tiếp tục.' : 'Trạng thái hiện tại không cho phép ra quyết định.' }}</p>
            <form @submit.prevent="submit">
              <fieldset :disabled="!canDecide || submitting"><legend>Chọn quyết định</legend>
                <label v-for="(label, value) in actionLabels" :key="value" class="radio"><input v-model="action" type="radio" :value="value" name="decision" />{{ label }}</label>
                <label for="public-message">{{ action === 'reject' ? 'Lý do từ chối công khai *' : action === 'information' ? 'Nội dung yêu cầu bổ sung *' : 'Lời nhắn công khai (tùy chọn)' }}</label>
                <textarea id="public-message" v-model="publicMessage" :required="action !== 'approve'" maxlength="1000" rows="4" aria-describedby="public-help" />
                <small id="public-help">Donor sẽ thấy nội dung này khi backend được kết nối. {{ publicMessage.length }}/1000</small>
                <label for="internal-note">Internal note (tùy chọn)</label>
                <textarea id="internal-note" v-model="internalNote" maxlength="2000" rows="3" aria-describedby="internal-help" />
                <small id="internal-help">Ghi chú riêng cho nhân sự; lưu tách khỏi lý do công khai. {{ internalNote.length }}/2000</small>
                <p class="notice">Duyệt chỉ chuyển sang “Đã duyệt”, không tăng tồn kho. Inventory cần nghiệp vụ tiếp nhận riêng.</p>
                <button type="submit" class="submit" :class="{ danger: action === 'reject' }">{{ submitting ? 'Đang lưu…' : `${actionLabels[action]} (demo)` }}</button>
              </fieldset>
            </form>
            <div v-if="donation.internalNote" class="internal"><strong>Ghi chú nội bộ đã lưu</strong><p>{{ donation.internalNote }}</p></div>
          </aside>
        </div>
      </template>
      <dialog v-if="enlarged && activeImage" ref="imageDialog" class="lightbox" aria-label="Ảnh donation phóng to" @close="enlarged = false" @cancel="enlarged = false">
        <button autofocus @click="enlarged = false">Đóng ảnh</button><img :src="activeImage.url" :alt="activeImage.alt" />
      </dialog>
    </div>
  </AuthShell>
</template>

<style scoped>
.donation-page { width: 100%; max-width: 1200px; margin: auto; }
.donation-page a { color: #1f6b2c; }
.page-heading,.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 18px 0; }
h1 { font-size: clamp(24px, 4vw, 34px); } h2 { font-size: 20px; margin-bottom: 16px; }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #526354; overflow-wrap: anywhere; }
.demo-tag { background: #fff0c9; color: #715300; padding: 6px 12px; border-radius: 8px; white-space: nowrap; font-weight: 700; }
.demo-notice,.notice { padding: 12px 16px; border-radius: 8px; background: #f0f4ed; margin: 12px 0; }
.demo-notice { background: #fff5dc; }
.demo-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 20px 0; }
.card { background: white; border: 1px solid #dde2ea; border-radius: 14px; padding: 24px; margin-bottom: 20px; }
.status-card .section-heading { margin-top: 0; }
.stepper { list-style: none; padding: 0; display: flex; gap: 12px; margin: 20px 0; }
.stepper li { flex: 1; color: #596274; border-top: 3px solid #dde2ea; padding-top: 12px; font-size: 13px; }
.stepper li.completed { border-color: #277a3b; color: #1f6b2c; font-weight: 700; }
.stepper li span { display: block; margin-bottom: 4px; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); gap: 24px; align-items: start; }
.details { min-width: 0; } .decision { position: sticky; top: 20px; }
.gallery { margin: 18px 0; } .gallery img { display: block; width: 100%; object-fit: contain; }
.main-image { width: 100%; padding: 0; overflow: hidden; } .main-image img { max-height: 380px; }
figcaption { font-size: 13px; color: #596274; margin: 8px 0; }
.thumbnails { display: flex; gap: 10px; } .thumbnails button { width: 90px; padding: 3px; }
.thumbnails button[aria-pressed=true] { border: 2px solid #1f6b2c; }
.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
dt { color: #596274; font-size: 13px; } dd { font-weight: 600; overflow-wrap: anywhere; }
.description { margin-top: 20px; } .history { padding-left: 20px; } .history li { padding: 8px 0; }
.history time,.history span { display: block; color: #596274; font-size: 13px; }
.history-public,.history-internal { margin-top: 10px; padding: 12px; border-radius: 8px; }
.history-public { background: #f0f4ed; }
.history-internal { background: #f3f4f7; border-left: 3px solid #7b8392; }
.history p { white-space: pre-wrap; overflow-wrap: anywhere; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; } legend { font-weight: 600; }
label { display: block; font-weight: 600; margin-top: 18px; } .radio { font-weight: 400; display: flex; align-items: center; gap: 8px; margin: 12px 0; }
textarea,select,button { font: inherit; border: 1px solid #c8d0c8; border-radius: 8px; padding: 10px 12px; }
textarea { display: block; width: 100%; resize: vertical; margin-top: 8px; } small { display: block; color: #596274; margin-top: 6px; }
button { min-height: 44px; cursor: pointer; background: white; color: #25382b; } button:disabled { cursor: not-allowed; opacity: .6; }
:is(button,textarea,select,input):focus-visible { outline: 3px solid #26793b; outline-offset: 3px; }
.submit { width: 100%; background: #1f6b2c; color: white; font-weight: 700; } .submit.danger { background: #a62424; }
.error { background: #fdeceb; color: #9c2020; } .success { background: #e3f3e5; color: #1f6b2c; } .rejected { color: #9c2020; }
.internal { border-top: 1px solid #dde2ea; padding-top: 16px; margin-top: 20px; }
.internal p,.status-card p,.description { white-space: pre-wrap; overflow-wrap: anywhere; }
.lightbox { position: fixed; inset: 5vh 5vw; width: 90vw; height: 90vh; z-index: 20; background: #15221ff5; border: 0; border-radius: 12px; padding: 20px; box-shadow: 0 0 0 100vmax #0008; }
.lightbox img { display: block; width: 100%; height: calc(100% - 60px); object-fit: contain; margin-top: 12px; }
@media (max-width: 800px) { .detail-grid { grid-template-columns: 1fr; } .decision { position: static; } .stepper { flex-wrap: wrap; } .stepper li { min-width: 100px; } .card { padding: 18px; } .facts { grid-template-columns: 1fr; } .page-heading { flex-wrap: wrap; } select { max-width: 100%; } }
</style>
