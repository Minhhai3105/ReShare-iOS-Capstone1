<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '../auth/components/AuthShell.vue'
import { ADMIN_ROUTE, USER_ROLE, USER_ROLE_LABEL } from '../auth/auth.constants'
import { currentUser, signOut } from '../auth/auth.store'
import { assignStaff, listStaff, listStaffAudit, listWarehouses, lookupAccount, revokeStaff } from './staff.service'

const router = useRouter()
const staff = ref([])
const warehouses = ref([])
const events = ref([])
const isLoading = ref(true)
const isLookingUp = ref(false)
const isSaving = ref(false)
const isLoadingAudit = ref(false)
const showAudit = ref(false)
const error = ref('')
const success = ref('')
const search = ref('')
const lookupEmail = ref('')
const target = ref(null)
const role = ref(USER_ROLE.warehouseAdmin)
const warehouseIds = ref([])
const pendingAction = ref(null)

const visibleStaff = computed(() => {
  const query = search.value.trim().toLowerCase()
  return staff.value.filter(person => !query ||
    [person.displayName, person.email, person.uid].some(value => value?.toLowerCase().includes(query)))
})
const activeCount = computed(() => staff.value.filter(person => person.assignment?.active && !person.disabled).length)
const activeWarehouseIds = computed(() => new Set(warehouses.value.map(warehouse => warehouse.id)))

function personName(person) {
  return person?.displayName || person?.email || person?.uid || 'Tài khoản chưa rõ tên'
}

function roleLabel(value) {
  return USER_ROLE_LABEL[value] || value || 'Chưa được cấp quyền'
}

function warehouseLabel(ids, value) {
  if (!ids?.length) return value === USER_ROLE.systemAdmin ? 'Toàn hệ thống' : 'Không có kho'
  return ids.map(id => warehouses.value.find(warehouse => warehouse.id === id)?.name || id).join(', ')
}

function dateLabel(value) {
  if (!value) return 'Chưa có thời gian'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Chưa có thời gian' : date.toLocaleString('vi-VN')
}

async function refresh() {
  isLoading.value = true
  error.value = ''
  try {
    const [staffResult, warehouseResult] = await Promise.all([listStaff(), listWarehouses()])
    staff.value = staffResult.staff
    warehouses.value = warehouseResult.warehouses
  } catch (cause) {
    error.value = cause.message
  } finally {
    isLoading.value = false
  }
}

function editPerson(person) {
  error.value = ''
  success.value = ''
  pendingAction.value = null
  target.value = person
  role.value = person.assignment?.role || USER_ROLE.warehouseAdmin
  warehouseIds.value = (person.assignment?.warehouseIds || []).filter(id => activeWarehouseIds.value.has(id))
}

function clearForm() {
  target.value = null
  lookupEmail.value = ''
  warehouseIds.value = []
  role.value = USER_ROLE.warehouseAdmin
  pendingAction.value = null
}

async function findAccount() {
  if (!lookupEmail.value.trim()) {
    error.value = 'Nhập email của tài khoản đã đăng ký trước khi tìm.'
    return
  }
  isLookingUp.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await lookupAccount(lookupEmail.value.trim())
    if (result.account.uid === currentUser.value?.id) {
      error.value = 'Bạn không thể tự thay đổi quyền của mình.'
      return
    }
    editPerson(result.account)
  } catch (cause) {
    error.value = cause.message
  } finally {
    isLookingUp.value = false
  }
}

function prepareAssign() {
  if (!target.value) return
  if (role.value === USER_ROLE.warehouseAdmin && warehouseIds.value.length === 0) {
    error.value = 'Chọn ít nhất một kho đang hoạt động cho Quản trị viên kho.'
    return
  }
  error.value = ''
  pendingAction.value = {
    kind: 'assign', person: target.value, role: role.value,
    warehouseIds: role.value === USER_ROLE.systemAdmin ? [] : [...warehouseIds.value],
  }
}

function prepareRevoke(person) {
  error.value = ''
  success.value = ''
  pendingAction.value = { kind: 'revoke', person }
}

async function confirmAction() {
  const action = pendingAction.value
  if (!action) return
  isSaving.value = true
  error.value = ''
  success.value = ''
  try {
    if (action.kind === 'assign') {
      await assignStaff(action.person.uid, action.role, action.warehouseIds)
      success.value = `Đã cập nhật quyền Web Admin của ${personName(action.person)}.`
    } else {
      await revokeStaff(action.person.uid)
      success.value = `Đã thu hồi quyền Web Admin của ${personName(action.person)}. Tài khoản iOS vẫn dùng được.`
    }
    clearForm()
    await refresh()
    if (showAudit.value) await loadAudit()
  } catch (cause) {
    error.value = cause.message
  } finally {
    isSaving.value = false
  }
}

async function loadAudit() {
  isLoadingAudit.value = true
  error.value = ''
  try {
    events.value = (await listStaffAudit()).events
  } catch (cause) {
    error.value = cause.message
  } finally {
    isLoadingAudit.value = false
  }
}

async function toggleAudit() {
  showAudit.value = !showAudit.value
  if (showAudit.value) await loadAudit()
}

async function onSignOut() {
  await signOut()
  router.replace({ name: ADMIN_ROUTE.login })
}

onMounted(refresh)
</script>

<template>
  <AuthShell>
    <div class="staff-page">
      <nav class="staff-page__nav" aria-label="Điều hướng quản trị">
        <router-link :to="{ name: ADMIN_ROUTE.home }">Tổng quan</router-link>
        <span aria-hidden="true">/</span>
        <strong>Nhân sự & quyền</strong>
      </nav>

      <header class="staff-page__heading">
        <div>
          <span class="auth-chip">System Admin</span>
          <h1>Quản lý nhân sự</h1>
          <p>Cấp quyền theo vai trò và kho được phân công. Mỗi thay đổi đều có lịch sử.</p>
        </div>
        <button type="button" class="auth-btn auth-btn--soft" @click="onSignOut">Đăng xuất</button>
      </header>

      <p v-if="error" class="staff-alert staff-alert--error" role="alert">{{ error }}</p>
      <p v-if="success" class="staff-alert staff-alert--success" role="status">{{ success }}</p>

      <div class="staff-page__layout">
        <section class="auth-card staff-panel" aria-labelledby="staff-list-title">
          <div class="staff-panel__heading">
            <div>
              <h2 id="staff-list-title">Danh sách nhân sự</h2>
              <p v-if="!isLoading">{{ activeCount }} đang hoạt động · {{ staff.length }} tài khoản có phân công</p>
            </div>
            <button type="button" class="auth-btn auth-btn--soft" :disabled="isLoading" @click="refresh">Tải lại</button>
          </div>
          <label class="staff-field">
            <span>Tìm trong danh sách</span>
            <input v-model.trim="search" type="search" placeholder="Tên, email hoặc UID" autocomplete="off" />
          </label>
          <p v-if="isLoading" class="staff-empty" role="status">Đang tải nhân sự và danh sách kho…</p>
          <p v-else-if="visibleStaff.length === 0" class="staff-empty">
            {{ search ? 'Không có nhân sự khớp tìm kiếm.' : 'Chưa có nhân sự được cấp quyền.' }}
          </p>
          <ul v-else class="staff-list">
            <li v-for="person in visibleStaff" :key="person.uid" class="staff-person">
              <div class="staff-person__identity">
                <strong>{{ personName(person) }}</strong>
                <span>{{ person.email || person.uid }}</span>
              </div>
              <div class="staff-person__details">
                <span :class="['staff-status', person.assignment?.active && !person.disabled ? 'staff-status--active' : 'staff-status--inactive']">
                  {{ person.disabled ? 'Tài khoản bị khóa' : person.assignment?.active ? 'Đang hoạt động' : 'Đã thu hồi' }}
                </span>
                <span :class="['staff-scope', person.assignment?.role === USER_ROLE.systemAdmin ? 'staff-scope--system' : 'staff-scope--warehouse']">
                  {{ person.assignment?.role === USER_ROLE.systemAdmin ? 'Toàn hệ thống' : 'Theo kho được gán' }}
                </span>
                <span>Kho: {{ warehouseLabel(person.assignment?.warehouseIds, person.assignment?.role) }}</span>
              </div>
              <div v-if="person.uid !== currentUser?.id && !person.disabled" class="staff-person__actions">
                <button type="button" class="auth-btn auth-btn--soft" @click="editPerson(person)">
                  {{ person.assignment?.active ? 'Chỉnh quyền' : 'Cấp lại' }}
                </button>
                <button v-if="person.assignment?.active" type="button" class="staff-text-button" @click="prepareRevoke(person)">Thu hồi</button>
              </div>
              <span v-else class="staff-person__self">{{ person.disabled ? 'Cần mở khóa tài khoản Firebase trước khi cấp quyền' : 'Tài khoản của bạn' }}</span>
            </li>
          </ul>
        </section>

        <aside class="auth-card staff-panel staff-panel--form" aria-labelledby="staff-form-title">
          <div class="staff-panel__heading">
            <div>
              <h2 id="staff-form-title">{{ target ? 'Cập nhật phân quyền' : 'Cấp quyền nhân sự' }}</h2>
              <p>Chỉ cấp quyền cho tài khoản Firebase đã đăng ký.</p>
            </div>
          </div>
          <form v-if="!target" class="staff-form" @submit.prevent="findAccount">
            <label class="staff-field">
              <span>Email tài khoản</span>
              <input v-model.trim="lookupEmail" type="email" placeholder="nhan-su@example.com" required autocomplete="off" />
            </label>
            <button class="auth-btn auth-btn--primary" type="submit" :disabled="isLookingUp">
              {{ isLookingUp ? 'Đang tìm tài khoản…' : 'Tìm tài khoản' }}
            </button>
          </form>

          <form v-else class="staff-form" @submit.prevent="prepareAssign">
            <div class="staff-target">
              <span class="staff-target__avatar" aria-hidden="true">{{ personName(target).slice(0, 1).toLocaleUpperCase('vi') }}</span>
              <div class="staff-target__identity">
                <strong>{{ personName(target) }}</strong>
                <span>{{ target.email || 'Chưa có email' }}</span>
                <small>UID: {{ target.uid }}</small>
              </div>
            </div>
            <label class="staff-field">
              <span>Vai trò</span>
              <select v-model="role" :disabled="isSaving">
                <option :value="USER_ROLE.warehouseAdmin">Quản trị viên kho</option>
                <option :value="USER_ROLE.systemAdmin">Quản trị hệ thống</option>
              </select>
            </label>
            <fieldset v-if="role === USER_ROLE.warehouseAdmin" class="staff-warehouses">
              <legend>Kho được phân công</legend>
              <p v-if="warehouses.length === 0">Chưa có kho đang hoạt động. Cần cấu hình kho trước khi cấp vai trò này.</p>
              <label v-for="warehouse in warehouses" :key="warehouse.id">
                <input v-model="warehouseIds" type="checkbox" :value="warehouse.id" :disabled="isSaving" />
                <span>{{ warehouse.name }}</span>
              </label>
            </fieldset>
            <p v-else class="staff-hint">Quản trị hệ thống xem và quản lý toàn bộ kho.</p>
            <div class="staff-form__actions">
              <button class="auth-btn auth-btn--primary" type="submit" :disabled="isSaving || (role === USER_ROLE.warehouseAdmin && !warehouses.length)">Tiếp tục</button>
              <button class="auth-btn auth-btn--soft" type="button" :disabled="isSaving" @click="clearForm">Hủy</button>
            </div>
          </form>

          <div v-if="pendingAction" class="staff-confirm" role="group" aria-label="Xác nhận thay đổi quyền">
            <h3>Xác nhận thay đổi</h3>
            <p><strong>Nhân sự:</strong> {{ personName(pendingAction.person) }}</p>
            <template v-if="pendingAction.kind === 'assign'">
              <p><strong>Vai trò:</strong> {{ roleLabel(pendingAction.role) }}</p>
              <p><strong>Kho:</strong> {{ warehouseLabel(pendingAction.warehouseIds, pendingAction.role) }}</p>
            </template>
            <p v-else>Thu hồi quyền Web Admin. Tài khoản vẫn có thể dùng app iOS như donor.</p>
            <div class="staff-form__actions">
              <button type="button" class="auth-btn auth-btn--primary" :disabled="isSaving" @click="confirmAction">
                {{ isSaving ? 'Đang lưu…' : 'Xác nhận' }}
              </button>
              <button type="button" class="auth-btn auth-btn--soft" :disabled="isSaving" @click="pendingAction = null">Quay lại</button>
            </div>
          </div>

          <section class="staff-policy" aria-labelledby="staff-policy-title">
            <h3 id="staff-policy-title">Quy chuẩn phân quyền</h3>
            <ul>
              <li>Quản trị viên kho phải được gán ít nhất một kho đang hoạt động.</li>
              <li>Chỉ System Admin được cấp hoặc thu hồi quyền nhân sự.</li>
              <li>Mỗi thay đổi được máy chủ ghi vào lịch sử với người thực hiện và thời điểm.</li>
            </ul>
          </section>
        </aside>
      </div>

      <section class="auth-card staff-panel staff-audit" aria-labelledby="staff-audit-title">
        <div class="staff-panel__heading">
          <div>
            <h2 id="staff-audit-title">Lịch sử thay đổi quyền</h2>
            <p>Ghi người thực hiện, thời gian và quyền trước/sau.</p>
          </div>
          <button type="button" class="auth-btn auth-btn--soft" :aria-expanded="showAudit" @click="toggleAudit">
            {{ showAudit ? 'Ẩn lịch sử' : 'Xem lịch sử' }}
          </button>
        </div>
        <template v-if="showAudit">
          <p v-if="isLoadingAudit" class="staff-empty" role="status">Đang tải lịch sử…</p>
          <p v-else-if="events.length === 0" class="staff-empty">Chưa có thay đổi nào được ghi nhận.</p>
          <ol v-else class="staff-audit__list">
            <li v-for="event in events" :key="event.id">
              <strong>{{ event.after?.active ? 'Cấp/cập nhật quyền' : 'Thu hồi quyền' }}</strong>
              <span>{{ dateLabel(event.createdAt) }} · {{ event.actorUid === 'bootstrap' ? 'Khởi tạo hệ thống' : staff.find(person => person.uid === event.actorUid)?.email || event.actorUid }}</span>
              <span>Nhân sự: {{ staff.find(person => person.uid === event.targetUid)?.email || event.targetUid }}</span>
              <span>Trước: {{ event.before ? `${roleLabel(event.before.role)} · ${event.before.active ? 'hoạt động' : 'đã thu hồi'} · ${warehouseLabel(event.before.warehouseIds, event.before.role)}` : 'Chưa cấp quyền' }}</span>
              <span>Sau: {{ roleLabel(event.after?.role) }} · {{ event.after?.active ? 'hoạt động' : 'đã thu hồi' }} · {{ warehouseLabel(event.after?.warehouseIds, event.after?.role) }}</span>
            </li>
          </ol>
        </template>
      </section>
    </div>
  </AuthShell>
</template>

<style scoped>
.staff-page { width: min(1180px, 100%); margin: 0 auto; display: grid; gap: 24px; }
.staff-page__nav { display: flex; gap: 10px; color: var(--auth-text-secondary); }
.staff-page__nav a { color: var(--auth-primary); }
.staff-page__heading, .staff-panel__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; }
.staff-page__heading h1 { margin: 10px 0 4px; font-size: clamp(28px, 3vw, 36px); }
.staff-page__heading p, .staff-panel__heading p, .staff-hint { color: var(--auth-text-secondary); }
.staff-page__layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); gap: 20px; align-items: start; }
.staff-panel { padding: 28px; min-width: 0; }
.staff-panel h2 { margin: 0; font-size: 21px; }
.staff-panel__heading p { margin-top: 4px; font-size: 14px; }
.staff-field { display: grid; gap: 7px; margin-top: 20px; font-weight: 600; }
.staff-field input, .staff-field select { width: 100%; min-height: 46px; padding: 10px 13px; border: 1px solid var(--auth-border); border-radius: 10px; background: #fff; font: inherit; }
.staff-field input:focus, .staff-field select:focus { border-color: var(--auth-primary); }
.staff-alert { margin: 0; padding: 12px 16px; border-radius: 10px; }
.staff-alert--error { color: var(--auth-danger); background: var(--auth-danger-soft); }
.staff-alert--success { color: var(--auth-primary); background: var(--auth-primary-soft); }
.staff-empty { padding: 28px 0; color: var(--auth-text-secondary); }
.staff-list { list-style: none; padding: 0; margin: 18px 0 0; }
.staff-person { display: grid; gap: 12px; padding: 17px 0; border-top: 1px solid var(--auth-border); }
.staff-person__identity, .staff-person__details { display: flex; flex-wrap: wrap; gap: 7px 13px; align-items: center; }
.staff-person__identity strong { font-size: 16px; }
.staff-person__identity span, .staff-person__details, .staff-person__self { color: var(--auth-text-secondary); font-size: 14px; }
.staff-person__actions, .staff-form__actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.staff-status { border-radius: 999px; padding: 4px 10px; font-weight: 600; }
.staff-status--active { color: var(--auth-primary); background: var(--auth-primary-soft); }
.staff-status--inactive { color: var(--auth-danger); background: var(--auth-danger-soft); }
.staff-scope { border-radius: 999px; padding: 4px 10px; font-weight: 600; }
.staff-scope--system { color: #6c39a1; background: #f3eafb; }
.staff-scope--warehouse { color: #285b9a; background: #eaf2fc; }
.staff-text-button { min-height: 44px; border: 0; background: none; color: var(--auth-danger); font: inherit; font-weight: 600; cursor: pointer; }
.staff-form { display: grid; gap: 16px; margin-top: 14px; }
.staff-form .staff-field { margin-top: 0; }
.staff-target { display: flex; gap: 12px; align-items: center; padding: 14px; border-radius: 10px; background: var(--auth-primary-soft); }
.staff-target__avatar { display: grid; place-items: center; flex: 0 0 42px; width: 42px; height: 42px; border-radius: 50%; background: var(--auth-primary); color: #fff; font-weight: 700; }
.staff-target__identity { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
.staff-target__identity span, .staff-target__identity small { color: var(--auth-text-secondary); font-size: 13px; }
.staff-warehouses { display: grid; gap: 10px; margin: 0; padding: 14px; border: 1px solid var(--auth-border); border-radius: 10px; }
.staff-warehouses legend { padding: 0 5px; font-weight: 600; }
.staff-warehouses p { margin: 0; color: var(--auth-text-secondary); }
.staff-warehouses label { display: flex; gap: 10px; align-items: center; min-height: 36px; cursor: pointer; }
.staff-warehouses input { width: 18px; height: 18px; accent-color: var(--auth-primary); }
.staff-confirm { margin-top: 22px; padding: 18px; border: 1px solid var(--auth-primary); border-radius: 12px; background: var(--auth-primary-soft); }
.staff-confirm h3 { margin: 0 0 9px; }
.staff-confirm p { margin: 6px 0; }
.staff-confirm .staff-form__actions { margin-top: 16px; }
.staff-policy { margin-top: 22px; padding: 16px 18px; border: 1px solid var(--auth-border); border-radius: 12px; background: #f8faf8; }
.staff-policy h3 { margin: 0 0 8px; font-size: 15px; }
.staff-policy ul { margin: 0; padding-left: 20px; color: var(--auth-text-secondary); font-size: 14px; line-height: 1.5; }
.staff-audit__list { display: grid; gap: 15px; padding: 0; margin: 18px 0 0; list-style: none; }
.staff-audit__list li { display: grid; gap: 2px; padding-top: 15px; border-top: 1px solid var(--auth-border); font-size: 14px; }
.staff-audit__list li span { color: var(--auth-text-secondary); overflow-wrap: anywhere; }
@media (max-width: 840px) { .staff-page__layout { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .staff-panel { padding: 20px; } .staff-page__heading, .staff-panel__heading { flex-wrap: wrap; } }
</style>
