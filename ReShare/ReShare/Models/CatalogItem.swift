import SwiftUI

// MARK: - Trạng thái món đồ 0đ cộng đồng
enum CatalogItemStatus: String, Codable, CaseIterable {
    case available = "available"
    case reserved = "reserved"
    case completed = "completed"

    // Text tiếng Việt hiển thị trên giao diện người dùng
    var displayText: String {
        switch self {
        case .available: return "Sẵn sàng nhận đồ"
        case .reserved: return "Đã có người hẹn"
        case .completed: return "Đã trao tặng"
        }
    }

    var color: Color {
        switch self {
        case .available: return Color(red: 0.08, green: 0.35, blue: 0.18)
        case .reserved: return Color.orange
        case .completed: return Color.secondary
        }
    }

    var badgeBgColor: Color {
        switch self {
        case .available: return Color(red: 0.82, green: 0.96, blue: 0.86)
        case .reserved: return Color.orange.opacity(0.15)
        case .completed: return Color(uiColor: .systemGray5)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        switch raw.lowercased() {
        case "available", "sẵn sàng nhận đồ":
            self = .available
        case "reserved", "đã có người hẹn":
            self = .reserved
        case "completed", "đã trao tặng":
            self = .completed
        default:
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Trạng thái món đồ không hợp lệ trong CSDL: '\(raw)'"
                )
            )
        }
    }
}

// MARK: - Model món đồ 0đ cộng đồng (P2P C2C tại Đà Nẵng)
struct CatalogItem: Identifiable, Codable, Hashable {
    let id: String
    var donorId: String
    var donorName: String
    let title: String
    let category: String
    let condition: String
    let district: String // Quận tại Đà Nẵng
    var timeAgo: String
    var imageName: String
    var status: CatalogItemStatus
    var pickupAddress: String
    var donorNote: String
    var createdAt: Date
    var imageBase64: String? = nil
    var imageUrl: String? = nil
    var images: [String]? = nil
    var imageProvider: String? = nil
    var imagePublicIds: [String]? = nil
    var reservedChatId: String? = nil
    var reservedRequesterId: String? = nil
    var pickupTime: Date? = nil
    var reservationDeadline: Date? = nil
    var donorHandoverConfirmed: Bool = false
    var requesterHandoverConfirmed: Bool = false

    // Khởi tạo 1: Chuẩn hoá khi lưu Firestore hoặc form đăng đồ
    init(
        id: String,
        donorId: String = "donor_danang_pilot",
        donorName: String = "Người dân Đà Nẵng",
        title: String,
        category: String,
        condition: String,
        district: String,
        timeAgo: String = "Vừa xong",
        imageName: String = "tshirt.fill",
        status: CatalogItemStatus = .available,
        pickupAddress: String = "P. Thuận Phước, Q. Hải Châu, Đà Nẵng",
        donorNote: String = "Món đồ này mình không còn nhu cầu dùng tới nên muốn tặng lại cho ai cần. Các bạn đến nhà mình lấy trực tiếp nhé!",
        createdAt: Date = Date(),
        imageBase64: String? = nil,
        imageUrl: String? = nil,
        images: [String]? = nil,
        imageProvider: String? = nil,
        imagePublicIds: [String]? = nil,
        reservedChatId: String? = nil,
        reservedRequesterId: String? = nil,
        pickupTime: Date? = nil,
        reservationDeadline: Date? = nil,
        donorHandoverConfirmed: Bool = false,
        requesterHandoverConfirmed: Bool = false
    ) {
        self.id = id
        self.donorId = donorId
        self.donorName = donorName
        self.title = title
        self.category = category
        self.condition = condition
        self.district = district
        self.timeAgo = timeAgo
        self.imageName = imageName
        self.status = status
        self.pickupAddress = pickupAddress
        self.donorNote = donorNote
        self.createdAt = createdAt
        self.imageBase64 = imageBase64
        self.imageUrl = imageUrl
        self.images = images
        self.imageProvider = imageProvider
        self.imagePublicIds = imagePublicIds
        self.reservedChatId = reservedChatId
        self.reservedRequesterId = reservedRequesterId
        self.pickupTime = pickupTime
        self.reservationDeadline = reservationDeadline
        self.donorHandoverConfirmed = donorHandoverConfirmed
        self.requesterHandoverConfirmed = requesterHandoverConfirmed
    }

    // Khởi tạo 2: Tương thích với các lời gọi Preview và UI hiện tại
    init(
        id: String,
        title: String,
        category: String,
        condition: String,
        district: String,
        timeAgo: String = "Vừa xong",
        imageName: String = "tshirt.fill",
        donorName: String = "Người dân Đà Nẵng",
        status: CatalogItemStatus = .available,
        pickupAddress: String = "P. Thuận Phước, Q. Hải Châu, Đà Nẵng",
        donorNote: String = "Món đồ này mình không còn nhu cầu dùng tới nên muốn tặng lại cho ai cần. Các bạn đến nhà mình lấy trực tiếp nhé!",
        donorId: String = "donor_danang_pilot",
        createdAt: Date = Date(),
        imageBase64: String? = nil,
        imageUrl: String? = nil,
        images: [String]? = nil,
        imageProvider: String? = nil,
        imagePublicIds: [String]? = nil,
        reservedChatId: String? = nil,
        reservedRequesterId: String? = nil,
        pickupTime: Date? = nil,
        reservationDeadline: Date? = nil,
        donorHandoverConfirmed: Bool = false,
        requesterHandoverConfirmed: Bool = false
    ) {
        self.id = id
        self.donorId = donorId
        self.donorName = donorName
        self.title = title
        self.category = category
        self.condition = condition
        self.district = district
        self.timeAgo = timeAgo
        self.imageName = imageName
        self.status = status
        self.pickupAddress = pickupAddress
        self.donorNote = donorNote
        self.createdAt = createdAt
        self.imageBase64 = imageBase64
        self.imageUrl = imageUrl
        self.images = images
        self.imageProvider = imageProvider
        self.imagePublicIds = imagePublicIds
        self.reservedChatId = reservedChatId
        self.reservedRequesterId = reservedRequesterId
        self.pickupTime = pickupTime
        self.reservationDeadline = reservationDeadline
        self.donorHandoverConfirmed = donorHandoverConfirmed
        self.requesterHandoverConfirmed = requesterHandoverConfirmed
    }
}

extension CatalogItem {
    private enum CodingKeys: String, CodingKey {
        case id, donorId, donorName, title, category, condition, district
        case timeAgo, imageName, status, pickupAddress, donorNote, createdAt
        case imageBase64, imageUrl, images, imageProvider, imagePublicIds, reservedChatId, reservedRequesterId
        case pickupTime, reservationDeadline, donorHandoverConfirmed, requesterHandoverConfirmed
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        donorId = try values.decode(String.self, forKey: .donorId)
        donorName = try values.decode(String.self, forKey: .donorName)
        title = try values.decode(String.self, forKey: .title)
        category = try values.decode(String.self, forKey: .category)
        condition = try values.decode(String.self, forKey: .condition)
        district = try values.decode(String.self, forKey: .district)
        timeAgo = try values.decode(String.self, forKey: .timeAgo)
        imageName = try values.decode(String.self, forKey: .imageName)
        status = try values.decode(CatalogItemStatus.self, forKey: .status)
        pickupAddress = try values.decode(String.self, forKey: .pickupAddress)
        donorNote = try values.decode(String.self, forKey: .donorNote)
        createdAt = try values.decode(Date.self, forKey: .createdAt)
        imageBase64 = try values.decodeIfPresent(String.self, forKey: .imageBase64)
        imageUrl = try values.decodeIfPresent(String.self, forKey: .imageUrl)
        images = try values.decodeIfPresent([String].self, forKey: .images)
        imageProvider = try values.decodeIfPresent(String.self, forKey: .imageProvider)
        imagePublicIds = try values.decodeIfPresent([String].self, forKey: .imagePublicIds)
        reservedChatId = try values.decodeIfPresent(String.self, forKey: .reservedChatId)
        reservedRequesterId = try values.decodeIfPresent(String.self, forKey: .reservedRequesterId)
        pickupTime = try values.decodeIfPresent(Date.self, forKey: .pickupTime)
        reservationDeadline = try values.decodeIfPresent(Date.self, forKey: .reservationDeadline)
        // Món đồ cũ chưa có hai cờ xác nhận bàn giao vẫn phải hiển thị được.
        donorHandoverConfirmed = try values.decodeIfPresent(Bool.self, forKey: .donorHandoverConfirmed) ?? false
        requesterHandoverConfirmed = try values.decodeIfPresent(Bool.self, forKey: .requesterHandoverConfirmed) ?? false
    }
}

extension CatalogItem {
    /// Bài cũ chỉ có imageUrl hoặc imageBase64 vẫn đọc được.
    var photoURLs: [String] {
        let urls = images?.filter { !$0.isEmpty } ?? []
        if !urls.isEmpty { return urls }
        if let imageUrl, !imageUrl.isEmpty { return [imageUrl] }
        return []
    }
}
