import Foundation


struct DonationItem: Identifiable, Codable {
    //id: String: Để map trực tiếp với Document ID từ Firestore
    let id: String
    let donorId: String
    var title: String
    var description: String
    var category: DonationCategory
    var condition: ItemCondition
    var status: DonationStatus
    var imageUrl: String?
    var images: [String]? = nil
    var imageProvider: String? = nil
    var imagePublicIds: [String]? = nil
    var createdAt: Date
    
    //  statusNote: Dùng hiển thị lời nhắn trạng thái từ hệ thống/admin cho người dùng
    var statusNote: String?
    
    // Hỗ trợ tích hợp Firestore & đồng bộ Web Admin theo BACKEND_SPECIFICATION.md
    var campaignId: String? = nil
    var hubId: String? = nil
    var deliveryMethod: String? = nil
    var confirmationCode: String? = nil
    
    /// Helper lấy URL ảnh: ưu tiên ảnh đầu tiên trong mảng images, fallback về imageUrl
    var primaryImageUrl: String? {
        if let first = images?.first(where: { !$0.isEmpty }) {
            return first
        }
        return imageUrl
    }
}

// MARK: - Mock Data Extension

extension DonationItem {
    static let mockRecentItems: [DonationItem] = [
        DonationItem(
            id: "mock_1",
            donorId: "user_01",
            title: "Oxford Math Books Set",
            description: "Complete set of grade 11 textbook, good for high school students.",
            category: .books,
            condition: .good,
            status: .pending,
            imageUrl: nil,
            createdAt: Date(),
            statusNote: "Waiting for admin review"
        ),
        DonationItem(
            id: "mock_2",
            donorId: "user_01",
            title: "Linen Warm Cardigan",
            description: "Unisex warm sweater, used once during winter.",
            category: .clothing,
            condition: .likeNew,
            status: .approved,
            imageUrl: nil,
            createdAt: Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date(),
            statusNote: "Approved & awaiting warehouse intake"
        ),
        DonationItem(
            id: "mock_3",
            donorId: "user_01",
            title: "Ceramic Desk Lamp",
            description: "Working study lamp with LED bulb included.",
            category: .household,
            condition: .fair,
            status: .distributed,
            imageUrl: nil,
            createdAt: Calendar.current.date(byAdding: .day, value: -5, to: Date()) ?? Date(),
            statusNote: "Successfully delivered to recipient"
        )
    ]
}
