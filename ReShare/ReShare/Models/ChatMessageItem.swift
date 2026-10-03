import Foundation

/// Model tin nhắn trao đổi 1-1 trong cuộc hội thoại nhận đồ 0đ tại Đà Nẵng
struct ChatMessageItem: Identifiable, Codable, Equatable {
    let id: String
    let senderId: String
    let senderName: String
    let text: String
    let timeString: String
    var isCurrentUser: Bool = false
    var createdAt: Date = Date()
    
    // Thẻ đề xuất lịch hẹn nhận đồ tương tác
    var messageType: String = "text" // "text", "appointment_proposal", "system"
    var appointmentTime: Date? = nil
    var appointmentStatus: String? = nil // "pending", "accepted", "declined", "cancelled"
}

extension ChatMessageItem {
    private enum CodingKeys: String, CodingKey {
        case id, senderId, senderName, text, timeString, isCurrentUser, createdAt
        case messageType, appointmentTime, appointmentStatus
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        senderId = try values.decode(String.self, forKey: .senderId)
        senderName = try values.decode(String.self, forKey: .senderName)
        text = try values.decode(String.self, forKey: .text)
        timeString = try values.decode(String.self, forKey: .timeString)
        isCurrentUser = try values.decodeIfPresent(Bool.self, forKey: .isCurrentUser) ?? false
        createdAt = try values.decodeIfPresent(Date.self, forKey: .createdAt) ?? Date()
        // Tin nhắn cũ chưa có loại tin vẫn phải hiện như tin nhắn văn bản.
        messageType = try values.decodeIfPresent(String.self, forKey: .messageType) ?? "text"
        appointmentTime = try values.decodeIfPresent(Date.self, forKey: .appointmentTime)
        appointmentStatus = try values.decodeIfPresent(String.self, forKey: .appointmentStatus)
    }
}
