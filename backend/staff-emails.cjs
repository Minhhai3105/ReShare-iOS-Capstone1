// Đổi UID nhân sự sang email để màn chi tiết hiện người thao tác dễ đọc. Dữ liệu chỉ lưu UID
// (staff_assignments không có email) nên tra Firebase Auth lúc đọc; tra lỗi thì giữ UID, không làm hỏng màn.
async function staffEmails(auth, uids) {
  const ids = [...new Set(uids.filter(uid => typeof uid === 'string' && uid))];
  if (!auth?.getUsers || !ids.length) return new Map();
  try {
    const { users } = await auth.getUsers(ids.map(uid => ({ uid })));
    return new Map(users.filter(user => user.email).map(user => [user.uid, user.email]));
  } catch {
    return new Map();
  }
}

module.exports = { staffEmails };
