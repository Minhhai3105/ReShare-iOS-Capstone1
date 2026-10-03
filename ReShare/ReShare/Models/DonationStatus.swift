import SwiftUI

enum DonationStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case approved = "approved"
    case received = "received"
    case inStock = "in_stock"
    case distributed = "distributed"
    case rejected = "rejected"
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
        }
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
        case .rejected:
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
            return "Đã qua sấy khử trùng UV-C và lưu kho an toàn."
        case .distributed:
            return "Đã trao tặng thành công đến người nhận."
        case .rejected:
            return "Món đồ chưa đạt tiêu chuẩn tiếp nhận của trạm."
        }
    }
}

