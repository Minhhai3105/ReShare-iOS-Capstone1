import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  campaignErrorMessage, campaignPayload, campaignProgress, emptyCampaignForm, formFromCampaign,
  guidelinesFrom, nextStatusActions, todayInVietnam, validateCampaignForm,
} from '../src/admin/campaigns/campaign.model.js'
import { createCampaignRepository } from '../src/admin/campaigns/campaign.repository.js'

const NOW = new Date('2026-11-10T03:00:00Z')
const validForm = () => ({
  ...emptyCampaignForm(), title: 'Áo ấm', organizer: 'Trường TH Hòa Bắc', targetQuantity: '100',
  endDate: '2026-12-20', hubIds: ['hub-haichau'], guidelinesText: 'Đồ sạch\n\n Không rách ',
})
const published = {
  id: 'c1', status: 'active', version: 3, title: 'Áo ấm', summary: '', description: '', organizer: 'Trường TH Hòa Bắc',
  category: 'clothing', unitId: 'piece', targetQuantity: 100, urgent: false, endDateLocal: '2026-12-20',
  hubs: [{ id: 'hub-haichau', name: 'Hải Châu' }], guidelines: ['Đồ sạch', 'Không rách'],
}

test('form hợp lệ không có lỗi; thiếu field bắt buộc thì báo đúng chỗ', () => {
  assert.deepEqual(validateCampaignForm(validForm(), { now: NOW }), {})
  const errors = validateCampaignForm({ ...emptyCampaignForm() }, { now: NOW })
  assert.deepEqual(Object.keys(errors).sort(), ['endDate', 'hubIds', 'organizer', 'targetQuantity', 'title'])
})

test('mục tiêu theo đơn vị: chiếc chỉ nhận số nguyên, kg tối đa 3 chữ số thập phân', () => {
  assert.ok(validateCampaignForm({ ...validForm(), targetQuantity: '1.5' }, { now: NOW }).targetQuantity)
  assert.equal(validateCampaignForm({ ...validForm(), unitId: 'kg', targetQuantity: '1.5' }, { now: NOW }).targetQuantity, undefined)
  assert.ok(validateCampaignForm({ ...validForm(), unitId: 'kg', targetQuantity: '1.0005' }, { now: NOW }).targetQuantity)
  assert.ok(validateCampaignForm({ ...validForm(), targetQuantity: '0' }, { now: NOW }).targetQuantity)
})

test('ngày kết thúc tính theo giờ Việt Nam, không nhận ngày đã qua', () => {
  assert.equal(todayInVietnam(new Date('2026-11-10T18:00:00Z')), '2026-11-11')
  assert.ok(validateCampaignForm({ ...validForm(), endDate: '2026-11-09' }, { now: NOW }).endDate)
  assert.equal(validateCampaignForm({ ...validForm(), endDate: '2026-11-10' }, { now: NOW }).endDate, undefined)
})

test('payload tạo mới đủ field; payload sửa chỉ gửi field đã đổi và bỏ danh mục/đơn vị khi đã công khai', () => {
  const payload = campaignPayload(validForm())
  assert.equal(payload.targetQuantity, 100)
  assert.deepEqual(payload.guidelines, ['Đồ sạch', 'Không rách'])
  assert.deepEqual(guidelinesFrom(' a \n\n b'), ['a', 'b'])
  const form = formFromCampaign(published)
  assert.deepEqual(campaignPayload(form, published), {})
  assert.deepEqual(campaignPayload({ ...form, targetQuantity: '150', category: 'books' }, published), { targetQuantity: 150 })
  assert.deepEqual(campaignPayload({ ...form, category: 'books' }, { ...published, status: 'draft' }), { category: 'books' })
})

test('tiến độ không vượt 100% và hiển thị theo đơn vị mục tiêu', () => {
  assert.deepEqual(campaignProgress({ targetQuantity: 10, receivedQuantity: 3, unitId: 'piece', receivedDonationCount: 2 }),
    { percent: 30, text: '3 / 10 chiếc', donations: 2 })
  assert.equal(campaignProgress({ targetQuantity: 10, receivedQuantity: 25, unitId: 'kg' }).percent, 100)
  assert.equal(campaignProgress(null).percent, 0)
})

test('nút trạng thái theo vòng đời nháp → đang tiếp nhận → đã đóng → mở lại', () => {
  assert.deepEqual(nextStatusActions({ status: 'draft' }).map((action) => action.status), ['active'])
  assert.deepEqual(nextStatusActions({ status: 'active' }).map((action) => action.status), ['closed'])
  assert.deepEqual(nextStatusActions({ status: 'closed' }).map((action) => action.status), ['active'])
})

test('lỗi backend được dịch sang tiếng Việt, lỗi lạ có câu chung', () => {
  assert.match(campaignErrorMessage({ status: 409, message: 'Campaign changed; reload first' }), /người khác cập nhật/)
  assert.match(campaignErrorMessage({ status: 0, code: 'UNCERTAIN' }), /Chưa rõ/)
  assert.match(campaignErrorMessage({ status: 500, message: 'Internal server error' }), /Không thực hiện được/)
})

test('repository gửi đúng đường dẫn, kèm token và expectedVersion', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => ({ campaign: { id: 'c1' } }) }
  }
  const authInstance = { currentUser: { getIdToken: async () => 'tok' } }
  const repository = createCampaignRepository({ apiBase: 'https://api.test', authInstance, fetchImpl })
  await repository.update('c1', { title: 'Mới' }, 3)
  await repository.changeStatus('c1', 'closed', 4)
  assert.equal(calls[0].url, 'https://api.test/v1/admin/campaigns/c1/update')
  assert.deepEqual(JSON.parse(calls[0].options.body), { title: 'Mới', expectedVersion: 3 })
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok')
  assert.equal(calls[1].url, 'https://api.test/v1/admin/campaigns/c1/status')
  assert.deepEqual(JSON.parse(calls[1].options.body), { status: 'closed', expectedVersion: 4 })

  const failing = createCampaignRepository({
    apiBase: 'https://api.test', authInstance,
    fetchImpl: async () => { throw new Error('offline') },
  })
  await assert.rejects(failing.create({}), { code: 'UNCERTAIN' })
  await assert.rejects(failing.list(), { code: 'NETWORK_ERROR' })
})
