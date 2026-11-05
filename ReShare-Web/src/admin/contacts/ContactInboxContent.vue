<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import AuthIcon from '../auth/components/AuthIcon.vue'

const props = defineProps({
  state: { type: Object, required: true },
  // Trong khung quản trị, thanh vị trí của khung đã thay cho đường dẫn này.
  showBreadcrumb: { type: Boolean, default: true },
})
const emit = defineEmits(['refresh', 'next', 'previous', 'select', 'home', 'login'])
const detailOpen = ref(false)
const detailHeading = ref(null)
const listPanel = ref(null)
const selected = computed(() => props.state.contacts.find(item => item.id === props.state.selectedId))
const formatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })
const dateLabel = value => value ? formatter.format(new Date(value)) : 'Chưa có thời gian'
const errorTitle = computed(() => props.state.error === 401 ? 'Phiên đăng nhập đã hết hạn'
  : props.state.error === 403 ? 'Bạn không còn quyền xem liên hệ' : 'Chưa tải được hộp thư')
const errorMessage = computed(() => props.state.error === 401 ? 'Vui lòng đăng nhập lại để tiếp tục.'
  : props.state.error === 403 ? 'Quyền Quản trị hệ thống của tài khoản cần được kiểm tra lại.'
    : props.state.error === 'TIMEOUT' ? 'Máy chủ phản hồi chậm. Vui lòng thử lại.'
      : props.state.error === 'INVALID_PAYLOAD' ? 'Dữ liệu liên hệ chưa sẵn sàng để hiển thị. Vui lòng thử lại sau.'
        : 'Không thể tải liên hệ lúc này. Kiểm tra kết nối và thử lại.')

watch(() => props.state.contacts, () => { detailOpen.value = false })

async function openContact(id) {
  emit('select', id)
  detailOpen.value = true
  await nextTick()
  detailHeading.value?.focus()
}

async function backToList() {
  detailOpen.value = false
  await nextTick()
  listPanel.value?.querySelector('button[aria-pressed="true"]')?.focus()
}
</script>

<template>
  <div class="contacts-page">
    <nav v-if="showBreadcrumb" class="contacts-breadcrumb" aria-label="Đường dẫn trang">
      <slot name="navigation"><button type="button" @click="emit('home')">Tổng quan</button></slot>
      <span aria-hidden="true">/</span><span aria-current="page">Liên hệ</span>
    </nav>

    <header class="contacts-heading">
      <div>
        <span class="auth-chip"><AuthIcon name="shield-check" :size="14" />Quản trị hệ thống</span>
        <h1>Hộp thư liên hệ</h1>
        <p>Nội dung được gửi từ trang giới thiệu ReShare.</p>
      </div>
      <button v-if="![401, 403].includes(state.error)" class="auth-btn auth-btn--soft contacts-refresh" type="button" :disabled="state.loading" @click="emit('refresh')">
        <AuthIcon name="refresh" :size="17" />{{ state.loading ? 'Đang tải…' : 'Tải lại' }}
      </button>
    </header>

    <section v-if="state.loading" class="auth-card contacts-state" role="status" aria-live="polite">
      <AuthIcon name="inbox" :size="34" /><h2>Đang tải liên hệ…</h2>
      <p>Vui lòng chờ trong giây lát.</p>
      <div class="contacts-skeleton" aria-hidden="true"><span /><span /><span /></div>
    </section>
    <section v-else-if="state.error" class="auth-card contacts-state" role="alert">
      <AuthIcon :name="[401, 403].includes(state.error) ? 'shield-check' : 'cloud-off'" :size="34" />
      <h2>{{ errorTitle }}</h2><p>{{ errorMessage }}</p>
      <button v-if="state.error === 401" type="button" class="auth-btn auth-btn--primary" @click="emit('login')">Đăng nhập lại</button>
      <button v-else-if="state.error === 403" type="button" class="auth-btn auth-btn--soft" @click="emit('home')">Về tổng quan</button>
      <button v-else type="button" class="auth-btn auth-btn--primary" @click="emit('refresh')">Thử lại</button>
    </section>
    <section v-else-if="!state.contacts.length" class="auth-card contacts-state">
      <AuthIcon name="mail" :size="38" /><h2>Chưa có liên hệ nào</h2>
      <p>Liên hệ mới từ trang giới thiệu sẽ xuất hiện tại đây.</p>
      <p v-if="state.syncedAt" class="contacts-synced">Đã cập nhật {{ dateLabel(state.syncedAt) }}</p>
    </section>
    <div v-else class="contacts-layout" :class="{ 'contacts-layout--detail': detailOpen }">
      <section ref="listPanel" class="auth-card contacts-list-panel" aria-labelledby="contact-list-heading">
        <header class="contacts-panel-heading">
          <h2 id="contact-list-heading">Liên hệ đã tiếp nhận</h2>
          <p>{{ state.contacts.length }} liên hệ trên trang · Mới nhất trước</p>
        </header>
        <ul class="contacts-list">
          <li v-for="contact in state.contacts" :key="contact.id">
            <button type="button" class="contact-item" :class="{ 'contact-item--selected': state.selectedId === contact.id }"
              :aria-pressed="state.selectedId === contact.id" :aria-label="`Xem liên hệ từ ${contact.name}, ${contact.email}`" @click="openContact(contact.id)">
              <span class="contact-item__top"><strong>{{ contact.name }}</strong><AuthIcon name="chevron-right" :size="17" /></span>
              <span class="contact-item__email">{{ contact.email }}</span>
              <span class="contact-item__preview">{{ contact.message }}</span>
              <time :datetime="contact.createdAt || undefined">{{ dateLabel(contact.createdAt) }}</time>
            </button>
          </li>
        </ul>
        <footer class="contacts-pagination" aria-label="Phân trang liên hệ">
          <button type="button" class="auth-btn auth-btn--soft" :disabled="state.page <= 1" @click="emit('previous')"><AuthIcon name="chevron-left" :size="16" />Trước</button>
          <span role="status" aria-live="polite">Trang {{ state.page }}</span>
          <button type="button" class="auth-btn auth-btn--soft" :disabled="!state.hasMore" @click="emit('next')">Sau<AuthIcon name="chevron-right" :size="16" /></button>
        </footer>
      </section>

      <section v-if="selected" class="auth-card contact-detail" aria-labelledby="contact-detail-heading">
        <button type="button" class="contact-back" @click="backToList"><AuthIcon name="arrow-left" :size="18" />Danh sách liên hệ</button>
        <header class="contact-detail__heading">
          <span class="contact-detail__icon"><AuthIcon name="mail" :size="24" /></span>
          <div><p class="contact-detail__eyebrow">Nội dung liên hệ</p><h2 id="contact-detail-heading" ref="detailHeading" tabindex="-1">{{ selected.name }}</h2></div>
        </header>
        <dl class="contact-detail__meta">
          <div><dt>Email</dt><dd>{{ selected.email }}</dd></div>
          <div><dt>Thời gian gửi</dt><dd><time :datetime="selected.createdAt || undefined">{{ dateLabel(selected.createdAt) }}</time></dd></div>
          <div><dt>Trạng thái</dt><dd><span class="contact-status"><span aria-hidden="true" class="auth-dot" />{{ selected.status === 'new' ? 'Mới tiếp nhận' : 'Đã tiếp nhận' }}</span></dd></div>
        </dl>
        <div class="contact-message"><h3>Nội dung</h3><p>{{ selected.message }}</p></div>
        <p v-if="state.syncedAt" class="contacts-synced">Đã cập nhật {{ dateLabel(state.syncedAt) }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.contacts-page { width: min(1320px, 100%); margin: 0 auto; min-width: 0; }
.contacts-breadcrumb { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; color: var(--auth-text-secondary); font-size: 14px; }
.contacts-breadcrumb :deep(a), .contacts-breadcrumb button { color: var(--auth-primary); text-decoration: none; background: none; border: 0; padding: 8px 0; cursor: pointer; }
.contacts-breadcrumb :deep(a:hover), .contacts-breadcrumb button:hover { text-decoration: underline; }
.contacts-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.contacts-heading h1 { font-size: clamp(26px, 3vw, 34px); line-height: 1.25; margin: 14px 0 8px; letter-spacing: -.025em; }
.contacts-heading p, .contacts-panel-heading p { color: var(--auth-text-secondary); }
.contacts-refresh { flex-shrink: 0; }
.contacts-layout { display: grid; grid-template-columns: minmax(300px, .85fr) minmax(0, 1.45fr); gap: 24px; align-items: start; }
.contacts-list-panel, .contact-detail { border: 1px solid var(--auth-border); min-width: 0; overflow: hidden; }
.contacts-panel-heading { padding: 24px; border-bottom: 1px solid var(--auth-border); }
.contacts-panel-heading h2 { font-size: 18px; margin-bottom: 6px; }
.contacts-panel-heading p { font-size: 13px; }
.contacts-list { list-style: none; padding: 0; margin: 0; max-height: 650px; overflow-y: auto; }
.contacts-list li + li { border-top: 1px solid var(--auth-border); }
.contact-item { width: 100%; padding: 20px 24px; display: flex; flex-direction: column; align-items: stretch; gap: 5px; text-align: left; border: 0; border-left: 3px solid transparent; background: var(--auth-surface); cursor: pointer; overflow-wrap: anywhere; }
.contact-item:hover { background: var(--auth-bg); }
.contact-item--selected, .contact-item--selected:hover { border-left-color: var(--auth-primary); background: var(--auth-primary-soft); }
.contact-item:focus-visible { outline-offset: -4px; }
.contact-item__top { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
.contact-item__top strong { font-size: 16px; font-weight: 650; }
.contact-item__top svg { flex-shrink: 0; margin-top: 3px; color: var(--auth-primary); }
.contact-item__email { font-size: 13px; color: var(--auth-text-secondary); }
.contact-item__preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--auth-text-secondary); font-size: 14px; line-height: 1.5; margin-top: 6px; }
.contact-item time { font-size: 12px; color: var(--auth-text-secondary); margin-top: 6px; }
.contacts-pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-top: 1px solid var(--auth-border); font-size: 13px; }
.contacts-pagination .auth-btn { min-height: 42px; padding: 8px 12px; font-size: 13px; }
.contact-detail { padding: 30px; }
.contact-detail__heading { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; overflow-wrap: anywhere; }
.contact-detail__icon { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 14px; background: var(--auth-primary-soft); color: var(--auth-primary); flex-shrink: 0; }
.contact-detail__heading h2 { font-size: 24px; line-height: 1.35; margin-top: 5px; }
.contact-detail__eyebrow { font-size: 12px; font-weight: 600; color: var(--auth-text-secondary); text-transform: uppercase; letter-spacing: .07em; }
.contact-detail__meta { border: 1px solid var(--auth-border); border-radius: 12px; background: var(--auth-bg); padding: 4px 18px; }
.contact-detail__meta > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; padding: 13px 0; font-size: 14px; }
.contact-detail__meta > div + div { border-top: 1px solid var(--auth-border); }
.contact-detail__meta dt { color: var(--auth-text-secondary); }
.contact-detail__meta dd { overflow-wrap: anywhere; }
.contact-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: var(--auth-primary); }
.contact-message { padding-top: 26px; }
.contact-message h3 { font-size: 14px; margin: 0 0 12px; color: var(--auth-text-secondary); }
.contact-message p { font-size: 16px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 72ch; }
.contacts-synced { font-size: 12px; color: var(--auth-text-secondary); margin-top: 28px; }
.contact-back { display: none; }
.contacts-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; padding: 56px 24px; min-height: 340px; }
.contacts-state > svg { color: var(--auth-primary); }
.contacts-state h2 { font-size: 22px; margin-top: 8px; }
.contacts-state p { color: var(--auth-text-secondary); max-width: 48ch; }
.contacts-state .auth-btn { margin-top: 12px; }
.contacts-state .contacts-synced { margin-top: 12px; }
.contacts-skeleton { width: min(320px, 100%); display: grid; gap: 10px; margin-top: 20px; }
.contacts-skeleton span { display: block; height: 12px; border-radius: 6px; background: var(--auth-border); }
.contacts-skeleton span:last-child { width: 65%; }
@media (max-width: 900px) {
  .contacts-heading { align-items: flex-start; gap: 16px; }
  .contacts-heading p { font-size: 14px; }
  .contacts-layout { display: block; }
  .contacts-list { max-height: none; }
  .contact-detail { display: none; padding: 24px; }
  .contacts-layout--detail .contacts-list-panel { display: none; }
  .contacts-layout--detail .contact-detail { display: block; }
  .contact-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin: -8px 0 20px; padding: 8px 0; border: 0; background: none; color: var(--auth-primary); font: inherit; cursor: pointer; }
}
@media (max-width: 480px) {
  .contacts-breadcrumb { margin-bottom: 18px; }
  .contacts-heading { flex-wrap: wrap; margin-bottom: 20px; }
  .contacts-heading h1 { font-size: 28px; }
  .contacts-panel-heading, .contact-item { padding: 20px; }
  .contact-detail { padding: 20px; }
  .contact-detail__meta > div { grid-template-columns: 1fr; gap: 5px; }
  .contact-detail__heading { align-items: flex-start; gap: 12px; }
  .contact-detail__heading h2 { font-size: 22px; }
  .contacts-pagination { padding: 16px; gap: 8px; }
  .contacts-state { padding: 40px 20px; }
}
</style>
