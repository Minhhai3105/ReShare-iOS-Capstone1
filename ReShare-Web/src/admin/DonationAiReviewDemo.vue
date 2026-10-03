<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AdminIcon from './AdminIcon.vue';
import ApprovedScreen from './ApprovedScreen.vue';
import ReportScreen from './ReportScreen.vue';
import { donationCategories, mockDonationAiReviewItems, type DonationCategory } from './mockDonationAiReview';

const tabs = [
  { id: 'Q', label: 'Q – Báo cáo' },
  { id: 'E', label: 'E – Chưa duyệt' },
  { id: 'F', label: 'F – Đã duyệt' }
] as const;

const initialScreen = new URLSearchParams(location.search).get('screen')?.toUpperCase();
const activeTab = ref<'Q' | 'E' | 'F'>(initialScreen === 'Q' || initialScreen === 'F' ? initialScreen : 'E');
const setScreen = (screen: 'Q' | 'E' | 'F') => {
  activeTab.value = screen;
  history.replaceState(null, '', `?screen=${screen}`);
  window.scrollTo(0, 0);
};
const demoRole = ref<'system_admin' | 'warehouse_admin' | 'viewer'>('system_admin');

const items = ref(
  mockDonationAiReviewItems.map((item) => ({
    ...item,
    aiPrediction: { ...item.aiPrediction },
    donorConfirmation: { ...item.donorConfirmation },
    staffConfirmation: { ...item.staffConfirmation }
  }))
);
const scopedItems = computed(() => items.value.filter(item => demoRole.value !== 'warehouse_admin' || item.warehouseId === 'hai-chau'));
const pendingItems = computed(() => scopedItems.value.filter(item => ['ai-01', 'ai-02', 'ai-03', 'ai-04'].includes(item.id)));
const approvedItems = computed(() => scopedItems.value.filter(item => item.staffConfirmation.status === 'confirmed'));
const approvedItemId = ref('ai-05');
watch(demoRole, () => {
  if (!pendingItems.value.some(item => item.id === mockItemId.value)) mockItemId.value = pendingItems.value[0]?.id ?? '';
  if (!approvedItems.value.some(item => item.id === approvedItemId.value)) approvedItemId.value = approvedItems.value[0]?.id ?? '';
});

const mockItemId = ref('ai-01');
const pendingItem = computed(() => pendingItems.value.find((item) => item.id === mockItemId.value) ?? pendingItems.value[0]);
const approvedItem = computed(() => approvedItems.value.find((entry) => entry.id === approvedItemId.value) ?? approvedItems.value[0]);

const staffCategory = ref<DonationCategory | ''>('');
const reviewAction = ref<'confirmed' | 'rejected' | null>(null);
const rejectionReason = ref('');
const actionMessage = ref('');
const canReview = computed(() => demoRole.value !== 'viewer' && pendingItem.value.staffConfirmation.canConfirm && pendingItem.value.staffConfirmation.status === 'pending' && (demoRole.value !== 'warehouse_admin' || pendingItem.value.warehouseId === 'hai-chau'));
watch(mockItemId, () => {
  staffCategory.value = pendingItem.value.staffConfirmation.category ?? '';
  reviewAction.value = null;
  rejectionReason.value = '';
  actionMessage.value = '';
});
const updateApprovedStatus = (status: 'confirmed' | 'rejected') => {
  const item = pendingItem.value;
  if (!canReview.value || (status === 'confirmed' && !staffCategory.value) || (status === 'rejected' && !rejectionReason.value.trim())) return;
  item.staffConfirmation.status = status;
  item.staffConfirmation.category = status === 'confirmed' ? staffCategory.value as DonationCategory : null;
  item.staffConfirmation.note =
    status === 'confirmed'
      ? `Mock FE: staff đã duyệt donation và chọn danh mục ${staffCategory.value}.`
      : `Mock FE: staff từ chối donation. Lý do: ${rejectionReason.value.trim()}`;
  if (status === 'confirmed') { item.staffConfirmedAt = new Date().toISOString(); item.staffName = 'Nguyễn Văn An'; }
  actionMessage.value = status === 'confirmed' ? 'Đã duyệt yêu cầu trong dữ liệu mock; chưa tạo tồn kho hoặc xác nhận nhận hàng.' : 'Đã từ chối yêu cầu trong dữ liệu mock; chưa gửi thông báo thật.';
  reviewAction.value = null;
};

const openReviewAction = (status: 'confirmed' | 'rejected') => {
  if (canReview.value) reviewAction.value = status;
};

const requestStatus = computed(() => ({ pending: 'CHỜ DUYỆT', confirmed: 'ĐÃ DUYỆT', rejected: 'ĐÃ TỪ CHỐI' })[pendingItem.value.staffConfirmation.status]);
const formatDate = (date: string) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(date));
const operationMenu = [
  { label: 'Tổng quan', icon: 'grid' },
  { label: 'Yêu cầu quyên góp', icon: 'donation', active: true },
  { label: 'Kho hàng', icon: 'box' },
  { label: 'Người thụ hưởng', icon: 'users' },
  { label: 'Báo cáo', icon: 'chart' },
  { label: 'Nhật ký', icon: 'log' }
];

</script>

<template>
  <div :class="['admin-shell', { 'e-shell-layout': true }]">
    <main :class="['content-panel', { 'e-shell-main': true }]">
      <ApprovedScreen v-if="activeTab === 'F'" :item="approvedItem" :scoped-items="approvedItems" :selected-id="approvedItemId" :role="demoRole" @select="approvedItemId = $event" @navigate="setScreen" @role="demoRole = $event" />
      <ReportScreen v-if="activeTab === 'Q'" :items="scopedItems" :role="demoRole" @navigate="setScreen" @role="demoRole = $event" />
      <section v-if="activeTab === 'E'" class="page-view e-page">
        <div class="e-app-shell">
          <aside class="e-sidebar">
            <div class="e-brand"><span class="brand-mark">R</span><strong>ReShare</strong><small>PORTAL</small></div>
            <nav class="e-nav" aria-label="Điều hướng quản trị">
              <div class="menu-group">
                <div class="menu-label">Vận hành kho &amp; xử lý</div>
                <button v-for="entry in operationMenu" :key="entry.label" type="button" :class="['e-nav-item', { active: entry.active }]" :aria-current="entry.active ? 'page' : undefined" @click="entry.label === 'Báo cáo' ? setScreen('Q') : entry.label === 'Yêu cầu quyên góp' ? setScreen('E') : undefined">
                  <AdminIcon :name="entry.icon" :size="20" />{{ entry.label }}
                </button>
              </div>
              <div class="menu-group">
                <div class="menu-label">Quản trị hệ thống</div>
                <button type="button" class="e-nav-item"><AdminIcon name="shield" :size="20" />Nhân sự &amp; Phân quyền</button>
                <button type="button" class="e-nav-item"><AdminIcon name="settings" :size="20" />Cấu hình chung</button>
              </div>
            </nav>
            <div class="sidebar-status">
              <div class="status-row"><strong>Trạng thái kết nối</strong><span class="connection-state"><span class="status-dot online"></span>Online</span></div>
              <div class="status-row station"><AdminIcon name="monitor" :size="14" />Máy trạm: WH-SGN-02</div>
            </div>
          </aside>

          <div class="e-main-area">
            <header class="e-topbar">
              <div class="e-topbar-logo"><strong>ReShare<br />Portal</strong><small>Hệ thống điều<br />phối vận hành</small></div>
              <div class="warehouse-switch"><AdminIcon name="warehouse" /><div><strong>Kho demo<br />Hải Châu</strong><small>Khu vực Hải<br />Châu &amp; Sơn Trà</small></div><AdminIcon name="chevron" :size="14" /></div>
              <span class="operating-pill">Đang thao tác<br />tại kho</span>
              <span class="demo-pill">Dữ liệu<br />demo</span>
              <div class="shift-pill"><AdminIcon name="clock" /><span>Ca trực: Sáng<br />(08:00 - 16:30)</span></div>
              <div class="e-search-box"><AdminIcon name="search" /><span>Tìm kiện hàng,<br />mã đơn...</span><kbd>⌘K</kbd></div>
              <button type="button" class="notification-button" aria-label="Thông báo demo"><AdminIcon name="bell" /><i></i></button>
              <div class="e-user-pill"><span class="user-avatar"><AdminIcon name="user" /></span><div><strong>Nguyễn<br />Văn An</strong><small>{{ demoRole === 'warehouse_admin' ? 'Quản trị viên kho' : demoRole === 'viewer' ? 'Người xem demo' : 'Quản trị viên hệ thống' }}</small></div><AdminIcon name="chevron" :size="14" /></div>
            </header>

            <div class="e-content-wrap">
              <div class="e-breadcrumb">
                <span class="back-link"><AdminIcon name="arrow" :size="16" />Quay lại danh sách</span>
                <span class="divider">/</span><span>Yêu cầu quyên góp</span><span class="divider">/</span><strong>Chi tiết yêu cầu</strong>
                <span class="environment-note"><AdminIcon name="flask" :size="14" />Môi trường thử nghiệm <span>• Địa chỉ &amp; vị trí kho là dữ liệu demo nội bộ</span></span>
              </div>

              <div class="e-header-row">
                <div>
                  <div class="title-cluster"><h1>Chi tiết yêu cầu</h1><span class="detail-status-badge">● {{ requestStatus }}</span></div>
                  <div class="e-submeta-row"><span>Mã yêu cầu: <b class="request-code">{{ pendingItem.donationId }}</b></span><span class="meta-separator">•</span><span><AdminIcon name="flask" :size="14" />Trạng thái nghiệp vụ: {{ pendingItem.staffConfirmation.status === 'pending' ? 'Đang chờ quản trị viên kho thẩm tra thông tin' : requestStatus }}</span></div>
                </div>
                <div class="reviewer-role"><span><AdminIcon name="shield" /></span><div><small>Phân quyền thao tác</small><strong>{{ demoRole === 'viewer' ? 'Chỉ xem · không xác nhận' : 'Thẩm định viên tiếp nhận' }}</strong></div></div>
              </div>

              <div class="e-main-grid">
                <div class="e-left-column">
                  <div class="detail-card item-card">
                    <div class="card-title-row"><h3><span class="heading-icon"><AdminIcon name="hanger" /></span>Thông tin vật phẩm</h3><span class="meta-tag">Khai báo qua ứng dụng</span></div>
                    <div class="item-info-grid">
                      <div class="info-row"><span class="meta-label">Tên vật phẩm</span><strong>{{ pendingItem.title }}</strong></div>
                      <div class="info-row"><span class="meta-label">Danh mục donor khai báo</span><strong>{{ pendingItem.donorConfirmation.category ?? 'Chưa xác nhận' }}</strong></div>
                      <div class="info-row"><span class="meta-label">Tình trạng người gửi khai báo</span><strong>{{ pendingItem.condition ?? 'Chưa khai báo' }}</strong></div>
                      <div class="info-row"><span class="meta-label">Ngày gửi</span><strong>{{ formatDate(pendingItem.createdAt) }}</strong></div>
                      <div class="info-row wide-row"><span class="meta-label">Mô tả của người quyên góp</span><strong>{{ pendingItem.description ?? 'Người gửi chưa nhập mô tả.' }}</strong></div>
                    </div>
                    <div class="photo-heading"><h4><AdminIcon name="shield" :size="16" />Hình ảnh vật phẩm (Bảo mật nội bộ)</h4><span class="meta-tag">Bảo vệ riêng tư</span></div>
                    <div class="photo-surface"><div class="photo-privacy-box">
                      <div class="privacy-icon"><AdminIcon name="lock" :size="28" /></div>
                      <div class="privacy-title">Ảnh chỉ hiển thị khi được cấp quyền xem</div>
                      <div class="privacy-copy">Hình ảnh tải lên từ ứng dụng người dùng được mã hóa và bảo vệ quyền riêng tư.<br />Quyền truy cập ảnh tạm thời (short-lived token) sẽ được cấp sau khi nhân sự đăng nhập và xác thực thẩm quyền duyệt đơn.</div>
                      <span class="privacy-footnote"><AdminIcon name="shield" :size="12" />Không sử dụng liên kết công khai vĩnh viễn cho ảnh quyên góp.</span>
                    </div></div>
                  </div>

                  <div class="detail-card request-history-card">
                    <div class="card-title-row"><h3><span class="heading-icon"><AdminIcon name="history" /></span>Lịch sử yêu cầu</h3><span class="history-origin"><AdminIcon name="check" :size="14" />Khởi tạo hệ thống</span></div>
                    <div class="history-list">
                      <div class="history-row"><span class="history-dot"><AdminIcon name="play" :size="12" /></span><div class="history-entry"><div class="history-entry-top"><strong>Người dùng gửi yêu cầu</strong><small>Thời gian tiếp nhận: {{ formatDate(pendingItem.createdAt) }}</small></div><p>Nhân sự ghi nhận: &nbsp;Hệ thống demo</p><p>Dữ liệu được tiếp nhận tự động qua cổng dịch vụ ứng dụng ReShare.</p></div></div>
                      <div class="history-row next-stage"><span class="history-dot">◷</span><div class="history-entry"><div>Giai đoạn tiếp theo: Thẩm định &amp; Phê duyệt <span class="meta-tag">Chờ thực thi</span></div><p>Các sự kiện thẩm tra, duyệt hoặc từ chối sẽ được tự động ghi nhận vào nhật ký kiểm toán (Audit Log) khi hoàn tất xử lý nghiệp vụ.</p></div></div>
                    </div>
                  </div>
                </div>

                <div class="e-side-stack">
                  <div class="detail-card sender-card">
                    <div class="card-title-row"><h3><span class="heading-icon"><AdminIcon name="user" /></span>Người gửi</h3><AdminIcon name="eye" /></div>
                    <div class="data-protection-note"><AdminIcon name="info" :size="16" /><span>Thông tin liên hệ chỉ hiển thị khi máy chủ xác thực cung cấp đủ dữ liệu.</span></div>
                    <div class="meta-list compact">
                      <div class="meta-row"><span class="meta-label">Họ và tên người gửi</span><strong>{{ pendingItem.donorName }}</strong></div>
                      <div class="meta-row"><span class="meta-label">Số điện thoại</span><strong>{{ pendingItem.donorPhone ?? 'Chưa cung cấp' }}</strong></div>
                      <div class="meta-row"><span class="meta-label">Email tài khoản</span><strong>{{ pendingItem.donorEmail ?? 'Chưa cung cấp' }}</strong></div>
                      <div class="meta-row"><span class="meta-label">Địa chỉ lấy hàng / gửi hàng</span><strong>Chưa cung cấp trong mock</strong></div>
                    </div>
                    <div class="sender-privacy"><AdminIcon name="shield" :size="14" /><span>Dữ liệu được bảo vệ theo chính sách quyền riêng tư ReShare.</span></div>
                  </div>

                  <div class="detail-card warehouse-card">
                    <div class="card-title-row"><h3><span class="heading-icon"><AdminIcon name="warehouse" /></span>Kho dự kiến</h3><span class="warehouse-demo">Demo</span></div>
                    <div class="warehouse-location"><span><AdminIcon name="pin" :size="24" /></span><div><strong>Kho demo {{ pendingItem.warehouseId === 'hai-chau' ? 'Hải Châu' : 'Sơn Trà' }}</strong><small>Khu vực demo</small></div></div>
                    <div class="warehouse-alert"><AdminIcon name="warning" /><span>Kho dự kiến trên yêu cầu; chưa xác nhận đã nhận hàng.</span></div>
                    <div class="warehouse-comparison"><span class="meta-label">Đối chiếu điểm xử lý</span><small>Kho thao tác hiện tại</small><div class="current-warehouse"><i></i><strong>Kho demo<br />Hải Châu</strong><small>(đang kích hoạt<br />trên hệ thống)</small></div><hr /><small>Kho chỉ định trên yêu cầu app</small><div class="expected-warehouse"><i></i><strong>Kho demo {{ pendingItem.warehouseId === 'hai-chau' ? 'Hải Châu' : 'Sơn Trà' }} (Dự kiến)</strong></div></div>
                    <div class="warehouse-business-note"><strong>Lưu ý nghiệp vụ:</strong> Việc duyệt yêu cầu quyên góp chỉ xác nhận tính hợp lệ của đơn gửi, <strong>KHÔNG</strong> tạo tồn kho vật lý và <strong>KHÔNG</strong> xác nhận hàng đã về tới kho.</div>
                  </div>
                </div>
              </div>

              <div class="detail-card assessment-card">
                <div class="card-title-row"><h3><AdminIcon name="gavel" />Thao tác thẩm định hồ sơ</h3><div class="e-actions"><button type="button" class="secondary-button" :disabled="!canReview" @click="openReviewAction('rejected')"><AdminIcon name="close" :size="16" />Từ chối yêu cầu</button><button type="button" class="primary-button" :disabled="!canReview" @click="openReviewAction('confirmed')"><AdminIcon name="check" :size="16" />Duyệt yêu cầu</button></div></div>
                <ul class="assessment-instructions"><li>Thao tác <strong>"Duyệt yêu cầu"</strong> sẽ yêu cầu bước xác nhận lại thông tin vật phẩm và kho phụ trách. Sau khi máy chủ thẩm định, trạng thái đơn sẽ chuyển sang "Đã duyệt" (approved).</li><li>Thao tác <strong>"Từ chối yêu cầu"</strong> bắt buộc nhập lý do từ chối gửi về cho người dùng qua ứng dụng.</li><li>Hệ thống tự động khóa nút khi đang gửi yêu cầu để ngăn chặn thao tác trùng lặp.</li></ul>
                <p v-if="actionMessage" class="mock-action-message" role="status">{{ actionMessage }}</p>
              </div>

              <footer class="e-footer"><div>© 2024 ReShare Circular Fashion Hub. Hệ thống điều phối nội bộ. <span>•</span><strong>● Hệ thống máy chủ: Sẵn sàng</strong><br />Trung tâm trợ giúp vận hành &nbsp;&nbsp; Chính sách an toàn kho</div></footer>

              <div v-if="reviewAction" class="review-modal-backdrop" @click.self="reviewAction = null" @keydown.esc="reviewAction = null">
                <section class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
                  <h2 id="review-dialog-title">{{ reviewAction === 'confirmed' ? 'Xác nhận duyệt yêu cầu' : 'Từ chối yêu cầu' }}</h2>
                  <p>Dữ liệu mock · {{ pendingItem.donationId }} · {{ pendingItem.title }}</p>
                  <template v-if="reviewAction === 'confirmed'"><p>Kho phụ trách: <strong>Kho demo Hải Châu</strong></p><label for="approval-category">Danh mục vật phẩm thực tế</label><select id="approval-category" v-model="staffCategory" autofocus><option value="">-- Chọn danh mục --</option><option v-for="category in donationCategories" :key="category" :value="category">{{ category }}</option></select><p>Chỉ cập nhật xác nhận staff trong mock; không tạo tồn kho và không xác nhận đã nhận hàng.</p></template>
                  <template v-else><label for="rejection-reason">Lý do từ chối (bắt buộc)</label><textarea id="rejection-reason" v-model="rejectionReason" rows="4" autofocus placeholder="Nhập lý do từ chối yêu cầu" /></template>
                  <div class="dialog-actions"><button type="button" class="cancel-button" @click="reviewAction = null">Hủy</button><button type="button" class="primary-button" :disabled="reviewAction === 'confirmed' ? !staffCategory : !rejectionReason.trim()" @click="updateApprovedStatus(reviewAction)">Xác nhận {{ reviewAction === 'confirmed' ? 'duyệt' : 'từ chối' }} (mock)</button></div>
                </section>
              </div>

              <div class="detail-card review-sources-card">
                <div class="card-title-row">
                  <h3>RC1D-59 · AI / donor / staff</h3>
                  <span class="meta-tag soft">Mock data</span>
                </div>

                <div class="mock-controls">
                  <label for="demo-role">Vai trò demo</label>
                  <select id="demo-role" v-model="demoRole"><option value="system_admin">System Admin · toàn bộ kho</option><option value="warehouse_admin">Warehouse Admin · Hải Châu</option><option value="viewer">Người xem · không được xác nhận</option></select>
                  <label for="mock-item">Tình huống kiểm tra (dữ liệu mô phỏng)</label>
                  <select id="mock-item" v-model="mockItemId">
                    <option v-for="item in pendingItems" :key="item.id" :value="item.id">{{ item.donationId }} · {{ item.title }}</option>
                  </select>
                  <small>Chỉ thay đổi trạng thái trong trình duyệt; tải lại trang để đặt lại mock. Chưa kết nối dữ liệu thật.</small>
                </div>

                <div class="source-grid">
                  <div class="source-block">
                    <div class="source-header">
                      <span class="source-bullet ai"></span>
                      <strong>AI prediction</strong>
                    </div>
                    <div v-if="pendingItem.aiPrediction.available" class="source-body">
                      <div class="meta-row">
                        <span class="meta-label">Danh mục AI</span>
                        <strong>{{ pendingItem.aiPrediction.category ?? 'Chưa có dự đoán' }}</strong>
                      </div>
                      <div class="meta-row">
                        <span class="meta-label">Độ tin cậy</span>
                        <strong>{{ pendingItem.aiPrediction.confidence == null ? '—' : `${Math.round(pendingItem.aiPrediction.confidence * 100)}%` }}</strong>
                      </div>
                      <p>{{ pendingItem.aiPrediction.reason ?? 'Chưa có giải thích từ AI.' }}</p>
                    </div>
                    <p v-else class="source-empty">Không có model AI cho donation này.</p>
                  </div>

                  <div class="source-block">
                    <div class="source-header">
                      <span class="source-bullet donor"></span>
                      <strong>Donor confirmation</strong>
                    </div>
                    <div class="source-body">
                      <div class="meta-row">
                        <span class="meta-label">Phương thức</span>
                        <strong>{{ pendingItem?.donorConfirmation.method === 'ai' ? 'Gợi ý AI' : 'Nhập thủ công' }}</strong>
                      </div>
                      <div class="meta-row">
                        <span class="meta-label">Danh mục donor</span>
                        <strong>{{ pendingItem.donorConfirmation.category ?? 'Chưa xác nhận' }}</strong>
                      </div>
                      <p>{{ pendingItem.donorConfirmation.summary }}</p>
                    </div>
                  </div>

                  <div class="source-block staff-source">
                    <div class="source-header">
                      <span class="source-bullet staff"></span>
                      <strong>Staff confirmation</strong>
                    </div>
                    <div class="source-body">
                      <div class="meta-row">
                        <span class="meta-label">Danh mục staff</span>
                        <strong>{{ pendingItem?.staffConfirmation.category ?? 'Chưa xác nhận' }}</strong>
                      </div>
                      <div class="meta-row">
                        <span class="meta-label">Trạng thái</span>
                        <strong>{{ requestStatus }}</strong>
                      </div>
                      <p>{{ pendingItem?.staffConfirmation.note ?? 'Staff cần chọn danh mục cuối cùng trước khi xác nhận.' }}</p>
                      <p v-if="!canReview" class="source-empty">Vai trò hiện tại hoặc phạm vi kho không cho phép xác nhận donation này.</p>
                      <label class="staff-category-label" for="staff-category">Chọn danh mục thực tế</label>
                      <select id="staff-category" v-model="staffCategory" :disabled="!canReview"><option value="">-- Chọn danh mục --</option><option v-for="category in donationCategories" :key="category" :value="category">{{ category }}</option></select>
                      <button class="staff-mini-button" :disabled="!canReview || !staffCategory" @click="openReviewAction('confirmed')">Xác nhận staff</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="demo-navigation"><span>Preview RC1D-59 · dữ liệu mock</span><button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="setScreen(tab.id)">{{ tab.label }}</button></div>
            </div>
          </div>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
:global(body) { margin:0; font-family:'Segoe UI',sans-serif; background:#f8f9ff; }
* { box-sizing:border-box; }
.admin-shell { display:block; min-height:100vh; }
.content-panel { display:block; min-width:0; }
</style>
<style scoped src="./request-detail.css"></style>
