import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  emptyHubForm, formFromHub, hubErrorMessage, hubPayload, mapsUrl, nextStatusAction, parseCoordinate, validateHubForm,
} from '../src/admin/hubs/hub.model.js'
import { createHubRepository } from '../src/admin/hubs/hub.repository.js'

const hub = {
  id: 'hub-haichau', name: 'Hải Châu', address: 'Vị trí minh hoạ', openHours: 'Chưa hoạt động',
  latitude: 16.0678, longitude: 108.2208, isDemo: true, status: 'active', version: 2, openCampaigns: [],
}

test('Điểm tiếp nhận: form trống báo đủ lỗi; toạ độ nhận cả dấu phẩy thập phân và kiểm khoảng hợp lệ', () => {
  assert.deepEqual(Object.keys(validateHubForm(emptyHubForm())).sort(), ['address', 'latitude', 'longitude', 'name', 'openHours'])
  assert.equal(parseCoordinate('16,0678'), 16.0678)
  assert.equal(parseCoordinate(' -12.5 '), -12.5)
  assert.equal(parseCoordinate('16.0678 N'), null)
  assert.equal(parseCoordinate(''), null)
  assert.deepEqual(validateHubForm({ ...formFromHub(hub), latitude: '16,07' }), {})
  assert.ok(validateHubForm({ ...formFromHub(hub), latitude: '95' }).latitude)
  assert.ok(validateHubForm({ ...formFromHub(hub), longitude: 'abc' }).longitude)
  assert.ok(validateHubForm({ ...formFromHub(hub), name: 'x'.repeat(121) }).name)
})

test('Điểm tiếp nhận: tạo mới gửi đủ field, mặc định minh hoạ; sửa chỉ gửi field đã đổi', () => {
  assert.deepEqual(hubPayload({ ...emptyHubForm(), name: ' Điểm  A ', address: 'Số 1', openHours: '8h–17h', latitude: '16,1', longitude: '108.2' }), {
    name: 'Điểm A', address: 'Số 1', openHours: '8h–17h', latitude: 16.1, longitude: 108.2, isDemo: true,
  })
  assert.deepEqual(hubPayload(formFromHub(hub), hub), {})
  assert.deepEqual(hubPayload({ ...formFromHub(hub), name: 'Điểm Hải Châu', isDemo: false }, hub), { name: 'Điểm Hải Châu', isDemo: false })
  assert.deepEqual(hubPayload({ ...formFromHub(hub), latitude: '16,0678' }, hub), {}, 'cùng giá trị dù viết dấu phẩy')
})

test('Điểm tiếp nhận: link Google Maps, nút tạm ẩn/mở lại theo trạng thái', () => {
  assert.equal(mapsUrl('16,0678', 108.2208), 'https://www.google.com/maps?q=16.0678,108.2208')
  assert.equal(mapsUrl('', 108), '')
  assert.deepEqual(nextStatusAction(hub), { status: 'inactive', label: 'Tạm ẩn' })
  assert.deepEqual(nextStatusAction({ status: 'inactive' }), { status: 'active', label: 'Mở lại' })
})

test('Điểm tiếp nhận: lỗi backend hiện bằng tiếng Việt, nêu đúng chiến dịch đang dùng điểm', () => {
  assert.match(hubErrorMessage({ code: 'HUB_IN_USE', details: { campaigns: [{ id: 'c1', title: 'Áo ấm' }] } }), /chiến dịch đang mở “Áo ấm” vẫn dùng điểm này/)
  assert.match(hubErrorMessage({ code: 'HUB_IN_USE' }), /một chiến dịch đang mở/)
  assert.equal(hubErrorMessage({ message: 'Hub name already exists' }), 'Đã có điểm tiếp nhận trùng tên. Đặt tên khác để donor không nhầm.')
  assert.match(hubErrorMessage({ message: 'Hub changed; reload first' }), /người khác cập nhật/)
  assert.match(hubErrorMessage({ code: 'UNCERTAIN' }), /Chưa rõ thao tác đã lưu/)
  assert.match(hubErrorMessage({ status: 0 }), /Không kết nối được máy chủ/)
})

test('Điểm tiếp nhận: repository gọi đúng đường dẫn, gửi expectedVersion khi sửa và đổi trạng thái', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    const payload = url.endsWith('/v1/admin/hubs') && !options.method ? { hubs: [hub] } : { hub }
    return { ok: true, json: async () => payload }
  }
  const repository = createHubRepository({
    apiBase: 'https://api.test', fetchImpl,
    authInstance: { currentUser: { getIdToken: async () => 'token' } },
  })
  assert.deepEqual(await repository.list(), [hub])
  await repository.create({ name: 'A' })
  await repository.update('hub/x', { name: 'B' }, 2)
  await repository.changeStatus('hub-haichau', 'inactive', 3)
  assert.deepEqual(calls.map((call) => [call.method, call.url, call.body]), [
    ['GET', 'https://api.test/v1/admin/hubs', null],
    ['POST', 'https://api.test/v1/admin/hubs', { name: 'A' }],
    ['POST', 'https://api.test/v1/admin/hubs/hub%2Fx/update', { name: 'B', expectedVersion: 2 }],
    ['POST', 'https://api.test/v1/admin/hubs/hub-haichau/status', { status: 'inactive', expectedVersion: 3 }],
  ])
})
