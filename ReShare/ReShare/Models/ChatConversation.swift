import Foundation

/// Model cuộc hội thoại 1-1 giữa Người cho và Người nhận tại Đà Nẵng
struct ChatConversation: Identifiable, Codable, Equatable {
    let id: String // chatId
    let itemId: String
    let itemTitle: String
    var itemImageName: String = "tshirt.fill"
    var itemImageBase64: String? = nil
    var itemImageUrl: String? = nil
    var itemPickupAddress: String = ""
    
    let donorId: String
    let donorName: String
    let requesterId: String
    let requesterName: String
    
    let participantIds: [String] // [donorId, requesterId] dùng cho query Firestore array-contains
    
    var lastMessage: String
    var lastMessageTime: Date
    var lastSenderId: String
    var isReserved: Bool = false
    var lastReadTimes: [String: Date]? = [:]
    
    // Quản lý đề xuất hẹn giờ & bàn giao 2 bên
    var appointmentStatus: String? = "none" // "none", "proposed", "accepted", "declined", "cancelled", "completed"
    var proposedPickupTime: Date? = nil
    var reservationDeadline: Date? = nil
    var donorHandoverConfirmed: Bool = false
    var requesterHandoverConfirmed: Bool = false
    
    /// Kiểm tra xem người dùng hiện tại có tin nhắn mới chưa đọc hay không
    func hasUnread(for userId: String) -> Bool {
        guard !lastSenderId.isEmpty && lastSenderId != userId else { return false }
        let myLastRead = lastReadTimes?[userId] ?? .distantPast
        return lastMessageTime > myLastRead
    }
    
    /// Tên người đối thoại dựa trên UID người đang xem
    func partnerName(currentUserId: String) -> String {
        return (currentUserId == donorId) ? requesterName : donorName
    }
    
    /// Chữ cái viết tắt làm avatar
    func partnerInitials(currentUserId: String) -> String {
        let name = partnerName(currentUserId: currentUserId)
        let words = name.split(separator: " ")
        if words.count >= 2 {
            return "\(words[0].prefix(1))\(words[1].prefix(1))".uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }
    
    /// Chuyển đổi thành CatalogItem để mở CatalogItemDetailView hoặc ChatConversationView
    var asCatalogItem: CatalogItem {
        CatalogItem(
            id: itemId,
            donorId: donorId,
            donorName: donorName,
            title: itemTitle,
            category: "Đồ trao tặng",
            condition: "Còn tốt",
            district: "Đà Nẵng",
            timeAgo: "Vừa xong",
            imageName: itemImageName,
            status: appointmentStatus == "completed" ? .completed : (isReserved ? .reserved : .available),
            pickupAddress: itemPickupAddress,
            donorNote: "",
            createdAt: lastMessageTime,
            imageBase64: itemImageBase64,
            imageUrl: itemImageUrl,
            reservedChatId: isReserved ? id : nil,
            reservedRequesterId: isReserved ? requesterId : nil,
            pickupTime: proposedPickupTime,
            reservationDeadline: reservationDeadline,
            donorHandoverConfirmed: donorHandoverConfirmed,
            requesterHandoverConfirmed: requesterHandoverConfirmed
        )
    }
}

extension ChatConversation {
    private enum CodingKeys: String, CodingKey {
        case id, itemId, itemTitle, itemImageName, itemImageBase64, itemImageUrl, itemPickupAddress
        case donorId, donorName, requesterId, requesterName, participantIds
        case lastMessage, lastMessageTime, lastSenderId, isReserved, lastReadTimes
        case appointmentStatus, proposedPickupTime, reservationDeadline
        case donorHandoverConfirmed, requesterHandoverConfirmed
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        itemId = try values.decode(String.self, forKey: .itemId)
        itemTitle = try values.decode(String.self, forKey: .itemTitle)
        itemImageName = try values.decodeIfPresent(String.self, forKey: .itemImageName) ?? "tshirt.fill"
        itemImageBase64 = try values.decodeIfPresent(String.self, forKey: .itemImageBase64)
        itemImageUrl = try values.decodeIfPresent(String.self, forKey: .itemImageUrl)
        itemPickupAddress = try values.decodeIfPresent(String.self, forKey: .itemPickupAddress) ?? ""
        donorId = try values.decode(String.self, forKey: .donorId)
        donorName = try values.decode(String.self, forKey: .donorName)
        requesterId = try values.decode(String.self, forKey: .requesterId)
        requesterName = try values.decode(String.self, forKey: .requesterName)
        participantIds = try values.decode([String].self, forKey: .participantIds)
        lastMessage = try values.decode(String.self, forKey: .lastMessage)
        lastMessageTime = try values.decode(Date.self, forKey: .lastMessageTime)
        lastSenderId = try values.decode(String.self, forKey: .lastSenderId)
        isReserved = try values.decodeIfPresent(Bool.self, forKey: .isReserved) ?? false
        lastReadTimes = try values.decodeIfPresent([String: Date].self, forKey: .lastReadTimes)
        appointmentStatus = try values.decodeIfPresent(String.self, forKey: .appointmentStatus) ?? "none"
        proposedPickupTime = try values.decodeIfPresent(Date.self, forKey: .proposedPickupTime)
        reservationDeadline = try values.decodeIfPresent(Date.self, forKey: .reservationDeadline)
        // Các hội thoại tạo trước luồng bàn giao chưa có hai cờ xác nhận.
        donorHandoverConfirmed = try values.decodeIfPresent(Bool.self, forKey: .donorHandoverConfirmed) ?? false
        requesterHandoverConfirmed = try values.decodeIfPresent(Bool.self, forKey: .requesterHandoverConfirmed) ?? false
    }
}
