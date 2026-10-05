import { auth } from '../auth/firebase'

const apiBase = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://reshare-ios-capstone1-1.onrender.com').replace(/\/$/, '')

async function request(path, body) {
  const user = auth.currentUser
  if (!user) throw new Error('Vui lòng đăng nhập lại để tiếp tục.')
  const token = await user.getIdToken()
  let response
  try {
    response = await fetch(`${apiBase}/v1/admin/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })
  } catch {
    throw new Error('Không thể kết nối máy chủ quản trị. Vui lòng kiểm tra mạng và thử lại.')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    if (response.status === 403) throw new Error('Bạn không còn quyền quản lý nhân sự.')
    if (response.status === 404) throw new Error('Không tìm thấy tài khoản hoặc dữ liệu yêu cầu.')
    if (response.status === 409) throw new Error('Không thể thực hiện: tài khoản hoặc kho không còn hợp lệ.')
    throw new Error(result.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.')
  }
  return result
}

export const listStaff = () => request('staff')
export const listWarehouses = () => request('warehouses')
export const listStaffAudit = () => request('staff/audit')
export const lookupAccount = (email) => request('staff/lookup', { email })
export const assignStaff = (targetUid, role, warehouseIds) => request('staff/assign', { targetUid, role, warehouseIds })
export const revokeStaff = (targetUid) => request('staff/revoke', { targetUid })
