import Foundation

/// Lọc từ ngữ thô tục trước khi đăng bài Kho đồ 0đ hoặc gửi tin nhắn (App Store Guideline 1.2).
/// Firestore Rules (`cleanText` trong firestore.rules) chặn lại đúng danh sách này ở phía server,
/// nên app sửa đổi cũng không lách được; kiểm ở đây chỉ để báo lỗi sớm, rõ ràng cho người dùng.
/// Danh sách phải giống hệt rules — test web `content-filter-sync` so sánh hai bên.
enum ContentFilter {
    /// Chỉ dùng từ đủ đặc trưng để không chặn nhầm từ thường ("đĩa", "đụng", "buổi"…).
    static let blockedWords: [String] = [
        "địt", "đụ má", "đụ mẹ", "đéo", "lồn", "buồi", "cặc", "con đĩ", "đồ đĩ",
        "đmm", "đcm", "dcm", "vcl", "vkl", "fuck", "shit", "bitch", "cunt",
    ]

    /// true nếu văn bản chứa một từ bị chặn (không phân biệt hoa thường, chuẩn hoá Unicode trước).
    static func containsBlockedWord(_ text: String) -> Bool {
        let normalized = text.precomposedStringWithCanonicalMapping.lowercased()
        return blockedWords.contains { normalized.contains($0) }
    }

    static let rejectionMessage = "Nội dung có từ ngữ không phù hợp với Điều khoản sử dụng. Vui lòng sửa lại."
}
