import { createModerationRepository, createModerationRequest } from '../moderation/moderation.repository.js'

const BASE = '/v1/admin/users'

export function createUsersService(options) {
  const request = createModerationRequest(options)
  const moderation = createModerationRepository(options)
  return {
    async list({ email = '', pageToken = '' } = {}) {
      const query = new URLSearchParams()
      if (email) query.set('email', email.trim())
      if (pageToken) query.set('pageToken', pageToken)
      const data = await request(`${BASE}${query.size ? `?${query}` : ''}`)
      if (!Array.isArray(data.users)) throw Object.assign(new Error('Danh sách không hợp lệ.'), { status: 0 })
      return { users: data.users, nextPageToken: data.nextPageToken || null }
    },
    summary: uid => request(`${BASE}/${encodeURIComponent(uid)}/summary`),
    suspend: (uid, reason) => request(`${BASE}/${encodeURIComponent(uid)}/suspend`, {
      method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
    }),
    unsuspend: moderation.unsuspend,
  }
}

export const usersService = createUsersService()
