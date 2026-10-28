// RC1D-114: proposed MOCK codes only. Replace at the adapter boundary after BE agreement.
export const mockError = (code) => Object.assign(new Error(code), { code })

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
  if (['INSUFFICIENT_STOCK', 'STOCK_CONFLICT', 'STALE_DATA', 'NOT_FOUND'].includes(code)) return {
    kind: 'conflict', title: code === 'INSUFFICIENT_STOCK' ? 'Tồn kho không đủ' : 'Dữ liệu đã thay đổi',
    message: 'Tải lại dữ liệu, đối chiếu thông tin mới và xác nhận lại trước khi tiếp tục.', action: 'Tải lại dữ liệu',
  }
  if (code === 'NOT_SENT') return {
    kind: 'retry', title: 'Yêu cầu chưa được gửi',
    message: 'Mô phỏng kết nối bị lỗi trước khi gửi. Tải lại dữ liệu, kiểm tra và xác nhận lại biểu mẫu.', action: 'Tải lại dữ liệu',
  }
  if (write && !['VALIDATION', 'NOT_SENT'].includes(code)) return {
    kind: 'unknown', title: 'Chưa xác định kết quả',
    message: 'Chưa biết phiếu đã được tạo hay chưa. Đã khóa tạo phiếu mới; liên hệ người phụ trách để đối soát. Không gửi lại hoặc tải lại trang để thử tạo phiếu.',
  }
  if (code === 'VALIDATION') return { kind: 'validation', title: 'Thông tin chưa hợp lệ', message: error.message, action: 'Kiểm tra lại biểu mẫu' }
  return { kind: 'retry', title: 'Không thể tải dữ liệu', message: 'Kiểm tra kết nối rồi thử lại. Dữ liệu mẫu không được dùng thay cho dữ liệu bị lỗi.', action: 'Thử lại' }
}
