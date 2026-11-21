import SwiftUI

enum DonationStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case approved = "approved"
    case received = "received"
    case inStock = "in_stock"
    case distributed = "distributed"
    case rejected = "rejected"
    case cancelled = "cancelled"
}

// MARK: UI Helpers Extension
extension DonationStatus {
    var title: String {
        switch self {
        case .pending:
            return "Chờ tiếp nhận"
        case .approved:
            return "Đã duyệt"
        case .received:
            return "Đã tiếp nhận tại trạm"
        case .inStock:
            return "Trong kho Hub"
        case .distributed:
            return "Đã trao tặng"
        case .rejected:
            return "Từ chối"
        case .cancelled:
            return "Đã huỷ"
        }
    }

    /// Đơn chưa kết thúc (chưa trao tặng, chưa bị từ chối, chưa huỷ). Dùng cho nhãn "N đơn đang xử lý" ở Trang chủ.
    var isInProgress: Bool {
        switch self {
        case .pending, .approved, .received, .inStock: return true
        case .distributed, .rejected, .cancelled: return false
        }
    }

    /// Nhãn trạng thái người tặng thấy. Khi kho yêu cầu bổ sung, backend vẫn giữ `status = pending`
    /// và đánh dấu bằng `reviewState = "needs_information"`, nên cần nhãn riêng thay cho "Chờ tiếp nhận".
    func donorTitle(reviewState: String?) -> String {
        Self.needsInformation(self, reviewState: reviewState) ? "Cần bổ sung" : title
    }

    func donorIconName(reviewState: String?) -> String {
        Self.needsInformation(self, reviewState: reviewState) ? "exclamationmark.bubble" : iconName
    }

    private static func needsInformation(_ status: DonationStatus, reviewState: String?) -> Bool {
        status == .pending && reviewState == "needs_information"
    }

    var iconName: String {
        switch self {
        case .pending:
            return "clock.arrow.circlepath"
        case .approved, .received:
            return "checkmark.circle"
        case .inStock:
            return "shippingbox"
        case .distributed:
            return "gift"
        case .rejected, .cancelled:
            return "xmark.circle"
        }
    }

    var color: Color {
        switch self {
        case .pending:
            return .orange
        case .approved, .received:
            return .blue
        case .inStock:
            return .purple
        case .distributed:
            return .green
        case .rejected:
            return .red
        case .cancelled:
            return .gray
        }
    }

    var statusDescription: String {
        switch self {
        case .pending:
            return "Đang chờ tình nguyện viên kiểm duyệt."
        case .approved:
            return "Đã duyệt & chờ tiếp nhận vào trạm ReShare Hub."
        case .received:
            return "Đã tiếp nhận thành công tại trạm ReShare Hub."
        case .inStock:
            return "Đã được nhập kho và đang chờ phân phối."
        case .distributed:
            return "Đã trao tặng thành công đến người nhận."
        case .rejected:
            return "Món đồ chưa đạt tiêu chuẩn tiếp nhận của trạm."
        case .cancelled:
            return "Bạn đã huỷ đơn quyên góp."
        }
    }
}
