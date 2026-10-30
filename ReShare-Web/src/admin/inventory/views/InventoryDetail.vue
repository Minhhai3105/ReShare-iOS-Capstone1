<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InventoryLayout from '../InventoryLayout.vue'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { staffAssignment } from '../../auth/auth.store'
import { ADMIN_ROUTE, USER_ROLE, USER_ROLE_LABEL } from '../../auth/auth.constants'
import { resolveQueueAccess } from '../../donations/donation.service'
import {
  CONDITION_LABEL,
  DONATION_DETAIL_ROUTE,
  INVENTORY_ERROR,
  MOVEMENT_TYPE_LABEL,
  fetchInventoryItem,
  formatDateTime,
  getAccessibleWarehouses,
  getItemSources,
} from '../inventory.service'

// Nhãn demo (Sandbox, Demo, Xem thử, Prototype) chỉ hiện khi chạy dữ liệu mẫu ở dev, không hiện trên bản production.
const IS_SAMPLE_DATA = import.meta.env.DEV

const STATE_MESSAGE = {
  [INVENTORY_ERROR.notConfigured]: { icon: 'server', title: 'Chưa kết nối nguồn tồn kho', text: 'Phiên bản này chưa có dữ liệu tồn kho chính thức từ hệ thống, nên chưa xem được chi tiết vật phẩm.' },
  [INVENTORY_ERROR.forbidden]: { icon: 'shield', title: 'Không có quyền xem vật phẩm này', text: 'Vật phẩm thuộc kho bạn không được phân công.' },
  [INVENTORY_ERROR.notFound]: { icon: 'search', title: 'Không tìm thấy vật phẩm', text: 'Mã vật phẩm không tồn tại hoặc đã bị gỡ khỏi kho.' },
  [INVENTORY_ERROR.server]: { icon: 'cloud-off', title: 'Không tải được vật phẩm', text: 'Máy chủ hoặc kết nối mạng đang gặp sự cố. Vui lòng thử lại.' },
}
const RULES = [
  { icon: 'clipboard-check', title: 'Nguyên tắc xác định số lượng còn', text: 'Số lượng còn là kết quả suy diễn từ các giao dịch kho đã xác nhận. Mỗi lần nhập, phân phối hay điều chỉnh đều bắt buộc có chứng từ và sự kiện kiểm toán đi kèm.' },
  { icon: 'pie-chart', title: 'Phân phối từng phần', text: 'Xuất phân bổ chỉ giảm số lượng thực tế xuất đi, không đánh dấu tự động toàn bộ vật phẩm từ yêu cầu quyên góp gốc là đã phân phối xong.' },
  { icon: 'clipboard-check', title: 'Kiểm soát đồng thời (Concurrency)', text: 'Máy chủ sẽ thẩm định phân quyền kho, số dư tức thời và phát hiện xung đột trước khi cho phép xác nhận phân phối hoặc điều chỉnh.' },
  { icon: 'ban', title: 'Tách biệt tuyệt đối với P2P', text: 'Các bài đăng "Kho đồ 0đ" chia sẻ ngang hàng P2P thuộc hệ thống catalog_items hoàn toàn tách biệt, không bao giờ xuất hiện hay quản lý tại kho vật lý này.' },
]

const route = useRoute()
const router = useRouter()
const data = ref(null)
const errorStatus = ref(null)
const isLoading = ref(true)
let latestRequestId = 0

const access = computed(() => resolveQueueAccess(staffAssignment.value))
const item = computed(() => data.value?.item ?? null)
const movements = computed(() => data.value?.movements ?? [])
const warehouses = computed(() => (item.value ? [item.value.warehouse] : getAccessibleWarehouses(access.value)))
const stateMessage = computed(() => STATE_MESSAGE[errorStatus.value] ?? null)
const isSystemAdmin = computed(() => staffAssignment.value?.role === USER_ROLE.systemAdmin)
// Khi chưa tải được vật phẩm thì hiển thị phạm vi theo phân công thay cho "—".
const scopeName = computed(() =>
  item.value?.warehouse.name ?? (isSystemAdmin.value ? 'Tất cả kho' : warehouses.value.map(({ name }) => name).join(', ') || '—'),
)
const accessLabel = computed(() => {
  const role = staffAssignment.value?.role
  if (!role) return '—'
  const scope = isSystemAdmin.value ? 'toàn hệ thống' : scopeName.value.replace(/Kho /g, '')
  return `${USER_ROLE_LABEL[role]} (${scope})`
})
const donationParams = computed(() => ({ donationId: item.value?.donationId }))
const sources = computed(() => getItemSources(item.value))

async function load() {
  const requestId = ++latestRequestId
  isLoading.value = true
  errorStatus.value = null
  // Đổi vật phẩm hoặc phân công thì không giữ dữ liệu của lần xem trước.
  data.value = null
  try {
    const nextData = await fetchInventoryItem(access.value, route.params.itemId)
    if (requestId === latestRequestId) data.value = nextData
  } catch (error) {
    if (requestId !== latestRequestId) return
    data.value = null
    errorStatus.value = error.status ?? INVENTORY_ERROR.server
  } finally {
    if (requestId === latestRequestId) isLoading.value = false
  }
}

const formatCode = (code) => (code ? code.toUpperCase() : '—')
const formatQuantity = (quantity) => (quantity > 0 ? `+${quantity}` : `${quantity}`)

watch([() => route.params.itemId, staffAssignment], load, { immediate: true })
onBeforeUnmount(() => { latestRequestId += 1 })
</script>

<template>
  <InventoryLayout
    :warehouses="warehouses"
    :selected-warehouse-id="item?.warehouseId ?? (isSystemAdmin ? '' : warehouses[0]?.id ?? '')"
    @select-warehouse="(warehouseId) => router.push({ name: ADMIN_ROUTE.inventory, query: { warehouseId: warehouseId || undefined } })"
  >
    <nav class="detail-crumbs">
      <span><AuthIcon name="archive" :size="16" /><RouterLink :to="{ name: ADMIN_ROUTE.inventory }">Kho hàng</RouterLink> / <b>Chi tiết vật phẩm</b></span>
      <RouterLink :to="{ name: ADMIN_ROUTE.inventory, query: item ? { warehouseId: item.warehouseId } : {} }" class="detail-back">
        <AuthIcon name="arrow-left" :size="16" />Quay lại kho hàng
      </RouterLink>
    </nav>

    <section v-if="IS_SAMPLE_DATA" class="inv-sandbox">
      <AuthIcon name="flask" :size="26" />
      <div>
        <span class="inv-chip inv-chip--solid">Môi trường thử nghiệm (Sandbox Node)</span>
        <span class="mono detail-node">Node ID: WH-SGN-02 // HCH-DEMO</span>
        <p>Dữ liệu kho dưới đây thuộc phạm vi <strong>{{ scopeName }}</strong>. Dữ liệu thử nghiệm quy trình, không can thiệp luồng phân phối thực tế.</p>
      </div>
    </section>

    <header class="detail-head">
      <div>
        <p class="detail-tags"><span class="inv-chip mono">Chỉ đọc / Read-only</span>Phân loại kho: Tiếp nhận quyên góp</p>
        <h1>Chi tiết vật phẩm <span class="inv-chip">Mã vật phẩm: {{ formatCode(item?.id ?? route.params.itemId) }}</span></h1>
      </div>
      <span class="inv-chip detail-access"><AuthIcon name="shield-check" :size="16" />Quyền truy cập: {{ accessLabel }}</span>
    </header>

    <div v-if="stateMessage" class="inv-card inv-state inv-state--danger" role="alert">
      <span class="inv-state__icon"><AuthIcon :name="stateMessage.icon" :size="34" /></span>
      <h2>{{ stateMessage.title }}</h2>
      <p>{{ stateMessage.text }}</p>
      <div class="detail-state-actions">
        <button v-if="errorStatus === INVENTORY_ERROR.server" type="button" class="inv-btn inv-btn--primary" @click="load"><AuthIcon name="refresh" :size="18" />Thử lại</button>
        <RouterLink :to="{ name: ADMIN_ROUTE.inventory }" class="inv-btn"><AuthIcon name="arrow-left" :size="18" />Về kho hàng</RouterLink>
      </div>
    </div>

    <div v-else class="detail-grid" :aria-busy="isLoading" :class="{ 'is-loading': isLoading }">
      <div class="detail-main">
        <section class="inv-card">
          <div class="detail-card-head">
            <h2><AuthIcon name="clipboard-check" :size="22" />Thông tin tồn kho</h2>
            <span class="detail-hint"><AuthIcon name="refresh" :size="15" />Tính từ lịch sử biến động</span>
          </div>
          <div class="detail-core">
            <div>
              <p class="detail-label"><AuthIcon name="scale" :size="18" />Chỉ số cốt lõi: Số lượng còn</p>
              <p><strong class="detail-qty mono">{{ item?.remainingQuantity ?? '—' }}</strong> Đơn vị: {{ item?.unit ?? '—' }}</p>
            </div>
            <div class="detail-core__status">
              <span>Tình trạng tồn:
                <span class="inv-chip" :class="item ? (item.remainingQuantity > 0 ? 'inv-chip--green' : 'inv-chip--danger') : ''">
                  <i />{{ item ? (item.remainingQuantity > 0 ? 'Còn hàng' : 'Hết hàng') : '—' }}
                </span>
              </span>
              <small>Hệ thống tự động kích hoạt "Còn hàng" (&gt;0) hoặc "Hết hàng" (=0) từ số dư tức thời.</small>
            </div>
          </div>
          <div class="detail-facts">
            <div><AuthIcon name="warehouse" :size="20" /><div><p class="detail-label">Kho lưu vật lý</p><strong>{{ item?.warehouse.name ?? '—' }} <AuthIcon v-if="item" name="check-circle" :size="16" class="is-green" /></strong><small>{{ item?.warehouse.area }}</small></div></div>
            <div><AuthIcon name="shelves" :size="20" /><div><p class="detail-label">Vị trí kệ / Ô lưu</p><strong class="mono">{{ item?.location ?? '—' }}</strong><small>{{ item ? 'Dãy - Kệ - Ô lưu' : 'Định dạng gợi ý: Chưa gán vị trí lưu kho' }}</small></div></div>
            <div><AuthIcon name="download" :size="20" /><div><p class="detail-label">Số lượng đã nhập ban đầu</p><strong class="mono">{{ item ? `${item.initialQuantity} ${item.unit}` : '—' }}</strong><small>Ghi nhận cố định qua Biên bản thực nhận</small></div></div>
            <div><AuthIcon name="list-check" :size="20" /><div><p class="detail-label">Tình trạng thực tế (kiểm định)</p><strong>{{ CONDITION_LABEL[item?.condition] ?? '—' }}</strong><small>Theo biên bản phân loại &amp; thẩm định chất lượng</small></div></div>
          </div>
          <p class="detail-lock"><AuthIcon name="lock" :size="18" />Bảo toàn dữ liệu: Màn hình chỉ đọc. Nghiêm cấm chỉnh sửa thủ công số lượng hoặc trạng thái. Mọi biến động phải sinh giao dịch kiểm toán.</p>
        </section>

        <section class="inv-card">
          <div class="detail-card-head">
            <h2><AuthIcon name="history" :size="22" />Lịch sử nhập, xuất và điều chỉnh</h2>
            <span class="inv-chip mono">Append-only audit log</span>
          </div>
          <div class="detail-history">
            <table class="inv-table">
              <thead><tr><th>Thời gian</th><th>Loại thao tác</th><th>Số lượng</th><th>Người thực hiện</th><th>Chứng từ</th><th>Ghi chú</th></tr></thead>
              <tbody v-if="movements.length">
                <tr v-for="movement in movements" :key="movement.id">
                  <td class="detail-nowrap">{{ formatDateTime(movement.createdAt) }}</td>
                  <td><span class="inv-chip" :class="{ 'inv-chip--green': movement.quantity > 0, 'inv-chip--danger': movement.quantity < 0 }">{{ MOVEMENT_TYPE_LABEL[movement.type] }}</span></td>
                  <td class="mono detail-move" :class="movement.quantity > 0 ? 'is-green' : 'is-red'">{{ formatQuantity(movement.quantity) }}</td>
                  <td>{{ movement.actor }}</td>
                  <td class="detail-nowrap">
                    <span class="mono">{{ formatCode(movement.voucherId) }}</span>
                    <RouterLink v-if="movement.type === 'stock_in'" :to="{ name: DONATION_DETAIL_ROUTE, params: donationParams }" class="detail-voucher-link">Xem đơn nguồn</RouterLink>
                    <RouterLink v-else-if="movement.type === 'distribution'" :to="{ name: ADMIN_ROUTE.distributionDetail, params: { voucherId: movement.voucherId } }" class="detail-voucher-link">Xem phiếu xuất</RouterLink>
                    <small v-else class="detail-voucher-note">Chưa hỗ trợ xem phiếu</small>
                  </td>
                  <td>{{ movement.note }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="!movements.length" class="inv-state">
              <span class="inv-state__icon"><AuthIcon :name="isLoading ? 'loader' : 'inbox'" :size="30" /></span>
              <h2>{{ isLoading ? 'Đang tải lịch sử…' : 'Chưa có lịch sử để hiển thị' }}</h2>
              <p>Mọi giao dịch nhập kho, xuất phân phối hoặc điều chỉnh kiểm kê sẽ được ghi nhận tự động bất biến tại đây.</p>
              <small class="detail-hint"><AuthIcon name="check-circle" :size="15" />Bảo toàn lịch sử: Nhật ký bất biến, không hỗ trợ chỉnh sửa hoặc xóa giao dịch</small>
            </div>
          </div>
        </section>
      </div>

      <aside class="detail-side">
        <section class="inv-card">
          <h2 class="detail-side-title"><AuthIcon name="sliders" :size="20" />Tác vụ khả dụng</h2>
          <button type="button" class="inv-btn detail-action" disabled><AuthIcon name="lock" :size="17" />Bắt đầu phân phối</button>
          <button type="button" class="inv-btn detail-action" disabled><AuthIcon name="lock" :size="17" />Điều chỉnh tồn</button>
          <p class="detail-note"><AuthIcon name="info" :size="16" />{{ item ? 'Phân phối và điều chỉnh tồn được thực hiện qua chức năng riêng, có chứng từ và kiểm tra quyền.' : 'Cần có vật phẩm đã nhập kho để thao tác. Hệ thống khóa các tác vụ khi chưa có dữ liệu tồn kho thực tế.' }}</p>
        </section>

        <section class="inv-card">
          <h2 class="detail-side-title"><AuthIcon name="link" :size="20" />Nguồn nhập &amp; Chứng từ gốc</h2>
          <div v-for="source in sources" :key="source.label" class="detail-source">
            <span class="detail-label">{{ source.label }} <AuthIcon :name="source.icon" :size="16" /></span>
            <span>
              <RouterLink v-if="source.code && source.to" :to="source.to" class="mono detail-source-link">{{ formatCode(source.code) }}</RouterLink>
              <b v-else class="mono">{{ formatCode(source.code) }}</b>
              <em>{{ source.code ? source.linked : source.empty }}</em>
            </span>
          </div>
          <p class="detail-source-note">Bấm mã yêu cầu quyên góp để mở màn chi tiết. Phiếu xuất mở từ lịch sử biến động; biên bản thực nhận và phiếu nhập/điều chỉnh chưa có màn xem.</p>
          <p class="detail-hint is-green"><AuthIcon name="check-circle" :size="15" />Cam kết truy xuất nguồn gốc ReShare</p>
        </section>

        <section class="inv-card">
          <h2 class="detail-side-title"><AuthIcon name="shield-check" :size="20" />Quy chuẩn vận hành</h2>
          <ul class="inv-rules">
            <li v-for="rule in RULES" :key="rule.title"><AuthIcon :name="rule.icon" :size="18" /><p><strong>{{ rule.title }}</strong><br />{{ rule.text }}</p></li>
          </ul>
        </section>
      </aside>
    </div>
  </InventoryLayout>
</template>

<style scoped>
.detail-crumbs { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 15px; }
.detail-crumbs > span { display: inline-flex; align-items: center; gap: 6px; }
.detail-crumbs a { color: inherit; text-decoration: none; }
.detail-back { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--inv-green) !important; }
.inv-chip--solid { background: var(--inv-green); color: #fff; text-transform: uppercase; }
.detail-node { margin-left: 10px; font-size: 13px; color: var(--inv-muted); }
.detail-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.detail-tags { display: flex; align-items: center; gap: 12px; margin-bottom: 8px !important; font-size: 14px; font-weight: 600; text-transform: uppercase; color: var(--inv-muted); }
.detail-head h1 { display: flex; align-items: center; gap: 16px; font-size: 34px; }
.detail-head h1 .inv-chip { font-size: 15px; background: #fff; }
.detail-access { padding: 8px 14px; background: #fff; }
.detail-access svg { color: var(--inv-green); }
.detail-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr); gap: 22px; align-items: start; }
.detail-grid.is-loading { opacity: 0.7; }
.detail-main, .detail-side { display: flex; flex-direction: column; gap: 22px; }
.detail-card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; }
.detail-card-head h2, .detail-side-title { display: flex; align-items: center; gap: 10px; font-size: 21px; }
.detail-card-head h2 svg, .detail-side-title svg { color: var(--inv-green); }
.detail-side-title { margin-bottom: 18px !important; }
.detail-hint { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--inv-muted); }
.detail-label { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; text-transform: uppercase; color: var(--inv-muted); }
.detail-core { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 22px; border-radius: 12px; background: var(--inv-accent); }
.detail-qty { margin-right: 10px; font-size: 40px; color: var(--inv-green); }
.detail-core__status { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right; font-weight: 500; }
.detail-core__status small { max-width: 380px; font-size: 13px; color: var(--inv-muted); }
.detail-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
.detail-facts > div { display: flex; gap: 12px; padding: 18px; border-radius: 12px; background: var(--inv-accent); }
.detail-facts > div > svg { flex-shrink: 0; color: var(--inv-muted); }
.detail-facts strong { display: flex; align-items: center; gap: 6px; font-size: 17px; }
.detail-facts small { color: var(--inv-muted); }
.detail-lock { display: flex; gap: 10px; padding: 14px 16px; border-radius: 10px; background: var(--inv-accent); font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.detail-history { overflow-x: auto; border-radius: 12px; background: var(--inv-accent); }
.detail-history .inv-table { min-width: 700px; }
.detail-history td { background: #fff; }
.detail-move { font-weight: 700; }
.detail-nowrap { white-space: nowrap; }
.detail-voucher-link, .detail-source-link { display: block; font-size: 13px; font-weight: 600; color: var(--inv-green); }
.detail-source-link { font-size: 15px; }
.detail-voucher-note { display: block; font-size: 12px; color: var(--inv-faint); }
.is-green { color: var(--inv-green); }
.is-red { color: var(--inv-danger); }
.detail-action { width: 100%; margin-bottom: 10px; }
.detail-note { display: flex; gap: 8px; padding: 12px 14px; border-radius: 10px; background: var(--inv-accent); font-size: 14px; color: var(--inv-muted); }
.detail-note svg { flex-shrink: 0; margin-top: 3px; }
.detail-source { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; padding: 12px 14px; border-radius: 10px; background: var(--inv-accent); }
.detail-source .detail-label { justify-content: space-between; }
.detail-source > span:last-child { display: flex; justify-content: space-between; gap: 8px; }
.detail-source em { font-size: 14px; color: var(--inv-muted); }
.detail-source-note { margin: 14px 0 10px !important; font-size: 14px; font-weight: 600; color: var(--inv-muted); }
.detail-state-actions { display: flex; gap: 12px; margin-top: 8px; }
@media (max-width: 1100px) {
  .detail-grid, .detail-facts { grid-template-columns: 1fr; }
}
</style>
