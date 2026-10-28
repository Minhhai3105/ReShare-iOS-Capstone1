<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AuthIcon from '../../auth/components/AuthIcon.vue'
import { currentUser, staffAssignment, canAccessWarehouse } from '../../auth/auth.store'
import { ADMIN_ROUTE } from '../../auth/auth.constants'
import { demoStockInRepository, STOCK_IN_ERROR, stockInRepository } from '../stockin.repository'
import brandLogo from '../../auth/assets/reshare-logo.png'

const route = useRoute()
const isDemoPreview = import.meta.env.DEV && route.meta.devPreview === true
const repository = isDemoPreview ? demoStockInRepository : stockInRepository
const ENTRY_STATUS_LABEL = Object.freeze({ confirmed: 'Đã xác nhận' })

const loading = ref(true)
const entry = ref(null)
// Lỗi khi tải phiếu: { kind, message, status }. Thử lại gọi lại đúng phiếu đang xem.
const loadFailure = ref(null)
const failureNotice = ref(null)
const failureKind = computed(() => loadFailure.value?.kind ?? null)
const backRoute = { name: ADMIN_ROUTE.home }

const statusLabel = computed(() => ENTRY_STATUS_LABEL[entry.value?.status] || entry.value?.status || '—')
const donationRoute = computed(() => (!isDemoPreview && entry.value?.donationId
  ? { name: 'admin-donation-detail', params: { donationId: entry.value.donationId } }
  : null))
// Màn hình nhập kho của yêu cầu nguồn hiển thị biên bản thực nhận (chỉ đọc) đã dùng cho phiếu này.
const receiptRoute = computed(() => (!isDemoPreview && entry.value?.donationId && entry.value?.receiptId
  ? { name: 'admin-donation-stock-in', params: { donationId: entry.value.donationId } }
  : null))
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '—')

async function load() {
  loading.value = true
  loadFailure.value = null
  entry.value = null
  try {
    const record = await repository.getStockEntry(route.params.entryId || 'DEMO-PNK-2601-00001')
    if (!isDemoPreview && !canAccessWarehouse(record.warehouseId)) {
      loadFailure.value = { kind: STOCK_IN_ERROR.forbidden, status: 0, message: 'Phiếu nhập này thuộc kho nằm ngoài phân công của bạn.' }
    } else {
      entry.value = record
    }
  } catch (error) {
    loadFailure.value = {
      kind: error?.kind ?? STOCK_IN_ERROR.other,
      status: error?.status ?? 0,
      message: error?.message || 'Không thể tải phiếu nhập kho.',
    }
  } finally {
    loading.value = false
  }
  if (loadFailure.value) {
    await nextTick()
    failureNotice.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function reload() {
  if (!loading.value) load()
}

onMounted(load)
</script>

<template>
  <div class="admin-shell">
    <header class="topbar">
      <div class="brand"><img class="brand-logo" :src="brandLogo" alt="" /><strong>ReShare</strong><span class="brand-tag">PORTAL</span><span class="brand-caption">Hệ thống điều phối vận hành</span></div>
      <div class="topbar__warehouse"><AuthIcon name="warehouse" :size="18" /><span><strong>{{ entry?.warehouseName || 'Chưa xác định kho' }}</strong><small>{{ isDemoPreview ? 'Kho minh họa' : 'Kho nhập' }}</small></span></div>
      <span v-if="isDemoPreview" class="topbar__demo">Dữ liệu demo</span>
      <div class="topbar__profile"><span class="profile-avatar">NV</span><span><strong>{{ currentUser?.displayName || currentUser?.email || 'Nhân sự' }}</strong><small>{{ staffAssignment?.role || 'Chưa có quyền' }}</small></span></div>
    </header>

    <aside class="sidebar">
      <p class="sidebar__label">VẬN HÀNH KHO &amp; XỬ LÝ</p>
      <RouterLink :to="{ name: ADMIN_ROUTE.home }"><AuthIcon name="dashboard" />Tổng quan</RouterLink>
      <span class="sidebar__label sidebar__label--second">Chi tiết phiếu nhập kho</span>
    </aside>

    <main class="admin-main">
    <div class="entry-page">
      <div class="breadcrumbs"><span>Hệ thống</span><b>/</b><span>Vận hành kho</span><b>/</b><strong>Chi tiết phiếu nhập kho</strong></div>

      <div v-if="isDemoPreview" class="entry-notice entry-notice--demo" role="status">
        <AuthIcon name="alert-triangle" /><div><strong>MÔI TRƯỜNG XEM THỬ</strong><p>Dữ liệu mô phỏng, không phải chứng từ thật.</p></div>
      </div>

      <header class="entry-heading">
        <div>
          <div class="entry-chips">
            <span class="chip"><AuthIcon name="warehouse" :size="13" />Phạm vi kho: {{ entry?.warehouseName || '—' }}</span>
            <span class="chip chip--green"><AuthIcon name="eye" :size="13" />Chỉ xem (read-only)</span>
          </div>
          <h1>Chi tiết phiếu nhập kho</h1>
          <p>Tra cứu chứng từ nhập kho, đối soát nguồn gốc tiếp nhận và dấu vết xác nhận nhập hàng.</p>
        </div>
        <RouterLink class="back-link" :to="backRoute"><AuthIcon name="arrow-left" :size="15" />Quay lại tổng quan</RouterLink>
      </header>

      <div v-if="loading" class="entry-notice" role="status">Đang tải phiếu nhập kho…</div>

      <div v-if="loadFailure && !loading" ref="failureNotice" class="entry-notice entry-notice--error" role="alert">
        <AuthIcon name="alert-circle" />
        <div v-if="failureKind === STOCK_IN_ERROR.forbidden">
          <strong>Không có quyền xem phiếu nhập{{ loadFailure.status ? ` (${loadFailure.status})` : '' }}</strong>
          <p>{{ loadFailure.message }}</p>
          <p>Hãy liên hệ quản trị hệ thống để kiểm tra vai trò và phân công kho của bạn, sau đó tải lại.</p>
          <button class="entry-link-button" type="button" @click="reload">Tải lại trạng thái quyền</button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.notFound">
          <strong>Không tìm thấy phiếu nhập kho (404)</strong>
          <p>{{ loadFailure.message }}</p>
          <p>Kiểm tra lại mã phiếu trên đường dẫn, hoặc quay lại danh sách để mở đúng phiếu.</p>
          <RouterLink class="entry-link-button" :to="backRoute">Quay lại tổng quan</RouterLink>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.conflict">
          <strong>Dữ liệu phiếu đã thay đổi (409)</strong>
          <p>{{ loadFailure.message }}</p>
          <p>Phiếu có thể vừa được cập nhật ở nơi khác. Hãy tải trạng thái mới nhất.</p>
          <button class="entry-link-button" type="button" @click="reload">Tải lại trạng thái mới nhất</button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.retryable">
          <strong>Chưa tải được phiếu nhập{{ loadFailure.status ? ` (${loadFailure.status})` : '' }}</strong>
          <p>{{ loadFailure.message }}</p>
          <p>Lỗi tạm thời từ mạng hoặc máy chủ. Bạn có thể thử tải lại cùng phiếu này.</p>
          <button class="button button--primary failure-retry" type="button" :disabled="loading" @click="reload">Thử lại</button>
        </div>
        <div v-else-if="failureKind === STOCK_IN_ERROR.auth">
          <strong>Phiên đăng nhập không còn hiệu lực</strong>
          <p>{{ loadFailure.message }}</p>
          <RouterLink class="entry-link-button" :to="{ name: ADMIN_ROUTE.login, query: { redirect: route.fullPath } }">Đăng nhập lại</RouterLink>
        </div>
        <div v-else>
          <strong>Không thể tải phiếu nhập kho{{ loadFailure.status ? ` (${loadFailure.status})` : '' }}</strong>
          <p>{{ loadFailure.message }}</p>
          <button class="entry-link-button" type="button" @click="reload">Tải lại</button>
        </div>
      </div>

      <div v-if="entry" class="entry-columns">
        <div class="main-stack">
          <section class="entry-card" aria-labelledby="entry-info-title">
            <div class="card-title"><span class="card-title__icon"><AuthIcon name="clipboard-check" /></span>
              <div><h2 id="entry-info-title">Thông tin phiếu nhập</h2><p>Dữ liệu xác nhận ghi nhận tăng tồn kho thực tế.</p></div></div>
            <dl class="info-grid">
              <div><dt>Mã phiếu nhập</dt><dd>{{ entry.id || '—' }}</dd></div>
              <div><dt>Trạng thái phiếu</dt><dd><span class="status-dot" :class="entry.status === 'confirmed' ? 'status-dot--ok' : ''" />{{ statusLabel }}</dd></div>
              <div><dt>Kho nhập thực tế</dt><dd>{{ entry.warehouseName || '—' }}</dd></div>
              <div><dt>Thời gian xác nhận</dt><dd>{{ formatDate(entry.confirmedAt) }}</dd></div>
              <div><dt>Người xác nhận</dt><dd>{{ entry.confirmedBy || '—' }}</dd></div>
              <div><dt>Ghi chú nhập kho</dt><dd>{{ entry.note || '—' }}</dd></div>
            </dl>
            <p class="card-note"><AuthIcon name="info" :size="15" />Giá trị hiển thị lấy từ phiếu nhập đã xác nhận và không thể chỉnh sửa trực tiếp.</p>
          </section>

          <section class="entry-card" aria-labelledby="entry-items-title">
            <div class="card-title"><span class="card-title__icon"><AuthIcon name="inbox" /></span>
              <div><h2 id="entry-items-title">Vật phẩm đã nhập</h2><p>Danh mục hàng hóa được ghi nhận tăng tồn kho.</p></div></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Vật phẩm</th><th class="num">Số lượng nhập</th><th>Đơn vị</th><th>Tình trạng thực tế</th><th>Vị trí lưu</th></tr></thead>
                <tbody v-if="entry.items.length">
                  <tr v-for="item in entry.items" :key="item.id">
                    <td>{{ item.name || '—' }}</td><td class="num">{{ item.quantity ?? '—' }}</td><td>{{ item.unitName || '—' }}</td>
                    <td>{{ item.conditionName || '—' }}</td><td>{{ item.location || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!entry.items.length" class="empty-state"><span><AuthIcon name="inbox" :size="26" /></span>
                <strong>Chưa có dòng vật phẩm để hiển thị</strong><p>Phiếu nhập này chưa có dòng vật phẩm nào.</p></div>
            </div>
          </section>

          <section class="entry-card" aria-labelledby="entry-movement-title">
            <div class="card-title"><span class="card-title__icon"><AuthIcon name="refresh" /></span>
              <div><h2 id="entry-movement-title">Biến động tồn kho</h2><p>Bản ghi movement do phiếu nhập này tạo ra.</p></div></div>
            <dl v-if="entry.movement" class="info-grid">
              <div><dt>Loại biến động</dt><dd>{{ entry.movement.typeName || '—' }}</dd></div>
              <div><dt>Số lượng</dt><dd>{{ entry.movement.quantity != null ? `+${entry.movement.quantity} ${entry.movement.unitName}`.trim() : '—' }}</dd></div>
              <div><dt>Kho</dt><dd>{{ entry.movement.warehouseName || '—' }}</dd></div>
              <div><dt>Chứng từ tham chiếu</dt><dd>{{ entry.movement.receiptId || '—' }}</dd></div>
              <div><dt>Người thực hiện</dt><dd>{{ entry.movement.actor || '—' }}</dd></div>
              <div><dt>Thời gian</dt><dd>{{ formatDate(entry.movement.createdAt) }}</dd></div>
            </dl>
            <div v-else class="empty-state"><span><AuthIcon name="refresh" :size="26" /></span>
              <strong>Chưa có dữ liệu biến động</strong><p>Dịch vụ chưa trả bản ghi movement cho phiếu nhập này.</p></div>
          </section>
        </div>

        <aside class="side-stack">
          <section class="entry-card side-card"><h2><AuthIcon name="network" :size="16" />Nguồn gốc nhập kho</h2>
            <div class="chain-step"><i>1</i><span><strong>Yêu cầu quyên góp</strong>
              <RouterLink v-if="donationRoute" :to="donationRoute">{{ entry.donationId }}</RouterLink><small v-else>{{ entry.donationId || '—' }}</small></span></div>
            <div class="chain-step"><i>2</i><span><strong>Biên bản thực nhận</strong>
              <RouterLink v-if="receiptRoute" :to="receiptRoute">{{ entry.receiptId }}</RouterLink><small v-else>{{ entry.receiptId || '—' }}</small></span></div>
            <div class="chain-step is-current"><i><AuthIcon name="check" :size="13" /></i><span><strong>Phiếu nhập kho</strong><small>{{ entry.id }} (hiện tại)</small></span></div>
          </section>
          <section class="entry-card side-card"><h2><AuthIcon name="shield-check" :size="16" />Dấu vết xác nhận</h2>
            <dl class="trace-list">
              <div><dt>Người tạo phiếu</dt><dd>{{ entry.createdBy || '—' }}</dd></div>
              <div><dt>Thời gian tạo</dt><dd>{{ formatDate(entry.createdAt) }}</dd></div>
              <div><dt>Người xác nhận</dt><dd>{{ entry.confirmedBy || '—' }}</dd></div>
              <div><dt>Thời gian xác nhận</dt><dd>{{ formatDate(entry.confirmedAt) }}</dd></div>
            </dl>
            <p class="side-note"><AuthIcon name="lock" :size="14" />Màn hình này chỉ để tra cứu; không có thao tác chỉnh sửa phiếu.</p>
          </section>
        </aside>
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
.admin-main{min-height:calc(100vh - 120px);margin-left:264px;padding:12px 32px 32px}
.admin-footer{margin-left:264px;padding:14px 32px;background:#fff;color:#526070;font-size:11px}
.entry-page{display:grid;gap:16px;width:min(100%,1160px);margin:0 auto}.entry-page :where(h1,h2,p,dl){margin:0}
.breadcrumbs{display:flex;align-items:center;gap:8px;min-height:32px;color:#697486;font-size:12px}.breadcrumbs b{color:#b4bccb;font-weight:400}.breadcrumbs strong{color:#182235}
.entry-notice{display:flex;gap:12px;align-items:flex-start;padding:16px 20px;border:1px solid #dce4ff;border-radius:12px;background:#eef2ff}.entry-notice p{margin-top:4px}
.entry-notice--demo{border-color:#f2dea4;background:#fff8e6;color:#775513}
.entry-notice--error{border-color:#ffd9d5;background:#fff2f0;color:#8e2723}.entry-notice--error p+p{color:#6b3330}
.entry-link-button{display:inline-block;margin-top:10px;padding:0;border:0;background:none;color:#176b2b;text-decoration:underline;font:inherit;font-weight:600;cursor:pointer}
.failure-retry{margin-top:12px;min-height:38px}
.entry-heading{display:flex;align-items:flex-start;gap:16px}.entry-heading h1{margin-top:10px;font-size:30px;letter-spacing:-.02em}.entry-heading p{margin-top:6px;color:#586272}
.entry-chips{display:flex;flex-wrap:wrap;gap:8px}.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;background:#e9eefc;color:#3c4b64;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.chip--green{background:#dcf6dd;color:#18712c}
.back-link{display:inline-flex;align-items:center;gap:8px;margin-left:auto;padding:9px 14px;border:1px solid #e5e8ef;border-radius:10px;background:#fff;color:#176b2b;text-decoration:none;font-weight:600;white-space:nowrap}
.entry-columns{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(270px,.92fr);gap:20px;align-items:start}
.main-stack,.side-stack{display:grid;gap:18px}
.entry-card{padding:22px 24px;border:1px solid #e8ebf2;border-radius:14px;background:#fff;box-shadow:0 2px 10px #18223508}
.card-title{display:flex;gap:12px;align-items:flex-start;margin-bottom:18px}.card-title__icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:9px;background:#e9eefc;color:#176b2b}.card-title h2{font-size:18px}.card-title p{margin-top:3px;color:#606a78;font-size:13px}
.info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px;border-radius:12px;background:#f0f3ff}.info-grid>div{padding:12px 14px;border-radius:10px;background:#fff}.info-grid dt{color:#586272;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}.info-grid dd{display:flex;align-items:center;gap:6px;margin:6px 0 0;font-weight:600;overflow-wrap:anywhere}
.status-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#9aa3b2}.status-dot--ok{background:#25893c}
.card-note{display:flex;gap:8px;align-items:flex-start;margin-top:14px!important;padding:12px 14px;border-radius:10px;background:#f0f3ff;color:#4b5666;font-size:13px}.card-note :deep(svg){flex:none;margin-top:2px;color:#176b2b}
.table-wrap{overflow-x:auto;border-radius:12px;background:#f0f3ff}table{width:100%;border-collapse:collapse;font-size:13px}th{padding:12px 14px;color:#586272;font-size:11px;font-weight:700;letter-spacing:.03em;text-align:left;text-transform:uppercase;white-space:nowrap}td{padding:12px 14px;border-top:1px solid #e3e8f5;background:#fff}.num{text-align:right}
.empty-state{display:grid;justify-items:center;gap:6px;padding:36px 20px;text-align:center}.empty-state span{display:grid;place-items:center;width:52px;height:52px;border-radius:12px;background:#dcf6dd;color:#176b2b}.empty-state strong{margin-top:8px;font-size:15px}.empty-state p{color:#606a78;font-size:13px}
.side-card h2{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:16px;color:#192337}.side-card h2 :deep(svg){color:#176b2b}
.chain-step{position:relative;display:flex;gap:12px;padding-bottom:18px}.chain-step:not(:last-of-type):after{content:"";position:absolute;left:12px;top:27px;bottom:3px;border-left:2px solid #e3e7ed}.chain-step i{z-index:1;display:grid;place-items:center;flex:none;width:25px;height:25px;border-radius:50%;background:#eef1f7;color:#637084;font-style:normal;font-size:12px}.chain-step.is-current i{background:#176b2b;color:#fff}.chain-step span{display:grid;gap:2px;min-width:0}.chain-step strong{font-size:13px}.chain-step small,.chain-step a{color:#647084;font-size:12px;overflow-wrap:anywhere}.chain-step a{color:#176b2b;font-weight:600}.chain-step.is-current small{color:#176b2b}
.trace-list{display:grid;gap:8px;padding:10px;border-radius:12px;background:#f0f3ff}.trace-list>div{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:8px;background:#fff;font-size:13px}.trace-list dt{color:#586272}.trace-list dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
.side-note{display:flex;gap:8px;align-items:flex-start;margin-top:14px!important;padding:12px;border-radius:10px;background:#eef2ff;color:#4b5666;font-size:12px}.side-note :deep(svg){flex:none;margin-top:2px;color:#176b2b}
.button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 16px;border:0;border-radius:9px;font:inherit;font-size:13px;font-weight:650;text-decoration:none;cursor:pointer}.button:disabled{opacity:.55;cursor:not-allowed}.button--primary{background:#176b2b;color:#fff}
@media(max-width:1150px){.sidebar{width:220px}.admin-main,.admin-footer{margin-left:220px;padding-right:20px;padding-left:20px}.brand{min-width:auto}.brand-caption{display:none}.entry-columns{grid-template-columns:1fr}.side-stack{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.admin-shell{padding-top:60px}.topbar{height:60px;padding:0 14px}.brand{border:0;padding:0}.topbar__warehouse,.topbar__demo,.topbar__profile>span:nth-child(2){display:none}.sidebar{display:none}.admin-main{margin:0;padding:12px 14px 24px}.admin-footer{display:none}.entry-heading{flex-wrap:wrap}.back-link{margin-left:0}.entry-heading h1{font-size:24px}.side-stack,.info-grid{grid-template-columns:1fr}.entry-card{padding:18px 16px}}
</style>
