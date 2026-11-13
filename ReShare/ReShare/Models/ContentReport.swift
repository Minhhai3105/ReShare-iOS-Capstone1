import Foundation

/// Báo cáo vi phạm người dùng gửi từ app (App Store Guideline 1.2). Ghi vào `reports`; client chỉ
/// tạo được, không đọc lại. System Admin xử lý trên Web Admin (Báo cáo vi phạm) trong vòng 24 giờ.
struct ContentReport: Identifiable {
    enum TargetType: String {
        case listing, message, user
    }

    enum Reason: String, CaseIterable, Identifiable {
        case spam, scam, inappropriate, harassment
        case prohibitedItem = "prohibited_item"
        case other

        var id: String { rawValue }

        var title: String {
            switch self {
            case .spam: return "Spam hoặc quảng cáo"
            case .scam: return "Lừa đảo, đòi tiền"
            case .inappropriate: return "Nội dung không phù hợp"
            case .harassment: return "Quấy rối, đe doạ"
            case .prohibitedItem: return "Món đồ bị cấm trao đổi"
            case .other: return "Lý do khác"
            }
        }
    }

    let id = UUID()
    let targetType: TargetType
    let targetId: String
    let targetUserId: String
    var conversationId: String? = nil

    /// Tiêu đề hiển thị trên màn báo cáo.
    var subject: String {
        switch targetType {
        case .listing: return "Báo cáo bài đăng"
        case .message: return "Báo cáo tin nhắn"
        case .user: return "Báo cáo người dùng"
        }
    }
}
