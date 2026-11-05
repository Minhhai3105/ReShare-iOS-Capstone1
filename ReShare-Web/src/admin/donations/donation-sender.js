export function donationSender(record) {
  const name = [record.donor?.name, record.donorName]
    .find(value => typeof value === 'string' && value.trim() && value.trim() !== record.donorId)
  const email = record.donor?.email
  return {
    name: name?.trim() || 'Chưa cập nhật tên',
    email: typeof email === 'string' && email.trim() ? email.trim() : null,
  }
}
