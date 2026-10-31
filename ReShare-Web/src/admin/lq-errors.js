// Phân loại lỗi cho các màn L/Q. Module này CHỈ phân loại — không quyết định khoá
// hay cho gửi lại; đó là việc của màn hình, vì chỉ nó biết mình có đang giữ
// idempotencyKey hay không.
export const mockError = (code) => Object.assign(new Error(code), { code })

// Từ chối dứt khoát: server đã xử lý và không ghi gì. Người dùng tải lại rồi làm tiếp.
// Phải khớp mã mà backend thật phát ra — lệch một mã là hiện thông báo sai bản chất.
// distribution-api: INSUFFICIENT_STOCK, STOCK_CONFLICT, NOT_FOUND, WAREHOUSE_INACTIVE,
// IDEMPOTENCY_CONFLICT. STALE_DATA chỉ do kịch bản preview phát ra, BE không dùng.
const DEFINITE_REJECTION = [
  'INSUFFICIENT_STOCK', 'STOCK_CONFLICT', 'NOT_FOUND',
  'WAREHOUSE_INACTIVE', 'IDEMPOTENCY_CONFLICT', 'STALE_DATA',
]

const REJECTION_TITLE = {
  INSUFFICIENT_STOCK: 'Tồn kho không đủ',
  WAREHOUSE_INACTIVE: 'Kho đã ngừng hoạt động',
  IDEMPOTENCY_CONFLICT: 'Khóa gửi đã dùng cho một phiếu khác',
}

// Mất kết nối: không biết server đã ghi hay chưa, NHƯNG gửi lại cùng idempotencyKey
// là an toàn — distribution-api đọc voucher/movement trước khi ghi và trả 200 replay,
// không trừ tồn lần hai. Mã không rõ (code rỗng) cũng xếp vào đây vì cùng tính chất.
const REPLAYABLE = ['NETWORK_ERROR', 'TIMEOUT']

const userFacing = (error, code) => (error?.message && error.message !== code ? error.message : '')

export function mapLqError(error, { write = false } = {}) {
  const code = error?.code
  if (code === 'UNAUTHENTICATED' || error?.status === 401) return {
    kind: 'session', title: 'Phiên đăng nhập đã hết hạn',
    message: 'Dữ liệu đã được ẩn. Vui lòng đăng nhập lại rồi kiểm tra quyền truy cập.', action: 'Đăng nhập lại',
  }
  if (code === 'FORBIDDEN' || error?.status === 403) return {
    kind: 'permission', title: 'Không còn quyền truy cập',
    message: 'Dữ liệu đã được ẩn. Liên hệ quản trị viên để kiểm tra phân công kho.',
  }
  if (DEFINITE_REJECTION.includes(code)) return {
    kind: 'conflict',
    title: REJECTION_TITLE[code] || 'Dữ liệu đã thay đổi',
    // Backend trả message cụ thể hơn câu chung ("Chỉ còn 3 chiếc", tên kho đã ngừng),
    // nên ưu tiên dùng nó. Bỏ qua khi message trùng chính mã lỗi — đó là dạng
    // mockError(code) của kịch bản preview, hiện ra sẽ thành chuỗi mã trần.
    message: userFacing(error, code)
      || 'Tải lại dữ liệu, đối chiếu thông tin mới và xác nhận lại trước khi tiếp tục.',
    action: 'Tải lại dữ liệu',
  }
  if (code === 'NOT_SENT') return {
    kind: 'retry', title: 'Yêu cầu chưa được gửi',
    message: 'Kết nối lỗi trước khi gửi, chưa có gì được ghi. Tải lại dữ liệu, kiểm tra và xác nhận lại biểu mẫu.', action: 'Tải lại dữ liệu',
  }
  if (write && !['VALIDATION', 'NOT_SENT'].includes(code)) {
    const replayable = !code || REPLAYABLE.includes(code)
    return {
      kind: 'unknown', replayable,
      title: 'Chưa xác định kết quả',
      message: replayable
        ? 'Chưa rõ máy chủ đã ghi phiếu hay chưa. Bấm kiểm tra lại lần gửi — hệ thống dùng lại đúng khóa gửi nên không trừ tồn hai lần. Đừng tải lại trang vì sẽ mất khóa đó.'
        : 'Chưa biết phiếu đã được tạo hay chưa và không có khóa gửi để kiểm tra lại. Đã khóa tạo phiếu mới; liên hệ người phụ trách để đối soát.',
    }
  }
  if (code === 'VALIDATION') return { kind: 'validation', title: 'Thông tin chưa hợp lệ', message: error.message, action: 'Kiểm tra lại biểu mẫu' }
  return { kind: 'retry', title: 'Không thể tải dữ liệu', message: 'Kiểm tra kết nối rồi thử lại. Dữ liệu mẫu không được dùng thay cho dữ liệu bị lỗi.', action: 'Thử lại' }
}
